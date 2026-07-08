import { AUTH_PROXY_URL } from '../config/constants'

export class ScrapeError extends Error {
  reason: 'invalid_url' | 'fetch_failed' | 'no_content' | 'network'

  constructor(reason: ScrapeError['reason'], message: string) {
    super(message)
    this.name = 'ScrapeError'
    this.reason = reason
  }
}

// Fetches a URL via the Worker's /fetch-url route (bypasses the browser's
// own CORS block on cross-origin fetch — see worker/src/index.ts), then
// runs @mozilla/readability — the same deterministic, client-side algorithm
// behind Firefox's Reader Mode and Safari's Reader View — to isolate just
// the article body from everything else on the page (nav, ads, sidebars,
// comments). Deliberately not an AI/LLM call: this is a solved heuristic
// problem, not one that needs a paid API to get right, and doing it this
// way keeps the whole feature at zero ongoing cost.
export async function scrapeUrl(url: string): Promise<{ title: string; html: string }> {
  if (!AUTH_PROXY_URL) {
    throw new ScrapeError('network', 'Web clipper is not configured (missing proxy URL).')
  }

  let res: Response
  try {
    res = await fetch(`${AUTH_PROXY_URL}/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw new ScrapeError('network', 'Could not reach the web clipper service.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const errorCode = body && typeof body === 'object' && 'error' in body ? String(body.error) : null
    if (errorCode === 'invalid_url' || errorCode === 'unsupported_protocol' || errorCode === 'blocked_host') {
      throw new ScrapeError('invalid_url', 'That doesn\'t look like a fetchable web address.')
    }
    if (errorCode === 'timeout') {
      throw new ScrapeError('fetch_failed', 'That page took too long to respond.')
    }
    if (errorCode === 'response_too_large') {
      throw new ScrapeError('fetch_failed', 'That page is too large to import.')
    }
    // Covers fetch_failed (the target itself returned a non-OK status —
    // often a bot-protection challenge or a login/paywall gate) and any
    // other unrecognized error shape.
    throw new ScrapeError(
      'fetch_failed',
      'Could not fetch that page — it may be blocking automated access. Try copy-pasting the content instead.',
    )
  }

  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Confirmed real bug from testing: a DOMParser-created document has no
  // notion of where its HTML actually came from — its base URI defaults to
  // *this app's own* origin. Any relative link/image in the source page
  // (e.g. MediaWiki's inline "[edit]" section links, which are genuinely
  // relative hrefs) then resolves against Sanctum's own origin instead of
  // the real site, silently producing links to a page that doesn't exist.
  // A <base> element, inserted before Readability ever walks the DOM, fixes
  // resolution for everything downstream (Readability's own processing and
  // the turndown conversion after it).
  const base = doc.createElement('base')
  base.href = url
  doc.head.prepend(base)

  // Lazy-loaded, same as every other occasionally-used heavy library in
  // this app (turndown, mammoth, mermaid, docx, html2pdf.js) — no reason to
  // ship it in the main bundle for the common case of never using the web
  // clipper. Readability mutates the document it's given, so this needs a
  // document dedicated to this one parse — reusing a shared/cached
  // DOMParser output across calls would corrupt whichever call ran first.
  const { Readability } = await import('@mozilla/readability')
  const article = new Readability(doc).parse()

  if (!article || !article.content || !article.content.trim()) {
    throw new ScrapeError(
      'no_content',
      'Could not find article content on that page — it may be a page that needs JavaScript to load its content.',
    )
  }

  return { title: article.title || 'Imported page', html: stripTrailingBackMatter(article.content) }
}

// Confirmed real gap from testing: Readability's own heuristics don't
// reliably strip a heavily-cited page's reference list (a long <ol> of
// citations reads structurally like "real content" to it, not chrome) —
// on a citation-heavy Wikipedia article this left 70+ numbered references
// in the imported note. This is a second, narrower pass on top of
// Readability specifically for the common "the rest of the page from here
// down is back matter" case.
//
// First attempt (heading text matching "References"/"Notes"/etc.) turned
// out not to work at all on the real test case: Readability itself already
// strips MediaWiki's "References"/"Notes" *headings* as boilerplate-looking
// short text, while leaving the citation <ol> that followed them behind —
// so by the time this function runs, there's no matching heading left to
// find. A structural signal survives that Readability's cleanup instead:
// MediaWiki's citation anchors (#cite_note-*/#cite_ref-*) are still present
// on every list item's links, regardless of whether the heading above the
// list survived. A list where most items carry one of those is treated as
// the start of back matter — deliberately not "See also," which uses plain
// wiki links with no citation anchors and stays untouched.
const BACK_MATTER_HEADINGS = /^(references|notes|footnotes|bibliography|works cited|external links|further reading|citations)$/i
// Two independent MediaWiki signals, either one enough to mark a list item
// as citation-shaped: #cite_note-/#cite_ref- anchors (inline footnote-style
// citations, e.g. Bell's theorem's "References"/"Notes" sections) and links
// to Wikipedia's own "_(identifier)" pages — ISBN_(identifier),
// DOI_(identifier), PMID_(identifier), OCLC_(identifier), etc. — which is
// how it marks up bibliographic metadata on plain, non-footnoted
// "Further reading"-style book/article lists that don't use #cite_ at all.
// Confirmed from testing: without the second signal, a ~25-item "Further
// reading" bibliography survived even after the citation-anchor list was
// correctly stripped, since it has no #cite_ links of its own — just heavy
// ISBN/DOI/OCLC linking, which normal article prose essentially never does.
const CITATION_SIGNAL_PATTERN = /#cite_(note|ref)-|_\(identifier\)/

function isCitationHeavyList(el: Element): boolean {
  if (el.tagName !== 'OL' && el.tagName !== 'UL') return false
  const items = Array.from(el.children).filter((child) => child.tagName === 'LI')
  if (items.length === 0) return false
  const citationItems = items.filter((item) => CITATION_SIGNAL_PATTERN.test(item.innerHTML))
  return citationItems.length / items.length > 0.5
}

function stripTrailingBackMatter(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Confirmed real, serious bug from testing on both prior approaches:
  // (1) "walk forward from the first match to the end of its siblings"
  // missed a second, separately-wrapped section (Wikipedia's "Notes" and
  // "References" turned out to be independent sibling sections, not one
  // contiguous run — removing one's local trailing siblings never reached
  // the other); (2) climbing up to whichever ancestor sits directly under
  // <body> before doing that "delete to the end" walk fixed the nesting
  // problem but overcorrected into a worse bug — when Readability wraps
  // its whole output in one shared root container (common), that ancestor
  // is the SAME div for every match, so the walk deleted the entire
  // article the instant anything inside it matched.
  //
  // Removing every citation-heavy list found anywhere, independently, side-
  // steps both: no assumption about how many sections there are or how
  // they're nested, and it can only ever remove elements that themselves
  // matched the citation-density check — never anything downstream of one,
  // so it can't silently wipe unrelated content the way both walks could.
  const lists = doc.body.querySelectorAll('ol, ul')
  for (const list of lists) {
    if (isCitationHeavyList(list)) list.remove()
  }

  // Narrower, secondary cleanup: an explicit "References"/"Notes"/etc.
  // heading that survived Readability's own boilerplate stripping (usually
  // it doesn't — see the comment above these constants — but when it does,
  // this clears the now-dangling label with nothing left under it).
  const headings = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6')
  for (const heading of headings) {
    if (BACK_MATTER_HEADINGS.test(heading.textContent?.trim() ?? '')) heading.remove()
  }

  return doc.body.innerHTML
}

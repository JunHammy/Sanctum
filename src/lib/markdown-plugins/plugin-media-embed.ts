import type MarkdownIt from 'markdown-it'
import { isRelativeImagePath } from '../image-resolver'

const YOUTUBE_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/
const AUDIO_EXTENSION = /\.(mp3|wav|ogg|m4a|flac|aac)(\?.*)?$/i
const PDF_EXTENSION = /\.pdf(\?.*)?$/i
// A standalone `![alt](src)` — deliberately permissive (doesn't handle
// titles or reference-style links) since it only needs to recognize the
// common "media embed alone on its own line" shape, not fully replicate
// markdown-it's own image-parsing grammar.
const STANDALONE_IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/

type MediaType = 'youtube' | 'audio' | 'pdf'

function detectMediaType(src: string): MediaType | null {
  if (YOUTUBE_PATTERN.test(src)) return 'youtube'
  if (AUDIO_EXTENSION.test(src)) return 'audio'
  if (PDF_EXTENSION.test(src)) return 'pdf'
  return null
}

function renderMedia(md: MarkdownIt, type: MediaType, src: string): string {
  if (type === 'youtube') {
    const youtubeId = YOUTUBE_PATTERN.exec(src)![1]
    return `<div class="media-embed media-embed-youtube"><iframe src="https://www.youtube.com/embed/${youtubeId}" title="YouTube video" allowfullscreen loading="lazy"></iframe></div>`
  }

  // Vault-relative paths (assets/foo.mp3, not a full https:// URL) need the
  // same async blob-URL resolution images already go through —
  // data-relative-src (resolved by useMediaEmbeds.ts after mount), not a
  // real src yet, mirroring useImageResolution's own convention for the
  // exact same reason (Drive attachments aren't fetchable by plain URL).
  const isRelative = isRelativeImagePath(src)
  const srcAttr = isRelative ? `data-relative-src="${md.utils.escapeHtml(src)}"` : `src="${md.utils.escapeHtml(src)}"`

  if (type === 'audio') return `<audio class="media-embed-audio" controls ${srcAttr}></audio>`
  return `<div class="media-embed media-embed-pdf"><iframe ${srcAttr} title="PDF preview"></iframe></div>`
}

// YouTube/audio/PDF via `![](...)`. Two cases, handled two different ways:
//
// 1. The embed alone on its own line (the common case, same convention as
//    plugin-transclusion.ts's `![[Note]]`) — promoted to a block-level
//    token here, in a core rule that runs before 'inline', rather than
//    left as an inline image. Markdown-it wraps *all* inline content
//    (including a lone image) in a <p>, and a <div>/<iframe>/<audio>
//    inside a <p> is invalid HTML — browsers silently "fix" it by breaking
//    the <p> around the block element, which works but leaves two stray
//    empty <p> tags in the DOM. Confirmed directly, not assumed.
// 2. The embed mixed inline with other text (e.g. "see this: ![](url) —
//    neat") — stays a genuine inline element, handled by the image
//    renderer-rule override below. Same reasoning as why a plain
//    mid-sentence image doesn't get promoted to block either.
export function mediaEmbedPlugin(md: MarkdownIt): void {
  md.core.ruler.before('inline', 'media-embed-block', (state) => {
    const tokens = state.tokens

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type !== 'paragraph_open') continue
      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue

      const match = STANDALONE_IMAGE_PATTERN.exec(inline.content.trim())
      if (!match) continue
      const src = match[2]
      const type = detectMediaType(src)
      if (!type) continue

      const embedToken = new state.Token('media_embed', 'div', 0)
      embedToken.meta = { type, src }
      embedToken.block = true
      embedToken.map = token.map
      embedToken.level = token.level
      tokens.splice(i, 3, embedToken) // replaces paragraph_open, inline, paragraph_close
    }

    return true
  })

  md.renderer.rules.media_embed = (tokens, idx) => {
    const token = tokens[idx]
    const { type, src } = token.meta as { type: MediaType; src: string }
    // renderAttrs (not a hand-written attribute string) is what actually
    // picks up data-src-line — sourceLinePlugin runs after this rule is
    // *defined* but before it *executes* (core rules all run before the
    // render/HTML-string phase), stamping it via token.attrSet() onto
    // this exact token. plugin-transclusion.ts hit this same gap first: a
    // hand-written wrapper here would silently drop it, breaking the
    // toggle/search/backlink scroll machinery for any note whose nearest
    // anchor happened to be a media embed.
    const outerAttrs = md.renderer.renderAttrs(token)
    return `<div class="media-embed-block"${outerAttrs}>${renderMedia(md, type, src)}</div>\n`
  }

  const defaultImage = md.renderer.rules.image!
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const src = token.attrGet('src') ?? ''
    const type = detectMediaType(src)
    return type ? renderMedia(md, type, src) : defaultImage(tokens, idx, options, env, self)
  }
}

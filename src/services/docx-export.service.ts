import type {
  Paragraph as ParagraphType,
  Table as TableType,
  TextRun as TextRunType,
  ImageRun as ImageRunType,
  ExternalHyperlink as ExternalHyperlinkType,
  BorderStyle as BorderStyleType,
  ShadingType as ShadingTypeType,
} from 'docx'
import { safeFilename, buildResolvedNoteContainer } from './export.service'
import type { FileTreeNode } from '../types/vault.types'

// Same light palette print.css uses for PDF export, as plain hex (docx
// wants "RRGGBB", no leading #) — kept independent of print.css rather
// than shared, since that file is CSS consumed by html2canvas and this is
// plain data consumed by docx's own API, nothing to actually share.
const HIGHLIGHT_FILL = 'FDECC8'
const CODE_FILL = 'F3F1ED'
// Wikilinks/tags use this (not Word's own default hyperlink blue) since,
// unlike a real external <a>, they have no meaningful target in a
// standalone document — a real ExternalHyperlink gets Word's own built-in
// link styling automatically, so nothing needs setting for that case.
const MUTED_COLOR = '6E6A61'
const BORDER_COLOR = 'C9C3B6'
const CALLOUT_FILL = 'E2DDD1'
const CODE_FONT = 'Consolas'

// docx's own bundled default styles (verified directly: no <w:spacing> at
// all in Normal or Heading1-6) leave every paragraph flush against its
// neighbors with zero built-in breathing room — confirmed in a real
// export, which came out as one dense, cramped block with no visual
// separation between headings/paragraphs/lists/callouts at all. These are
// applied explicitly everywhere below rather than relying on any default.
// Twips (1/20 pt) throughout, matching every other size value docx's API
// itself uses.
const HEADING_SPACING = { before: 240, after: 120 }
const BODY_SPACING = { after: 160 }
const LIST_ITEM_SPACING = { after: 40 }

type InlineChild = TextRunType | ImageRunType | ExternalHyperlinkType

interface InlineStyle {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
  highlight?: boolean
  muted?: boolean
}

// Shared appearance a Paragraph is built with — threaded through
// construction (rather than trying to retrofit it onto an already-built
// Paragraph afterward, which docx's API doesn't expose a way to do)
// specifically so a callout can give every paragraph inside it the same
// left border/indent without each block-level branch needing its own
// special-cased "am I inside a callout" logic.
interface ParagraphDecoration {
  border?: { left: { style: (typeof BorderStyleType)[keyof typeof BorderStyleType]; size: number; color: string } }
  indent?: { left: number }
  shading?: { type: (typeof ShadingTypeType)[keyof typeof ShadingTypeType]; color: string; fill: string }
  spacing?: { before?: number; after?: number }
}

// Dynamic import, not a top-of-file static one — docx (Document/Paragraph/
// Table building plus zip packaging) is a substantial library, and most
// page loads never touch Word export. Same lazy-loading reasoning as
// html2pdf.js in export.service.ts. Everything that actually constructs
// docx objects lives as a nested function *inside* this one instead of at
// module scope — they close over the dynamically-imported classes
// destructured below, which avoids threading a "here's the docx module"
// parameter through a dozen separate top-level helper functions.
export async function exportNoteToDocx(fileId: string, title: string, fileTree: FileTreeNode[]): Promise<void> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    ImageRun,
    ExternalHyperlink,
    WidthType,
    ShadingType,
    BorderStyle,
  } = await import('docx')

  function textRun(text: string, style: InlineStyle): TextRunType {
    return new TextRun({
      text,
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      font: style.code ? CODE_FONT : undefined,
      color: style.muted ? MUTED_COLOR : undefined,
      shading:
        style.code || style.highlight
          ? { type: ShadingType.CLEAR, color: 'auto', fill: style.highlight ? HIGHLIGHT_FILL : CODE_FILL }
          : undefined,
    })
  }

  // Converts via an offscreen <canvas> regardless of the image's original
  // format, rather than detecting and mapping MIME types to docx's own
  // ImageRun `type` union (which only covers jpg/png/gif/bmp — notably not
  // webp, a common paste/screenshot format). Re-encoding every image to
  // PNG sidesteps that gap entirely: canvas.drawImage() works uniformly
  // from an already-loaded <img> no matter what format it was decoded from.
  async function imageRun(img: HTMLImageElement): Promise<ImageRunType | null> {
    const src = img.getAttribute('src')
    if (!src || !src.startsWith('blob:')) return null // unresolved/broken image — skip rather than embedding nothing useful
    if (!img.naturalWidth || !img.naturalHeight) return null

    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0)

      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('canvas.toBlob returned null'))
            return
          }
          blob.arrayBuffer().then(resolve, reject)
        }, 'image/png')
      })

      // Word's page is much narrower than a screen — scaling down to a
      // fixed max width (preserving aspect ratio) keeps a full-resolution
      // photo from overflowing the page margins entirely.
      const maxWidth = 500
      const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1
      return new ImageRun({
        type: 'png',
        data: buffer,
        transformation: {
          width: Math.round(img.naturalWidth * scale),
          height: Math.round(img.naturalHeight * scale),
        },
      })
    } catch {
      return null // one broken image shouldn't fail the whole export
    }
  }

  // Walks a node's inline content (text, bold/italic/strikethrough/code/
  // highlight formatting, links, images) into docx's flat run-array model
  // — docx paragraphs are just a list of runs, not a nested tree the way
  // HTML is, so nested <strong><em>text</em></strong> has to fold into a
  // single run carrying both bold and italics, tracked via `style` as
  // recursion descends rather than each tag producing its own wrapper run.
  async function inlineRuns(node: ChildNode, style: InlineStyle): Promise<InlineChild[]> {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      return text ? [textRun(text, style)] : []
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const el = node as Element
    const tag = el.tagName.toLowerCase()

    if (tag === 'img') {
      const run = await imageRun(el as HTMLImageElement)
      return run ? [run] : []
    }
    if (tag === 'br') return [new TextRun({ break: 1 })]
    // The checkbox itself can't usefully convert — a literal ☑/☐
    // character (added by listToParagraphs) stands in for it.
    if (tag === 'input') return []
    // KaTeX's output is a leaf for these purposes, not a subtree to
    // recurse into — confirmed directly: it contains BOTH a hidden
    // MathML tree (individual glyph elements, plus the clean LaTeX
    // annotation) AND the visible HTML rendering (decomposed into dozens
    // of positioned spans for layout). Recursing into it the way plain
    // formatting tags get walked below picked up text from all three at
    // once, producing garbled, tripled output in a real export (e.g.
    // "v=2ghv = \sqrt{2gh}v=2gh"). Math inside a <p> (inline math) hits
    // this path; mathToParagraph handles the block-level (display math
    // not wrapped in a <p>) case using the same underlying extraction.
    if (el.classList.contains('katex') || el.classList.contains('katex-display')) {
      return [textRun(mathAnnotationText(el), { code: true, italics: true })]
    }

    // A real external link (markdown [text](url)) becomes a genuine,
    // clickable docx hyperlink. Wikilinks/tags have no meaningful target
    // in a standalone Word document (they only resolve within the vault),
    // so they fall through to the plain "muted-ish colored text"
    // treatment below instead — same visual-only compromise the PDF
    // export already makes for the same reason.
    if (tag === 'a' && !el.classList.contains('wikilink') && el.getAttribute('href')) {
      const children = (await collectInline(el, style)).filter((c): c is TextRunType => c instanceof TextRun)
      return [new ExternalHyperlink({ link: el.getAttribute('href')!, children })]
    }

    let nextStyle = style
    if (tag === 'strong' || tag === 'b') nextStyle = { ...style, bold: true }
    else if (tag === 'em' || tag === 'i') nextStyle = { ...style, italics: true }
    else if (tag === 's' || tag === 'del') nextStyle = { ...style, strike: true }
    else if (tag === 'code') nextStyle = { ...style, code: true }
    else if (tag === 'mark') nextStyle = { ...style, highlight: true }
    else if (tag === 'a' || el.classList.contains('wikilink') || el.classList.contains('tag')) {
      nextStyle = { ...style, muted: true }
    }

    return collectInline(el, nextStyle)
  }

  async function collectInline(el: Element, style: InlineStyle): Promise<InlineChild[]> {
    const runs: InlineChild[] = []
    for (const child of Array.from(el.childNodes)) {
      runs.push(...(await inlineRuns(child, style)))
    }
    return runs
  }

  function headingLevel(tag: string): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
    switch (tag) {
      case 'h1':
        return HeadingLevel.HEADING_1
      case 'h2':
        return HeadingLevel.HEADING_2
      case 'h3':
        return HeadingLevel.HEADING_3
      case 'h4':
        return HeadingLevel.HEADING_4
      case 'h5':
        return HeadingLevel.HEADING_5
      case 'h6':
        return HeadingLevel.HEADING_6
      default:
        return undefined
    }
  }

  // docx paragraphs support a native `bullet` shorthand for unordered
  // lists, but ordered lists need a full custom Numbering definition
  // registered on the Document up front — real overhead for what a
  // literal "1. " text prefix already conveys just as clearly, and it
  // keeps both list types on the same simple code path. Same technique
  // the PDF export already uses for the same underlying reason (there,
  // because html2canvas can't render list-style markers at all; here,
  // just because it's simpler).
  async function listToParagraphs(list: Element, decoration: ParagraphDecoration = {}): Promise<ParagraphType[]> {
    const isOrdered = list.tagName.toLowerCase() === 'ol'
    const start = isOrdered ? Number(list.getAttribute('start') ?? '1') : 0
    const paragraphs: ParagraphType[] = []
    let index = 0

    for (const child of Array.from(list.children)) {
      if (child.tagName.toLowerCase() !== 'li') continue
      const isTask = child.classList.contains('task-list-item')
      const checkbox = isTask ? child.querySelector<HTMLInputElement>('input[type="checkbox"]') : null
      const prefix = isTask ? (checkbox?.checked ? '☑ ' : '☐ ') : isOrdered ? `${start + index}. ` : '• '
      const runs = await collectInline(child, {})
      paragraphs.push(
        new Paragraph({
          ...decoration,
          spacing: LIST_ITEM_SPACING,
          indent: { left: 720 },
          children: [textRun(prefix, {}), ...runs],
        }),
      )
      index++
    }
    return paragraphs
  }

  async function tableToDocx(table: Element): Promise<TableType> {
    const rows: InstanceType<typeof TableRow>[] = []
    for (const rowEl of Array.from(table.querySelectorAll('tr'))) {
      const cells: InstanceType<typeof TableCell>[] = []
      for (const cellEl of Array.from(rowEl.querySelectorAll('th, td'))) {
        const isHeader = cellEl.tagName.toLowerCase() === 'th'
        const runs = await collectInline(cellEl, isHeader ? { bold: true } : {})
        cells.push(
          new TableCell({
            width: { size: 100 / rowEl.children.length, type: WidthType.PERCENTAGE },
            shading: isHeader ? { type: ShadingType.CLEAR, color: 'auto', fill: CODE_FILL } : undefined,
            children: [new Paragraph({ children: runs })],
          }),
        )
      }
      rows.push(new TableRow({ children: cells }))
    }
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  }

  // Code blocks go through highlight.js in the live app/PDF export, which
  // wraps individual tokens in dozens of differently-colored <span>s —
  // not worth walking span-by-span to reproduce syntax-highlighting
  // colors in a Word document, so this flattens to plain monospace text
  // on a shaded background instead. Preserves the actual code and its
  // line breaks (textContent alone collapses them), just not the coloring.
  function codeBlockToParagraphs(pre: Element, decoration: ParagraphDecoration = {}): ParagraphType[] {
    const code = pre.textContent ?? ''
    const lines = code.split('\n')
    // Only the block's last line carries spacing-after — every line in
    // between needs to sit flush against the next to read as one
    // continuous block, not lines individually spaced apart.
    return lines.map(
      (line, i) =>
        new Paragraph({
          ...decoration,
          spacing: i === lines.length - 1 ? BODY_SPACING : { after: 0 },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: CODE_FILL },
          children: [new TextRun({ text: line || ' ', font: CODE_FONT })],
        }),
    )
  }

  // KaTeX's rendered output is a deeply nested tree of precisely
  // positioned spans, built to be painted by a browser — not something
  // meaningful to walk element-by-element into docx runs. Word has a real
  // native equation format (OMML), but converting LaTeX to OMML is a
  // substantial project of its own, out of scope here. KaTeX's own output
  // already embeds the exact original LaTeX source in an
  // <annotation encoding="application/x-tex"> element (confirmed
  // directly) purely for accessibility/copy-paste — this reuses that as a
  // faithful, if unrendered, fallback: the real expression as text,
  // clearly not a typeset equation. Shared by inlineRuns (inline math,
  // sitting inside a <p> alongside other text) and mathToParagraph (block
  // math not wrapped in a <p>) so both extract it the exact same way.
  function mathAnnotationText(mathEl: Element): string {
    const tex = mathEl.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ?? ''
    const delimiter = mathEl.classList.contains('katex-display') ? '$$' : '$'
    return `${delimiter}${tex}${delimiter}`
  }

  function mathToParagraph(mathEl: Element): ParagraphType {
    return new Paragraph({
      spacing: BODY_SPACING,
      children: [new TextRun({ text: mathAnnotationText(mathEl), italics: true, font: CODE_FONT })],
    })
  }

  // Callouts have no equivalent native Word concept — approximated here
  // as a paragraph with a colored left border (matching the app's own
  // visual convention for them) and a bold title line, rather than
  // dropping the distinction entirely and rendering it as an
  // indistinguishable plain blockquote.
  async function calloutToParagraphs(callout: Element): Promise<ParagraphType[]> {
    const title = callout.querySelector('.callout-title')
    const decoration: ParagraphDecoration = {
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: BORDER_COLOR } },
      indent: { left: 200 },
      // The border alone (no fill) didn't read as a distinct box the way
      // the app/PDF's tinted background does — matches print.css's
      // --bg-tertiary value for the same "this is a callout" cue.
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: CALLOUT_FILL },
    }
    const paragraphs: ParagraphType[] = []
    if (title) {
      paragraphs.push(
        new Paragraph({
          ...decoration,
          spacing: { after: 80 },
          children: [textRun(title.textContent ?? '', { bold: true })],
        }),
      )
    }
    for (const child of Array.from(callout.children)) {
      if (child === title) continue
      paragraphs.push(...(await blockToParagraphs(child, decoration)))
    }
    return paragraphs
  }

  async function blockToParagraphs(el: Element, decoration: ParagraphDecoration = {}): Promise<ParagraphType[]> {
    const tag = el.tagName.toLowerCase()
    const level = headingLevel(tag)
    if (level) {
      return [
        new Paragraph({
          ...decoration,
          spacing: decoration.spacing ?? HEADING_SPACING,
          heading: level,
          // docx's own bundled Heading1-6 styles (verified directly) only
          // set color/size, not bold — Word's real default template does,
          // so without this every heading reads as merely large/colored
          // text rather than a heading.
          children: await collectInline(el, { bold: true }),
        }),
      ]
    }

    switch (tag) {
      case 'p':
        return [new Paragraph({ ...decoration, spacing: decoration.spacing ?? BODY_SPACING, children: await collectInline(el, {}) })]
      case 'ul':
      case 'ol':
        return listToParagraphs(el, decoration)
      case 'pre':
        return codeBlockToParagraphs(el, decoration)
      case 'blockquote': {
        const runs = await collectInline(el, { italics: true })
        return [
          new Paragraph({ ...decoration, spacing: decoration.spacing ?? BODY_SPACING, indent: { left: 400 }, children: runs }),
        ]
      }
      case 'hr':
        return [
          new Paragraph({
            ...decoration,
            spacing: decoration.spacing ?? BODY_SPACING,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_COLOR } },
          }),
        ]
      default:
        if (el.classList.contains('katex') || el.classList.contains('katex-display')) return [mathToParagraph(el)]
        // A table nested inside a callout isn't given the callout's
        // border — an accepted gap (this note's own content never nests
        // one), not worth a real Table's border needing entirely
        // different plumbing than a Paragraph's for one edge case.
        if (el.classList.contains('callout')) return calloutToParagraphs(el)
        // Unrecognized wrapper (transclusion containers, the task-lists
        // plugin's own wrapping <div>, etc.) — not meaningful on its own,
        // just flatten straight through to its children.
        return blockChildren(Array.from(el.children)).then((blocks) =>
          blocks.filter((b): b is ParagraphType => b instanceof Paragraph),
        )
    }
  }

  async function blockChildren(elements: Element[]): Promise<(ParagraphType | TableType)[]> {
    const blocks: (ParagraphType | TableType)[] = []
    for (const el of elements) {
      if (el.tagName.toLowerCase() === 'table') {
        blocks.push(await tableToDocx(el))
      } else {
        blocks.push(...(await blockToParagraphs(el)))
      }
    }
    return blocks
  }

  // Same resolved-content pipeline exportNoteToPDF uses (embeds and
  // images fully fetched before conversion, not left as placeholders) —
  // only the final "turn this into a file" step differs: walking the DOM
  // into docx's object model instead of rasterizing it.
  const container = await buildResolvedNoteContainer(fileId, fileTree)
  const children = await blockChildren(Array.from(container.children))

  const doc = new Document({
    sections: [{ children: children.length > 0 ? children : [new Paragraph({})] }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(title)}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

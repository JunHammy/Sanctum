import MarkdownIt from 'markdown-it'
import mark from 'markdown-it-mark'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import { load as parseYaml } from 'js-yaml'
import { calloutPlugin } from '../lib/markdown-plugins/plugin-callout'
import { tagPlugin } from '../lib/markdown-plugins/plugin-tag'
import { wikilinkPlugin } from '../lib/markdown-plugins/plugin-wikilink'
import { blockIdPlugin } from '../lib/markdown-plugins/plugin-block-id'
import { renderMath } from '../lib/katex-setup'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLang from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdownLang)
hljs.registerLanguage('python', python)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang }).value
  }
  return hljs.highlightAuto(code).value
}

// Exported so MarkdownReader can compute the same id when scrolling to a
// [[Note#Heading]] target — must stay in sync with how ids get assigned below.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

// Headings don't get anchor ids by default in markdown-it — needed so
// [[Note#Heading]] wikilinks have something to scroll to.
function headingIdPlugin(md: MarkdownIt): void {
  md.core.ruler.push('heading-id', (state) => {
    const tokens = state.tokens
    const seen = new Map<string, number>()

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue
      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue

      let slug = slugify(inline.content)
      const count = seen.get(slug) ?? 0
      seen.set(slug, count + 1)
      if (count > 0) slug = `${slug}-${count}`

      tokens[i].attrSet('id', slug)
    }

    return true
  })
}

let renderer: MarkdownIt | null = null

function getRenderer(): MarkdownIt {
  if (!renderer) {
    renderer = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      breaks: false,
      highlight: highlightCode,
    })
      .use(mark) // ==highlight==
      .use(footnote) // [^1]
      .use(taskLists, { enabled: true }) // - [ ] checkboxes
      .use(calloutPlugin) // > [!TYPE] Title
      .use(blockIdPlugin) // trailing ^block-id marker on a paragraph/list item
      .use(tagPlugin) // #tag
      .use(wikilinkPlugin) // [[Note]], [[Note#Heading]], [[Note^block-id]], [[Note|Alias]]
      .use(headingIdPlugin)
  }
  return renderer
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function extractFrontmatter(raw: string): { content: string; data: Record<string, unknown> } {
  const match = raw.match(FRONTMATTER_PATTERN)
  if (!match) return { content: raw, data: {} }

  const data = (parseYaml(match[1]) as Record<string, unknown>) ?? {}
  return { content: raw.slice(match[0].length), data }
}

export interface RenderedNote {
  html: string
  frontmatter: Record<string, unknown>
}

export function renderNote(raw: string): RenderedNote {
  const { content, data } = extractFrontmatter(raw)
  const html = renderMath(getRenderer().render(content))
  return { html, frontmatter: data }
}

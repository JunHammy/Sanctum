import MarkdownIt from 'markdown-it'
import mark from 'markdown-it-mark'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import { load as parseYaml } from 'js-yaml'
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

// Custom syntax (wikilinks, callouts, tags, math) isn't wired in yet —
// this is the base Tier 1 markdown-it pipeline plus frontmatter extraction.
export function renderNote(raw: string): RenderedNote {
  const { content, data } = extractFrontmatter(raw)
  const html = getRenderer().render(content)
  return { html, frontmatter: data }
}

// markdown-it-mark and markdown-it-task-lists don't ship types and have no
// @types package — minimal ambient declarations for the plugin signature.
declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default plugin
}

// turndown/turndown-plugin-gfm ship no types and have no @types package —
// minimal ambient declarations covering just what docx-import.service.ts
// uses (verified directly against the installed packages' actual runtime
// exports, not guessed).
declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx'
    codeBlockStyle?: 'indented' | 'fenced'
    bulletListMarker?: '-' | '+' | '*'
  }

  type TurndownPlugin = (service: TurndownService) => void

  class TurndownService {
    constructor(options?: TurndownOptions)
    turndown(html: string): string
    use(plugin: TurndownPlugin | TurndownPlugin[]): this
  }

  export default TurndownService
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export function gfm(service: TurndownService): void
}

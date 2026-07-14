import { PYTHON_LANG, PYTHON_OUTPUT_LANG } from './python/python-syntax'
import { JS_LANG, JS_OUTPUT_LANG } from './javascript/javascript-syntax'

// The set of fence languages that get a Run button + persisted output —
// shared between plugin-code-blocks.ts (rendering) and split-blocks.ts
// (block-merging), so there's exactly one place that could typo/drift
// between the two — same reasoning python-syntax.ts's own header comment
// already gives for exporting PYTHON_LANG/PYTHON_OUTPUT_LANG from a single
// place, just one level up now that there are two runnable languages.
export interface RunnableLanguageConfig {
  lang: string
  outputLang: string
  blockClass: string
}

export const RUNNABLE_LANGUAGES: RunnableLanguageConfig[] = [
  { lang: PYTHON_LANG, outputLang: PYTHON_OUTPUT_LANG, blockClass: 'python-block' },
  { lang: JS_LANG, outputLang: JS_OUTPUT_LANG, blockClass: 'javascript-block' },
]

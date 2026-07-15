import { useKatexStore } from '../stores/katex.store'

// Same shape as prefetch-block-editor.ts's loadBlockEditor — a plain
// function, not a module-level promise, so it has to be explicitly called
// (AppShell.tsx does, the moment the vault shell mounts) to actually start
// the fetch. A second call anywhere else would just resolve instantly from
// the same cached import() promise, same as that file's own comment
// explains for BlockEditor.
export function loadKatex() {
  return import('katex').then((m) => {
    const mod = m.default
    useKatexStore.setState({ module: mod })
    return mod
  })
}

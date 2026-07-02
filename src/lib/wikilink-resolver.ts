import type { FileTreeNode } from '../types/vault.types'

function flattenFiles(nodes: FileTreeNode[]): Array<{ id: string; name: string }> {
  const files: Array<{ id: string; name: string }> = []
  for (const node of nodes) {
    if (node.type === 'file') files.push({ id: node.id, name: node.name })
    else if (node.type === 'folder') files.push(...flattenFiles(node.children))
  }
  return files
}

// Ghost-link styling for unresolved targets is deferred (dev plan note) —
// this just returns null and the caller decides what to do with that.
export function resolveWikilink(target: string, fileTree: FileTreeNode[]): string | null {
  const allFiles = flattenFiles(fileTree)

  const exact = allFiles.find((f) => f.name === `${target}.md`)
  if (exact) return exact.id

  const caseInsensitive = allFiles.find((f) => f.name.toLowerCase() === `${target.toLowerCase()}.md`)
  if (caseInsensitive) return caseInsensitive.id

  const partial = allFiles.find((f) => f.name.toLowerCase().startsWith(target.toLowerCase()))
  if (partial) return partial.id

  return null
}

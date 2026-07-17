import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FilePlus,
  FolderPlus,
  Search,
  FileSearch,
  Sun,
  Moon,
  Archive,
  LogOut,
  FolderOpen,
  PenLine,
  Keyboard,
  HelpCircle,
} from 'lucide-react'
import { Modal } from './Modal'
import { PromptModal } from './PromptModal'
import { ShortcutsModal } from './ShortcutsModal'
import { useVaultStore } from '../../stores/vault.store'
import { useUIStore } from '../../stores/ui.store'
import { useNoteStore } from '../../stores/note.store'
import { useAuthStore } from '../../stores/auth.store'
import { useToastStore } from '../../stores/toast.store'
import { exportVaultZip } from '../../services/backup.service'
import { toUserMessage, logError } from '../../lib/error-messages'
import { fuzzyMatch } from '../../lib/fuzzy-match'
import { flattenFolders } from '../../lib/vault-tree'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenSearch: () => void
  onOpenQuickSwitcher: () => void
}

interface CommandItem {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
  perform: () => void
}

// Global quick actions (Ctrl+K) — deliberately scoped to things reachable
// without touching vault.store's write paths beyond the same create flows
// the sidebar already exposes (New note/New folder still prompt for a name,
// same as there, rather than silently creating an "Untitled" file with no
// way to rename it afterward — Sanctum has no rename-note feature yet).
export function CommandPalette({ isOpen, onClose, onOpenSearch, onOpenQuickSwitcher }: CommandPaletteProps) {
  const activeNoteId = useNoteStore((s) => s.activeNoteId)
  const toggleReadMode = useNoteStore((s) => s.toggleReadMode)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const fileTree = useVaultStore((s) => s.fileTree)
  const signOut = useAuthStore((s) => s.signOut)
  const showToast = useToastStore((s) => s.show)
  const toastPromise = useToastStore((s) => s.promise)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [promptOpen, setPromptOpen] = useState<'note' | 'folder' | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelected(0)
    }
  }, [isOpen])

  useEffect(() => {
    setSelected(0)
  }, [query])

  async function handleBackup() {
    try {
      await toastPromise(() => exportVaultZip(fileTree), {
        loading: 'Zipping vault…',
        success: 'Vault backup downloaded',
        error: (err) => toUserMessage(err, 'Could not create the vault backup.'),
      })
    } catch (err) {
      logError('commandPalette.backup', err)
    }
  }

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { id: 'new-note', label: 'New note', icon: FilePlus, perform: () => { onClose(); setPromptOpen('note') } },
      { id: 'new-folder', label: 'New folder', icon: FolderPlus, perform: () => { onClose(); setPromptOpen('folder') } },
      { id: 'search', label: 'Search notes', icon: Search, perform: () => { onClose(); onOpenSearch() } },
      { id: 'quick-switch', label: 'Go to note', icon: FileSearch, perform: () => { onClose(); onOpenQuickSwitcher() } },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? Sun : Moon,
        perform: () => { toggleTheme(); onClose() },
      },
      { id: 'backup', label: 'Download vault backup (.zip)', icon: Archive, perform: () => { onClose(); handleBackup() } },
      { id: 'vaults', label: 'Manage vaults', icon: FolderOpen, perform: () => { onClose(); navigate('/vaults') } },
      { id: 'syntax-guide', label: 'Syntax guide', icon: HelpCircle, perform: () => { onClose(); navigate('/help') } },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, perform: () => { onClose(); setShortcutsOpen(true) } },
      { id: 'sign-out', label: 'Sign out', icon: LogOut, perform: () => { onClose(); signOut() } },
    ]
    if (activeNoteId) {
      items.splice(4, 0, {
        id: 'toggle-mode',
        label: 'Toggle Read/Edit mode',
        icon: PenLine,
        perform: () => { toggleReadMode(); onClose() },
      })
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId, theme])

  const results = useMemo(() => {
    if (!query.trim()) return commands
    return commands
      .map((c) => ({ c, score: fuzzyMatch(query, c.label) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c)
  }, [commands, query])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[selected]?.perform()
    }
  }

  async function handleCreateNote(name: string, parentId?: string) {
    setPromptOpen(null)
    try {
      const id = await useVaultStore.getState().createNote(name, parentId)
      showToast(`Created "${name}"`, 'success')
      navigate(`/vault/note/${id}`)
    } catch (err) {
      logError('commandPalette.createNote', err)
      showToast(toUserMessage(err, 'Could not create the note.'), 'error')
    }
  }

  async function handleCreateFolder(name: string, parentId?: string) {
    setPromptOpen(null)
    try {
      await useVaultStore.getState().createFolder(name, parentId)
      showToast(`Created folder "${name}"`, 'success')
    } catch (err) {
      logError('commandPalette.createFolder', err)
      showToast(toUserMessage(err, 'Could not create the folder.'), 'error')
    }
  }

  const flatFolders = useMemo(() => flattenFolders(fileTree), [fileTree])

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Command palette">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command…"
          className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && (
            <p className="px-1 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              No matching commands.
            </p>
          )}
          {results.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm"
              style={{ background: i === selected ? 'var(--bg-tertiary)' : undefined, color: 'var(--text-primary)' }}
              onMouseEnter={() => setSelected(i)}
              onClick={() => cmd.perform()}
            >
              <cmd.icon size={14} />
              {cmd.label}
            </button>
          ))}
        </div>
      </Modal>
      <PromptModal
        isOpen={promptOpen === 'note'}
        title="New note"
        placeholder="Note title"
        onSubmit={handleCreateNote}
        onClose={() => setPromptOpen(null)}
        folders={flatFolders}
      />
      <PromptModal
        isOpen={promptOpen === 'folder'}
        title="New folder"
        placeholder="Folder name"
        onSubmit={handleCreateFolder}
        onClose={() => setPromptOpen(null)}
        folders={flatFolders}
      />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  )
}

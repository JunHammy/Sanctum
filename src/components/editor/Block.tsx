import { memo, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ChevronUp, ChevronDown, GripVertical, Plus, Trash2, Table2, Code, Maximize2, Sigma, BarChart3, Workflow } from 'lucide-react'
import { useVaultStore } from '../../stores/vault.store'
import { useToastStore } from '../../stores/toast.store'
import { resolveWikilink } from '../../lib/wikilink-resolver'
import { useImageResolution } from '../../hooks/useImageResolution'
import { useTransclusion } from '../../hooks/useTransclusion'
import { useCharts } from '../../hooks/useCharts'
import { useMediaEmbeds } from '../../hooks/useMediaEmbeds'
import { useDragScrollTables } from '../../hooks/useDragScrollTables'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { useNoteStore } from '../../stores/note.store'
import { renderBody } from '../../services/markdown.service'
import { parseTable } from '../../lib/table-syntax'
import { parseMathBlock } from '../../lib/math-syntax'
import { parseChartBlock } from '../../lib/chart-syntax'
import { parseFlowchartBlock } from '../../lib/mermaid-syntax'
import { parsePythonBlock, parsePythonBlockId, parsePersistedOutput, serializePythonBlock } from '../../lib/python/python-syntax'
import {
  parseJavaScriptBlock,
  parseJavaScriptBlockId,
  parseJsPersistedOutput,
  serializeJavaScriptBlock,
} from '../../lib/javascript/javascript-syntax'
import { MarkdownEditor } from './MarkdownEditor'
import { TableGridEditor } from './TableGridEditor'
import { MathBlockEditor } from './MathBlockEditor'
import { ChartBlockEditor } from './ChartBlockEditor'
import { MermaidBlockEditor } from './MermaidBlockEditor'
import { CodeBlock, type PersistedCodeOutput } from './CodeBlock'
import { Modal } from '../common/Modal'
import type { Block as BlockType } from '../../lib/blocks/split-blocks'

interface BlockProps {
  block: BlockType
  isActive: boolean
  isSelected: boolean
  onActivate: (id: string) => void
  onChange: (id: string, rawText: string) => void
  onAddBelow: (id: string) => void
  onDelete: (id: string) => void
  onDragStart: (e: DragEvent, id: string) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent, id: string) => void
  onDrop: (e: DragEvent, id: string) => void
  dropIndicator: 'above' | 'below' | null
  isDragging: boolean
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  canMoveUp: boolean
  canMoveDown: boolean
}

const EMPTY_PLACEHOLDER = '<p class="opacity-40">Click to type…</p>'

// Left gutter (drag handle + add-below) stays visible in both active and
// inactive states — reordering or inserting a block shouldn't require
// leaving edit mode first. Delete lives separately, only while inactive
// (viewing) — deliberately not grouped with the frequently-used controls
// so it's not one misclick away from them.
// Inactive content: renders through the exact same renderBody()/
// markdown-body path MarkdownReader uses for the whole document —
// wikilinks, callouts, math, images, tags all just work here with zero new
// rendering code, since it's the same pipeline, just scoped to one block.
// Active content: a scoped instance of the Live Preview CodeMirror editor.
//
// Wrapped in memo() — every callback prop here is a genuinely stable
// reference from BlockEditor (built on functional setState specifically so
// they never need to change identity), so this only actually re-renders
// when *this* block's own data changes. Without that, typing in any one
// block re-rendered — and re-parsed the markdown, and re-ran image
// resolution, for — every other block on every keystroke.
export const Block = memo(function Block({
  block,
  isActive,
  isSelected,
  onActivate,
  onChange,
  onAddBelow,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dropIndicator,
  isDragging,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: BlockProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const isVaultLoading = useVaultStore((s) => s.isLoading)
  const showToast = useToastStore((s) => s.show)
  const isTouch = useIsTouchDevice()
  const containerRef = useRef<HTMLDivElement>(null)
  // Only actually needed by the *inactive* preview branch below (every
  // dangerouslySetInnerHTML site is there, none in the active branch) — but
  // this used to run unconditionally, re-parsing the block's full markdown
  // through renderBody() on every keystroke even while actively editing it,
  // wasted work an active block never uses. Confirmed as a real contributor
  // to a mobile crash via testing, compounding with ChartBlockEditor/
  // MermaidBlockEditor's own heavy live-preview re-renders on every
  // keystroke (see their own debouncedSpec fix) — skipping this here is a
  // straightforward win with no downside, not a tradeoff.
  const html = !isActive && block.rawText.trim() ? renderBody(block.rawText) : EMPTY_PLACEHOLDER

  useImageResolution(containerRef, fileTree, isVaultLoading)
  useTransclusion(containerRef, fileTree)
  useCharts(containerRef)
  useMediaEmbeds(containerRef, fileTree)
  useDragScrollTables(containerRef)
  useTableMinWidth(containerRef)
  // activeNoteId, not a fileId prop threaded down from BlockEditor — Block
  // doesn't otherwise know which note it belongs to, and there's only ever
  // one active note today (no split-pane view yet). Revisit this if that
  // changes.
  const activeNoteId = useNoteStore((s) => s.activeNoteId)

  // Escape hatch for pasting a table copied from elsewhere (the grid can't
  // sanely accept a multi-line paste) and any hand-edit the grid's toolbar
  // doesn't expose. Reset on deactivate so reactivating a block always
  // re-offers the grid view first, rather than remembering a stale
  // "viewed as raw text" choice from a previous editing session.
  const [forceRawMode, setForceRawMode] = useState(false)
  // Full-viewport view for a table that's outgrown the reading column —
  // reuses the exact same TableGridEditor instance (just mounted inside a
  // Modal instead of inline), so there's no separate "expanded editing"
  // logic to keep in sync with the inline one. Resets alongside
  // forceRawMode on deactivate — editing only ever happens while active.
  const [isExpanded, setIsExpanded] = useState(false)
  // Only true while the inline grid is actually scrolling to fit its
  // columns — see TableGridEditor's onOverflowChange. Gates the expand
  // button so it only appears once inline editing has genuinely gotten
  // cramped, not on every table regardless of size.
  const [isOverflowing, setIsOverflowing] = useState(false)
  useEffect(() => {
    if (!isActive) {
      setForceRawMode(false)
      setIsExpanded(false)
    }
  }, [isActive])

  // Classification is computed fresh from the block's current rawText on
  // every render, not decided once at split time — a block's content can
  // turn into (or out of) a valid table shape purely through in-place
  // typing (e.g. the /table snippet landing inside a previously-empty
  // block), and split-blocks.ts only re-runs on note switch/undo, not on
  // every keystroke. Computed unconditionally (not just while active) —
  // the expand button needs to know a block is a table even before it's
  // clicked into, so it can activate + expand in one step.
  const parsedTable = parseTable(block.rawText)
  const table = forceRawMode ? null : parsedTable
  // Same dynamic, every-render classification as tables — a block can turn
  // into (or out of) a $$...$$ span purely through in-place typing (e.g.
  // the /math snippet landing in a previously-empty block). parsedMath
  // holds the extracted LaTeX (possibly ''), not a boolean — null means
  // "not a math block."
  const parsedMath = parseMathBlock(block.rawText)
  const isMath = !forceRawMode && parsedMath !== null
  // Same dynamic classification once more, for a ```chartjs/```plotly fence
  // whose JSON matches the narrow single-series bar/line/pie shape
  // chart-syntax.ts recognizes — anything more complex (multi-series,
  // custom options, an unrecognized trace shape) returns null here and
  // falls through to the plain text editor below, same as an unrecognized
  // table/math shape would. Ungated by forceRawMode (same as parsedTable
  // above, unlike isMath) — the toggle button's own icon needs to know
  // this is a chart even while showing raw text, same reason parsedTable
  // stays ungated.
  const parsedChart = parseChartBlock(block.rawText)
  const chart = forceRawMode ? null : parsedChart
  // Same ungated/gated split once more, for a ```mermaid fence matching the
  // narrow flowchart shape mermaid-syntax.ts recognizes.
  const parsedFlowchart = parseFlowchartBlock(block.rawText)
  const flowchart = forceRawMode ? null : parsedFlowchart
  // Unlike table/math, python/javascript never swap out the text editor —
  // the code itself is still genuinely worth hand-editing as raw text.
  // This just decides whether to *also* show a live Run button + output
  // panel alongside it, in both active and inactive rendering (below), so
  // running code doesn't require deactivating the block first (confirmed
  // via testing: requiring that extra step read as "there's no Run button"
  // since nothing indicated one existed until you clicked away). Rendered
  // as a direct sibling here rather than via a portal into the raw HTML's
  // own `.code-run-controls` placeholder (which plugin-code-blocks.ts still
  // emits, unused here) — confirmed via testing that portaling a live React
  // component into a node living inside this same element's
  // dangerouslySetInnerHTML subtree caused the whole subtree to get
  // silently torn down and rebuilt on every render once that portal's own
  // state started changing (new marker element each pass, byte-identical
  // html content each time — ruled out via direct comparison) — an
  // infinite loop reproduced here specifically after an activate/deactivate
  // cycle. MarkdownReader hit the same wall for its own whole-document
  // rendering and fixed it the same way — see split-code-segments.ts.
  const parsedPython = parsePythonBlock(block.rawText)
  // The block's last-saved run result, if any — parsed straight from its
  // own rawText (the ```python-output fence split-blocks.ts merges onto
  // the same Block as its code fence). Handed to CodeBlock as its
  // starting point so a note doesn't come up blank before anything's been
  // (re-)run this session.
  const parsedOutput = parsePersistedOutput(block.rawText)
  // A ```python ^block-id cell's tag, if any — re-threaded into every
  // serializePythonBlock call below so typing (or running) the cell never
  // silently drops it. See python-syntax.ts's own comment on why this has
  // to happen on every keystroke, not just after a run.
  const parsedPythonBlockId = parsePythonBlockId(block.rawText)
  // JavaScript's own counterpart — a block is never both at once (the fence
  // language decides which, and split-blocks.ts only ever merges a
  // ```javascript-output onto a matching ```javascript fence), so exactly
  // one of parsedPython/parsedJavaScript is non-null for any runnable block.
  const parsedJavaScript = parseJavaScriptBlock(block.rawText)
  const parsedJsOutput = parseJsPersistedOutput(block.rawText)
  const parsedJsBlockId = parseJavaScriptBlockId(block.rawText)

  // Writes a completed run's result back into this block's own rawText —
  // rides the same onChange → BlockEditor.handleBlockChange → note.store
  // pipeline any other edit to this block already goes through, so
  // persisted output picks up autosave/undo for free.
  function handlePersistOutput(output: PersistedCodeOutput) {
    if (parsedPython !== null) onChange(block.id, serializePythonBlock(parsedPython, output, parsedPythonBlockId))
    else if (parsedJavaScript !== null)
      onChange(block.id, serializeJavaScriptBlock(parsedJavaScript, output, parsedJsBlockId))
  }

  // Expanding always lands you in the editable grid/equation, even from
  // Read mode — activating first (if needed) and opening expanded are one
  // motion, so there's no separate "read-only big view" to build and keep
  // consistent with the real editing one. Shared between tables and math:
  // both use the same isExpanded state and Modal, just with different
  // content inside.
  function handleExpand() {
    if (!isActive) onActivate(block.id)
    setIsExpanded(true)
  }

  // Edit mode deliberately doesn't navigate on a wikilink click — clicking
  // one just activates the block for editing, same as clicking anywhere
  // else in it (edit mode is for editing, not link-browsing; switch to
  // Read mode to actually follow a link). But the rendered wikilink is a
  // real `<a href="#">` (plugin-wikilink.ts), and without an explicit
  // preventDefault, that native anchor navigation fires *alongside*
  // onActivate below — confirmed a real bug via testing, not something
  // exclusive to unresolved targets: in this hash-routed app, jumping the
  // URL hash to empty blows away the current route entirely, which is what
  // actually closed the note and reloaded. A resolved target's own
  // resulting state just happened to look closer to "nothing visibly
  // happened," which is why it read as an invalid-link-only problem.
  function handleInactiveClick(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest('.wikilink')
    if (link) {
      e.preventDefault()
      const target = link.getAttribute('data-target')
      if (target && !resolveWikilink(target, fileTree)) {
        showToast(`No note found for "${target}"`, 'error')
      }
    }
    onActivate(block.id)
  }

  return (
    <div
      className="flex items-start gap-1 rounded transition-opacity"
      onDragOver={(e) => onDragOver(e, block.id)}
      onDrop={(e) => onDrop(e, block.id)}
      style={{
        borderTop: `2px solid ${dropIndicator === 'above' ? 'var(--accent-link)' : 'transparent'}`,
        borderBottom: `2px solid ${dropIndicator === 'below' ? 'var(--accent-link)' : 'transparent'}`,
        opacity: isDragging ? 0.4 : 1,
        // Same color-mix-based translucent-tint idiom markdown.css's
        // heading-flash keyframe already uses for a temporary/state-driven
        // highlight, reused here for a persistent one instead.
        background: isSelected ? 'color-mix(in srgb, var(--accent-link) 15%, transparent)' : undefined,
      }}
    >
      {/* Touch has no hover state to reveal these on, and native HTML5 drag
          never fires on touch at all — so touch gets always-visible Move
          Up/Down buttons instead of a drag handle, while desktop keeps the
          hover-revealed drag-to-reorder interaction. */}
      {/* Fixed width (not sized to its own content) so this column occupies
          exactly the same space whether the icons are showing or not.
          MarkdownReader.tsx no longer mirrors this gutter in Read mode —
          confirmed via testing that doing so pushed every note's text
          visibly out of alignment with the header above it on every single
          page view, which was a worse problem than the small one-time
          reflow that now happens when toggling into Edit mode. */}
      <div
        className={`flex w-7 shrink-0 flex-col items-center gap-0.5 pt-0.5 transition-opacity select-none ${
          isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isTouch ? (
          <>
            <button
              type="button"
              aria-label="Move block up"
              disabled={!canMoveUp}
              onClick={() => onMoveUp(block.id)}
              className="rounded p-1.5 hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              aria-label="Move block down"
              disabled={!canMoveDown}
              onClick={() => onMoveDown(block.id)}
              className="rounded p-1.5 hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronDown size={16} />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Drag to reorder"
            draggable
            onDragStart={(e) => onDragStart(e, block.id)}
            onDragEnd={onDragEnd}
            className="cursor-grab rounded p-1 hover:bg-[var(--bg-tertiary)] active:cursor-grabbing"
            style={{ color: 'var(--text-muted)' }}
          >
            <GripVertical size={16} />
          </button>
        )}
        <button
          type="button"
          aria-label="Add block below"
          className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          onClick={() => onAddBelow(block.id)}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="relative min-w-0 flex-1">
        {isActive ? (
          // Deactivation (click-outside or Escape) is handled centrally in
          // BlockEditor via a document-level listener — see the comment
          // there for why a wrapping onBlur wasn't reliable (only fires on
          // focus moving to another focusable element, not clicks on plain
          // page background). Already flowed up via onChange as-you-type,
          // so no separate "save this block" step is needed on deactivate.
          <>
            {(table || isMath) && isExpanded ? (
              <div
                className="rounded-md border p-3 pt-10 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}
              >
                Editing in expanded view…
              </div>
            ) : table ? (
              <TableGridEditor
                id={block.id}
                value={block.rawText}
                onChange={onChange}
                onOverflowChange={setIsOverflowing}
              />
            ) : isMath ? (
              <MathBlockEditor id={block.id} value={block.rawText} onChange={onChange} />
            ) : chart ? (
              <ChartBlockEditor id={block.id} value={block.rawText} onChange={onChange} />
            ) : flowchart ? (
              <MermaidBlockEditor id={block.id} value={block.rawText} onChange={onChange} />
            ) : parsedPython !== null ? (
              // One shared bordered box for the whole "cell" (code + Run/
              // output), not two stacked boxes — see CodeBlock's own
              // comment for why it has no border of its own. `bare` on
              // MarkdownEditor for the same reason. Fed just the code, not
              // the block's full rawText — CodeMirror is uncontrolled (see
              // MarkdownEditor's own comment) and reports its *entire*
              // buffer back on every keystroke, so if it were ever handed
              // the block's persisted output fence too, its stale copy of
              // that fence would silently overwrite a real run's result the
              // next time the user typed anything at all (confirmed as a
              // real bug from testing — the raw output JSON was visibly
              // editable right inside the code editor, and re-running while
              // still active could revert to a stale prior result).
              // onChange reconstructs the full block text by re-attaching
              // whatever the *current* persisted output is — always fresh,
              // even though CodeMirror itself doesn't remount on every
              // render, because MarkdownEditor re-reads this closure via a
              // ref on every render (see its own onChangeRef).
              <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
                <MarkdownEditor
                  bare
                  language="python"
                  value={parsedPython}
                  onChange={(text) => onChange(block.id, serializePythonBlock(text, parsedOutput, parsedPythonBlockId))}
                />
                {activeNoteId && (
                  <CodeBlock
                    language="python"
                    noteId={activeNoteId}
                    blockKey={block.id}
                    code={parsedPython}
                    initialOutput={parsedOutput}
                    onPersist={handlePersistOutput}
                  />
                )}
              </div>
            ) : parsedJavaScript !== null ? (
              // Same shape as the python branch above, just javascript's
              // own fence/output pair — see that branch's comment for why
              // MarkdownEditor is fed just the code, not the block's full
              // rawText.
              <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
                <MarkdownEditor
                  bare
                  language="javascript"
                  value={parsedJavaScript}
                  onChange={(text) => onChange(block.id, serializeJavaScriptBlock(text, parsedJsOutput, parsedJsBlockId))}
                />
                {activeNoteId && (
                  <CodeBlock
                    language="javascript"
                    noteId={activeNoteId}
                    blockKey={block.id}
                    code={parsedJavaScript}
                    initialOutput={parsedJsOutput}
                    onPersist={handlePersistOutput}
                  />
                )}
              </div>
            ) : (
              <MarkdownEditor value={block.rawText} onChange={(text) => onChange(block.id, text)} />
            )}
            {(parsedTable || parsedMath !== null || parsedChart || parsedFlowchart) && (
              <div className="absolute top-2 right-2 flex gap-1.5">
                {((table && isOverflowing) || isMath) && (
                  <button
                    type="button"
                    aria-label={isMath ? 'Expand equation' : 'Expand table'}
                    title={isMath ? 'Expand equation' : 'Expand table'}
                    className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={handleExpand}
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
                {!isExpanded && (
                  <button
                    type="button"
                    aria-label={forceRawMode ? 'Edit visually' : 'Edit as text'}
                    title={forceRawMode ? 'Edit visually' : 'Edit as text'}
                    className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setForceRawMode((v) => !v)}
                  >
                    {forceRawMode ? (
                      parsedTable ? (
                        <Table2 size={14} />
                      ) : parsedChart ? (
                        <BarChart3 size={14} />
                      ) : parsedFlowchart ? (
                        <Workflow size={14} />
                      ) : (
                        <Sigma size={14} />
                      )
                    ) : (
                      <Code size={14} />
                    )}
                  </button>
                )}
              </div>
            )}
            {table && isExpanded && (
              <Modal
                isOpen
                onClose={() => setIsExpanded(false)}
                title="Table (Esc or click outside to close)"
                size="large"
                dataBlockId={block.id}
              >
                <TableGridEditor id={block.id} value={block.rawText} onChange={onChange} />
              </Modal>
            )}
            {isMath && isExpanded && (
              <Modal
                isOpen
                onClose={() => setIsExpanded(false)}
                title="Equation (Esc or click outside to close)"
                size="large"
                dataBlockId={block.id}
              >
                <MathBlockEditor id={block.id} value={block.rawText} onChange={onChange} compact={false} />
              </Modal>
            )}
          </>
        ) : (
          <>
            {parsedPython !== null ? (
              // One shared bordered box, same reasoning as the active
              // branch above — `.python-cell-wrapper` (markdown.css)
              // suppresses `.python-block`'s own standalone border/rounding
              // specifically in this context (it keeps its full one when
              // MarkdownReader is the only container around it, via a
              // portal instead of this sibling arrangement) so the two
              // pieces read as one cell instead of two.
              <div className="python-cell-wrapper overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
                <div
                  ref={containerRef}
                  className="markdown-body cursor-text px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
                  onClick={handleInactiveClick}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {activeNoteId && (
                  <CodeBlock
                    language="python"
                    noteId={activeNoteId}
                    blockKey={block.id}
                    code={parsedPython}
                    initialOutput={parsedOutput}
                    onPersist={handlePersistOutput}
                  />
                )}
              </div>
            ) : parsedJavaScript !== null ? (
              // Same shape as the python branch above.
              <div className="javascript-cell-wrapper overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
                <div
                  ref={containerRef}
                  className="markdown-body cursor-text px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
                  onClick={handleInactiveClick}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {activeNoteId && (
                  <CodeBlock
                    language="javascript"
                    noteId={activeNoteId}
                    blockKey={block.id}
                    code={parsedJavaScript}
                    initialOutput={parsedJsOutput}
                    onPersist={handlePersistOutput}
                  />
                )}
              </div>
            ) : (
              <div
                ref={containerRef}
                className="markdown-body cursor-text rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
                onClick={handleInactiveClick}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
            {(parsedTable || parsedMath !== null) && (
              <button
                type="button"
                aria-label={parsedMath !== null ? 'Expand equation' : 'Expand table'}
                title={parsedMath !== null ? 'Expand equation' : 'Expand table'}
                className={`absolute top-0 right-7 rounded p-1 transition-opacity hover:bg-[var(--bg-tertiary)] ${
                  isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{ color: 'var(--text-muted)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  handleExpand()
                }}
              >
                <Maximize2 size={14} />
              </button>
            )}
            <button
              type="button"
              aria-label="Delete block"
              className={`absolute top-0 right-0 rounded p-1 transition-opacity hover:text-[var(--error)] ${
                isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{ color: 'var(--text-muted)' }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(block.id)
              }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
})

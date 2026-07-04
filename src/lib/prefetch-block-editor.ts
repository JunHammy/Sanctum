// Shared by AppShell (fires the moment the authenticated vault shell mounts,
// well before any note is opened) and NoteView (the actual lazy() import
// site, and a fallback prefetch while just reading). A dynamic import()'s
// resolved promise is cached by identical module id regardless of which
// file calls it first, so whichever of the two fires first starts the real
// network fetch and the other just resolves instantly from that cache.
export const loadBlockEditor = () => import('../components/editor/BlockEditor')

import { create } from 'zustand'

interface NetworkState {
  isOnline: boolean
}

function getInitialIsOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

// Deliberately a leaf store — no imports of other stores, so drive.service.ts
// and every other store can read useNetworkStore.getState().isOnline without
// any circular-import risk. Not persisted: connectivity is a live fact about
// this exact page load, never something to remember across reloads.
export const useNetworkStore = create<NetworkState>()(() => ({
  isOnline: getInitialIsOnline(),
}))

// Registered at module scope, not inside a React hook — drive.service.ts's
// assertOnline() and every store's offline-fallback logic need an accurate
// reading even before App.tsx has mounted anything (e.g. AuthGate's very
// first render).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useNetworkStore.setState({ isOnline: true }))
  window.addEventListener('offline', () => useNetworkStore.setState({ isOnline: false }))
}

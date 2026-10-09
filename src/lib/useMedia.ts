import { useSyncExternalStore } from 'react'

const subs = new Map<string, (cb: () => void) => () => void>()
function subscribe(query: string) {
  let s = subs.get(query)
  if (s) return s
  s = (cb: () => void) => {
    const m = window.matchMedia(query)
    m.addEventListener('change', cb)
    return () => m.removeEventListener('change', cb)
  }
  subs.set(query, s)
  return s
}

export function useMedia(query: string) {
  return useSyncExternalStore(subscribe(query), () => window.matchMedia(query).matches, () => false)
}

export function usePrefersReducedMotion() {
  return useMedia('(prefers-reduced-motion: reduce)')
}

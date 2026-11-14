// Light mode for computers with little memory (4 GB of RAM or less) or few cores.
// Same features; smaller images, simpler meshes, no extra per-pixel ground detail and parts loaded
// only when they are used, so the whole tab stays well under 1 GB.
//
// It turns on by itself when the browser reports 4 GB or less (navigator.deviceMemory, Chrome and Edge)
// or 2 cores or fewer. `?lite` forces it on (also used by the CI tests without a GPU); `?full` forces it off.

interface NavigatorWithMemory {
  deviceMemory?: number
  hardwareConcurrency?: number
}

export function detectLite(search: string, nav: NavigatorWithMemory | undefined): boolean {
  const q = new URLSearchParams(search)
  if (q.has('full')) return false
  if (q.has('lite')) return true
  if (!nav) return false
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2) return true
  return false
}

export const LITE = typeof window !== 'undefined' && detectLite(window.location.search, navigator as NavigatorWithMemory)

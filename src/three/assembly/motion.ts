import { PARTS, turns, type PartId } from './parts'

/**
 * One continuous motion per part, instead of three eased tweens that each come
 * to a stop. The unscrew accelerates; when the thread lets go its axial speed
 * is handed straight to the pull; the pull slows as the part lifts away into
 * its park, which starts before the pull has quite finished so the corner is
 * rounded. The spin has its own channel: it winds down a moment after the
 * thread lets go, while the pull is already under way, instead of stopping
 * dead at the instant the part comes free. Every channel is a cubic Hermite segment, so position and velocity
 * are continuous across the phase boundaries.
 *
 * Installing plays the same curve backwards: in from the park, a gentle
 * deceleration into the thread, and the last turn settles to rest.
 *
 * Times are authored seconds; the engine scales them by TEMPO and speed.
 */
export interface Motion {
  /** total duration */
  T: number
  /** authored seconds before the end at which the next part may start */
  handoff: number
  at(t: number): { engage: number; spin: number; clear: number; park: number }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 0 → 1 between t0 and t1 with start/end rates r0, r1 (per second, of the 0…1 channel) */
function segment(t: number, t0: number, t1: number, r0: number, r1: number) {
  const span = t1 - t0
  const u = clamp01((t - t0) / span)
  // normalised slopes; a Hermite from 0 to 1 is monotone while both stay within [0, 3]
  const m0 = Math.min(3, r0 * span)
  const m1 = Math.min(3, r1 * span)
  const u2 = u * u
  const u3 = u2 * u
  return 3 * u2 - 2 * u3 + (u3 - 2 * u2 + u) * m0 + (u3 - u2) * m1
}

const cache = new Map<PartId, Motion>()

export function removalMotion(id: PartId): Motion {
  const hit = cache.get(id)
  if (hit) return hit
  const d = PARTS[id]
  const screw = d.kind === 'screw'
  // unscrewing is unhurried; pulls are quick
  const tS = screw ? Math.max(0.9, turns(id) * 0.7) : 0.4
  const spinTail = screw ? 0.26 : 0
  const tC = 0.3 + d.clear / 300
  const tP = 0.42
  const overlap = Math.min(0.14, tC * 0.35)

  const t1 = tS
  const t2 = tS + tC
  const p0 = t2 - overlap
  const T = p0 + tP

  // mm/s: the unscrew ends 1.5× faster than its average, and the pull starts at that speed
  const vThread = (1.5 * d.engage) / tS
  const vPullEnd = (0.45 * d.clear) / tC

  const m: Motion = {
    T,
    handoff: Math.min(0.2, T * 0.15),
    at: (t) => ({
      engage: segment(t, 0, t1, 0, vThread / d.engage),
      // starts gently, winds down into the pull; the turns still come out whole
      spin: screw ? segment(t, 0, t1 + spinTail, 0, 0) : 0,
      clear: segment(t, t1, t2, vThread / d.clear, vPullEnd / d.clear),
      park: segment(t, p0, T, 1.3 / tP, 0),
    }),
  }
  cache.set(id, m)
  return m
}

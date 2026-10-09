/**
 * Mechanical definition of the Meridian.
 *
 * Every removable part declares how it is joined to its parent:
 *  - screw: travels `engage` mm along the pen axis while turning
 *           engage / lead full turns (lead = advance per turn of the real
 *           multi-start thread modelled in Blender, so the motion matches the
 *           thread geometry exactly)
 *  - slide: push/pull fit, travels `engage` mm without turning
 * then clears `clear` mm and finally moves to its `park` position.
 *
 * `blockedBy` lists parts that must come off first (a cap covers the nib,
 * the barrel hides the converter, the finial clamps the clip ring).
 * The planner resolves removal order from these edges.
 */
export type PartId = 'cap' | 'capFinial' | 'clip' | 'nib' | 'filler' | 'barrel'

export interface PartDef {
  id: PartId
  parent: PartId | null
  kind: 'screw' | 'slide'
  /** +1 moves toward the nib end, −1 toward the blind end */
  dir: 1 | -1
  engage: number
  lead?: number
  clear: number
  /** mm, pen space: axial offset plus lateral x (up, nib-top side) / z (−z faces the viewer) */
  park: { axial: number; x: number; z: number }
  /**
   * Exploded-view path, relative to the parent: keyframes of (axial, x, z) mm
   * reached at time t (0…1 of the explode slider). Big parts first slide clear
   * along the axis, then step sideways, so nothing passes through anything else.
   */
  explode: { t: number; axial: number; x?: number; z?: number }[]
  /** explode time at which this part starts to move */
  explodeFrom?: number
  blockedBy: PartId[]
  name: string
}

export const PARTS: Record<PartId, PartDef> = {
  cap: {
    id: 'cap',
    parent: null,
    kind: 'screw',
    dir: 1,
    engage: 5.0, // 3-start thread, lead 2.5 mm -> exactly 2 turns, clip back on top
    lead: 2.5,
    clear: 55,
    park: { axial: -20, x: 20, z: 0 }, // lift clear of the nib, then lie back above the pen
    explode: [
      { t: 0.4, axial: 61 },
      { t: 0.7, axial: 61, x: 24 },
      { t: 1, axial: 64, x: 24 },
    ],
    blockedBy: [],
    name: 'Cap',
  },
  capFinial: {
    id: 'capFinial',
    parent: 'cap',
    kind: 'screw',
    dir: 1,
    engage: 3.0, // fine single-start thread, 1.0 mm lead -> 3 turns
    lead: 1.0,
    clear: 6,
    park: { axial: 4, x: 0, z: -15 },
    explode: [{ t: 1, axial: 18 }],
    explodeFrom: 0.65,
    blockedBy: [],
    name: 'Finial',
  },
  clip: {
    id: 'clip',
    parent: 'cap',
    kind: 'slide',
    dir: 1,
    engage: 1.2,
    clear: 31,
    park: { axial: 4, x: 7, z: 0 },
    explode: [{ t: 1, axial: 9 }],
    explodeFrom: 0.65,
    blockedBy: ['capFinial'],
    name: 'Clip',
  },
  nib: {
    id: 'nib',
    parent: null,
    kind: 'slide',
    dir: 1,
    engage: 17.8, // feed leaves the 17.6 mm deep section bore
    clear: 9,
    park: { axial: 4, x: 0, z: 0 },
    explode: [{ t: 1, axial: 22 }],
    explodeFrom: 0.6,
    blockedBy: ['cap'],
    name: 'Nib & feed',
  },
  filler: {
    id: 'filler',
    parent: null,
    kind: 'slide',
    dir: -1,
    engage: 8.2, // collar slides off the 7.6 mm nipple
    clear: 26,
    park: { axial: 4, x: 0, z: 0 },
    explode: [{ t: 1, axial: 20 }],
    explodeFrom: 0.6,
    blockedBy: ['barrel'],
    name: 'Filling system',
  },
  barrel: {
    id: 'barrel',
    parent: null,
    kind: 'screw',
    dir: -1,
    engage: 7.2, // 2-start thread, lead 2.4 mm -> 3 turns
    lead: 2.4,
    clear: 54,
    park: { axial: 8, x: -19, z: -4 },
    explode: [
      { t: 0.4, axial: 75 },
      { t: 0.7, axial: 75, x: -24 },
      { t: 1, axial: 46, x: -24 },
    ],
    blockedBy: ['cap'],
    name: 'Barrel',
  },
}

export const PART_IDS = Object.keys(PARTS) as PartId[]

export function turns(id: PartId) {
  const p = PARTS[id]
  return p.kind === 'screw' && p.lead ? p.engage / p.lead : 0
}

export function turnsLabel(n: number) {
  const whole = Math.floor(n + 1e-6)
  const frac = n - whole
  const f = frac < 0.12 ? '' : frac < 0.42 ? '⅓' : frac < 0.58 ? '½' : frac < 0.9 ? '⅔' : ''
  const w = frac >= 0.9 ? whole + 1 : whole
  const s = `${w || ''}${f}` || '0'
  return `${s} ${w + (f ? 1 : 0) > 1 ? 'turns' : 'turn'}`
}

/** All parts that must be removed (in order) before `id` can come off, including `id`. */
export function removalChain(id: PartId, out: PartId[] = []): PartId[] {
  for (const b of PARTS[id].blockedBy) removalChain(b, out)
  if (!out.includes(id)) out.push(id)
  return out
}

const smooth = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * How far (in explode time) a move on one axis starts before the move on the
 * other axis has finished. The part never stops at a corner: as it slows along
 * the axis it is already gathering speed sideways, so the path is rounded.
 * Small enough that every part is still clear before it turns.
 */
const BLEND = 0.08

/** Position along the exploded-view path at time e (axial is in the part's own direction). */
export function explodeAt(id: PartId, e: number): { axial: number; x: number; z: number } {
  const d = PARTS[id]
  const from = d.explodeFrom ?? 0
  const out = { axial: 0, x: 0, z: 0 }
  for (const ch of ['axial', 'x', 'z'] as const) {
    // each axis is a chain of eased moves; summing the clamped moves gives the value at e
    let base = 0
    let prevT = from
    let lastEnd = from
    let v = 0
    for (const k of d.explode) {
      const next = k[ch] ?? 0
      if (next !== base) {
        const start = Math.max(lastEnd, prevT > from ? prevT - BLEND : prevT)
        v += (next - base) * smooth(clamp01((e - start) / Math.max(1e-6, k.t - start)))
        base = next
        lastEnd = k.t
      }
      prevT = k.t
    }
    out[ch] = v
  }
  return out
}

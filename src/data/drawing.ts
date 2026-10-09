/**
 * Outer silhouettes of each part, in millimetres (z along the axis, r radius),
 * taken from blender/build_meridian.py. Used by the technical drawing on the
 * home page so the published dimensions are the modelled ones.
 */
export type Profile = [z: number, r: number][]

export interface DrawnPart {
  id: string
  name: string
  offset: number // exploded offset along the axis (mm)
  lift?: number // exploded offset across the axis (mm, + is up) — matches the 3D exploded view
  profiles: Profile[]
  threads?: { z0: number; z1: number; r0: number; r1: number; pitch: number }[]
  nib?: boolean
  clip?: [number, number][]
}

const halfWidth = (t: number) => {
  if (t <= 0.42) return 4.0
  if (t <= 0.56) {
    const u = (t - 0.42) / 0.14
    return 4.0 + (3.15 - 4.0) * (1 - Math.pow(1 - u, 2.2))
  }
  if (t <= 0.975) {
    const u = (t - 0.56) / 0.415
    return 3.15 + (0.55 - 3.15) * Math.pow(u, 1.25)
  }
  return 0.55 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.975) / 0.025, 2))) + 0.02
}
const nibProfile: Profile = Array.from({ length: 61 }, (_, i) => {
  const t = 0.33 + (0.67 * i) / 60
  return [104 + 36 * t, halfWidth(t)] as [number, number]
})

export const DRAWING: DrawnPart[] = [
  {
    id: 'barrel',
    name: 'Barrel',
    offset: -46,
    lift: -24,
    profiles: [
      [[-1.6, 0], [-1.52, 2.5], [-1.18, 4.4], [-0.62, 5.3], [-0.1, 5.55], [0.05, 5.5]],
      [[0, 5.3], [1, 5.9], [3, 6.25], [7, 6.4], [80.8, 6.4], [80.8, 6.5], [82.6, 6.5], [82.6, 5.45], [88, 5.45], [88, 4.65]],
    ],
    threads: [{ z0: 83, z1: 88, r0: 5.45, r1: 5.75, pitch: 2.5 / 3 }],
  },
  {
    id: 'filler',
    name: 'Converter',
    offset: -20,
    profiles: [[[18, 0], [18, 2.6], [18.7, 3.0], [25.4, 3.0], [26, 2.2], [26.2, 3.15], [26.5, 3.3], [71.6, 3.3], [71.6, 3.43], [78.3, 3.43], [79.6, 3.05], [79.6, 1.55]]],
  },
  {
    id: 'section',
    name: 'Section',
    offset: 0,
    profiles: [
      [[72, 0.9], [72, 1.5], [79.6, 1.5], [80, 2.4], [80.4, 4.25], [88, 4.25], [88, 5.56], [89.4, 5.56], [89.4, 5.3], [91, 5.26], [96, 5.1], [102, 4.8], [107.5, 4.6], [110.5, 4.56], [113, 4.66], [114.9, 4.92], [115.6, 4.96], [116.3, 4.82], [116.6, 4.5], [116.6, 3.7]],
    ],
    threads: [{ z0: 80.6, z1: 87.8, r0: 4.25, r1: 4.6, pitch: 1.2 }],
  },
  {
    id: 'clip',
    name: 'Clip',
    offset: 73,
    lift: 24,
    // side elevation of the Wheeler clip: ring, arm and roller (r measured from the axis, top side only)
    profiles: [],
    clip: [
      [144.4, 5.9],
      [144.35, 6.7],
      [143.9, 7.45],
      [142.8, 7.9],
      [141.0, 8.02],
      [130.0, 8.0],
      [122.0, 7.98],
      [120.2, 7.9],
    ],
  },
  { id: 'nib', name: 'Nib & feed', offset: 22, profiles: [nibProfile], nib: true },
  {
    id: 'cap',
    name: 'Cap',
    offset: 64,
    lift: 24,
    profiles: [[[82.7, 5.9], [82.7, 6.6], [83.1, 6.85], [84.2, 6.85], [84.2, 6.99], [89.2, 6.99], [89.2, 6.85], [139.5, 6.85], [141.4, 6.75], [143.1, 6.55], [144, 6.3], [144, 0]]],
  },
  {
    id: 'finial',
    name: 'Finial',
    offset: 82,
    lift: 24,
    profiles: [[[144.8, 0], [144.8, 5.9], [145.15, 6.18], [145.9, 6.2], [147, 6.05], [148.4, 5.5], [149.35, 4.6], [149.7, 3.95], [149.7, 0]]],
  },
]

/** Removal order as the assembly engine resolves it from the blocking graph. */
export const STRIP_DOWN = [
  { name: 'Cap', text: 'Unscrews in two full turns. The thread has three starts, so it catches at once from any angle.' },
  { name: 'Finial', text: 'Three turns of a fine thread. It clamps the clip ring and carries the W&R medallion.' },
  { name: 'Clip', text: 'Lifts off the cap once the finial is out. The Wheeler roller clip rides on a knurled wheel.' },
  { name: 'Nib & feed', text: 'A friction fit, 17.6 mm deep in the section. Change the width without changing the pen.' },
  { name: 'Barrel', text: 'Three turns on a two-start thread and it parts from the section.' },
  { name: 'Converter', text: 'Pulls straight off the nipple. Turn its knob and the piston draws ink from the bottle.' },
]

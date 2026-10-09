/** Shared, mutable render stats — written in the frame loop, read by the HUD. */
export const perfStats = {
  fps: 0,
  ms: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  dpr: 1,
  frames: 0,
}

import * as THREE from 'three'
import { NOISE_GLSL } from './glsl'
import type { BodyId, TrimId, InkId } from '@/data/catalog'
import { INKS } from '@/data/catalog'

/* ---------------------------------------------------------------------------
 * Body "look": every body finish is a point in one parameter space, so the
 * pen can morph smoothly from celluloid to steel to carbon to clear acrylic.
 * ------------------------------------------------------------------------- */
export interface BodyLook {
  base: string // flat colour (ebonite, steel, crystal tint)
  colorA: string // celluloid band colours
  colorB: string
  colorC: string // chatoyant fleck / shimmer colour
  swirl: number // 0 flat … 1 full celluloid pattern
  scale: number // pattern frequency (1/mm)
  bands: number // band frequency
  fleck: number
  shimmer: number
  weave: number // carbon twill amount
  brushed: number // brushed-metal streaks
  metalness: number
  roughness: number
  clearcoat: number
  clearcoatRoughness: number
  transmission: number
  seed: number
}

const L = (p: Partial<BodyLook>): BodyLook => ({
  base: '#101010',
  colorA: '#101010',
  colorB: '#202020',
  colorC: '#ffffff',
  swirl: 0,
  scale: 0.16,
  bands: 1.4,
  fleck: 0,
  shimmer: 0,
  weave: 0,
  brushed: 0,
  metalness: 0,
  roughness: 0.2,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  transmission: 0,
  seed: 0,
  ...p,
})

export const BODY_LOOKS: Record<BodyId, BodyLook> = {
  midnight: L({ colorA: '#060b1c', colorB: '#1a3264', colorC: '#a9c2f2', swirl: 1, fleck: 0.55, shimmer: 0.5, scale: 0.085, bands: 0.85, roughness: 0.22, seed: 3 }),
  oxblood: L({ colorA: '#1a0405', colorB: '#741c1a', colorC: '#e89a62', swirl: 1, fleck: 0.5, shimmer: 0.45, scale: 0.08, bands: 0.8, roughness: 0.22, seed: 11 }),
  verdigris: L({ colorA: '#04120c', colorB: '#2f6e58', colorC: '#bfe8d4', swirl: 1, fleck: 0.55, shimmer: 0.5, scale: 0.09, bands: 0.9, roughness: 0.22, seed: 23 }),
  tortoise: L({ colorA: '#170701', colorB: '#9a5214', colorC: '#f0bd68', swirl: 1, fleck: 0.3, shimmer: 0.35, scale: 0.14, bands: 1.1, roughness: 0.2, seed: 41 }),
  ebonite: L({ base: '#141312', colorA: '#141312', colorB: '#1c1a18', swirl: 0.15, scale: 0.05, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.22, seed: 5 }),
  brushed: L({ base: '#d4d7da', colorA: '#d4d7da', colorB: '#dfe1e3', metalness: 1, roughness: 0.27, brushed: 1, clearcoat: 0, seed: 9 }),
  carbon: L({ base: '#0b0c0e', colorA: '#0b0c0e', colorB: '#0b0c0e', weave: 1, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, seed: 2 }),
  crystal: L({ base: '#f4f7fb', colorA: '#f4f7fb', colorB: '#f4f7fb', roughness: 0.03, clearcoat: 0, transmission: 1, seed: 1 }),
}

export interface BodyUniforms {
  [k: string]: THREE.IUniform
  uColorA: { value: THREE.Color }
  uColorB: { value: THREE.Color }
  uColorC: { value: THREE.Color }
  uBase: { value: THREE.Color }
  uSwirl: { value: number }
  uScale: { value: number }
  uBands: { value: number }
  uFleck: { value: number }
  uShimmer: { value: number }
  uWeave: { value: number }
  uBrushed: { value: number }
  uSeed: { value: number }
}

export type BodyMaterial = THREE.MeshPhysicalMaterial & { userData: { uniforms: BodyUniforms } }

export function createBodyMaterial(look: BodyLook): BodyMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    ior: 1.49,
    thickness: 0.0016,
    attenuationColor: new THREE.Color('#dfe9f5'),
    attenuationDistance: 0.03,
    envMapIntensity: 1.1,
    side: THREE.FrontSide,
  }) as BodyMaterial
  const u: BodyUniforms = {
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
    uColorC: { value: new THREE.Color() },
    uBase: { value: new THREE.Color() },
    uSwirl: { value: 0 },
    uScale: { value: 0.15 },
    uBands: { value: 1.5 },
    uFleck: { value: 0 },
    uShimmer: { value: 0 },
    uWeave: { value: 0 },
    uBrushed: { value: 0 },
    uSeed: { value: 0 },
  }
  m.userData.uniforms = u
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vAxisV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvAxisV = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
varying vec3 vAxisV;
uniform vec3 uColorA, uColorB, uColorC, uBase;
uniform float uSwirl, uScale, uBands, uFleck, uShimmer, uWeave, uBrushed, uSeed;
${NOISE_GLSL}
float wr_sparkle = 0.0;
float wr_tow = 0.0;
float wr_towDir = 0.0;
float wr_streak = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 P = vObjPos * 1000.0;               // millimetres in pen space
  float ang = atan(P.z, P.x);
  float rad = max(length(P.xz), 0.5);
  // --- celluloid: domain-warped noise folded into long ribbons, stretched along the axis
  vec3 q = vec3(P.x, P.y * 0.2, P.z) * uScale + vec3(uSeed * 1.37, uSeed * 0.71, uSeed * 2.13);
  float w = wr_snoise(q * 0.45) + 0.5 * wr_snoise(q * 0.9 + 4.0);
  float n = wr_snoise(q + vec3(w * 1.6, w * 0.8, -w * 1.3)) + 0.35 * wr_snoise(q * 2.1 + w);
  float bands = sin((n * uBands + w * 0.35) * 6.2831853) * 0.5 + 0.5;
  bands = smoothstep(0.05, 0.95, bands);
  vec3 cel = mix(uColorA, uColorB, bands);
  // chatoyance: bright, view-dependent ribbons that slide as the pen turns
  vec3 Nv = normalize(vNormal);
  float ndv = abs(dot(Nv, normalize(vViewPosition)));
  float ribbon = sin((n * uBands * 1.9 + ndv * 0.9 + 0.25) * 6.2831853) * 0.5 + 0.5;
  wr_sparkle = smoothstep(0.62, 0.97, ribbon) * smoothstep(0.25, 0.75, bands);
  cel = mix(cel, uColorC, wr_sparkle * uFleck * (0.35 + 0.65 * (1.0 - ndv)));
  vec3 col = mix(uBase, cel, uSwirl);
  // --- carbon twill, laid on the cylinder surface (s = arc length, t = axial)
  float s = ang * rad;
  float t = P.y;
  float a = (s + t) * 0.7071, b = (s - t) * 0.7071;
  float tw = 1.7;
  float ca = floor(a / tw), cb = floor(b / tw);
  wr_towDir = mod(ca + floor(cb * 0.5), 2.0);
  float fa = fract(a / tw), fb = fract(b / tw);
  wr_tow = wr_towDir > 0.5 ? fb : fa;
  float fibre = 0.5 + 0.5 * sin((wr_towDir > 0.5 ? a : b) * 38.0);
  vec3 carbon = mix(vec3(0.018), vec3(0.055, 0.058, 0.064), (wr_towDir > 0.5 ? 0.85 : 0.35) + fibre * 0.15);
  col = mix(col, carbon, uWeave);
  // --- brushed metal: fine streaks running along the axis
  wr_streak = wr_snoise(vec3(s * 9.0, t * 0.12, uSeed)) * 0.6 + wr_snoise(vec3(s * 31.0, t * 0.3, 3.0)) * 0.4;
  col *= 1.0 - uBrushed * 0.07 * (wr_streak * 0.5 + 0.5);
  diffuseColor.rgb = col;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + uBrushed * wr_streak * 0.08 + uWeave * (wr_towDir > 0.5 ? -0.08 : 0.06), 0.02, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
if (uWeave > 0.001) {
  vec3 axisV = normalize(vAxisV);
  vec3 circ = normalize(cross(axisV, normal));
  vec3 d1 = normalize(axisV + circ), d2 = normalize(axisV - circ);
  vec3 across = wr_towDir > 0.5 ? d2 : d1;
  normal = normalize(normal + across * (wr_tow - 0.5) * 0.55 * uWeave);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
  totalEmissiveRadiance += uColorC * wr_sparkle * uShimmer * (0.05 + 0.25 * fres) * uSwirl;
}`,
      )
  }
  m.customProgramCacheKey = () => 'wr-body-v1'
  applyBodyLook(m, look)
  return m
}

const tmpA = new THREE.Color()
const tmpB = new THREE.Color()

export function applyBodyLook(m: BodyMaterial, look: BodyLook) {
  mixBodyLooks(m, look, look, 1)
}

/** Write the interpolation of two looks into the material (t = 0 → a, 1 → b). */
export function mixBodyLooks(m: BodyMaterial, a: BodyLook, b: BodyLook, t: number) {
  const u = m.userData.uniforms
  const col = (out: THREE.Color, x: string, y: string) => out.copy(tmpA.set(x)).lerp(tmpB.set(y), t)
  col(u.uColorA.value, a.colorA, b.colorA)
  col(u.uColorB.value, a.colorB, b.colorB)
  col(u.uColorC.value, a.colorC, b.colorC)
  col(u.uBase.value, a.base, b.base)
  const n = (x: number, y: number) => x + (y - x) * t
  u.uSwirl.value = n(a.swirl, b.swirl)
  u.uScale.value = n(a.scale, b.scale)
  u.uBands.value = n(a.bands, b.bands)
  u.uFleck.value = n(a.fleck, b.fleck)
  u.uShimmer.value = n(a.shimmer, b.shimmer)
  u.uWeave.value = n(a.weave, b.weave)
  u.uBrushed.value = n(a.brushed, b.brushed)
  u.uSeed.value = t < 0.5 ? a.seed : b.seed
  m.metalness = n(a.metalness, b.metalness)
  m.roughness = n(a.roughness, b.roughness)
  m.clearcoat = n(a.clearcoat, b.clearcoat)
  m.clearcoatRoughness = n(a.clearcoatRoughness, b.clearcoatRoughness)
  const tr = n(a.transmission, b.transmission)
  m.transmission = tr < 0.002 ? 0 : tr
  // brushed steel reads best with anisotropic highlights stretched around the barrel
  const an = n(a.brushed, b.brushed)
  m.anisotropy = an < 0.002 ? 0 : an * 0.85
  m.anisotropyRotation = Math.PI / 2
}

/* ---------------------------------------------------------------------------
 * Trim metals
 * ------------------------------------------------------------------------- */
export interface MetalLook {
  color: string
  roughness: number
  metalness: number
  clearcoat: number
}

export const TRIM_LOOKS: Record<TrimId, MetalLook> = {
  gold: { color: '#f3c97c', roughness: 0.17, metalness: 1, clearcoat: 0 },
  palladium: { color: '#dcdcd8', roughness: 0.15, metalness: 1, clearcoat: 0 },
  rose: { color: '#efab94', roughness: 0.17, metalness: 1, clearcoat: 0 },
  noir: { color: '#26262a', roughness: 0.3, metalness: 0.85, clearcoat: 0.6 },
}

export function createMetalMaterial(look: MetalLook) {
  const m = new THREE.MeshPhysicalMaterial({ envMapIntensity: 1.25 })
  applyMetalLook(m, look, look, 1)
  return m
}

export function applyMetalLook(m: THREE.MeshPhysicalMaterial, a: MetalLook, b: MetalLook, t: number) {
  m.color.copy(tmpA.set(a.color)).lerp(tmpB.set(b.color), t)
  m.roughness = a.roughness + (b.roughness - a.roughness) * t
  m.metalness = a.metalness + (b.metalness - a.metalness) * t
  m.clearcoat = a.clearcoat + (b.clearcoat - a.clearcoat) * t
}

export function inkColor(id: InkId) {
  return new THREE.Color(INKS.find((i) => i.id === id)!.color)
}

/* ---------------------------------------------------------------------------
 * Fixed materials
 * ------------------------------------------------------------------------- */
export function createFixedMaterials() {
  return {
    section: new THREE.MeshPhysicalMaterial({ color: '#0b0b0c', roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1 }),
    feed: new THREE.MeshPhysicalMaterial({ color: '#0d0d0e', roughness: 0.62, envMapIntensity: 0.7 }),
    steel: new THREE.MeshPhysicalMaterial({ color: '#d2d4d8', metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
    tipping: new THREE.MeshPhysicalMaterial({ color: '#c7c8cc', metalness: 1, roughness: 0.24 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: '#09090a', roughness: 0.7 }),
    tube: new THREE.MeshPhysicalMaterial({
      color: '#e8eef5',
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      envMapIntensity: 1.4,
      clearcoat: 1,
      side: THREE.DoubleSide,
    }),
    cartridge: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.32,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      envMapIntensity: 1,
    }),
    converterInk: new THREE.MeshPhysicalMaterial({ color: '#1b2b55', roughness: 0.06, clearcoat: 1, envMapIntensity: 0.8 }),
    cartridgeInk: new THREE.MeshPhysicalMaterial({ color: '#1b2b55', roughness: 0.2, envMapIntensity: 0.6 }),
  }
}

export type FixedMaterials = ReturnType<typeof createFixedMaterials>

/* ---------------------------------------------------------------------------
 * Numeric forms — GSAP tweens these flat records directly, so a look change
 * can be interrupted mid-morph and re-targeted without a visual jump.
 * ------------------------------------------------------------------------- */
export type LookNumbers = Record<string, number>

function colorNums(prefix: string, hex: string, out: LookNumbers) {
  const c = new THREE.Color(hex)
  out[prefix + 'R'] = c.r
  out[prefix + 'G'] = c.g
  out[prefix + 'B'] = c.b
}

export function bodyNumbers(l: BodyLook): LookNumbers {
  const n: LookNumbers = {}
  colorNums('a', l.colorA, n)
  colorNums('b', l.colorB, n)
  colorNums('c', l.colorC, n)
  colorNums('base', l.base, n)
  for (const k of ['swirl', 'scale', 'bands', 'fleck', 'shimmer', 'weave', 'brushed', 'metalness', 'roughness', 'clearcoat', 'clearcoatRoughness', 'transmission', 'seed'] as const)
    n[k] = l[k]
  return n
}

export function applyBodyNumbers(m: BodyMaterial, n: LookNumbers) {
  const u = m.userData.uniforms
  u.uColorA.value.setRGB(n.aR, n.aG, n.aB)
  u.uColorB.value.setRGB(n.bR, n.bG, n.bB)
  u.uColorC.value.setRGB(n.cR, n.cG, n.cB)
  u.uBase.value.setRGB(n.baseR, n.baseG, n.baseB)
  u.uSwirl.value = n.swirl
  u.uScale.value = n.scale
  u.uBands.value = n.bands
  u.uFleck.value = n.fleck
  u.uShimmer.value = n.shimmer
  u.uWeave.value = n.weave
  u.uBrushed.value = n.brushed
  u.uSeed.value = n.seed
  m.metalness = n.metalness
  m.roughness = n.roughness
  m.clearcoat = n.clearcoat
  m.clearcoatRoughness = n.clearcoatRoughness
  m.transmission = n.transmission < 0.002 ? 0 : n.transmission
  m.anisotropy = n.brushed < 0.002 ? 0 : n.brushed * 0.85
  m.anisotropyRotation = Math.PI / 2
}

export function metalNumbers(l: MetalLook): LookNumbers {
  const n: LookNumbers = { roughness: l.roughness, metalness: l.metalness, clearcoat: l.clearcoat }
  colorNums('c', l.color, n)
  return n
}

export function applyMetalNumbers(m: THREE.MeshPhysicalMaterial, n: LookNumbers) {
  m.color.setRGB(n.cR, n.cG, n.cB)
  m.roughness = n.roughness
  m.metalness = n.metalness
  m.clearcoat = n.clearcoat
}

import * as THREE from 'three'
import type { Engraving, NibMaterialId, NibSizeId } from '@/data/catalog'
import { FONTS } from '@/data/catalog'
import { BRAND } from '@/brand'

/* All surface graphics are drawn at runtime on canvases, so they stay sharp,
 * follow the customer's text and cost nothing to download. */

const FONT_SPECS = [
  'italic 400 64px "Libre Caslon Text"',
  '400 64px "Libre Caslon Text"',
  '400 64px "Libre Caslon Display"',
  '400 64px "Pinyon Script"',
]

let fontsReady: Promise<unknown> | null = null
export function loadCanvasFonts() {
  if (!fontsReady) {
    fontsReady = 'fonts' in document ? Promise.all(FONT_SPECS.map((f) => document.fonts.load(f).catch(() => null))) : Promise.resolve()
  }
  return fontsReady
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function texture(c: HTMLCanvasElement, srgb = false, aniso = 8) {
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = aniso
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

/* ---------------------------------------------------------------------------
 * Engraving
 * Barrel sleeve: circumference 2π·6.41 mm ≈ 40.3 mm (u), length 52 mm (v).
 * The text runs along the barrel, centred on u = ENGRAVE_U (facing the viewer).
 * ------------------------------------------------------------------------- */
export const ENGRAVE_U = 0.4
export const BARREL_SLEEVE = { r: 6.415, z0: 18, z1: 74 }

export function drawEngraving(e: Engraving): HTMLCanvasElement {
  const font = FONTS.find((f) => f.id === e.font)!
  const text = e.text.trim()

  // 2048 px around (40.3 mm) × 2846 px along (56 mm) -> ~50.8 px/mm
  const circ = 2 * Math.PI * BARREL_SLEEVE.r
  const len = BARREL_SLEEVE.z1 - BARREL_SLEEVE.z0
  const W = 2048
  const H = Math.round((W * len) / circ)
  const barrel = canvas(W, H)
  if (!text) return barrel

  const pxmm = W / circ
  const g = barrel.getContext('2d')!
  let size = (font.id === 'script' ? 5.4 : font.id === 'roman' ? 3.4 : 4.2) * pxmm
  g.save()
  g.translate(ENGRAVE_U * W, H / 2)
  g.rotate(-Math.PI / 2) // text runs from the blind cap toward the section
  const css = () => font.css.replace('{px}', String(Math.round(size)))
  g.font = css()
  // keep within ~44 mm of length
  const maxLen = 44 * pxmm
  while (g.measureText(text).width > maxLen && size > 10) {
    size *= 0.95
    g.font = css()
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  if (font.id === 'roman') {
    ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(size * 0.14)}px`
  }
  g.fillText(text, 0, font.id === 'script' ? size * 0.08 : 0)
  g.restore()
  return barrel
}

export function engravingTexture(e: Engraving) {
  return texture(drawEngraving(e))
}

/* ---------------------------------------------------------------------------
 * Nib face: colour (two-tone plating), engraved imprint and bump.
 * UV layout from the Blender build: u = s / 9 mm + 0.5, v = t (0 rear … 1 tip),
 * nib length 36 mm. Canvas 512 × 2048 -> 56.9 px/mm both ways.
 * ------------------------------------------------------------------------- */
const NIB = { W: 512, H: 2048, sMM: 9, lenMM: 36 }

function nibXY(s: number, t: number): [number, number] {
  return [(s / NIB.sMM + 0.5) * NIB.W, (1 - t) * NIB.H]
}

function halfWidth(t: number) {
  if (t <= 0.42) return 4.0
  if (t <= 0.56) {
    const u = (t - 0.42) / 0.14
    return 4.0 + (3.15 - 4.0) * (1 - Math.pow(1 - u, 2.2))
  }
  if (t <= 0.975) {
    const u = (t - 0.56) / 0.415
    return 3.15 + (0.55 - 3.15) * Math.pow(u, 1.25)
  }
  return 0.3
}

const NIB_COLORS: Record<NibMaterialId, { base: string; heart?: string }> = {
  steel: { base: '#e3e5e8' },
  twotone: { base: '#f0c879', heart: '#e6e8eb' },
  gold18: { base: '#f3c97c' },
}

export function nibTextures(material: NibMaterialId, size: NibSizeId) {
  const color = canvas(NIB.W, NIB.H)
  const bump = canvas(NIB.W, NIB.H)
  const c = color.getContext('2d')!
  const b = bump.getContext('2d')!
  const px = NIB.W / NIB.sMM

  c.fillStyle = NIB_COLORS[material].base
  c.fillRect(0, 0, NIB.W, NIB.H)
  b.fillStyle = '#808080'
  b.fillRect(0, 0, NIB.W, NIB.H)

  // two-tone: rhodium-plated heart following the nib outline toward the tip
  const heart = NIB_COLORS[material].heart
  if (heart) {
    c.fillStyle = heart
    c.beginPath()
    const steps = 40
    for (let i = 0; i <= steps; i++) {
      const t = 0.5 + (0.995 - 0.5) * (i / steps)
      const w = Math.min(halfWidth(t) * 0.62, 1.55 + (t - 0.5) * 0.4)
      const [x, y] = nibXY(-w, t)
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)
    }
    for (let i = steps; i >= 0; i--) {
      const t = 0.5 + (0.995 - 0.5) * (i / steps)
      const w = Math.min(halfWidth(t) * 0.62, 1.55 + (t - 0.5) * 0.4)
      const [x, y] = nibXY(w, t)
      c.lineTo(x, y)
    }
    c.closePath()
    // a heart-shaped crown below the breather hole
    c.fill()
    const [hx, hy] = nibXY(0, 0.505)
    c.beginPath()
    c.arc(hx - 0.85 * px, hy, 0.95 * px, 0, Math.PI * 2)
    c.arc(hx + 0.85 * px, hy, 0.95 * px, 0, Math.PI * 2)
    c.fill()
  }

  // engraved imprint: drawn dark on colour, dark (recessed) on bump
  const ink = material === 'steel' ? 'rgba(40,40,46,0.55)' : 'rgba(90,60,20,0.55)'
  const strokes = (g: CanvasRenderingContext2D, style: string) => {
    g.strokeStyle = style
    g.fillStyle = style
    g.lineWidth = 0.11 * px
    g.lineCap = 'round'
    // scrollwork parallel to the shoulders
    for (const side of [-1, 1]) {
      g.beginPath()
      for (let i = 0; i <= 50; i++) {
        const t = 0.39 + (0.66 - 0.39) * (i / 50)
        const w = halfWidth(t) - 0.55 - 0.12 * Math.sin(i * 0.9)
        const [x, y] = nibXY(side * w, t)
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
      }
      g.stroke()
      g.beginPath()
      for (let i = 0; i <= 40; i++) {
        const t = 0.4 + (0.6 - 0.4) * (i / 40)
        const w = halfWidth(t) - 0.95
        const [x, y] = nibXY(side * w, t)
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
      }
      g.stroke()
    }
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let [x, y] = nibXY(0, 0.468)
    g.font = `italic 400 ${Math.round(1.55 * px)}px "Libre Caslon Text"`
    g.fillText(BRAND.short, x, y)
    ;[x, y] = nibXY(0, 0.432)
    g.font = `400 ${Math.round(0.62 * px)}px "Libre Caslon Display"`
    ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(0.12 * px)}px`
    g.fillText(String(BRAND.established), x, y)
    ;[x, y] = nibXY(0, 0.4)
    g.font = `400 ${Math.round(0.95 * px)}px "Libre Caslon Display"`
    g.fillText(size, x, y)
    if (material === 'gold18') {
      ;[x, y] = nibXY(0, 0.548)
      g.font = `400 ${Math.round(0.58 * px)}px "Libre Caslon Display"`
      g.fillText('18K · 750', x, y)
    }
    ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
  }
  strokes(c, ink)
  strokes(b, '#000')

  const map = texture(color, true, 8)
  const bumpMap = texture(bump, false, 8)
  map.wrapS = bumpMap.wrapS = THREE.ClampToEdgeWrapping
  return { map, bumpMap }
}

/* ---------------------------------------------------------------------------
 * Finial medallion monogram (planar UV, 8 mm across, upright under the clip)
 * A polished field with a sunk, frosted W&R inside a double ring: the bump map
 * gives the cut, the roughness map gives the satin floor of the letters.
 * Call after loadCanvasFonts(), or the glyphs fall back to a system face.
 * ------------------------------------------------------------------------- */
/** roughnessMap multiplier: the field keeps the trim's roughness, the letters get MONO_FROST × it */
export const MONO_FROST = 3

export function monogramTextures() {
  const S = 1024
  const px = S / 8 // pixels per mm
  const c = S / 2

  // one drawing, filled black on transparent, reused for both maps
  const art = canvas(S, S)
  const a = art.getContext('2d')!
  a.fillStyle = a.strokeStyle = '#000'
  a.lineWidth = 0.13 * px
  a.beginPath()
  a.arc(c, c, 3.42 * px, 0, Math.PI * 2)
  a.stroke()
  a.lineWidth = 0.05 * px
  a.beginPath()
  a.arc(c, c, 3.14 * px, 0, Math.PI * 2)
  a.stroke()

  // W and R in roman display capitals, a smaller italic ampersand set between them
  const caps = (sz: number) => `400 ${sz}px "Libre Caslon Display"`
  const amp = (sz: number) => `italic 400 ${sz}px "Libre Caslon Text"`
  let size = 3.3 * px
  const gap = 0.1 * px
  const measure = () => {
    a.font = caps(size)
    const w = a.measureText('W').width
    const r = a.measureText('R').width
    a.font = amp(size * 0.66)
    const m = a.measureText('&').width
    return { w, r, m, total: w + m + r + gap * 2 }
  }
  let mm = measure()
  const maxW = 4.7 * px
  if (mm.total > maxW) {
    size *= maxW / mm.total
    mm = measure()
  }
  a.textBaseline = 'alphabetic'
  a.textAlign = 'left'
  // optical centre: Caslon caps are ~0.66 em tall
  const base = c + size * 0.33
  let x = c - mm.total / 2
  a.font = caps(size)
  a.fillText('W', x, base)
  x += mm.w + gap
  a.font = amp(size * 0.66)
  a.fillText('&', x, base - size * 0.02)
  x += mm.m + gap
  a.font = caps(size)
  a.fillText('R', x, base)

  // bump: mid-grey field, letters sunk, edges softened so the cut reads as a bevel
  const bump = canvas(S, S)
  const b = bump.getContext('2d')!
  b.fillStyle = '#808080'
  b.fillRect(0, 0, S, S)
  ;(b as CanvasRenderingContext2D & { filter?: string }).filter = `blur(${Math.round(0.025 * px)}px)`
  b.drawImage(art, 0, 0)

  // roughness: field 1/MONO_FROST (keeps the trim's polish), letters full (frosted)
  const rough = canvas(S, S)
  const r = rough.getContext('2d')!
  const field = Math.round(255 / MONO_FROST)
  r.fillStyle = `rgb(${field},${field},${field})`
  r.fillRect(0, 0, S, S)
  r.globalCompositeOperation = 'destination-out'
  r.drawImage(art, 0, 0)
  r.globalCompositeOperation = 'destination-over'
  r.fillStyle = '#fff'
  r.fillRect(0, 0, S, S)

  const bumpMap = texture(bump, false, 8)
  const roughnessMap = texture(rough, false, 8)
  bumpMap.wrapS = roughnessMap.wrapS = THREE.ClampToEdgeWrapping
  // glTF UVs have their origin top-left: canvas row 0 is v = 0 (the clip side)
  bumpMap.flipY = roughnessMap.flipY = false
  return { bumpMap, roughnessMap }
}

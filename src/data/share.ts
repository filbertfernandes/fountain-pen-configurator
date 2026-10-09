import type { Config } from './catalog'
import { DEFAULT_CONFIG, OPTIONS, FONTS, ENGRAVE_COLORS, cleanEngraving } from './catalog'

/**
 * Configurations travel in readable query strings, e.g.
 *   /configure?body=crystal&trim=gold&clip=wheel&nib=gold18&w=M&fill=converter&ink=royal&eng=A.+R.&font=script
 * Unknown or invalid values fall back to defaults, so a shared link never breaks the page.
 */
const KEYS = {
  body: 'body',
  trim: 'trim',
  clip: 'clip',
  nibMaterial: 'nib',
  nibSize: 'w',
  fill: 'fill',
  ink: 'ink',
  case: 'case',
} as const

export function encodeConfig(c: Config): string {
  const p = new URLSearchParams()
  for (const [k, q] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) p.set(q, c[k] as string)
  if (c.engraving.text.trim()) {
    p.set('eng', c.engraving.text.trim())
    p.set('font', c.engraving.font)
    p.set('ec', c.engraving.color)
  }
  return p.toString()
}

export function decodeConfig(search: string): Config | null {
  const p = new URLSearchParams(search)
  if (![...p.keys()].some((k) => Object.values(KEYS).includes(k as never) || k === 'eng')) return null
  const c: Config = structuredClone(DEFAULT_CONFIG)
  for (const [k, q] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    const v = p.get(q)
    const list = OPTIONS[k] as readonly { id: string }[]
    if (v && list.some((o) => o.id === v)) (c as unknown as Record<string, string>)[k] = v
  }
  const font = p.get('font')
  const color = p.get('ec')
  c.engraving = cleanEngraving({
    text: p.get('eng') ?? '',
    font: FONTS.some((f) => f.id === font) ? (font as Config['engraving']['font']) : 'caslon',
    color: ENGRAVE_COLORS.some((x) => x.id === color) ? (color as Config['engraving']['color']) : 'match',
  })
  return c
}

export function shareUrl(c: Config): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}configure?${encodeConfig(c)}`
}

/** Short, stable identifier for a configuration (used as the cart line key and order SKU suffix). */
export function configId(c: Config): string {
  const s = encodeConfig(c)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7)
}

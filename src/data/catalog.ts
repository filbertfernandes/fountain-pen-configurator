/**
 * Product definition: every configurable part, its options and how each
 * option is described to the customer. Prices are NOT stored here — they are
 * fetched from the catalog endpoint (see data/pricing.ts), the same way a
 * storefront would read live variant prices.
 */

export type BodyId = 'midnight' | 'oxblood' | 'verdigris' | 'tortoise' | 'ebonite' | 'brushed' | 'carbon' | 'crystal'
export type TrimId = 'gold' | 'palladium' | 'rose' | 'noir'
export type ClipId = 'classic' | 'wheel' | 'minimal'
export type NibMaterialId = 'steel' | 'twotone' | 'gold18'
export type NibSizeId = 'EF' | 'F' | 'M' | 'B'
export type FillId = 'converter' | 'cartridge'
export type InkId = 'blueblack' | 'royal' | 'oxblood' | 'emerald' | 'jet'
export type FontId = 'caslon' | 'script' | 'roman'
export type EngraveColorId = 'match' | 'gold' | 'silver' | 'white' | 'black' | 'vermilion'

export interface Engraving {
  text: string
  font: FontId
  /** what the engraved letters are filled with */
  color: EngraveColorId
}

export interface Config {
  body: BodyId
  trim: TrimId
  clip: ClipId
  nibMaterial: NibMaterialId
  nibSize: NibSizeId
  fill: FillId
  ink: InkId
  engraving: Engraving
}

export type OptionKey = Exclude<keyof Config, 'engraving'>

export interface OptionDef<Id extends string = string> {
  id: Id
  name: string
  note: string
  swatch: string // CSS background for the swatch chip
}

export const DEFAULT_CONFIG: Config = {
  body: 'midnight',
  trim: 'gold',
  clip: 'wheel',
  nibMaterial: 'twotone',
  nibSize: 'F',
  fill: 'converter',
  ink: 'blueblack',
  engraving: { text: '', font: 'caslon', color: 'match' },
}

export const BODIES: OptionDef<BodyId>[] = [
  {
    id: 'midnight',
    name: 'Midnight celluloid',
    note: 'Deep blue celluloid with a slow silver-blue swirl. Turned and hand-polished.',
    swatch: 'radial-gradient(circle at 30% 30%, #4a6aa8 0%, #18264a 45%, #0a1024 100%)',
  },
  {
    id: 'oxblood',
    name: 'Oxblood celluloid',
    note: 'The colour of our first 1899 ledger bindings, with amber depth in the light.',
    swatch: 'radial-gradient(circle at 30% 30%, #b04a3c 0%, #5e1a1c 50%, #2a0a0c 100%)',
  },
  {
    id: 'verdigris',
    name: 'Verdigris celluloid',
    note: 'Green patina tones drawn from the copper roof of the Benefit Street workshop.',
    swatch: 'radial-gradient(circle at 30% 30%, #7fb3a0 0%, #2f6152 50%, #12271f 100%)',
  },
  {
    id: 'tortoise',
    name: 'Tortoiseshell',
    note: 'Layered amber and umber resin. Every barrel is patterned differently.',
    swatch: 'radial-gradient(circle at 35% 35%, #d39a4a 0%, #7a3f12 45%, #2b1305 100%)',
  },
  {
    id: 'ebonite',
    name: 'Black ebonite',
    note: 'Vulcanised rubber with a soft satin finish. Warm in the hand, quiet to the eye.',
    swatch: 'radial-gradient(circle at 30% 30%, #3a3836 0%, #151413 60%, #080808 100%)',
  },
  {
    id: 'brushed',
    name: 'Brushed steel',
    note: 'Solid stainless steel, brushed along the length of the pen. Heavier, cooler.',
    swatch: 'linear-gradient(100deg, #6d7074 0%, #c9ccd0 35%, #8a8d91 55%, #dfe1e3 75%, #75787c 100%)',
  },
  {
    id: 'carbon',
    name: 'Carbon fibre',
    note: 'Twill-woven carbon under a deep lacquer. The lightest Meridian we make.',
    swatch: 'repeating-linear-gradient(45deg, #121315 0 4px, #2a2c30 4px 8px)',
  },
  {
    id: 'crystal',
    name: 'Crystal demonstrator',
    note: 'Clear acrylic. You can see the threads, the converter and the ink inside.',
    swatch: 'linear-gradient(135deg, rgba(255,255,255,.55), rgba(190,210,230,.15) 60%, rgba(255,255,255,.35))',
  },
]

export const TRIMS: OptionDef<TrimId>[] = [
  { id: 'gold', name: 'Gold', note: 'Clip, bands and finials plated in 23K gold.', swatch: 'linear-gradient(135deg,#f6dc9c,#c99a45 55%,#8a6424)' },
  { id: 'palladium', name: 'Palladium', note: 'A cool, bright white metal that does not tarnish.', swatch: 'linear-gradient(135deg,#f4f4f2,#b9bab8 55%,#7d7e7d)' },
  { id: 'rose', name: 'Rose gold', note: 'Gold alloyed with copper for a warm pink tone.', swatch: 'linear-gradient(135deg,#f6c9b4,#c78a72 55%,#875444)' },
  { id: 'noir', name: 'Black PVD', note: 'A hard black coating, applied in vacuum.', swatch: 'linear-gradient(135deg,#4a4a4d,#1a1a1c 55%,#050506)' },
]

export const CLIPS: OptionDef<ClipId>[] = [
  { id: 'wheel', name: 'The Wheeler', note: 'Our signature clip with a knurled roller that glides over cloth.', swatch: '' },
  { id: 'classic', name: 'Ball clip', note: 'A tapered spring clip ending in a polished ball.', swatch: '' },
  { id: 'minimal', name: 'Bar clip', note: 'A flat, straight bar with a square end.', swatch: '' },
]

export const NIB_MATERIALS: OptionDef<NibMaterialId>[] = [
  { id: 'steel', name: 'Polished steel', note: 'A firm, reliable stainless steel nib.', swatch: 'linear-gradient(135deg,#f2f3f5,#a8abb0)' },
  { id: 'twotone', name: 'Two-tone steel', note: 'Gold-plated steel with a rhodium heart.', swatch: 'linear-gradient(90deg,#d9b46a 0 30%,#e6e7ea 30% 70%,#d9b46a 70%)' },
  { id: 'gold18', name: '18K gold', note: 'Solid 18K gold. Softer, with a little spring in the stroke.', swatch: 'linear-gradient(135deg,#f6dc9c,#c99a45)' },
]

export const NIB_SIZES: (OptionDef<NibSizeId> & { line: number })[] = [
  { id: 'EF', name: 'Extra fine', note: 'For small handwriting and thin paper.', swatch: '', line: 0.35 },
  { id: 'F', name: 'Fine', note: 'The everyday choice. Crisp on most paper.', swatch: '', line: 0.5 },
  { id: 'M', name: 'Medium', note: 'A wetter line that shows the ink colour.', swatch: '', line: 0.7 },
  { id: 'B', name: 'Broad', note: 'Bold, generous lines for signatures.', swatch: '', line: 0.95 },
]

export const FILLS: OptionDef<FillId>[] = [
  { id: 'converter', name: 'Piston converter', note: 'Fill from any bottle of ink by turning the knob.', swatch: '' },
  { id: 'cartridge', name: 'Cartridge', note: 'Standard international cartridges. Clean and quick.', swatch: '' },
]

export const INKS: (OptionDef<InkId> & { color: string })[] = [
  { id: 'blueblack', name: 'Iron-gall blue-black', note: 'Writes blue, darkens to near black on the page.', swatch: '#1d2a4a', color: '#1b2b55' },
  { id: 'royal', name: 'Royal blue', note: 'A bright, classic blue.', swatch: '#1d4fd6', color: '#1e4bd8' },
  { id: 'oxblood', name: 'Oxblood', note: 'Deep red-brown.', swatch: '#6b1a1f', color: '#7a1620' },
  { id: 'emerald', name: 'Emerald', note: 'A saturated green.', swatch: '#0d6b4a', color: '#0b7a52' },
  { id: 'jet', name: 'Jet black', note: 'Pure, permanent black.', swatch: '#0b0b0c', color: '#0a0a0c' },
]

export const FONTS: { id: FontId; name: string; short: string; css: string; max: number; upper?: boolean }[] = [
  { id: 'caslon', name: 'Caslon italic', short: 'Italic', css: 'italic 400 {px}px "Libre Caslon Text"', max: 22 },
  { id: 'script', name: 'Copperplate script', short: 'Script', css: '400 {px}px "Pinyon Script"', max: 18 },
  { id: 'roman', name: 'Roman capitals', short: 'Capitals', css: '400 {px}px "Libre Caslon Display"', max: 16, upper: true },
]

/** Engraving runs along the barrel; this is the most it can hold. */
export const ENGRAVE_MAX = 22

export const ENGRAVE_COLORS: (OptionDef<EngraveColorId> & { css: string; metal: boolean; hex: string })[] = [
  { id: 'match', name: 'Match the trim', note: 'Filled with the same metal as the clip and bands.', swatch: '', css: '', metal: true, hex: '' },
  { id: 'gold', name: 'Gold leaf', note: 'Laid in by hand and burnished.', swatch: 'linear-gradient(135deg,#f6dc9c,#c99a45)', css: '#b8893a', metal: true, hex: '#f3c97c' },
  { id: 'silver', name: 'Silver', note: 'Bright silver leaf.', swatch: 'linear-gradient(135deg,#f4f4f2,#a9aaa8)', css: '#8d8f93', metal: true, hex: '#dcdcd8' },
  { id: 'white', name: 'White', note: 'Hard white enamel.', swatch: '#f2f0ea', css: '#a9a69e', metal: false, hex: '#ffffff' },
  { id: 'black', name: 'Black', note: 'Black enamel, for light bodies.', swatch: '#141414', css: '#141414', metal: false, hex: '#121212' },
  { id: 'vermilion', name: 'Vermilion', note: 'The red of the workshop ledgers.', swatch: '#b8352e', css: '#a8302a', metal: false, hex: '#b8352e' },
]

export const OPTIONS = {
  body: BODIES,
  trim: TRIMS,
  clip: CLIPS,
  nibMaterial: NIB_MATERIALS,
  nibSize: NIB_SIZES,
  fill: FILLS,
  ink: INKS,
} as const

export const GROUP_LABELS: Record<OptionKey, string> = {
  body: 'Body',
  trim: 'Trim',
  clip: 'Clip',
  nibMaterial: 'Nib',
  nibSize: 'Nib width',
  fill: 'Filling system',
  ink: 'Ink',
}

export function optionName<K extends OptionKey>(key: K, id: Config[K]): string {
  const list = OPTIONS[key] as readonly OptionDef[]
  return list.find((o) => o.id === id)?.name ?? String(id)
}

export function engravingMax(e: Engraving): number {
  return Math.min(ENGRAVE_MAX, FONTS.find((f) => f.id === e.font)!.max)
}

/** Normalise free text for engraving: printable characters only, length-limited. */
export function cleanEngraving(e: Engraving): Engraving {
  const font = FONTS.find((f) => f.id === e.font)!
  let text = e.text.replace(/[^\p{L}\p{N} .,&'’\-·]/gu, '').replace(/\s{2,}/g, ' ')
  if (font.upper) text = text.toUpperCase()
  text = text.slice(0, engravingMax(e))
  return { ...e, text }
}

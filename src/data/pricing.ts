import { create } from 'zustand'
import type { Config, OptionKey } from './catalog'
import { GROUP_LABELS, optionName } from './catalog'
import { BRAND } from '@/brand'

/** Shape of /api/catalog.json — modelled on a storefront product/variant price feed. */
export interface PriceBook {
  product: string
  currency: string
  updatedAt: string
  base: number
  options: Record<OptionKey, Record<string, number>>
  engraving: number
}

export interface PriceLine {
  key: OptionKey | 'base' | 'engraving'
  label: string
  value: string
  amount: number
}

interface PricingState {
  book: PriceBook | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  load: () => Promise<void>
}

export const usePricing = create<PricingState>((set, get) => ({
  book: null,
  status: 'idle',
  async load() {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading' })
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/catalog.json`, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`Catalog responded ${res.status}`)
      const book = (await res.json()) as PriceBook
      set({ book, status: 'ready' })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Prices could not be loaded' })
    }
  },
}))

const ORDER: OptionKey[] = ['body', 'trim', 'clip', 'nibMaterial', 'nibSize', 'fill', 'ink']

export function priceLines(cfg: Config, book: PriceBook): PriceLine[] {
  const lines: PriceLine[] = [{ key: 'base', label: BRAND.product.name, value: 'Pen', amount: book.base }]
  for (const key of ORDER) {
    const id = cfg[key] as string
    lines.push({ key, label: GROUP_LABELS[key], value: optionName(key, cfg[key]), amount: book.options[key]?.[id] ?? 0 })
  }
  if (cfg.engraving.text.trim()) {
    lines.push({ key: 'engraving', label: 'Engraving', value: `“${cfg.engraving.text.trim()}”`, amount: book.engraving })
  }
  return lines
}

export function totalPrice(cfg: Config, book: PriceBook): number {
  return priceLines(cfg, book).reduce((s, l) => s + l.amount, 0)
}

/** Price difference if `key` were set to `id`, relative to the current config. */
export function optionDelta(cfg: Config, book: PriceBook, key: OptionKey, id: string): number {
  return (book.options[key]?.[id] ?? 0) - (book.options[key]?.[cfg[key] as string] ?? 0)
}

const fmtCache = new Map<string, Intl.NumberFormat>()
export function money(amount: number, currency = 'USD', cents = false): string {
  const k = currency + cents
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
    fmtCache.set(k, f)
  }
  return f.format(amount)
}

export function signedMoney(amount: number, currency = 'USD'): string {
  if (amount === 0) return 'Included'
  return (amount > 0 ? '+' : '−') + money(Math.abs(amount), currency)
}

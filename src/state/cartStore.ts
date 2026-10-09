import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Config } from '@/data/catalog'
import { GROUP_LABELS, optionName, ENGRAVE_COLORS } from '@/data/catalog'
import { configId, encodeConfig } from '@/data/share'
import { BRAND } from '@/brand'

export interface CartLine {
  key: string // configuration id — identical configurations stack
  config: Config
  unitPrice: number
  currency: string
  quantity: number
  thumbnail?: string
  addedAt: number
}

export interface PlacedOrder {
  number: string
  placedAt: number
  email: string
  name: string
  lines: CartLine[]
  subtotal: number
  shipping: number
  total: number
  currency: string
}

interface CartState {
  lines: CartLine[]
  open: boolean
  lastOrder: PlacedOrder | null
  add: (config: Config, unitPrice: number, currency: string, thumbnail?: string) => void
  setQuantity: (key: string, q: number) => void
  remove: (key: string) => void
  clear: () => void
  setOpen: (open: boolean) => void
  placeOrder: (o: Omit<PlacedOrder, 'number' | 'placedAt' | 'lines'>) => PlacedOrder
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      open: false,
      lastOrder: null,
      add(config, unitPrice, currency, thumbnail) {
        const key = configId(config)
        const lines = get().lines
        const existing = lines.find((l) => l.key === key)
        if (existing) {
          set({ lines: lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(9, l.quantity + 1), unitPrice } : l)), open: true })
        } else {
          set({
            lines: [...lines, { key, config, unitPrice, currency, quantity: 1, thumbnail, addedAt: Date.now() }],
            open: true,
          })
        }
      },
      setQuantity(key, q) {
        set({ lines: get().lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(9, q)) } : l)) })
      },
      remove(key) {
        set({ lines: get().lines.filter((l) => l.key !== key) })
      },
      clear() {
        set({ lines: [] })
      },
      setOpen(open) {
        set({ open })
      },
      placeOrder(o) {
        const order: PlacedOrder = {
          ...o,
          number: `WR-${new Date().getFullYear().toString().slice(2)}${Math.floor(10000 + Math.random() * 89999)}`,
          placedAt: Date.now(),
          lines: get().lines,
        }
        set({ lastOrder: order, lines: [] })
        return order
      },
    }),
    {
      name: 'wr-cart-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, lastOrder: s.lastOrder }),
      version: 2,
      // v1 engraving had a placement and no fill colour
      migrate: (persisted, version) => {
        const st = persisted as { lines?: CartLine[]; lastOrder?: PlacedOrder | null }
        if (version < 2 && st.lines) {
          st.lines = st.lines.map((l) => ({ ...l, config: { ...l.config, engraving: { text: l.config.engraving.text, font: l.config.engraving.font, color: 'match' } } }))
        }
        return st as CartState
      },
    },
  ),
)

export function cartCount(lines: CartLine[]) {
  return lines.reduce((n, l) => n + l.quantity, 0)
}

export function cartSubtotal(lines: CartLine[]) {
  return lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0)
}

/** Human-readable line item properties, as they would appear on an order. */
export function lineProperties(c: Config): { name: string; value: string }[] {
  const props = [
    { name: GROUP_LABELS.body, value: optionName('body', c.body) },
    { name: GROUP_LABELS.trim, value: optionName('trim', c.trim) },
    { name: GROUP_LABELS.clip, value: optionName('clip', c.clip) },
    { name: GROUP_LABELS.nibMaterial, value: `${optionName('nibMaterial', c.nibMaterial)}, ${optionName('nibSize', c.nibSize)}` },
    { name: GROUP_LABELS.fill, value: optionName('fill', c.fill) },
    { name: GROUP_LABELS.ink, value: optionName('ink', c.ink) },
  ]
  if (c.engraving.text.trim()) {
    props.push({
      name: 'Engraving',
      value: `“${c.engraving.text.trim()}”, ${
        { caslon: 'Caslon italic', script: 'copperplate script', roman: 'Roman capitals' }[c.engraving.font]
      }, ${(ENGRAVE_COLORS.find((x) => x.id === c.engraving.color)?.name ?? 'Trim metal').toLowerCase()} fill`,
    })
  }
  return props
}

/**
 * The payload a headless storefront would receive for this line
 * (shaped like the Shopify AJAX Cart API `items` entry). Shown in the cart's
 * developer view; this demo never sends it anywhere.
 */
export function cartPayload(line: CartLine) {
  const properties: Record<string, string> = {}
  for (const p of lineProperties(line.config)) properties[p.name] = p.value
  properties['_config'] = encodeConfig(line.config)
  properties['_config_id'] = line.key
  return {
    id: `${BRAND.product.sku}-${line.key}`,
    quantity: line.quantity,
    price: Math.round(line.unitPrice * 100),
    properties,
  }
}

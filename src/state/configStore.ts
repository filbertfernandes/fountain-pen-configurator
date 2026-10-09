import { create } from 'zustand'
import type { Config, OptionKey } from '@/data/catalog'
import { DEFAULT_CONFIG } from '@/data/catalog'
import { applyChange, type Adjustment } from '@/data/rules'

const HISTORY_LIMIT = 60

export interface Toast {
  id: number
  message: string
  undoable?: boolean
}

interface ConfigState {
  config: Config
  past: Config[]
  future: Config[]
  /** the option group the customer is working on (drives camera focus) */
  focus: OptionKey | 'engraving' | null
  /** ledger row currently expanded */
  openRow: string | null
  setOpenRow: (row: string | null, focus: ConfigState['focus']) => void
  toasts: Toast[]
  lastAdjustments: Adjustment[]

  set: (patch: Partial<Config>, opts?: { coalesce?: boolean }) => void
  replace: (config: Config) => void
  undo: () => void
  redo: () => void
  reset: () => void
  setFocus: (f: ConfigState['focus']) => void
  toast: (message: string, undoable?: boolean) => void
  dismiss: (id: number) => void
}

let toastSeq = 1
let lastCoalesceKey = ''
let lastCoalesceAt = 0

export const useConfig = create<ConfigState>((set, get) => ({
  config: structuredClone(DEFAULT_CONFIG),
  past: [],
  future: [],
  focus: null,
  openRow: 'body',
  toasts: [],
  lastAdjustments: [],

  set(patch, opts) {
    const { config, past } = get()
    const result = applyChange(config, patch)
    if (JSON.stringify(result.config) === JSON.stringify(config)) return
    // typing into the engraving field coalesces into a single history entry
    const key = Object.keys(patch).join(',')
    const now = performance.now()
    const coalesce = opts?.coalesce && key === lastCoalesceKey && now - lastCoalesceAt < 1500
    lastCoalesceKey = key
    lastCoalesceAt = now
    set({
      config: result.config,
      past: coalesce ? past : [...past, config].slice(-HISTORY_LIMIT),
      future: [],
      lastAdjustments: result.adjustments,
    })
    for (const a of result.adjustments) get().toast(a.message, true)
  },

  replace(config) {
    set({ config: applyChange(config, {}).config, past: [], future: [] })
  },

  undo() {
    const { past, config, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    lastCoalesceKey = ''
    set({ config: prev, past: past.slice(0, -1), future: [config, ...future].slice(0, HISTORY_LIMIT) })
  },

  redo() {
    const { past, config, future } = get()
    if (!future.length) return
    const [next, ...rest] = future
    lastCoalesceKey = ''
    set({ config: next, past: [...past, config].slice(-HISTORY_LIMIT), future: rest })
  },

  reset() {
    const { config, past } = get()
    set({ config: structuredClone(DEFAULT_CONFIG), past: [...past, config].slice(-HISTORY_LIMIT), future: [] })
  },

  setFocus(focus) {
    if (get().focus !== focus) set({ focus })
  },

  setOpenRow(openRow, focus) {
    set({ openRow, focus })
  },

  toast(message, undoable) {
    const id = toastSeq++
    set({ toasts: [...get().toasts.slice(-2), { id, message, undoable }] })
    window.setTimeout(() => get().dismiss(id), 6500)
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

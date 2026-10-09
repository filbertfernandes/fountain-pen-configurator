import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useStore } from 'zustand'
import { BRAND } from '@/brand'
import { PenStage, type StageApi } from '@/three/PenStage'
import type { PenHandle, FocusRegion, PickTarget } from '@/three/PenModel'
import type { Mode } from '@/three/assembly/engine'
import { useConfig } from '@/state/configStore'
import { useCart } from '@/state/cartStore'
import { usePricing, totalPrice } from '@/data/pricing'
import { decodeConfig, encodeConfig, shareUrl } from '@/data/share'
import { Ledger } from '@/ui/Ledger'
import { PerfHud } from '@/ui/PerfHud'
import { IconUndo, IconRedo, IconFrame, IconCamera, IconGauge } from '@/ui/icons'
import { usePrefersReducedMotion } from '@/lib/useMedia'
import { useDocumentMeta } from '@/lib/meta'
import { THEME } from '@/lib/theme'

const FOCUS_REGION: Record<string, FocusRegion> = {
  body: 'all',
  trim: 'trim',
  clip: 'clip',
  nibMaterial: 'nib',
  nibSize: 'nib',
  fill: 'all',
  ink: 'all',
  engraving: 'engraving',
  case: 'all',
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'closed', label: 'Capped' },
  { id: 'open', label: 'Uncapped' },
  { id: 'exploded', label: 'Exploded' },
]

/** Step-by-step narration for screen readers; nothing is shown on screen. */
function StatusLine({ pen }: { pen: PenHandle }) {
  const status = useStore(pen.engine.view, (s) => s.status)
  const busy = useStore(pen.engine.view, (s) => s.busy)
  return (
    <span className="visually-hidden" aria-live="polite">
      {busy ? status : ''}
    </span>
  )
}

function Toasts() {
  const toasts = useConfig((s) => s.toasts)
  const dismiss = useConfig((s) => s.dismiss)
  const undo = useConfig((s) => s.undo)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id} role="status">
          <span className="toast__msg">{t.message}</span>
          {t.undoable && (
            <button
              type="button"
              className="toast__undo"
              onClick={() => {
                undo()
                dismiss(t.id)
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Configure() {
  const location = useLocation()
  const config = useConfig((s) => s.config)
  const focus = useConfig((s) => s.focus)
  const { undo, redo, replace, toast } = useConfig.getState()
  const canUndo = useConfig((s) => s.past.length > 0)
  const canRedo = useConfig((s) => s.future.length > 0)
  const book = usePricing((s) => s.book)
  const addToCart = useCart((s) => s.add)
  const reduced = usePrefersReducedMotion()

  const [mode, setMode] = useState<Mode>('closed')
  const [pen, setPen] = useState<PenHandle | null>(null)
  const [hud, setHud] = useState(false)
  const [adding, setAdding] = useState(false)
  const api = useRef<StageApi | null>(null)

  useDocumentMeta({
    title: `Configure ${BRAND.product.name} — ${BRAND.name}`,
    description: 'Choose the body, trim, clip, nib and filling system of the Meridian fountain pen and watch it assemble.',
  })

  // shared links: load the configuration from the URL once per navigation
  const loadedFrom = useRef<string | null>(null)
  useEffect(() => {
    if (loadedFrom.current === location.search) return
    loadedFrom.current = location.search
    const c = decodeConfig(location.search)
    if (c) replace(c)
  }, [location.search, replace])

  // keep the address bar in step with the configuration (no history spam)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = `?${encodeConfig(config)}`
      if (window.location.search !== q) {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${q}`)
        loadedFrom.current = q
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [config])

  // looking at the nib uncaps the pen
  useEffect(() => {
    if ((focus === 'nibMaterial' || focus === 'nibSize') && mode === 'closed') setMode('open')
  }, [focus, mode])

  // keyboard: undo/redo, view modes, renderer stats
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      if (mod && !typing && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && !typing && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (!mod && !typing && !e.altKey) {
        if (e.key === '1') setMode('closed')
        if (e.key === '2') setMode('open')
        if (e.key === '3') setMode('exploded')
        if (e.key.toLowerCase() === 'p') setHud((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // clicking a part of the pen opens its row in the ledger
  const onPick = useCallback((t: PickTarget) => {
    const focus = ({ body: 'body', trim: 'trim', clip: 'clip', nib: 'nibMaterial', fill: 'fill', engraving: 'engraving' } as const)[t]
    useConfig.getState().setOpenRow(t, focus)
  }, [])

  const onApi = useCallback((a: StageApi) => {
    api.current = a
  }, [])

  const onAdd = useCallback(() => {
    if (!book) return
    setAdding(true)
    // thumbnail of exactly what the customer configured
    window.requestAnimationFrame(() => {
      let thumb: string | undefined
      try {
        thumb = api.current?.thumbnail()
      } catch {
        thumb = undefined
      }
      addToCart(useConfig.getState().config, totalPrice(useConfig.getState().config, book), book.currency, thumb)
      setAdding(false)
    })
  }, [book, addToCart])

  const onShare = useCallback(async () => {
    const url = shareUrl(useConfig.getState().config)
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied. Anyone who opens it will see this exact pen.')
    } catch {
      window.prompt('Copy this link to share your configuration:', url)
    }
  }, [toast])

  const onSnapshot = useCallback(async () => {
    const blob = await api.current?.capture({ scale: Math.max(2, Math.min(3, 3200 / window.innerWidth)) })
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wheeler-rawson-meridian-${encodeConfig(config).length.toString(36)}${Date.now().toString(36).slice(-4)}.png`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    toast('Image saved to your downloads.')
  }, [config, toast])

  const region = focus ? FOCUS_REGION[focus] : null
  // ?speed=0.2 is a QA aid for recording / slow machines
  const speedParam = useMemo(() => Number(new URLSearchParams(window.location.search).get('speed')) || 0, [])
  const speed = reduced ? 0.001 : speedParam || 1
  const stageView = useMemo(() => ({ azimuth: 0.22, polar: 1.27 }), [])

  return (
    <div className="cfg">
      <section className="cfg__stage" aria-label="3D view of your pen">
        <PenStage
          config={config}
          mode={mode}
          focus={region}
          speed={speed}
          snapOnMount
          showLabels
          onApi={onApi}
          onReady={setPen}
          onPick={onPick}
          view={stageView}
          theme={THEME}
        />
        <div className="stage-head">
          <h1 className="stage-head__title">{BRAND.product.name}</h1>
          <p className="stage-head__sub">
            {BRAND.product.model}: a cartridge-and-converter fountain pen, 150 mm capped. Made to order in {BRAND.city.split(',')[0]}.
          </p>
          {pen && <StatusLine pen={pen} />}
        </div>
        <Toasts />
        {hud && <PerfHud />}
        <div className="stage-bar" role="toolbar" aria-label="View">
          <div className="seg" role="group" aria-label="Display">
            {MODES.map((m) => (
              <button key={m.id} type="button" className="seg__btn" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <span className="stage-bar__sep" />
          <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <IconUndo />
          </button>
          <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <IconRedo />
          </button>
          <button type="button" className="icon-btn icon-btn--opt" onClick={() => api.current?.reframe()} aria-label="Reset the view" title="Reset the view">
            <IconFrame />
          </button>
          <button type="button" className="icon-btn icon-btn--opt" onClick={onSnapshot} aria-label="Save an image of this pen" title="Save image">
            <IconCamera />
          </button>
          <button type="button" className="icon-btn icon-btn--opt" aria-pressed={hud} onClick={() => setHud(!hud)} aria-label="Show renderer statistics" title="Renderer statistics (P)">
            <IconGauge />
          </button>
        </div>
      </section>
      <Ledger onAdd={onAdd} onShare={onShare} adding={adding} />
    </div>
  )
}

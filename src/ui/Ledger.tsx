import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BRAND } from '@/brand'
import type { Config, OptionKey } from '@/data/catalog'
import {
  BODIES,
  TRIMS,
  CLIPS,
  NIB_MATERIALS,
  NIB_SIZES,
  FILLS,
  INKS,
  FONTS,
  ENGRAVE_COLORS,
  GROUP_LABELS,
  optionName,
  engravingMax,
} from '@/data/catalog'
import { usePricing, optionDelta, signedMoney, money, totalPrice, priceLines } from '@/data/pricing'
import { previewAdjustments } from '@/data/rules'
import { useConfig } from '@/state/configStore'
import { IconChevron, ClipGlyph, FillGlyph, IconLink } from './icons'
import { AuthorLink } from './Nav'

type RowId = 'body' | 'trim' | 'clip' | 'nib' | 'fill' | 'ink' | 'engraving'

const ROW_FOCUS: Record<RowId, OptionKey | 'engraving'> = {
  body: 'body',
  trim: 'trim',
  clip: 'clip',
  nib: 'nibMaterial',
  fill: 'fill',
  ink: 'ink',
  engraving: 'engraving',
}

function useAnimatedNumber(value: number, ms = 450) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setShown(value)
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      const v = a + (value - a) * e
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

function Row({
  id,
  label,
  value,
  price,
  open,
  onToggle,
  children,
}: {
  id: RowId
  label: string
  value: ReactNode
  price?: string
  open: boolean
  onToggle: (id: RowId) => void
  children: ReactNode
}) {
  const panel = useId()
  const ref = useRef<HTMLElement>(null)
  // bring a newly opened row to the top of the ledger so its options are visible
  useEffect(() => {
    if (!open || !ref.current) return
    const el = ref.current
    const t = window.setTimeout(() => {
      const scroller = el.closest('.ledger__body') as HTMLElement | null
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTo({ top: el.offsetTop - 8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    }, 340)
    return () => window.clearTimeout(t)
  }, [open])
  return (
    <section className="row" data-open={open} ref={ref}>
      <button type="button" className="row__head" aria-expanded={open} aria-controls={panel} onClick={() => onToggle(id)}>
        <span className="row__label">{label}</span>
        <span className="row__value">{value}</span>
        <span className="row__price">{price}</span>
        <IconChevron className="row__chev" />
      </button>
      <div className="row__panel" id={panel} role="region" aria-label={label} inert={!open}>
        <div className="row__inner">
          <div className="row__content">{children}</div>
        </div>
      </div>
    </section>
  )
}

function Options<K extends OptionKey>({
  k,
  list,
  layout = 'grid',
  render,
}: {
  k: K
  list: readonly { id: string; name: string; note: string; swatch: string }[]
  layout?: 'grid' | 'list'
  render?: (o: { id: string; name: string; note: string; swatch: string }) => ReactNode
}) {
  const cfg = useConfig((s) => s.config)
  const set = useConfig((s) => s.set)
  const book = usePricing((s) => s.book)
  const currentId = cfg[k] as string
  const note = list.find((o) => o.id === currentId)?.note
  return (
    <>
      <div className={`opts ${layout === 'list' ? 'opts--list' : ''}`} role="radiogroup" aria-label={GROUP_LABELS[k]}>
        {list.map((o) => {
          const adj = previewAdjustments(cfg, k, o.id)
          const delta = book ? optionDelta(cfg, book, k, o.id) : null
          const checked = o.id === currentId
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`opt ${layout === 'list' ? 'opt--wide' : ''}`}
              onClick={() => set({ [k]: o.id } as Partial<Config>)}
            >
              {render ? render(o) : o.swatch ? <span className="opt__swatch" style={{ background: o.swatch }} /> : null}
              <span className="opt__text">
                <span className="opt__name">{o.name}</span>
                {layout === 'list' && <span className="opt__note">{o.note}</span>}
                {!checked && delta !== null && delta !== 0 && <span className="opt__price">{signedMoney(delta, book!.currency)}</span>}
                {!checked && adj.length > 0 && (
                  <span className="opt__warn">Also changes {adj.map((a) => `${GROUP_LABELS[a.key].toLowerCase()} to ${optionName(a.key, a.to as never)}`).join(', ')}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      {layout === 'grid' && note && <p className="desc">{note}</p>}
    </>
  )
}

function NibLine({ width }: { width: number }) {
  // drawn at 4× so the difference between EF and B is legible on screen
  return (
    <svg className="nibline" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden>
      <path d="M2 14 C 18 4, 30 20, 46 10 S 76 6, 98 12" stroke="currentColor" strokeWidth={width * 4} fill="none" strokeLinecap="round" />
    </svg>
  )
}

const TRIM_TEXT: Record<string, string> = { gold: '#ecc681', palladium: '#e0e0dc', rose: '#ebb19b', noir: '#2b2b2e' }

function Engraving() {
  const e = useConfig((s) => s.config.engraving)
  const body = useConfig((s) => s.config.body)
  const trim = useConfig((s) => s.config.trim)
  const set = useConfig((s) => s.set)
  const setFocus = useConfig((s) => s.setFocus)
  const book = usePricing((s) => s.book)
  const max = engravingMax(e)
  const font = FONTS.find((f) => f.id === e.font)!
  const fontCss = font.css.replace('{px}', '28')
  const inputId = useId()
  return (
    <div>
      <div className="field">
        <label className="field__label" htmlFor={inputId}>
          <span>Text</span>
          <span aria-live="polite">
            {e.text.length}/{max}
          </span>
        </label>
        <input
          id={inputId}
          className="input"
          value={e.text}
          maxLength={max}
          placeholder="A. R. Wheeler"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setFocus('engraving')}
          onChange={(ev) => set({ engraving: { ...e, text: ev.target.value } }, { coalesce: true })}
        />
      </div>
      <div className="field">
        <span className="field__label">Lettering</span>
        <div className="seg seg--field" role="radiogroup" aria-label="Lettering">
          {FONTS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={e.font === f.id} aria-pressed={e.font === f.id} className="seg__btn" title={f.name} onClick={() => set({ engraving: { ...e, font: f.id } })}>
              {f.short}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field__label">
          <span>Fill</span>
          <span>{ENGRAVE_COLORS.find((c) => c.id === e.color)!.name}</span>
        </span>
        <div className="fills" role="radiogroup" aria-label="Engraving fill">
          {ENGRAVE_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={e.color === c.id}
              aria-label={c.name}
              title={c.name}
              className="fill-chip"
              style={{ background: c.id === 'match' ? TRIMS.find((t) => t.id === trim)!.swatch : c.swatch }}
              onClick={() => set({ engraving: { ...e, color: c.id } })}
            >
              {c.id === 'match' && <span className="fill-chip__label">Trim</span>}
            </button>
          ))}
        </div>
      </div>
      {/* the preview sits on the chosen body so the contrast is honest */}
      <div
        className="engrave-preview"
        data-empty={!e.text.trim()}
        style={{
          background: BODIES.find((b) => b.id === body)!.swatch,
          ...(e.text.trim()
            ? {
                font: fontCss,
                letterSpacing: font.id === 'roman' ? '0.14em' : undefined,
                color: e.color === 'match' ? TRIM_TEXT[trim] : ENGRAVE_COLORS.find((c) => c.id === e.color)!.hex,
              }
            : {}),
        }}
      >
        {e.text.trim() || 'Your engraving will appear here and on the pen.'}
      </div>
      <p className="desc">
        Hand-engraved along the barrel, then filled with leaf or enamel. {book ? `${money(book.engraving, book.currency)}.` : ''} Engraved pens cannot be returned.
      </p>
    </div>
  )
}

export { ROW_FOCUS }
export type { RowId }

export function Ledger({ onAdd, onShare, adding }: { onAdd: () => void; onShare: () => void; adding: boolean }) {
  const cfg = useConfig((s) => s.config)
  const open = useConfig((s) => s.openRow) as RowId | null
  const setOpenRow = useConfig((s) => s.setOpenRow)
  const { book, status, load } = usePricing()
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (id: RowId) => {
    const next = open === id ? null : id
    setOpenRow(next, next ? ROW_FOCUS[next] : null)
  }

  const total = book ? totalPrice(cfg, book) : 0
  const animated = useAnimatedNumber(total)
  const p = (k: OptionKey) => {
    if (!book) return undefined
    const v = book.options[k]?.[cfg[k] as string] ?? 0
    return v ? `+${money(v, book.currency)}` : ''
  }
  const engraved = cfg.engraving.text.trim()

  return (
    <aside className="cfg__ledger" aria-label="Configuration">
      <div className="ledger__body">
        <Row id="body" label="Body" value={optionName('body', cfg.body)} price={p('body')} open={open === 'body'} onToggle={toggle}>
          <Options k="body" list={BODIES} />
        </Row>
        <Row id="trim" label="Trim" value={optionName('trim', cfg.trim)} price={p('trim')} open={open === 'trim'} onToggle={toggle}>
          <Options k="trim" list={TRIMS} />
        </Row>
        <Row id="clip" label="Clip" value={optionName('clip', cfg.clip)} price={p('clip')} open={open === 'clip'} onToggle={toggle}>
          <Options k="clip" list={CLIPS} layout="list" render={(o) => <ClipGlyph id={o.id as 'wheel'} className="opt__icon" />} />
        </Row>
        <Row
          id="nib"
          label="Nib"
          value={`${optionName('nibMaterial', cfg.nibMaterial)}, ${cfg.nibSize}`}
          price={p('nibMaterial')}
          open={open === 'nib'}
          onToggle={toggle}
        >
          <Options k="nibMaterial" list={NIB_MATERIALS} />
          <div style={{ height: 18 }} />
          <Options
            k="nibSize"
            list={NIB_SIZES.map((n) => ({ ...n, name: `${n.id} — ${n.name}` }))}
            render={(o) => <NibLine width={NIB_SIZES.find((n) => n.id === o.id)!.line} />}
          />
        </Row>
        <Row id="fill" label="Filling" value={optionName('fill', cfg.fill)} price={p('fill')} open={open === 'fill'} onToggle={toggle}>
          <Options k="fill" list={FILLS} layout="list" render={(o) => <FillGlyph id={o.id as 'converter'} className="opt__icon" />} />
        </Row>
        <Row id="ink" label="Ink" value={optionName('ink', cfg.ink)} open={open === 'ink'} onToggle={toggle}>
          <Options k="ink" list={INKS} />
        </Row>
        <Row
          id="engraving"
          label="Engraving"
          value={engraved ? `“${engraved}”` : 'None'}
          price={engraved && book ? `+${money(book.engraving, book.currency)}` : ''}
          open={open === 'engraving'}
          onToggle={toggle}
        >
          <Engraving />
        </Row>
        <p className="demo-note demo-note--body">
          A portfolio project by <AuthorLink />. {BRAND.name} is fictional; nothing is sold.
        </p>
      </div>

      <div className="ledger__foot">
        {showBreakdown && book && (
          <ul className="breakdown" aria-label="Price breakdown">
            {priceLines(cfg, book).map((l) => (
              <li key={l.key}>
                <span>
                  {l.key === 'base' ? l.label : `${l.label}: ${l.value}`}
                </span>
                <span>{l.key === 'base' ? money(l.amount, book.currency) : l.amount ? `+${money(l.amount, book.currency)}` : '—'}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="total">
          <div>
            <div className="total__label">Total</div>
            <button type="button" className="total__breakdown" aria-expanded={showBreakdown} onClick={() => setShowBreakdown((v) => !v)}>
              {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
            </button>
          </div>
          <div className="total__value" aria-live="polite" aria-atomic="true">
            {status === 'ready' && book ? money(Math.round(animated), book.currency) : status === 'error' ? 'Unavailable' : <span className="price-skeleton" aria-label="Loading price" />}
          </div>
        </div>
        <div className="foot-actions">
          <button type="button" className="btn btn--primary" onClick={onAdd} disabled={!book || adding}>
            {adding ? 'Adding…' : 'Add to bag'}
          </button>
          <button type="button" className="btn btn--ghost btn--share" onClick={onShare} aria-label="Copy a link to this configuration">
            <IconLink width={18} height={18} />
            <span className="btn__label">Share</span>
          </button>
        </div>
        {status === 'error' && <p className="demo-note">Prices could not be loaded. Check your connection and reload the page.</p>}
        <p className="demo-note demo-note--foot">
          A portfolio project by <AuthorLink />. {BRAND.name} is fictional; nothing is sold.
        </p>
      </div>
    </aside>
  )
}

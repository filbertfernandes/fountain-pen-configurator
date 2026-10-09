import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { BRAND } from '@/brand'
import { useCart, cartSubtotal, lineProperties, cartPayload } from '@/state/cartStore'
import { money } from '@/data/pricing'
import { encodeConfig } from '@/data/share'
import { IconClose } from './icons'

export function CartDrawer() {
  const { lines, open, setOpen, setQuantity, remove } = useCart()
  const navigate = useNavigate()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('button, a[href], input, summary, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, setOpen])

  if (!open) return null
  const currency = lines[0]?.currency ?? 'USD'
  const subtotal = cartSubtotal(lines)

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="bag-title" ref={panelRef}>
        <div className="drawer__head">
          <h2 className="drawer__title" id="bag-title">
            Your bag
          </h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close bag">
            <IconClose />
          </button>
        </div>
        <div className="drawer__body">
          {lines.length === 0 ? (
            <div className="empty">
              <p>Your bag is empty. Every Meridian is made to order — start with the body and work your way to the nib.</p>
              <Link to="/configure" className="btn btn--ghost" onClick={() => setOpen(false)}>
                Configure a pen
              </Link>
            </div>
          ) : (
            lines.map((l) => (
              <article className="line" key={l.key}>
                {l.thumbnail ? <img className="line__thumb" src={l.thumbnail} alt="" /> : <div className="line__thumb" />}
                <div>
                  <div className="line__top">
                    <span className="line__name">{BRAND.product.name}</span>
                    <span className="line__price">{money(l.unitPrice * l.quantity, l.currency)}</span>
                  </div>
                  <dl className="props">
                    {lineProperties(l.config).map((p) => (
                      <div key={p.name} style={{ display: 'contents' }}>
                        <dt>{p.name}</dt>
                        <dd>{p.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="line__actions">
                    <div className="qty" role="group" aria-label="Quantity">
                      <button type="button" onClick={() => setQuantity(l.key, l.quantity - 1)} aria-label="Decrease quantity" disabled={l.quantity <= 1}>
                        −
                      </button>
                      <span aria-live="polite">{l.quantity}</span>
                      <button type="button" onClick={() => setQuantity(l.key, l.quantity + 1)} aria-label="Increase quantity" disabled={l.quantity >= 9}>
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setOpen(false)
                        navigate(`/configure?${encodeConfig(l.config)}`)
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="link-btn" onClick={() => remove(l.key)}>
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
          {lines.length > 0 && (
            <details className="payload">
              <summary>Cart payload (developer view)</summary>
              <pre>{JSON.stringify({ items: lines.map(cartPayload) }, null, 2)}</pre>
            </details>
          )}
        </div>
        {lines.length > 0 && (
          <div className="drawer__foot">
            <div className="subtotal">
              <span>Subtotal</span>
              <strong>{money(subtotal, currency)}</strong>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                setOpen(false)
                navigate('/checkout')
              }}
            >
              Check out
            </button>
            <p className="demo-note">Shipping is calculated at checkout. This is a demonstration store; no payment is taken.</p>
          </div>
        )}
      </div>
    </>
  )
}

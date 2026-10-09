import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { BRAND } from '@/brand'
import { useCart, cartSubtotal, lineProperties } from '@/state/cartStore'
import { money } from '@/data/pricing'
import { useDocumentMeta } from '@/lib/meta'

const SHIPPING = [
  { id: 'standard', name: 'Insured courier', note: '3–5 days after the pen is finished', price: 0 },
  { id: 'express', name: 'Express, signed for', note: '1–2 days after the pen is finished', price: 28 },
]

interface Errors {
  [k: string]: string | undefined
}

export default function Checkout() {
  useDocumentMeta({ title: `Checkout — ${BRAND.name}` })
  const lines = useCart((s) => s.lines)
  const placeOrder = useCart((s) => s.placeOrder)
  const navigate = useNavigate()
  const [ship, setShip] = useState('standard')
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  const currency = lines[0]?.currency ?? 'USD'
  const subtotal = cartSubtotal(lines)
  const shipping = SHIPPING.find((s) => s.id === ship)!.price
  const total = subtotal + shipping

  if (!lines.length) {
    return (
      <div className="page">
        <h1 className="page__title">Checkout</h1>
        <p className="page__lede">Your bag is empty, so there is nothing to check out yet.</p>
        <Link to="/configure" className="btn btn--primary">
          Configure a pen
        </Link>
      </div>
    )
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    const next: Errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) next.email = 'Enter an email address like name@example.com.'
    if (!v('name')) next.name = 'Enter the name for the delivery.'
    if (!v('address')) next.address = 'Enter a street address.'
    if (!v('city')) next.city = 'Enter a town or city.'
    if (!v('postal')) next.postal = 'Enter a postal code.'
    setErrors(next)
    if (Object.keys(next).length) {
      const first = e.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)
      first?.focus()
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      const order = placeOrder({ email: v('email'), name: v('name'), subtotal, shipping, total, currency })
      navigate(`/order/${order.number}`)
    }, 700)
  }

  const field = (name: string, label: string, props: Record<string, string | boolean> = {}) => (
    <div className="field">
      <label className="field__label" htmlFor={`co-${name}`}>
        <span>{label}</span>
      </label>
      <input
        id={`co-${name}`}
        name={name}
        className="input"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `co-${name}-err` : undefined}
        {...props}
      />
      {errors[name] && (
        <span className="field__error" id={`co-${name}-err`}>
          {errors[name]}
        </span>
      )}
    </div>
  )

  return (
    <div className="page checkout">
      <h1 className="page__title">Checkout</h1>
      <div className="notice" role="note">
        <span>
          <strong>Demonstration checkout.</strong> {BRAND.demoNotice} No card details are requested.
        </span>
      </div>
      <div className="checkout__grid">
        <form className="checkout__form" onSubmit={onSubmit} noValidate>
          <fieldset className="fs">
            <legend className="fs__legend">Contact</legend>
            {field('email', 'Email', { type: 'email', autoComplete: 'email', inputMode: 'email' })}
          </fieldset>
          <fieldset className="fs">
            <legend className="fs__legend">Delivery</legend>
            {field('name', 'Full name', { autoComplete: 'name' })}
            {field('address', 'Street address', { autoComplete: 'street-address' })}
            <div className="fs__row">
              {field('city', 'Town or city', { autoComplete: 'address-level2' })}
              {field('postal', 'Postal code', { autoComplete: 'postal-code' })}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="co-country">
                <span>Country</span>
              </label>
              <select id="co-country" name="country" className="input" defaultValue="US" autoComplete="country">
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="ID">Indonesia</option>
                <option value="JP">Japan</option>
                <option value="DE">Germany</option>
                <option value="AU">Australia</option>
              </select>
            </div>
          </fieldset>
          <fieldset className="fs">
            <legend className="fs__legend">Shipping</legend>
            <div className="opts opts--list" role="radiogroup" aria-label="Shipping">
              {SHIPPING.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={ship === s.id} className="opt opt--wide" onClick={() => setShip(s.id)}>
                  <span className="opt__text">
                    <span className="opt__name">{s.name}</span>
                    <span className="opt__note">{s.note}</span>
                  </span>
                  <span className="opt__price">{s.price ? money(s.price, currency) : 'Free'}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Placing order…' : `Place demo order, ${money(total, currency)}`}
          </button>
        </form>

        <aside className="summary" aria-label="Order summary">
          <h2 className="summary__title">Order summary</h2>
          {lines.map((l) => (
            <div className="line" key={l.key}>
              {l.thumbnail ? <img className="line__thumb" src={l.thumbnail} alt="" /> : <div className="line__thumb" />}
              <div>
                <div className="line__top">
                  <span className="line__name">
                    {BRAND.product.name}
                    {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                  </span>
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
              </div>
            </div>
          ))}
          <dl className="totals">
            <dt>Subtotal</dt>
            <dd>{money(subtotal, currency)}</dd>
            <dt>Shipping</dt>
            <dd>{shipping ? money(shipping, currency) : 'Free'}</dd>
            <dt className="totals__grand">Total</dt>
            <dd className="totals__grand">{money(total, currency)}</dd>
          </dl>
        </aside>
      </div>
    </div>
  )
}

import { Link, useParams } from 'react-router'
import { BRAND } from '@/brand'
import { useCart, lineProperties } from '@/state/cartStore'
import { money } from '@/data/pricing'
import { useDocumentMeta } from '@/lib/meta'
import { IconCheck } from '@/ui/icons'

export default function OrderConfirmed() {
  const { number } = useParams()
  const order = useCart((s) => s.lastOrder)
  useDocumentMeta({ title: `Order ${number ?? ''} — ${BRAND.name}` })

  if (!order || order.number !== number) {
    return (
      <div className="page">
        <h1 className="page__title">Order not found</h1>
        <p className="page__lede">This order is not stored in this browser. Demo orders are kept only on the device that placed them.</p>
        <Link to="/configure" className="btn btn--primary">
          Configure a pen
        </Link>
      </div>
    )
  }

  const date = new Date(order.placedAt)
  const ready = new Date(order.placedAt + 21 * 86400000)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="page confirm">
      <div className="confirm__mark" aria-hidden>
        <IconCheck />
      </div>
      <h1 className="page__title">Thank you, {order.name.split(' ')[0]}.</h1>
      <p className="page__lede">
        Demo order <strong>{order.number}</strong> was placed on {fmt(date)}. In a real workshop, your Meridian would be turned, fitted and tested over three weeks and ready around {fmt(ready)}. Nothing was charged and no email was sent to {order.email}.
      </p>
      <div className="confirm__lines">
        {order.lines.map((l) => (
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
          <dt>Shipping</dt>
          <dd>{order.shipping ? money(order.shipping, order.currency) : 'Free'}</dd>
          <dt className="totals__grand">Total</dt>
          <dd className="totals__grand">{money(order.total, order.currency)}</dd>
        </dl>
      </div>
      <Link to="/configure" className="btn btn--ghost">
        Configure another pen
      </Link>
    </div>
  )
}

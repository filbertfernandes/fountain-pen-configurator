import { Link } from 'react-router'
import { BRAND } from '@/brand'
import { useDocumentMeta } from '@/lib/meta'

export default function NotFound() {
  useDocumentMeta({ title: `Page not found — ${BRAND.name}` })
  return (
    <div className="page notfound">
      <h1 className="page__title">This page isn&rsquo;t in the ledger</h1>
      <p className="page__lede">The address may have changed, or the link was copied with a part missing. The configurator and the Meridian are both one click away.</p>
      <div className="hero__actions">
        <Link to="/configure" className="btn btn--primary">
          Configure a pen
        </Link>
        <Link to="/" className="btn btn--ghost">
          Go to the home page
        </Link>
      </div>
    </div>
  )
}

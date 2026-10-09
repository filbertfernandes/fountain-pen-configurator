import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { BRAND, AUTHOR } from '@/brand'
import { useCart, cartCount } from '@/state/cartStore'
import { IconBag } from './icons'
import { HERO_THEME } from '@/lib/theme'

export function Nav({ overlay = false }: { overlay?: boolean }) {
  const lines = useCart((s) => s.lines)
  const setOpen = useCart((s) => s.setOpen)
  const n = cartCount(lines)
  // the transparent nav over the hero turns solid once the page scrolls
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!overlay) return
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [overlay])
  return (
    <header
      className={`nav ${overlay ? 'nav--overlay' : ''} ${overlay && scrolled ? 'is-solid' : ''}`}
      // over the hero the nav takes the hero's colours until the page scrolls
      data-theme={overlay && !scrolled ? HERO_THEME : undefined}
    >
      <Link to="/" className="wordmark" aria-label={`${BRAND.name}, home`}>
        <span className="wordmark__name">{BRAND.name}</span>
        <span className="wordmark__line">Fine writing instruments since {BRAND.established}</span>
      </Link>
      <nav className="nav__links" aria-label="Main">
        <NavLink to="/" end className="nav__link nav__link--hide-sm">
          The Meridian
        </NavLink>
        <NavLink to="/configure" className="nav__link">
          Configure
        </NavLink>
        <button type="button" className="bag-btn" onClick={() => setOpen(true)} aria-label={`Bag, ${n} ${n === 1 ? 'item' : 'items'}`}>
          <IconBag width={18} height={18} />
          <span className="bag-btn__count" data-zero={n === 0}>
            {n}
          </span>
        </button>
      </nav>
    </header>
  )
}

export function AuthorLink() {
  return (
    <a className="author-link" href={AUTHOR.url} target="_blank" rel="noopener">
      {AUTHOR.name}
    </a>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div>
        <p className="footer__brand">{BRAND.name}</p>
        <p style={{ margin: 0, maxWidth: '44ch' }}>
          {BRAND.workshop}, {BRAND.city}. Pens turned, fitted and tested by hand since {BRAND.established}.
        </p>
        <p style={{ margin: '14px 0 0', maxWidth: '52ch', color: 'var(--paper-3)', fontFamily: 'var(--f-ui)', fontSize: '0.78rem' }}>
          {BRAND.demoNotice}
        </p>
      </div>
      <div>
        <h2>The Meridian</h2>
        <ul>
          <li>
            <Link to="/configure">Configure a pen</Link>
          </li>
          <li>
            <Link to="/#anatomy">How it comes apart</Link>
          </li>
          <li>
            <Link to="/#nibs">Choosing a nib</Link>
          </li>
        </ul>
      </div>
      <div>
        <h2>Workshop</h2>
        <ul>
          <li>Repairs and nib grinding</li>
          <li>Lifetime guarantee on every part</li>
          <li>
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          </li>
        </ul>
      </div>
      <p className="footer__credit">
        Designed and developed by <AuthorLink />
      </p>
    </footer>
  )
}

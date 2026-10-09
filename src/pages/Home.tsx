import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BRAND, SITE } from '@/brand'
import { BODIES, NIB_SIZES, NIB_MATERIALS, DEFAULT_CONFIG, type Config } from '@/data/catalog'
import { STRIP_DOWN } from '@/data/drawing'
import { TechnicalDrawing } from '@/ui/TechnicalDrawing'
import { useMedia, usePrefersReducedMotion } from '@/lib/useMedia'
import type { Backdrop } from '@/three/PenStage'
import { HERO_THEME, type Theme } from '@/lib/theme'
import { useDocumentMeta } from '@/lib/meta'
import type { Mode } from '@/three/assembly/engine'

const PenStage = lazy(() => import('@/three/PenStage').then((m) => ({ default: m.PenStage })))

const HERO_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  body: 'oxblood',
  trim: 'gold',
  clip: 'wheel',
  nibMaterial: 'gold18',
  nibSize: 'M',
}

const HERO_BG: Record<Theme, Backdrop> = {
  dark: { inner: '#212738', outer: '#10131b', cx: 0.62, cy: 0.36 },
  light: { inner: '#f4f2ed', outer: '#dbd7cf', cx: 0.62, cy: 0.36 },
}

function Hero() {
  const reduced = usePrefersReducedMotion()
  const [mode, setMode] = useState<Mode>('closed')
  // the one orchestrated moment: shortly after load, the cap unscrews
  useEffect(() => {
    const t = window.setTimeout(() => setMode('open'), reduced ? 0 : 1300)
    return () => window.clearTimeout(t)
  }, [reduced])
  const view = useMemo(() => ({ azimuth: 0.32, polar: 1.22 }), [])
  const wide = useMedia('(min-width: 761px)')
  const offset = useMemo<[number, number] | undefined>(() => (wide ? [-0.13, 0.17] : undefined), [wide])
  return (
    <section className="hero" aria-labelledby="hero-title" data-theme={HERO_THEME}>
      <div className="hero__stage" aria-hidden="true">
        <Suspense fallback={null}>
          <PenStage
            config={HERO_CONFIG}
            mode={mode}
            interactive={false}
            idle={!reduced}
            speed={reduced ? 0.001 : 1.15}
            snapOnMount
            view={view}
            padding={wide ? 1.3 : 1.08}
            focalOffset={offset}
            background={HERO_BG[HERO_THEME]}
            theme={HERO_THEME}
          />
        </Suspense>
      </div>
      <div className="hero__copy">
        <h1 className="hero__title" id="hero-title">
          Made to be taken apart.
        </h1>
        <p className="hero__lede">
          The Meridian is a fountain pen of seven parts that screw, slide and seat together. You choose every one of them, then watch your pen assemble.
        </p>
        <div className="hero__actions">
          <Link to="/configure" className="btn btn--primary">
            Configure your Meridian
          </Link>
          <a href="#anatomy" className="btn btn--ghost">
            See how it comes apart
          </a>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  useDocumentMeta({ title: SITE.title, description: SITE.description })
  return (
    <>
      <Hero />

      <section className="band" id="anatomy" aria-labelledby="anatomy-title">
        <div className="band__intro">
          <h2 className="h2" id="anatomy-title">
            Every part comes out the way it went in
          </h2>
          <p className="lede">
            Threads are cut with several starts so they catch at once. Nothing is glued. A nib can be changed at the desk, a cap thread replaced in the workshop, and the pen handed down.
          </p>
        </div>
        <TechnicalDrawing />
        <ol className="strip">
          {STRIP_DOWN.map((s) => (
            <li key={s.name} className="strip__item">
              <h3 className="strip__name">{s.name}</h3>
              <p className="strip__text">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="band band--alt" aria-labelledby="bodies-title">
        <div className="band__intro">
          <h2 className="h2" id="bodies-title">
            Eight bodies, turned from the bar
          </h2>
          <p className="lede">Celluloid is cut from rod and turned on the lathe, so the pattern on your barrel is never repeated on another.</p>
        </div>
        <ul className="bodies">
          {BODIES.map((b) => (
            <li key={b.id}>
              <Link className="body-tile" to={`/configure?body=${b.id}`}>
                <span className="body-tile__swatch" style={{ background: b.swatch }} aria-hidden />
                <span className="body-tile__name">{b.name}</span>
                <span className="body-tile__note">{b.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="band" id="nibs" aria-labelledby="nibs-title">
        <div className="band__intro">
          <h2 className="h2" id="nibs-title">
            Choose the nib by the line it leaves
          </h2>
          <p className="lede">
            Each width is ground and tested on paper before it leaves the bench. Below, the same word written with each of the four widths, drawn at twice life size.
          </p>
        </div>
        <div className="nibs">
          {NIB_SIZES.map((n) => (
            <div key={n.id} className="nib-sample">
              <div className="nib-sample__head">
                <span className="nib-sample__id">{n.id}</span>
                <span className="nib-sample__name">{n.name}</span>
                <span className="nib-sample__mm">{n.line.toFixed(2)} mm line</span>
              </div>
              <svg className="nib-sample__svg" viewBox="0 0 520 96" aria-label={`Writing sample, ${n.name.toLowerCase()} nib`} role="img">
                <text x="26" y="66" style={{ strokeWidth: (n.line - 0.3) * 4.2 }}>
                  Meridian
                </text>
              </svg>
              <p className="nib-sample__note">{n.note}</p>
            </div>
          ))}
        </div>
        <ul className="nib-mats">
          {NIB_MATERIALS.map((m) => (
            <li key={m.id}>
              <span className="nib-mats__swatch" style={{ background: m.swatch }} aria-hidden />
              <span>
                <strong>{m.name}.</strong> {m.note}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="band band--alt heritage" aria-labelledby="heritage-title">
        <div className="heritage__grid">
          <h2 className="h2 heritage__title" id="heritage-title">
            A machinist and a stationer, {BRAND.established}
          </h2>
          <div className="heritage__text">
            <p>
              Thomas Wheeler made gauges for the jewellery shops of Providence. Eliza Rawson sold ledgers and inks two doors down. Their first pen was a repair: a customer&rsquo;s cracked barrel, re-turned from ebonite with a thread that would not strip.
            </p>
            <p>
              The workshop on Benefit Street still turns every barrel and cap, cuts every thread and tests every nib by hand. A Meridian is made in about three weeks and comes with a guarantee on each part, for as long as you own it.
            </p>
          </div>
        </div>
      </section>

      <section className="cta" aria-labelledby="cta-title">
        <h2 className="h2" id="cta-title">
          Build yours part by part
        </h2>
        <p className="lede">Start with a body, finish with a nib. The price updates as you go and every choice can be undone.</p>
        <Link to="/configure" className="btn btn--primary">
          Open the configurator
        </Link>
      </section>
    </>
  )
}

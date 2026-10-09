import { DRAWING, type Profile } from '@/data/drawing'

/** Exploded side elevation of the Meridian, drawn from the model's own profiles (mm). */
const Z_MIN = -56
const Z_MAX = 240
const H = 78
const AXIS = H / 2

function outline(p: Profile, off: number, lift = 0) {
  const cy = AXIS - lift
  const top = p.map(([z, r]) => `${z + off - Z_MIN},${cy - r}`)
  const bottom = [...p].reverse().map(([z, r]) => `${z + off - Z_MIN},${cy + r}`)
  return `M${top.join(' L')} L${bottom.join(' L')} Z`
}

function Dim({ z0, z1, y, label }: { z0: number; z1: number; y: number; label: string }) {
  const x0 = z0 - Z_MIN
  const x1 = z1 - Z_MIN
  return (
    <g className="td__dim">
      <line x1={x0} y1={y - 2} x2={x0} y2={y + 2} />
      <line x1={x1} y1={y - 2} x2={x1} y2={y + 2} />
      <line x1={x0} y1={y} x2={x1} y2={y} markerStart="url(#td-arrow)" markerEnd="url(#td-arrow)" />
      <text x={(x0 + x1) / 2} y={y - 1.6} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}

export function TechnicalDrawing() {
  const W = Z_MAX - Z_MIN
  return (
    <figure className="td">
      <div className="td__scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="td-title td-desc">
          <title id="td-title">Exploded side view of the Meridian</title>
          <desc id="td-desc">
            The barrel, converter, section, nib and cap laid out along the pen axis, with the overall length of 150.2 millimetres and the cap diameter of 14 millimetres.
          </desc>
          <defs>
            <marker id="td-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L6,3 L0,6" fill="none" stroke="currentColor" strokeWidth="1" />
            </marker>
          </defs>
          {[-24, 0, 24].map((l) => (
            <line key={l} className="td__axis" x1={0} y1={AXIS - l} x2={W} y2={AXIS - l} />
          ))}
          {DRAWING.map((p) => {
            const cy = AXIS - (p.lift ?? 0)
            const dz = p.offset - Z_MIN
            return (
              <g key={p.id} className="td__part">
                {p.profiles.map((pr, i) => (
                  <path key={i} d={outline(pr, p.offset, p.lift)} />
                ))}
                {p.clip && (
                  <>
                    <path
                      className="td__clip"
                      d={`M${p.clip.map(([z, r]) => `${z + dz},${cy - r}`).join(' L')} L${[...p.clip]
                        .reverse()
                        .map(([z, r]) => `${z + dz},${cy - r + 0.95}`)
                        .join(' L')} Z`}
                    />
                    <circle className="td__clip" cx={117.55 + dz} cy={cy - 7.62} r={1.38} />
                  </>
                )}
                {p.threads?.map((t, i) => {
                  const n = Math.floor((t.z1 - t.z0) / t.pitch)
                  return Array.from({ length: n }, (_, k) => {
                    const z = t.z0 + k * t.pitch + dz
                    return (
                      <g key={`${i}-${k}`} className="td__thread">
                        <line x1={z} y1={cy - t.r1} x2={z + t.pitch * 0.6} y2={cy - t.r0} />
                        <line x1={z} y1={cy + t.r1} x2={z + t.pitch * 0.6} y2={cy + t.r0} />
                      </g>
                    )
                  })
                })}
                {p.nib && <circle cx={125.6 + dz} cy={cy} r={0.52} className="td__hole" />}
                {p.nib && <line x1={125.6 + dz} y1={cy} x2={140 + dz} y2={cy} className="td__slit" />}
              </g>
            )
          })}
          <Dim z0={-1.6 - 46} z1={88 - 46} y={AXIS + 24 + 10} label="Barrel 89.6" />
          <Dim z0={82.7 + 64} z1={144 + 64} y={AXIS - 24 - 11} label="Cap 61.3, Ø 13.7" />
          <Dim z0={72} z1={116.6} y={AXIS + 10} label="Section 44.6" />
          <Dim z0={104 + 22} z1={140 + 22} y={AXIS - 9} label="Nib 36.0" />
        </svg>
      </div>
      <figcaption className="td__caption">
        Exploded elevation, dimensions in millimetres. Capped length 150.2. Drawn from the same profiles that build the 3D model.
      </figcaption>
    </figure>
  )
}

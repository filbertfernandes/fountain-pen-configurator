import { useEffect, useRef } from 'react'
import { perfStats } from '@/three/perf'

/** Live renderer statistics. Toggle with the gauge button or the P key. */
export function PerfHud() {
  const ref = useRef<HTMLDListElement>(null)
  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < 250 || !ref.current) return
      last = t
      const s = perfStats
      const rows: [string, string][] = [
        ['FPS', s.fps.toFixed(0)],
        ['Frame', `${s.ms.toFixed(1)} ms`],
        ['Draw calls', String(s.calls)],
        ['Triangles', s.triangles.toLocaleString('en-US')],
        ['Geometries', String(s.geometries)],
        ['Textures', String(s.textures)],
        ['Shaders', String(s.programs)],
        ['Pixel ratio', s.dpr.toFixed(2)],
      ]
      ref.current.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="hud" role="status" aria-label="Renderer statistics">
      <p className="hud__title">Renderer</p>
      <dl ref={ref} />
    </div>
  )
}

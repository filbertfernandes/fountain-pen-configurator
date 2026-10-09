import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, ContactShadows } from '@react-three/drei'
import { StudioEnvironment } from './StudioEnvironment'
import gsap from 'gsap'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { Config } from '@/data/catalog'
import type { EngineView, Mode } from './assembly/engine'
import { PenModel, type FocusRegion, type PenHandle, type PickTarget } from './PenModel'
import { ExplodedLabels } from './ExplodedLabels'
import { perfStats } from './perf'

export interface StageApi {
  capture: (opts?: { scale?: number }) => Promise<Blob | null>
  thumbnail: () => string
  pen: PenHandle | null
  reframe: () => void
}

interface Props {
  config: Config
  mode: Mode
  focus?: FocusRegion | null
  interactive?: boolean
  speed?: number
  snapOnMount?: boolean
  showLabels?: boolean
  onApi?: (api: StageApi) => void
  onReady?: (pen: PenHandle) => void
  onPick?: (t: PickTarget) => void
  /** gentle idle float for marketing views */
  idle?: boolean
  className?: string
  children?: ReactNode
  /** camera angles (radians): azimuth around Y, polar from +Y */
  view?: { azimuth: number; polar: number }
  padding?: number
  background?: Backdrop
  theme?: 'dark' | 'light'
  /** shift the framing in view space (fractions of the framed width/height), e.g. to make room for copy */
  focalOffset?: [number, number]
}

const DEFAULT_BG: Backdrop = { inner: '#1d2231', outer: '#0e1118', cx: 0.5, cy: 0.42 }
const LIGHT_BG: Backdrop = { inner: '#f4f2ed', outer: '#d6d2ca', cx: 0.5, cy: 0.42 }

/** The pen lies along world X, nib to the right, nib face up, tilted toward the viewer. */
const PEN_QUAT = (() => {
  const q = new THREE.Quaternion()
  const ry = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
  const rz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
  const rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32)
  q.multiply(rx).multiply(rz).multiply(ry)
  return q
})()
export const PEN_SCALE = 10
/** captured at load — the configurator rewrites the query string as you edit */
const DEBUG = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')

/**
 * Opaque gradient backdrop rendered by three.js itself. It must be part of the
 * scene (not CSS) so the crystal demonstrator refracts the real background
 * instead of the renderer's fallback grey.
 */
export interface Backdrop {
  inner: string
  outer: string
  cx: number
  cy: number
}

function BackdropTexture({ bg }: { bg: Backdrop }) {
  const { scene } = useThree()
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(bg.cx * 1024, bg.cy * 1024, 0, bg.cx * 1024, bg.cy * 1024, 820)
    grd.addColorStop(0, bg.inner)
    grd.addColorStop(1, bg.outer)
    g.fillStyle = grd
    g.fillRect(0, 0, 1024, 1024)
    // a whisper of grain so the gradient never bands on 8-bit displays
    const img = g.getImageData(0, 0, 1024, 1024)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 3
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    g.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    scene.background = t
    return () => {
      scene.background = null
      t.dispose()
    }
  }, [scene, bg.inner, bg.outer, bg.cx, bg.cy])
  return null
}

function PerfProbe() {
  const { gl } = useThree()
  const acc = useRef({ t: 0, n: 0 })
  useEffect(() => {
    // count every pass of a frame (shadows, transmission, main) — reset manually below
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])
  // runs first in each frame: the counters hold the totals of the previous frame
  useFrame((_, dt) => {
    acc.current.t += dt
    acc.current.n += 1
    if (acc.current.t >= 0.5) {
      perfStats.fps = acc.current.n / acc.current.t
      perfStats.ms = (acc.current.t / acc.current.n) * 1000
      acc.current.t = 0
      acc.current.n = 0
    }
    const i = gl.info
    perfStats.calls = i.render.calls
    perfStats.triangles = i.render.triangles
    perfStats.geometries = i.memory.geometries
    perfStats.textures = i.memory.textures
    perfStats.programs = i.programs?.length ?? 0
    perfStats.dpr = gl.getPixelRatio()
    perfStats.frames++
    i.reset()
  }, -1000)
  return null
}

function Rig({
  pen,
  focus,
  interactive,
  view,
  padding = 1.12,
  onReframe,
  focalOffset,
}: {
  pen: PenHandle | null
  focus: FocusRegion | null | undefined
  interactive: boolean
  view: { azimuth: number; polar: number }
  padding?: number
  onReframe: (fn: () => void) => void
  focalOffset?: [number, number]
}) {
  const controls = useRef<CameraControls>(null)
  const { camera, size } = useThree()
  const settle = useStore(pen?.engine.view ?? DUMMY_VIEW, (s) => s.settle)
  const mode = useStore(pen?.engine.view ?? DUMMY_VIEW, (s) => s.mode)
  const plan = useStore(pen?.engine.view ?? DUMMY_VIEW, (s) => s.plan)
  const firstFit = useRef(true)
  const lastRegion = useRef<FocusRegion | null>(null)

  const fit = useCallback(
    (region: FocusRegion, smooth: boolean, ahead?: { box: THREE.Box3; mode: string }) => {
      const c = controls.current
      if (!c || !pen) return
      const box = pen.box(region)
      // heading somewhere: frame both where the parts are and where they are going
      if (ahead) box.union(ahead.box)
      if (box.isEmpty()) return
      const fitMode = ahead?.mode ?? mode
      const cam = camera as THREE.PerspectiveCamera
      const s = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const vfov = THREE.MathUtils.degToRad(cam.fov)
      const aspect = size.width / Math.max(1, size.height)
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
      const pad = region === 'all' ? padding * (fitMode === 'exploded' ? 1.18 : 1) : (REGION_VIEW[region]?.pad ?? 1.55)
      // re-aim only when the subject changes, so settling parts never undo the customer's orbit
      if (lastRegion.current !== region) {
        const angle = REGION_VIEW[region]
        if (lastRegion.current !== null || angle) void c.rotateTo(angle?.azimuth ?? view.azimuth, angle?.polar ?? view.polar, smooth)
        lastRegion.current = region
      }
      const dW = s.x / 2 / Math.tan(hfov / 2) + s.z / 2
      const dH = s.y / 2 / Math.tan(vfov / 2) + s.z / 2
      const dist = Math.max(dW, dH, 0.25) * pad
      void c.setTarget(center.x, center.y, center.z, smooth)
      void c.dollyTo(dist, smooth)
      if (focalOffset) {
        const fw = 2 * dist * Math.tan(hfov / 2)
        const fh = 2 * dist * Math.tan(vfov / 2)
        void c.setFocalOffset(focalOffset[0] * fw, focalOffset[1] * fh, 0, smooth)
      }
      if (DEBUG) {
        ;(window as unknown as { __fit: unknown }).__fit = { region, center: center.toArray(), size: s.toArray(), dist, smooth, at: performance.now() }
      }
    },
    [camera, pen, size.width, size.height, padding, mode, focalOffset, view.azimuth, view.polar],
  )

  // parts are setting off: start the camera move now, towards the layout they will end in,
  // instead of chasing each part after it stops
  useEffect(() => {
    if (!pen || !plan || firstFit.current) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const region = focus && plan.mode !== 'exploded' ? focus : 'all'
    fit(region, smooth, { box: pen.boxAt(region, plan.pose), mode: plan.mode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  // initial angle
  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (DEBUG) (window as unknown as { __controls: CameraControls }).__controls = c
    void c.rotateTo(view.azimuth, view.polar, false)
  }, [view.azimuth, view.polar])

  // frame the pen when parts settle, mode changes or focus changes
  useEffect(() => {
    if (!pen) return
    const smooth = !firstFit.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    firstFit.current = false
    fit(focus && mode !== 'exploded' ? focus : 'all', smooth)
  }, [pen, settle, focus, mode, fit])

  useEffect(() => {
    onReframe(() => {
      lastRegion.current = null
      const c = controls.current
      if (c) void c.rotateTo(view.azimuth, view.polar, true)
      fit(focus ?? 'all', true)
    })
  }, [onReframe, fit, focus, view.azimuth, view.polar])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={interactive}
      minDistance={0.18}
      maxDistance={9}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI - 0.35}
      smoothTime={0.32}
      draggingSmoothTime={0.12}
      dollySpeed={0.6}
      truckSpeed={interactive ? 1 : 0}
    />
  )
}

/** close-up framing per region: a top-down look for the clip, a raking one for the nib */
const REGION_VIEW: Partial<Record<FocusRegion, { pad: number; azimuth?: number; polar?: number }>> = {
  nib: { pad: 1.85, azimuth: 0.5, polar: 1.12 },
  clip: { pad: 1.9, azimuth: 0.15, polar: 0.78 },
  trim: { pad: 1.6, azimuth: 0.3, polar: 1.1 },
  engraving: { pad: 1.3 },
  cap: { pad: 1.6 },
  filler: { pad: 1.4 },
}

const DUMMY_VIEW = createStore<EngineView>(() => ({
  settle: 0,
  mode: 'closed',
  status: '',
  step: 0,
  busy: false,
  plan: null,
  fitted: { clip: 'wheel', nibMaterial: 'steel', nibSize: 'F', fill: 'converter', ink: 'blueblack' },
}))

function Bridge({
  onApi,
  pen,
  reframe,
  theme,
}: {
  onApi?: (a: StageApi) => void
  pen: PenHandle | null
  reframe: () => void
  theme: 'dark' | 'light'
}) {
  const { gl, scene, camera, size } = useThree()
  useEffect(() => {
    if (!onApi) return
    const render = (scale: number) => {
      const prev = gl.getPixelRatio()
      gl.setPixelRatio(scale)
      gl.setSize(size.width, size.height, false)
      gl.render(scene, camera)
      return () => {
        gl.setPixelRatio(prev)
        gl.setSize(size.width, size.height, false)
      }
    }
    onApi({
      pen,
      reframe,
      thumbnail() {
        const restore = render(1)
        const src = gl.domElement
        const out = document.createElement('canvas')
        const w = 320
        const h = Math.round((w * src.height) / src.width)
        out.width = w
        out.height = h
        const g = out.getContext('2d')!
        g.fillStyle = theme === 'light' ? '#e4e1da' : '#151922'
        g.fillRect(0, 0, w, h)
        g.drawImage(src, 0, 0, w, h)
        restore()
        return out.toDataURL('image/jpeg', 0.82)
      },
      capture({ scale = 3 } = {}) {
        const restore = render(Math.min(scale, 4))
        const src = gl.domElement
        const out = document.createElement('canvas')
        out.width = src.width
        out.height = src.height
        const g = out.getContext('2d')!
        g.drawImage(src, 0, 0)
        restore()
        // maker's mark
        const px = out.width / 1600
        g.fillStyle = theme === 'light' ? 'rgba(21,27,43,0.62)' : 'rgba(232,225,211,0.72)'
        g.font = `italic 400 ${Math.round(22 * px)}px "Libre Caslon Text"`
        g.textBaseline = 'bottom'
        g.fillText('Wheeler & Rawson — The Meridian', 40 * px, out.height - 34 * px)
        return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'))
      },
    })
  }, [gl, scene, camera, size, onApi, pen, reframe, theme])
  return null
}

function Idle({ children, active }: { children: ReactNode; active: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!g.current) return
    const t = clock.elapsedTime
    g.current.position.y = active ? Math.sin(t * 0.6) * 0.012 : 0
    g.current.rotation.x = active ? Math.sin(t * 0.4) * 0.03 : 0
  })
  return <group ref={g}>{children}</group>
}

export function PenStage({
  config,
  mode,
  focus,
  interactive = true,
  speed = 1,
  snapOnMount,
  showLabels,
  onApi,
  onReady,
  onPick,
  idle,
  className,
  children,
  view = { azimuth: 0.2, polar: 1.28 },
  padding,
  background: backgroundProp,
  focalOffset,
  theme = 'dark',
}: Props) {
  const background = backgroundProp ?? (theme === 'light' ? LIGHT_BG : DEFAULT_BG)
  const [pen, setPen] = useState<PenHandle | null>(null)
  const reframeRef = useRef<() => void>(() => {})
  const handleReady = useCallback(
    (h: PenHandle) => {
      setPen(h)
      onReady?.(h)
      if (DEBUG) {
        ;(window as unknown as { __pen: PenHandle }).__pen = h
        ;(window as unknown as { __gsap: typeof gsap }).__gsap = gsap
        gsap.ticker.lagSmoothing(0)
      }
    },
    [onReady],
  )
  const reframe = useCallback(() => reframeRef.current(), [])
  const setReframe = useCallback((fn: () => void) => {
    reframeRef.current = fn
  }, [])
  const dpr = useMemo<[number, number]>(() => [1, Math.min(2, window.devicePixelRatio || 1)], [])

  // stop rendering entirely while the stage is scrolled out of view
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Canvas
      ref={canvasRef}
      className={className}
      frameloop={onScreen ? 'always' : 'never'}
      dpr={dpr}
      camera={{ fov: 28, near: 0.01, far: 60, position: [0.6, 0.9, 3.4] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: theme === 'light' ? 1.0 : 1.05 }}
      onCreated={({ gl }) => {
        // alpha 0 keeps ContactShadows' render target transparent; the backdrop texture covers the frame
        gl.setClearColor(background.outer, 0)
        // transmission (crystal demonstrator) at reduced resolution on small screens
        ;(gl as THREE.WebGLRenderer & { transmissionResolutionScale?: number }).transmissionResolutionScale =
          window.innerWidth < 760 ? 0.5 : 1
      }}
    >
      <BackdropTexture bg={background} />
      <Suspense fallback={null}>
        <StudioEnvironment theme={theme} />
        <Idle active={!!idle}>
          <group quaternion={PEN_QUAT} scale={PEN_SCALE}>
            <PenModel config={config} mode={mode} onReady={handleReady} onPick={onPick} speed={speed} snapOnMount={snapOnMount} />
          </group>
        </Idle>
        <ContactShadows
          position={[0, -0.3, 0]}
          opacity={theme === 'light' ? 0.42 : 0.62}
          scale={5}
          blur={theme === 'light' ? 2.8 : 2.4}
          far={0.7}
          resolution={512}
          color={theme === 'light' ? '#1b2234' : '#000000'}
          frames={Infinity}
        />
        {showLabels && pen && <ExplodedLabels pen={pen} config={config} />}
      </Suspense>
      <Rig pen={pen} focus={focus} interactive={interactive} view={view} padding={padding} onReframe={setReframe} focalOffset={focalOffset} />
      <Bridge onApi={onApi} pen={pen} reframe={reframe} theme={theme} />
      <PerfProbe />
      {children}
    </Canvas>
  )
}

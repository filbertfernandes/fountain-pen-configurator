import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useStore } from 'zustand'
import gsap from 'gsap'
import type { Config, EngraveColorId } from '@/data/catalog'
import { ENGRAVE_COLORS } from '@/data/catalog'
import { AssemblyEngine, TEMPO, type Mode, type Pose, type Target } from './assembly/engine'
import { PARTS, type PartId } from './assembly/parts'
import {
  BODY_LOOKS,
  TRIM_LOOKS,
  createBodyMaterial,
  createMetalMaterial,
  createFixedMaterials,
  bodyNumbers,
  applyBodyNumbers,
  metalNumbers,
  applyMetalNumbers,
  inkColor,
  type LookNumbers,
  type MetalLook,
} from './materials'
import { engravingTexture, nibTextures, monogramTextures, MONO_FROST, loadCanvasFonts, BARREL_SLEEVE } from './textures'

export const MODEL_URL = `${import.meta.env.BASE_URL}models/meridian.glb`
const withMeshopt = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder)
}
const MM = 0.001

/** fill look for engraved letters: metal leaf, or enamel paint */
function engraveLook(id: EngraveColorId): MetalLook {
  const c = ENGRAVE_COLORS.find((x) => x.id === id) ?? ENGRAVE_COLORS[1]
  if (id === 'match') return TRIM_LOOKS.gold
  return c.metal ? { color: c.hex, roughness: 0.2, metalness: 1, clearcoat: 0 } : { color: c.hex, roughness: 0.42, metalness: 0, clearcoat: 0.3 }
}

/** Converter piston travel (mm, pen space) — must match blender/build_meridian.py CONV */
const CONV = { full: 34.5, empty: 70.0, rodBase: 26.6, inkTop: 72.1, inkLen: 72.1 - 36.0 }

/** place every part where the engine says it is */
function applyPose(built: { parts: Record<PartId, PartNodes> }, engine: AssemblyEngine) {
  for (const id of Object.keys(built.parts) as PartId[]) {
    const p = built.parts[id]
    const [lx, lz] = engine.lateral(id)
    p.outer.position.set(lx * MM, engine.axial(id) * MM, lz * MM)
    p.outer.rotation.y = engine.rotation(id)
    p.swapper.scale.setScalar(Math.max(0.0001, engine.parts[id].scale))
  }
}

export interface PenHandle {
  engine: AssemblyEngine
  root: THREE.Group
  /** world-space box of a named region, for camera framing */
  box: (region: FocusRegion) => THREE.Box3
  /** the same box with the pen posed as `pose` (where the parts are heading) */
  boxAt: (region: FocusRegion, pose: Pose) => THREE.Box3
}

export type FocusRegion = 'all' | 'nib' | 'clip' | 'trim' | 'engraving' | 'cap' | 'filler'

interface PartNodes {
  outer: THREE.Group
  swapper: THREE.Group
  content: THREE.Group
}

/** which part of the pen was clicked, in configurator terms */
export type PickTarget = 'body' | 'trim' | 'clip' | 'nib' | 'fill' | 'engraving'

const PICK: Record<string, PickTarget> = {
  barrel: 'body',
  cap: 'body',
  section: 'body',
  barrel_ring: 'trim',
  barrel_finial: 'trim',
  section_ring: 'trim',
  cap_band: 'trim',
  cap_finial: 'trim',
  cap_finial_top: 'trim',
  clip_classic: 'clip',
  clip_wheel: 'clip',
  clip_wheel_roller: 'clip',
  clip_minimal: 'clip',
  nib: 'nib',
  nib_tip: 'nib',
  feed: 'nib',
  converter_knob: 'fill',
  converter_tube: 'fill',
  converter_collar: 'fill',
  converter_piston: 'fill',
  converter_ink: 'fill',
  cartridge: 'fill',
  cartridge_ink: 'fill',
}

interface Props {
  config: Config
  mode: Mode
  onPick?: (t: PickTarget) => void
  onReady?: (h: PenHandle) => void
  /** play transitions at this speed (0 = instant) */
  speed?: number
  /** start already in the target state with no animation */
  snapOnMount?: boolean
}

function makePart(): PartNodes {
  const outer = new THREE.Group()
  const swapper = new THREE.Group()
  const content = new THREE.Group()
  outer.add(swapper)
  swapper.add(content)
  return { outer, swapper, content }
}

function centerSwapper(p: PartNodes) {
  const box = new THREE.Box3().setFromObject(p.content)
  if (box.isEmpty()) return
  const c = box.getCenter(new THREE.Vector3())
  p.swapper.position.copy(c)
  p.content.position.copy(c).multiplyScalar(-1)
}

export function PenModel({ config, mode, onReady, onPick, speed = 1, snapOnMount = false }: Props) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, withMeshopt)

  // ---------------------------------------------------------------- build
  const built = useMemo(() => {
    const scene = gltf.scene.clone(true)
    const mesh: Record<string, THREE.Mesh> = {}
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mesh[o.name] = o as THREE.Mesh
    })
    const need = (n: string) => {
      const m = mesh[n]
      if (!m) throw new Error(`Model is missing part "${n}"`)
      m.removeFromParent()
      m.castShadow = true
      return m
    }

    const root = new THREE.Group()
    root.name = 'pen-space'
    const parts = {} as Record<PartId, PartNodes>
    for (const id of Object.keys(PARTS) as PartId[]) parts[id] = makePart()

    const add = (p: PartNodes, names: string[]) => names.map((n) => p.content.add(need(n)))
    root.add(need('section'), need('section_ring'))

    add(parts.nib, ['nib', 'nib_tip', 'feed'])
    const converter = new THREE.Group()
    const cartridge = new THREE.Group()
    for (const n of ['converter_knob', 'converter_tube', 'converter_collar', 'converter_piston', 'converter_rod', 'converter_ink'])
      converter.add(need(n))
    for (const n of ['cartridge', 'cartridge_ink']) cartridge.add(need(n))
    parts.filler.content.add(converter, cartridge)
    add(parts.barrel, ['barrel', 'barrel_ring', 'barrel_finial'])
    add(parts.cap, ['cap', 'cap_band'])
    add(parts.capFinial, ['cap_finial', 'cap_finial_top'])
    const clips = {
      classic: need('clip_classic'),
      wheel: need('clip_wheel'),
      minimal: need('clip_minimal'),
    }
    const roller = need('clip_wheel_roller')
    parts.clip.content.add(clips.classic, clips.wheel, roller, clips.minimal)

    // hierarchy: finial and clip ride on the cap
    for (const id of Object.keys(PARTS) as PartId[]) {
      const parent = PARTS[id].parent
      ;(parent ? parts[parent].content : root).add(parts[id].outer)
    }

    // engraving sleeves (generated, wrap the straight barrel and the cap band)
    const sleeve = (r: number, z0: number, z1: number) => {
      const g = new THREE.CylinderGeometry(r * MM, r * MM, (z1 - z0) * MM, 256, 1, true)
      const m = new THREE.Mesh(g)
      m.position.y = ((z0 + z1) / 2) * MM
      m.renderOrder = 2
      return m
    }
    const barrelSleeve = sleeve(BARREL_SLEEVE.r, BARREL_SLEEVE.z0, BARREL_SLEEVE.z1)
    // hidden until the engraving texture (and its font) is ready
    barrelSleeve.visible = false
    parts.barrel.content.add(barrelSleeve)

    for (const id of Object.keys(parts) as PartId[]) centerSwapper(parts[id])

    // ---------------------------------------------------------- materials
    const fixed = createFixedMaterials()
    const body = createBodyMaterial(BODY_LOOKS[config.body])
    const trim = createMetalMaterial(TRIM_LOOKS[config.trim])
    const trimTop = createMetalMaterial(TRIM_LOOKS[config.trim])
    trimTop.bumpScale = -0.6 // the monogram maps arrive once the Caslon faces have loaded
    const nibMat = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.14, envMapIntensity: 1.35, bumpScale: -0.35 })
    const engraveMat = (m: THREE.Mesh) => {
      const mat = new THREE.MeshPhysicalMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        metalness: 1,
        roughness: 0.36,
        envMapIntensity: 1.1,
      })
      m.material = mat
      return mat
    }
    const engrave = engraveMat(barrelSleeve)

    const set = (names: string[], m: THREE.Material) =>
      names.forEach((n) => {
        const o = root.getObjectByName(n) as THREE.Mesh | undefined
        if (o) o.material = m
      })
    set(['barrel', 'cap'], body)
    set(['barrel_ring', 'barrel_finial', 'section_ring', 'cap_band', 'cap_finial', 'clip_classic', 'clip_wheel', 'clip_wheel_roller', 'clip_minimal'], trim)
    set(['cap_finial_top'], trimTop)
    set(['section'], fixed.section)
    set(['feed'], fixed.feed)
    set(['nib'], nibMat)
    set(['nib_tip'], fixed.tipping)
    set(['converter_knob', 'converter_collar', 'converter_rod'], fixed.steel)
    set(['converter_tube'], fixed.tube)
    set(['converter_piston'], fixed.rubber)
    set(['converter_ink'], fixed.converterInk)
    set(['cartridge'], fixed.cartridge)
    set(['cartridge_ink'], fixed.cartridgeInk)
    // transparent parts render after the ink inside them
    ;(root.getObjectByName('converter_tube') as THREE.Mesh).renderOrder = 1
    ;(root.getObjectByName('cartridge') as THREE.Mesh).renderOrder = 1

    const n = (name: string) => root.getObjectByName(name) as THREE.Mesh
    return {
      root,
      parts,
      clips,
      roller,
      converter,
      cartridge,
      piston: n('converter_piston'),
      rod: n('converter_rod'),
      knob: n('converter_knob'),
      convInk: n('converter_ink'),
      barrelSleeve,
      mats: { fixed, body, trim, trimTop, nibMat, engrave },
      bodyN: bodyNumbers(BODY_LOOKS[config.body]),
      trimN: metalNumbers(TRIM_LOOKS[config.trim]),
      engraveN: metalNumbers(engraveLook(config.engraving.color)),
    }
    // the model is built once per mount; config is applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf])

  // free per-instance GPU resources (geometry stays cached by useLoader)
  useEffect(
    () => () => {
      const { fixed, body, trim, trimTop, nibMat, engrave } = built.mats
      for (const m of [...Object.values(fixed), body, trim, trimTop, nibMat, engrave]) {
        const mm = m as THREE.MeshPhysicalMaterial
        mm.map?.dispose()
        mm.bumpMap?.dispose()
        mm.roughnessMap?.dispose()
        mm.alphaMap?.dispose()
        mm.dispose()
      }
      built.barrelSleeve.geometry.dispose()
    },
    [built],
  )

  // ---------------------------------------------------------------- engine
  const target = (c: Config, m: Mode): Target => ({
    clip: c.clip,
    nibMaterial: c.nibMaterial,
    nibSize: c.nibSize,
    fill: c.fill,
    ink: c.ink,
    mode: m,
    transparentBody: c.body === 'crystal',
  })

  const engine = useMemo(
    () => new AssemblyEngine({ initial: target(config, 'closed') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    engine.revive() // StrictMode mounts effects twice in development
    return () => engine.dispose()
  }, [engine])
  useEffect(() => {
    engine.speed = speed
  }, [engine, speed])

  const first = useRef(true)
  useEffect(() => {
    const t = target(config, mode)
    if (first.current && snapOnMount) engine.snap(t)
    else engine.setTarget(t)
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, config.clip, config.nibMaterial, config.nibSize, config.fill, config.ink, config.body, mode])

  const fitted = useStore(engine.view, (s) => s.fitted)

  // ---------------------------------------------------------------- variants
  useLayoutEffect(() => {
    const { clips, roller, converter, cartridge } = built
    clips.classic.visible = fitted.clip === 'classic'
    clips.wheel.visible = fitted.clip === 'wheel'
    roller.visible = fitted.clip === 'wheel'
    clips.minimal.visible = fitted.clip === 'minimal'
    converter.visible = fitted.fill === 'converter'
    cartridge.visible = fitted.fill === 'cartridge'
    const ink = inkColor(fitted.ink)
    built.mats.fixed.converterInk.color.copy(ink)
    built.mats.fixed.cartridgeInk.color.copy(ink)
    built.mats.fixed.cartridge.color.copy(ink).lerp(new THREE.Color('#ffffff'), 0.72)
  }, [built, fitted.clip, fitted.fill, fitted.ink])

  useEffect(() => {
    let alive = true
    void loadCanvasFonts().then(() => {
      if (!alive) return
      const { map, bumpMap } = nibTextures(fitted.nibMaterial, fitted.nibSize)
      const m = built.mats.nibMat
      m.map?.dispose()
      m.bumpMap?.dispose()
      m.map = map
      m.bumpMap = bumpMap
      m.color.set('#ffffff')
      m.roughness = fitted.nibMaterial === 'steel' ? 0.12 : 0.15
      m.needsUpdate = true
    })
    // nib width changes the tipping size
    const tip = built.root.getObjectByName('nib_tip')
    if (tip) tip.scale.setScalar({ EF: 0.62, F: 0.8, M: 1.0, B: 1.28 }[fitted.nibSize])
    return () => {
      alive = false
    }
  }, [built, fitted.nibMaterial, fitted.nibSize])

  // finial medallion: drawn once the canvas fonts are ready
  useEffect(() => {
    let alive = true
    void loadCanvasFonts().then(() => {
      if (!alive) return
      const m = built.mats.trimTop
      if (m.bumpMap) return
      const { bumpMap, roughnessMap } = monogramTextures()
      m.bumpMap = bumpMap
      m.roughnessMap = roughnessMap
      m.needsUpdate = true
    })
    return () => {
      alive = false
    }
  }, [built])

  // body + trim morph
  useEffect(() => {
    const to = bodyNumbers(BODY_LOOKS[config.body])
    const tw = gsap.to(built.bodyN, { ...to, duration: speed ? 1.1 * TEMPO * speed : 0, ease: 'power2.inOut' })
    return () => {
      tw.kill()
    }
  }, [built, config.body, speed])
  useEffect(() => {
    const to = metalNumbers(TRIM_LOOKS[config.trim])
    const tw = gsap.to(built.trimN, { ...to, duration: speed ? 0.8 * TEMPO * speed : 0, ease: 'power2.inOut' })
    return () => {
      tw.kill()
    }
  }, [built, config.trim, speed])

  // engraving
  useEffect(() => {
    let alive = true
    void loadCanvasFonts().then(() => {
      if (!alive) return
      const m = built.mats.engrave
      m.alphaMap?.dispose()
      m.alphaMap = engravingTexture(config.engraving)
      m.needsUpdate = true
      built.barrelSleeve.visible = !!config.engraving.text.trim()
    })
    return () => {
      alive = false
    }
  }, [built, config.engraving])

  // engraving fill colour
  const engraveFill = useRef(config.engraving.color)
  useEffect(() => {
    engraveFill.current = config.engraving.color
    if (config.engraving.color === 'match') return
    const tw = gsap.to(built.engraveN, { ...metalNumbers(engraveLook(config.engraving.color)), duration: speed ? 0.5 * TEMPO * speed : 0 })
    return () => {
      tw.kill()
    }
  }, [built, config.engraving.color, speed])

  // ---------------------------------------------------------------- frame loop
  const hoverSpin = useRef(0)
  const rollerAngle = useRef(0)
  useFrame((_, dt) => {
    const { mats } = built
    applyPose(built, engine)
    // converter mechanism: knob turns the screw that drives the piston
    const pz = CONV.empty + (CONV.full - CONV.empty) * engine.ink.fill
    built.piston.position.y = pz * MM
    built.rod.scale.y = (pz - CONV.rodBase) / (CONV.full - CONV.rodBase)
    const inkLen = CONV.inkTop - (pz + 1.5)
    built.convInk.scale.y = Math.max(0.0001, inkLen / CONV.inkLen)
    built.convInk.visible = inkLen > 0.3
    built.knob.rotation.y = (pz - CONV.full) * 0.42

    // the Wheeler roller spins when the clip moves or is hovered
    const clipMoving = engine.parts.clip.clear > 0 && engine.parts.clip.clear < 1
    const target = hoverSpin.current + (clipMoving ? 6 : 0)
    rollerAngle.current += target * dt
    built.roller.rotation.z = rollerAngle.current
    hoverSpin.current *= Math.pow(0.08, dt)

    applyBodyNumbers(mats.body, built.bodyN as LookNumbers)
    applyMetalNumbers(mats.trim, built.trimN)
    applyMetalNumbers(mats.trimTop, built.trimN)
    // the roughness map keeps the field at the trim's polish and frosts the letters
    if (mats.trimTop.roughnessMap) mats.trimTop.roughness = Math.min(0.85, built.trimN.roughness * MONO_FROST)
    // engraving fill: the trim metal, a chosen leaf, or enamel
    applyMetalNumbers(mats.engrave, engraveFill.current === 'match' ? built.trimN : built.engraveN)
    if (engraveFill.current === 'match' || built.engraveN.metalness > 0.5) mats.engrave.roughness = Math.min(0.6, mats.engrave.roughness + 0.22)
  })

  // ---------------------------------------------------------------- handle
  useEffect(() => {
    if (!onReady) return
    const box = (region: FocusRegion) => {
      const b = new THREE.Box3()
      const add = (o: THREE.Object3D) => {
        o.updateWorldMatrix(true, true)
        o.traverseVisible((c) => {
          const m = c as THREE.Mesh
          if (m.isMesh && m.geometry) {
            if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
            b.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld))
          }
        })
      }
      const r = built.root
      switch (region) {
        case 'nib':
          add(built.parts.nib.outer)
          break
        case 'clip':
          add(built.parts.clip.outer)
          add(built.parts.capFinial.outer)
          break
        case 'trim':
          add(r.getObjectByName('cap_band')!)
          add(built.parts.capFinial.outer)
          add(r.getObjectByName('barrel_ring')!)
          break
        case 'engraving':
          add(built.barrelSleeve)
          if (b.isEmpty()) add(r.getObjectByName('barrel')!)
          break
        case 'cap':
          add(built.parts.cap.outer)
          break
        case 'filler':
          add(built.parts.filler.outer)
          add(r.getObjectByName('section')!)
          break
        default:
          add(r)
      }
      return b
    }
    const boxAt = (region: FocusRegion, pose: Pose) => {
      const b = engine.withPose(pose, () => {
        applyPose(built, engine)
        return box(region)
      })
      applyPose(built, engine)
      return b
    }
    onReady({ engine, root: built.root, box, boxAt })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, engine, onReady])

  const pickOf = (o: THREE.Object3D) => (o === built.barrelSleeve ? 'engraving' : PICK[o.name])
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (e.object === built.roller || e.object === built.clips.wheel) hoverSpin.current = 14
    if (onPick && pickOf(e.object)) document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    document.body.style.cursor = ''
  }
  useEffect(() => () => void (document.body.style.cursor = ''), [])
  const downAt = useRef<[number, number] | null>(null)
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    downAt.current = [e.nativeEvent.clientX, e.nativeEvent.clientY]
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // a click, not the end of an orbit drag
    const d = downAt.current
    if (!onPick || !d || Math.hypot(e.nativeEvent.clientX - d[0], e.nativeEvent.clientY - d[1]) > 6) return
    const t = pickOf(e.object)
    if (t) {
      e.stopPropagation()
      onPick(t)
    }
  }

  return (
    <primitive
      object={built.root}
      onPointerOver={onOver}
      onPointerOut={onOut}
      onPointerDown={onDown}
      onClick={onClick}
      position={[0, -0.075, 0]}
    />
  )
}

useLoader.preload(GLTFLoader, MODEL_URL, withMeshopt)

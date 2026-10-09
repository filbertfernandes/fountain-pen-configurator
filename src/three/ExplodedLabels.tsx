import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useStore } from 'zustand'
import type { Config } from '@/data/catalog'
import { optionName } from '@/data/catalog'
import type { PenHandle } from './PenModel'

interface LabelDef {
  id: string
  title: string
  detail: string
  object: () => THREE.Object3D | undefined
  side: 1 | -1
}

/** Callouts for the exploded view, pinned to each part as it moves. */
export function ExplodedLabels({ pen, config }: { pen: PenHandle; config: Config }) {
  const mode = useStore(pen.engine.view, (s) => s.mode)
  const busy = useStore(pen.engine.view, (s) => s.busy)
  const fitted = useStore(pen.engine.view, (s) => s.fitted)
  const show = mode === 'exploded' && !busy

  const defs = useMemo<LabelDef[]>(() => {
    const r = pen.root
    const obj = (n: string) => () => r.getObjectByName(n) ?? undefined
    const eng = config.engraving.text.trim()
    return [
      { id: 'barrel', title: 'Barrel', detail: optionName('body', config.body) + (eng ? `, “${eng}”` : ''), object: obj('barrel'), side: -1 },
      { id: 'filler', title: fitted.fill === 'converter' ? 'Piston converter' : 'Cartridge', detail: optionName('ink', fitted.ink), object: obj(fitted.fill === 'converter' ? 'converter_tube' : 'cartridge'), side: -1 },
      { id: 'section', title: 'Section', detail: 'Ebonite grip, two-start thread', object: obj('section'), side: 1 },
      { id: 'nib', title: 'Nib & feed', detail: `${optionName('nibMaterial', fitted.nibMaterial)}, ${optionName('nibSize', fitted.nibSize).toLowerCase()}`, object: obj('nib'), side: -1 },
      { id: 'cap', title: 'Cap', detail: `${optionName('trim', config.trim)} band, three-start thread`, object: obj('cap'), side: 1 },
      { id: 'clip', title: 'Clip', detail: optionName('clip', fitted.clip), object: obj(`clip_${fitted.clip}`), side: -1 },
      { id: 'finial', title: 'Finial', detail: 'Clamps the clip ring', object: obj('cap_finial'), side: -1 },
    ]
  }, [pen, config.body, config.trim, config.engraving, fitted])

  return (
    <>
      {defs.map((d) => (
        <Label key={d.id} def={d} show={show} />
      ))}
    </>
  )
}

const box = new THREE.Box3()

function Label({ def, show }: { def: LabelDef; show: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const o = def.object()
    if (!o || !g.current) return
    const m = o as THREE.Mesh
    if (!m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld)
    box.getCenter(g.current.position)
    g.current.position.y += def.side * (box.max.y - box.min.y) * 0.5
  })
  return (
    <group ref={g}>
      <Html center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`xlabel ${def.side > 0 ? 'xlabel--up' : 'xlabel--down'} ${show ? 'is-on' : ''}`} aria-hidden={!show}>
          <span className="xlabel__title">{def.title}</span>
          <span className="xlabel__detail">{def.detail}</span>
        </div>
      </Html>
    </group>
  )
}

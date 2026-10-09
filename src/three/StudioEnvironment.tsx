import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

/**
 * Procedural studio lighting baked into a PMREM environment map once at start.
 * Long softboxes draw the bright lines along the barrel; a warm rim, a cool
 * kicker and a broad dim fill keep metals readable. No HDRI to download.
 */
interface Former {
  shape: 'rect' | 'ring'
  color: string
  intensity: number
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number] | number
}

/* Light stage: a pale sweep everywhere, with black flags so dark resins keep
 * their edges and metals keep their contrast — the product photographer's
 * "negative fill". */
const LIGHT_FORMERS: Former[] = [
  { shape: 'rect', color: '#ffffff', intensity: 2.4, position: [0, 5, 0.4], rotation: [Math.PI / 2, 0, 0], scale: [14, 1.3] },
  { shape: 'rect', color: '#ffffff', intensity: 1.3, position: [0, 1.7, 4], rotation: [-0.38, 0, 0], scale: [14, 0.2] },
  { shape: 'rect', color: '#000000', intensity: 1, position: [0, -0.3, 4.2], rotation: [0.1, 0, 0], scale: [16, 2.0] },
  { shape: 'rect', color: '#000000', intensity: 1, position: [0, 2.6, -4.4], rotation: [0.5, Math.PI, 0], scale: [16, 1.4] },
  { shape: 'rect', color: '#ffe2bd', intensity: 1.1, position: [0, 0.4, -5], rotation: [0, Math.PI, 0], scale: [14, 1.0] },
  { shape: 'rect', color: '#d9e6ff', intensity: 1.0, position: [6, 1.4, 1.5], rotation: [0, -Math.PI / 2.4, 0], scale: [2.5, 2.5] },
  { shape: 'ring', color: '#ffffff', intensity: 1.1, position: [-5, 2.5, 2], rotation: [0, Math.PI / 3, 0], scale: 1.8 },
  { shape: 'rect', color: '#ece8e0', intensity: 0.9, position: [0, -4, 0], rotation: [-Math.PI / 2, 0, 0], scale: [16, 8] },
]

const FORMERS: Former[] = [
  { shape: 'rect', color: '#fff8ee', intensity: 2.6, position: [0, 5, 0.6], rotation: [Math.PI / 2, 0, 0], scale: [14, 1.1] },
  { shape: 'rect', color: '#ffffff', intensity: 1.6, position: [0, 1.6, 4], rotation: [-0.35, 0, 0], scale: [14, 0.22] },
  { shape: 'rect', color: '#ffd9a8', intensity: 1.4, position: [0, 0.8, -5], rotation: [0, Math.PI, 0], scale: [14, 1.6] },
  { shape: 'rect', color: '#cfe0ff', intensity: 1.2, position: [6, 1.4, 1.5], rotation: [0, -Math.PI / 2.4, 0], scale: [2.5, 2.5] },
  { shape: 'ring', color: '#ffffff', intensity: 1.2, position: [-5, 2.5, 2], rotation: [0, Math.PI / 3, 0], scale: 1.8 },
  { shape: 'rect', color: '#f2ece2', intensity: 0.32, position: [0, 0.6, 7], rotation: [0, 0, 0], scale: [22, 7] },
  { shape: 'rect', color: '#5a5048', intensity: 0.25, position: [0, -4, 0], rotation: [-Math.PI / 2, 0, 0], scale: [14, 6] },
]

export function StudioEnvironment({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const background = theme === 'light' ? '#8f8c85' : '#0b0d13'
  const formers = theme === 'light' ? LIGHT_FORMERS : FORMERS
  const { gl, scene } = useThree()
  useEffect(() => {
    const studio = new THREE.Scene()
    studio.background = new THREE.Color(background)
    const disposables: { dispose: () => void }[] = []
    for (const f of formers) {
      const geo = f.shape === 'ring' ? new THREE.RingGeometry(0.5, 1, 64) : new THREE.PlaneGeometry(1, 1)
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color).multiplyScalar(f.intensity), side: THREE.DoubleSide, toneMapped: false })
      const m = new THREE.Mesh(geo, mat)
      m.position.set(...f.position)
      m.rotation.set(...f.rotation)
      if (typeof f.scale === 'number') m.scale.setScalar(f.scale)
      else m.scale.set(f.scale[0], f.scale[1], 1)
      studio.add(m)
      disposables.push(geo, mat)
    }
    const pmrem = new THREE.PMREMGenerator(gl)
    const rt = pmrem.fromScene(studio, 0.02)
    scene.environment = rt.texture
    pmrem.dispose()
    disposables.forEach((d) => d.dispose())
    return () => {
      if (scene.environment === rt.texture) scene.environment = null
      rt.dispose()
    }
  }, [gl, scene, background, formers])
  return null
}

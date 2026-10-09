/**
 * Optimises Blender exports for the web.
 *   blender/export/*_raw.glb  ->  public/models/*.glb
 * dedup + weld + reorder + quantize (normals/UVs) + EXT_meshopt_compression.
 * Materials are kept for reference; the app assigns its own PBR materials.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { dedup, weld, quantize, reorder, prune } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const SRC = 'blender/export'
const OUT = 'public/models'
mkdirSync(OUT, { recursive: true })

await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

for (const file of readdirSync(SRC).filter((f) => f.endsWith('_raw.glb'))) {
  const src = join(SRC, file)
  const out = join(OUT, basename(file).replace('_raw', ''))
  const doc = await io.read(src)
  await doc.transform(
    dedup(),
    weld(),
    prune({ keepLeaves: true, keepAttributes: true }),
    // Positions stay float: the app relies on every part's vertices being in
    // pen space (no dequantisation transform on the nodes). Normals and UVs
    // are quantised.
    quantize({ pattern: /^(NORMAL|TEXCOORD_\d+)$/, quantizeNormal: 10, quantizeTexcoord: 14 }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
  )
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  await io.write(out, doc)
  const kb = (n) => (n / 1024).toFixed(1) + ' KB'
  console.log(`${src} (${kb(statSync(src).size)}) -> ${out} (${kb(statSync(out).size)})`)
}

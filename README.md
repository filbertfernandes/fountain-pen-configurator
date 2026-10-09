# Wheeler & Rawson — The Meridian configurator

A production-grade 3D product configurator for a fictional fountain-pen maker, built with
Three.js and React Three Fiber. The pen is modelled procedurally in Blender at real dimensions —
multi-start helical threads, a slit nib with a breather hole, a finned feed, a working piston
converter — and the web app takes it apart and puts it back together mechanically.

> Portfolio piece by Filbert Fernandes. Wheeler & Rawson is fictional; nothing is sold and no
> payment is taken. All brand copy lives in `src/brand.ts`.

## What it demonstrates

| Area | Where | Notes |
| --- | --- | --- |
| Mechanical assembly engine | `src/three/assembly/` | Parts declare a joint (screw with the real thread lead, or push fit), what blocks them, where they park and their exploded path. A planner derives strip-down order from the blocking graph. Each part moves on one continuous curve (unscrew, pull, park) with matched velocities, the next part starts while the last is still settling, and the camera frames the layout the parts are heading for. |
| Context-aware sequences | `engine.ts` → `reconcile()` | New nib: uncap, draw nib and feed, swap, reseat. New ink: empties and refills the converter in place on a clear demonstrator, otherwise unscrews the barrel first. Requests made mid-sequence are coalesced. |
| Exploded view | `parts.ts` → `explode` keyframes | Large parts slide clear along the axis before stepping aside, so nothing passes through anything. Labels track each part. |
| Morphing materials | `src/three/materials.ts` | One physically based body shader covers celluloid, ebonite, brushed steel (anisotropic), carbon twill and clear acrylic (transmission), so every body change animates. Tweens are interruptible. |
| Runtime graphics | `src/three/textures.ts` | Engraving (three letterings, barrel or cap band), nib imprint with two-tone plating, and finial monogram are drawn on canvases at runtime. |
| Rules engine | `src/data/rules.ts` | Constraints with ordered repairs that never undo the customer's latest choice. Options preview the knock-on change; the toast offers Undo. |
| Live pricing | `src/data/pricing.ts`, `public/api/catalog.json` | Prices come from a catalog endpoint shaped like a storefront price feed, not from the UI. |
| Commerce flow | `src/state/cartStore.ts`, `src/pages/Checkout.tsx` | Persistent cart with line-item properties and a thumbnail of the exact pen, a Shopify AJAX Cart-style payload in a developer view, demo checkout and confirmation. |
| Sharing and history | `src/data/share.ts`, `src/state/configStore.ts` | Readable share URLs validated on load, undo/redo with coalesced typing. |
| Camera | `src/three/PenStage.tsx` | Frames each region with its own angle (top-down clip, raking nib), keeps the customer's orbit when parts settle, pauses rendering off screen. |
| Extras | | High-resolution image export, renderer stats HUD, click any part to edit it, reduced-motion support. |

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # type-check and build to dist/
pnpm preview
```

The site is a static SPA. `vercel.json` adds the SPA rewrite and long-term caching for the model.

## 3D pipeline

1. `blender/build_meridian.py` builds every part in Blender 4.2+ / 5.x (Scripting tab → Run) and
   writes `blender/meridian.blend` and `blender/export/meridian_raw.glb`.
2. `pnpm optimize:models` welds, reorders and meshopt-compresses it to `public/models/meridian.glb`
   (~800 KB, ~310 KB over the wire). Positions stay float so every part keeps pen-space vertices.

Parts are authored in millimetres on the pen axis (Blender +Z → glTF +Y), so the engine can screw
and slide them about one shared axis. Dimensions the web code relies on (converter travel,
engraving sleeves, nib UV layout) are documented next to their constants.

## Design

Light by default: laid-paper greys and iron-gall blue-black ink, so the many dark pen bodies read
against the page. The 3D stage has its own light studio (a pale sweep with black flags as negative
fill, so dark resins keep their edges and metals keep their contrast). The original dark direction
is still available with `?theme=dark`. Colour tokens live at the top of `src/styles/global.css`.

## Keyboard

`1` capped, `2` uncapped, `3` exploded, `P` renderer stats, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo.

## QA aids

- `?debug` exposes the pen handle as `window.__pen` and the last camera fit as `window.__fit`.
- `?speed=0.2` slows every mechanical sequence (useful for recording).

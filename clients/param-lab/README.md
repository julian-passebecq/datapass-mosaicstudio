# Param Lab (prototype)

A parametric CAD lab built as a client: sliders generated from a param schema rebuild a solid in a Web Worker, and clicking a face or an edge in 3D shows a **Selection details** panel (stable feature id, driving parameters, geometry references) with a **Copy as JSON** button.

**ILLUSTRATIVE geometry.** It is a generic NACA 4-digit blade on a hub, built from textbook formulas. It is not FOIL data, not a validated design, and makes no hydrodynamic claim.

## Run

```sh
npm run client:dev -- param-lab            # prints the loopback URL
npm run client:check -- param-lab
npm run build:client -- param-lab
node --experimental-strip-types --test tests/param-lab.test.mjs   # schema + determinism
node clients/param-lab/qa/smoke.mjs        # browser smoke (starts client:dev on port 5297)
```

## Files

| File | Role |
|---|---|
| `params.ts` | Param schema (id, min/max/step, unit, help). Manifest `input` fields and sliders are generated from it. |
| `features.ts` | Stable feature ids (`hub.body`, `blade-2.leading-edge`, ...) and the numeric face codes the kernel carries. |
| `geometry.ts` | Pure, deterministic generator: NACA rings, then a lofted blade with caps, a revolved hub, a boolean union, render arrays, edges, metrics, a SHA-256 mesh hash and STL. It runs in the worker and in Node. |
| `geometry.worker.ts` | Loads the WASM kernel on the first request. Rebuilds are latest-wins: the caller drops stale results by sequence number. |
| `viewport.ts` | Three.js view that renders on demand (no idle loop), plus picking, highlights and camera presets. |
| `details.ts` | The Selection details JSON (`param-lab.selection-details` v1). |
| `ParamLab.tsx` | UI: sliders, toolbar, metrics, exports, selection panel and `data-capture-state`. |

State: the 11 parameters are `input` fields. Selection, camera preset, edges and wireframe are `view` fields, and changing them never rebuilds. The selection is a `view/select` field over all feature ids for up to 4 blades. If a selected feature disappears (fewer blades, or a root cap buried in the hub), the selection is kept and the panel says it is not present.

## Kernel choice: manifold-3d (not replicad)

- **manifold-3d 3.5.4** gives one ~540 kB WASM file, has no runtime dependencies for the core module, and builds under Vite with no config change. The worker file is the lazy boundary, so the kernel never enters the main bundle. Its booleans are guaranteed manifold, and it **preserves input faceIDs through booleans**. That property is what makes click → stable feature id work after the union.
- **replicad (OpenCascade)** would give a B-rep and STEP export, but the WASM is about 10 MB or more, it is heavier to initialise, and it is more fragile under the selected-client Vite build. That cost is not justified for this prototype.
- Consequence: export is **STL** (binary) and a params JSON. **STEP is not available** because manifold is a mesh kernel. The STEP button is disabled and explains why.

## Known gaps / notes

- **CSP.** The selected-client build emits `_headers` with `script-src 'self'` and without `'wasm-unsafe-eval'`. On a host that applies that header, the browser blocks WebAssembly. In that case the worker falls back to a labelled **JS preview**: the solids are concatenated with no boolean union, the hash is different, and the volume counts overlaps twice. The local dev server and the `client:capture` preview did run the real kernel. Fixing this for real hosting is a framework change (an opt-in CSP per capability) and is out of scope for a client.
- The worker imports `../../node_modules/manifold-3d/manifold.js` by relative path. A bare `manifold-3d` import that is discovered only inside a worker stalls Vite's dev dependency optimizer: the request never answers.
- Determinism: the same params give the same hash in Node and in Chromium. The golden default hash is pinned in `tests/param-lab.test.mjs`.
- The tip is a flat cap. Upper and lower skins share smoothing, and the trailing edge keeps a hard crease.

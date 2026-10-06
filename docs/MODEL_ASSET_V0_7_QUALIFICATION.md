# Model assets v0.7: qualification record

## Recovery and saved source

This pass was recovered after an interrupted assistant session. The substantive model-asset source had already been saved in Git on `feat/studio2-model-assets`; it was not reconstructed from prose.

Base: qualified v0.6 documentation head `a01d312058d39fe5147ae017e4b0916ff96865bf`.
First complete model implementation checkpoint: `db566eab65bc84539e02354840e72ffe91af098c`.
The first hosted gate reached 374 core tests with 373 passing; its only failing suite exposed a case-colliding `model.ts` / `Model.tsx` module name. The source itself was preserved.
The recovery renamed the UI module and made type imports explicit in `77e020a1f4c43ec2c34d63d032f82947f990410d`, then corrected two renderer conditionals in `98df6afce557947716d07661d1f884890c31c772`.

**Qualified tested source commit:** `98df6afce557947716d07661d1f884890c31c772`.
**Tested source tree:** `6c98cb2c37274d269cb6e994b5ae160fe1eed469`.
The successful workflow generated and committed schema/lock metadata only, producing recorded branch head `e193e8e5973b0ca225cbe72a2f0b840f17f1e175`, tree `a3b015703e21e5545a9a7fcfa64347ff233e83b2`.

No merge, deployment, package publication, dependency-version upgrade, donor edit or Rust rewrite occurred.

## Completed qualification

Workflow: https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/37128396156
Hosted job: `111218398564`.

| Check | Observed result |
| --- | --- |
| Frozen npm installation | Passed |
| Generated contract drift / model schema generation | Passed |
| Core, boundary and controller tests | **376 passed**, 0 failed/cancelled/skipped |
| Strict TypeScript + integrated production build | Passed |
| Client source and original visual-engine contracts | Passed |
| Real production HTTP browser scenarios | **76 passed** |
| Independent selected-client build/browser targets | **16 passed** |
| Browser | Google Chrome **154.0.8037.57** |
| Model contract recording | Passed |

Workflow artifact `studio-web-evidence`: ID `11275837378`, **34,548,369 bytes**, SHA-256 `1ff258d30fcd72baa660c110b9c2bc49a954e7da42f689c0af8f1e3ecd499d3b`, expires 2026-10-06.

The sixteen isolated targets were the eight references plus eight fresh generated clients. Relevant measured JavaScript gzip sums:

| Client | JS gzip bytes |
| --- | ---: |
| model-reference | 332,948 |
| acceptance-model | 266,710 |
| operations-reference | 164,593 |
| acceptance-fresh | 98,929 |
| acceptance-analytics | 163,587 |
| acceptance-foundation | 171,742 |

The selected-client gate also verified that clients without `models` do not emit GLB assets or the model viewport and that lightweight clients do not acquire Three.js implicitly.

## What is delivered

### Bounded asset identity before decode

A `ModelAsset` declares one safe relative `.glb` path, exact byte length and lowercase SHA-256. Build-time and browser loaders verify these bytes before Three's existing pinned `GLTFLoader` decodes them. Browser transport is same-origin, credential-free, refuses redirects, has a timeout, streams into the exact approved allocation and aborts on navigation/unmount.

The static GLB profile is intentionally narrow: GLB 2.0, one embedded binary buffer, one scene, bounded node/mesh/primitive/accessor/material counts, static triangle geometry, POSITION plus optional NORMAL, optional integer indices, TRS node transforms and opaque untextured PBR materials. Coordinate, decoded-accessor and rendered-geometry budgets are checked.

External buffers, data URIs, images/textures, extensions/decoders, skins, animation tracks, morph targets, matrix transforms, nontriangle primitives and translucent assets are rejected. This is not universal glTF, CAD import or a game asset pipeline.

### Semantic part ownership

`PartBinding` maps stable client-owned semantic IDs to exact node indices in the hashed file. A group may own several child meshes. Bindings cannot overlap by ancestry, one node cannot represent two semantic parts, empty semantic roots are refused and every rendered mesh must resolve to one owner.

This means the visual object, inspector, annotation, evidence and story cue can use the same ID without depending on non-unique node names.

### Shared viewport rather than another 3D engine

Imported geometry plugs into the existing demand-rendered Three.js viewport. Existing OrbitControls, camera interpolation, picking, PNG capture, selection styling, WebGL loss/fallback behavior and reduced-motion rules remain shared.

Five bounded presentation modes are supported: assembled, exploded, wireframe, isolate and section. Explosion adds author-provided offsets in the bound node's parent coordinate frame. Section is an uncapped world-X clipping plane. Neither mode is a CAD measurement, physical simulation or calculation input.

Authored annotation anchors use local part coordinates transformed through the live world matrix, so labels follow authored part movement. The existing original StoryPlayer can drive model view fields; no model-specific timer or playback loop was added.

### Accessible/lazy product surface

The default `model3d` view is a semantic parts outline with descriptions, asset boundary information and source/evidence access. GLB bytes and the model renderer are requested only after the visitor explicitly chooses 3D. Leaving the view aborts loading; late results are discarded/disposed. No-WebGL keeps the outline and context useful.

The client scaffold command is:

```sh
npm run client:new -- product-demo --family spatial --model
npm run model:inspect -- clients/product-demo/public/models/product-demo/assembly.glb
npm run client:context -- product-demo
npm run client:check -- product-demo
npm run build:client -- product-demo
```

The model option is a capability composition, not a sixth family.

## Acceptance fixture and honesty boundary

`model-reference` uses an original deterministic synthetic plate/support/carriage/module/linkage assembly. It exists to prove static GLB loading, group ownership, exploded offsets, annotations, evidence and shared story controls. It is **not** actual Foil'o geometry, a conventional turbine, a CAD model, measured performance or validated physics.

A real Foil'o teardown still needs approved geometry, coordinate convention, semantic parts, offsets, camera presets, rights/license review, domain descriptions and client acceptance. Asset integrity proves file identity, not engineering correctness.

## Remaining extensions

Not delivered by this pass: textured/compressed/extension-rich glTF, animation tracks, skins/morphs, arbitrary CAD conversion, solid capped sectioning, physics, live telemetry binding, a general Scenario Engine, full SemanticOverlay renderer or final Foil'o/Galaxy client design.

These should remain separate extensions driven by concrete client requirements. A compact portfolio should not load this capability merely because it exists.

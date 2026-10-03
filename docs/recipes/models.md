# Approved model assets: optional static GLB profile

Use the model capability when an imported part/whole assembly explains the product better than procedural primitives. It is not required for a portfolio, ordinary dashboard or D3 scene.

```sh
npm run client:new -- product-demo --family spatial --model
npm run model:inspect -- clients/product-demo/public/models/product-demo/assembly.glb
npm run client:context -- product-demo
npm run client:check -- product-demo
npm run build:client -- product-demo
```

Edit the new client's `model.ts`, approved public asset and content. `modelFields`/`modelBlock` are pure imports from `src/framework/model-assets/index.ts`. Selective builds derive `models` and `spatial` from the actual model block. The five families remain unchanged.

## Supported profile, not universal glTF

The first profile accepts a single self-contained GLB 2.0 scene, static triangle geometry, POSITION/NORMAL attributes, optional integer indices, translation/quaternion/positive scale transforms and opaque untextured PBR materials. GLTFLoader from the existing pinned Three.js is used only after byte-level inspection.

Maximum 16 MiB, 128 nodes, 64 semantic parts, 250,000 rendered vertices and triangles, 256 primitives and a bounded decoded-accessor budget. No external URI or data URI, textures/images, extensions/decoders, skins, morphs, animation tracks, embedded cameras, matrix transforms or nontriangle primitives. Unsupported assets fail explicitly instead of loading dependencies from elsewhere. Export an appropriate static asset profile upstream; do not interpret this as CAD import, a universal GLTF conversion tool or a game animation engine.

`asset.path` is a safe client-relative public path. `byteLength` and SHA-256 identify the approved bytes. `model:inspect` prints node indices and content identity to help an AI map the actual file; it does not invent domain names, part units or engineering accuracy. Build-time and browser checks verify the file and semantic bindings. Fingerprinting is integrity, not trust, license validation or scientific correctness.

## Semantic part ownership

Each PartBinding names a stable client-owned ID and a GLB node index. A group can own several meshes. No two bindings can overlap by ancestry; every rendered mesh must have one semantic owner. Node names need not be unique because binding uses indices within the hashed asset.

`explode` is an additive offset in the part node's parent coordinate frame. The original transform remains the assembled pose. Annotation points are local coordinates of their bound part, including its authored transform and exploded position. Scene cameras use the existing camera contract in world coordinates.

## View state only

The block exposes selection, camera, mode, explode, section, view, annotation visibility and source IDs as ordinary declared view fields. Modes are assembled, exploded, wireframe, isolate and section. Section is an uncapped visual clipping plane along world X, not a solid CAD cross-section or measurement. Isolation without a selected part shows the full assembly. None of these controls executes a model or changes recorded results.

The default view is an accessible outline with source context. The model bytes and renderer are only requested after the visitor opens 3D. Leaving the view aborts loading; a late decode is disposed rather than mounted. Returning loads a fresh owned scene. The existing shared viewport owns rendering, camera interpolation, picking, capture and disposal. No new render or playback clock is created.

The reference app also uses existing story-controls with view-only cues to focus, separate and reassemble parts. A client does not need to copy that story or implement its own timer. Manual controls and reduced motion remain available.

## Evidence and delivery

The existing ContextInspector and SourceReader present approved descriptions and exact evidence lines. Source text is public when bundled. No live Git or filesystem access is added. Saved UI state contains only bounded field values, not binary geometry or code bodies.

Approve the file, coordinate system, offsets, parts, rights, camera presets and descriptions before publishing. A synthetic plate assembly demonstrates the contract; it is not actual Foil'o geometry and does not assume a conventional turbine.

A useful fallback is mandatory when WebGL is unavailable. Review on target browsers and actual devices. Parser/type tests alone do not establish visual or performance quality. Full external textures, compressed mesh profiles, animations and richer annotation placement require a separate measured client need and tests.

# Families and sampled replay: v0.4 source SDK

This is an additive pass on the qualified v0.3. It does not reorganize the entire repository, force a single visual aesthetic or publish a final client site. It does not claim that the framework knows every future app requirement.

## Progressive authoring rather than a giant agent context

Five starting families are implemented: content, knowledge, analytics, spatial and replay. Each maps to an actual scaffolder and a short recipe. `client.config.json` records a preferred family but does not force a capability or prevent composition.

`client:context -- id` evaluates trusted client source, computes capabilities from used blocks/resources, and writes a focused guide and JSON plan under `.generated/client-context/id`. It includes the required block contracts and recipe links, not every third-party library. An ordinary analytical client need not inspect 3D source. The plan can change when that client's needs change.

`src/framework/authoring.ts` is a small source entry with core types and `defineApp`. `src/framework/ui.ts` exposes lightweight React hooks without exporting a scene renderer. Existing broad exports remain compatible. This is progressive disclosure of code and documentation, not yet separate published npm packages: the development repository still has its pinned dependency set.

## Capability planning and build checks

`planCapabilities` is the single source of flags for selected builds. A referenced scene adds spatial; an unused scene resource does not. Known data/document clients do not ship a Three.js renderer. A custom source component may declare `customCapabilities: {componentId: []}` or a list of optional modules. Missing legacy declarations conservatively retain all capabilities and warn.

A selected build emits `studio-build.json` and checks the actual rendered module graph: Three.js must not appear without declared spatial support; the SQLRooms/DuckDB workbench must not appear implicitly. This catches accidental heavy imports; it is not a sandbox against malicious client source. Review dependencies, source imports, data and public assets before publication.

Families select a starting composition, not an appearance or runtime lock. Any client can combine a chart, documents, architecture, replay and a scene. Source-owned custom UI remains available. Framework changes justified by a real client need still belong on a narrow branch with regressions.

## Sampled engineering replay

A new `replay` block consumes an inert `ReplaySpec`. It has elapsed-second timestamps, entity positions, signal units, fixed chart domains, nullable sample arrays and authored events. Optional scene references and bounded part-motion bindings connect data to illustrative geometry.

One original VizForge StoryPlayer supplies discrete sample state. Its existing injectable scheduler uses the supplied time differences and selected speed; no second RAF clock or independent chart/map timer is added. A frame index is the common identity for the plan, numerical readouts, historical plot, event selection and optional scene. Seek, reset, restore, hidden document, offscreen component and unmount stop playback. Reduced motion preserves manual navigation.

This is bounded replay, not a streaming database or a 60-fps physics engine. Limits: 200 samples, 24 entities, 8 channels, 100 events, 1 MiB. Adjacent timestamps are at least 0.1 seconds apart. No interpolation creates an observation. Missing values remain unavailable. Time and null gaps split the original VizForge chart into independent segments; endpoint labels on older segments are historical, not filled-in current observations.

The shared Three.js viewport accepts optional validated additive position/rotation offsets. Motion bindings refer to a part belonging to the same entity and use numeric scale/offset only. Display transitions are cosmetic interpolation between poses, not scientific computation. A missing motion value supplies no delta, returning to the authored base pose with a missing-signal indication.

## Energy / Foil'o boundary

`energy-replay-reference` is a generic acceptance client with three oscillating plates and deterministic invented signals. It deliberately does not assume Foil'o is a conventional turbine. Neither its shapes, displacement, power, wind nor load values represent an approved Foil'o system or a validated physical calculation.

It starts in 2D. The default screen does not request a canvas/Three.js chunk. A user may explicitly choose the 3D scene; the selected installation, sample and plot remain coherent. A no-WebGL visitor still has the plan, readouts, event navigation and charts. The existing turbine example remains an explicitly illustrative v0.2 regression client, not the definition of Foil'o's product.

Real client work needs approved data, model/asset rights, computation assumptions, numerical tests, and decisions about local versus service-backed data. The optional backend task adapter remains separate. No live telemetry, remote Parquet, DuckLake, notebook, IDE, Hop runtime, GLTF import or video export is added here.

## Developer workflow

```sh
npm ci
npm run bootstrap
npm run client:families
npm run client:new -- project --family analytics
npm run client:context -- project
npm run client:check -- project
npm run build:client -- project
```

For replay use `--family replay`; it creates its own 2D recording fixture with no scene source. Add 3D only after it helps the audience. Output lives in `dist-clients/project/`; no deployment occurs.

Unit/controller checks use the pinned real visual engine after bootstrap. The integrated browser gate retains previous clients. Independent target acceptance creates fresh content/custom, knowledge, analytics, spatial and replay clients and verifies source hashes are unchanged by generation/build.

## Verification status

Consult `qa/FAMILIES_CHECKPOINT.md` and the final hosted qualification record, when present. Local TypeScript, unit and selected-build checks do not establish the HTTP/browser gate. The source SDK remains alpha until actual release requirements and real clients are qualified.

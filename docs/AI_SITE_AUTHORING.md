# AI client authoring: v0.7 source SDK

## Start with the task, not the libraries

Read `docs/recipes/START.md`. Families are useful starting compositions, not a restriction on future requirements or visual design.

```sh
npm ci
npm run bootstrap
npm run client:families
npm run client:new -- my-client --family analytics --title "Client project"
npm run client:context -- my-client
npm run dev
# Open the printed address with ?app=my-client
npm run client:check -- my-client
npm run build:client -- my-client
```

The context command writes `.generated/client-context/my-client/GUIDE.md` and `plan.json`. Read that guide before exploring more source: it includes the used block contracts, required capabilities and relevant recipes. Do not open Three.js for a client that has no spatial capability.

## Client and framework ownership

Edit `clients/my-client/`: app definition, approved content, data, trusted domain calculations, optional recordings, scenes and custom React components. Keep public assets in that client's `public/` directory. Scaffolding refuses existing folders. The directory name must equal the manifest ID.

Use `src/framework/authoring.ts` for `defineApp` and core types. Use `src/framework/ui.ts` for lightweight React hooks. Both avoid importing optional renderers. Existing broad exports remain compatible. Do not edit `.upstream` or copy its application shells.

An ordinary client must not modify framework internals. A real requirement may justify a narrowly scoped generic extension: isolate it on a branch, define its semantic boundaries and prove it with a consumer and regression tests. Otherwise keep it in client-owned TSX.

## Choose a short recipe

| Need | Recipe |
| --- | --- |
| Pages and simple custom UI | `docs/recipes/content.md` |
| Documents, search, context and architecture | `docs/recipes/knowledge.md` |
| Filters, typed data, charts and indicators | `docs/recipes/analytics.md` |
| Optional geometry, cameras and spatial exploration | `docs/recipes/spatial.md` |
| Approved static GLB, semantic parts and product teardown | `docs/recipes/models.md` |
| Supplied samples, signals and engineering replay | `docs/recipes/replay.md` |
| Authored process motion and source context | `docs/recipes/motion.md` |
| Captured tasks, results and comparison | `docs/recipes/runs.md` |
| Public-site canonical/social metadata | `docs/recipes/public-site.md` |
| Authored analytical scenes | `docs/recipes/stories.md` |
| Semantic transformation explanation | `docs/recipes/explanation.md` |

The preferred family in `client.config.json` is advisory. The build plan follows actual blocks and referenced resources. Unused scene resources do not force 3D. A client can combine families without changing its basic ownership model.

`client.config.json` may also carry per-client Content-Security-Policy opt-ins. Omit `csp` to keep the default policy (`script-src 'self'; connect-src 'self'`).

```json
{"format":"datapass.client-profile","version":1,"family":"analytics","csp":{"wasm":true,"connect":["http://127.0.0.1:8000"]}}
```

- `wasm: true` adds `'wasm-unsafe-eval'` to `script-src` for that client only (WebAssembly compilation; never `'unsafe-eval'`).
- `connect` adds at most 8 exact origins to `connect-src`: `https://host[:port]`, or `http://` on loopback only (`127.0.0.1`, `localhost`, `[::1]`). Paths, wildcards and other schemes are refused.

The opt-ins apply to `build:client` (emitted `_headers`) and the client preview server. They are declared configuration, not access control: the browser still talks only to the listed origins.

For extended context/navigation behavior read `docs/EXPERIENCE_KIT.md`; for replay and capability planning read `docs/FAMILIES_REPLAY.md`. For the first real energy client read `docs/FIRST_ENERGY_CLIENT.md`. The generated component and JSON Schema files are under `docs/contracts/`; semantic runtime validators remain authoritative.

## State, data and execution boundaries

Manifests are inert: they reference fields, data and trusted source bindings rather than containing executable strings. Build checks evaluate `app.ts` as trusted repository source; never use this mechanism to load an untrusted downloaded module.

Model/filter inputs and presentation fields are distinct. Derived datasets receive only their declared inputs and dependencies. Unrelated camera or selection updates must not recalculate a model. Rows require typed cells and stable unique keys. Null means unavailable, not zero. The small website contract supports at most 10,000 rows and 40 columns; layer labels do not imply persistence or a lakehouse.

Task execution is explicit, bounded and cancellable. Late or superseded results cannot replace newer state. Cancellation is cooperative; it cannot preempt arbitrary synchronous code blocking the browser. Expensive work belongs in a worker or an approved service. The optional fixed same-origin JSON task transport does not supply authentication or a backend.

SQLRooms/Mosaic remain the separate workbench query foundation. Do not bundle that workbench to display a few client indicators. No notebook, IDE, Hop runtime, remote Parquet or DuckLake is needed by default.

## Optional components and payload

Register a custom React function in `components` and reference it by a `custom` block. For a lightweight component declare `customCapabilities: {clientNote: []}`; otherwise list only the optional capabilities it actually uses. The `--custom` basic scaffold creates this lightweight form.

Legacy custom components without declarations keep all renderers and emit a warning. This compatibility behavior is deliberate. A selected build checks actual rendered modules and rejects undeclared Three.js or an implicit SQL workbench import. It records `studio-build.json`. This is not a security sandbox against arbitrary source code.

The repository still installs the full pinned development dependencies. Isolation currently reduces AI reading context and delivered browser code, not installation size through separate npm packages. No new dependency versions or donor pins were introduced for this pass.

## Replay and 3D honesty

The replay family starts in 2D. One original VizForge player schedules supplied timestamps; the plan, current values, chart cursor, events and optional scene share the sample index. Do not add another autoplay timer. Missing values and time gaps remain explicit. The original chart data table must stay accessible.

Current replay limits: 200 samples, 24 entities, eight channels and 1 MiB. This is not a high-frequency live telemetry platform. Replay continues to use bounded primitives and validated pose offsets by default. A separate opt-in `model3d` capability can load an approved static GLB for product/part exploration; this does not turn replay into CAD, physics or a universal glTF runtime. Visual interpolation never creates a measured observation.

The energy reference contains generic oscillating plates and invented signals, not approved Foil'o design or performance. Real geometry, model assumptions, numerical tests and data remain client-owned. Its local framing/free-orbit preferences are not serialized; sample, installation, signal, presentation and speed are saved input state.

## Delivery and acceptance

A selected build emits `dist-clients/my-client/`, using only that client's public directory. New clients are not silently added to the public workbench reference list. No deployment is performed.

Public bundles expose embedded content. Review source imports, document bodies, schemas, data, asset rights and public directories before publication. Filters, view links and evidence levels are not access control.

Saved input JSON excludes recording data, dataset bytes, task results and source callbacks. It may contain sensitive user-entered values. Restore requires review and exact app/version compatibility; invalid or jointly incoherent values leave the existing application unchanged.

For each real client, run source validation, relevant model/unit tests, strict TypeScript, selected production build and actual browser acceptance. Test missing/error states, navigation, restore/export, keyboard, mobile and reduced motion. Inspect rendered screenshots and verify optional 3D has a useful 2D/data fallback. Obtain explicit deployment/security approval.

The current framework is a qualified alpha source SDK, not general v1. Foundation results are recorded in `docs/FOUNDATION_V0_6_QUALIFICATION.md`; the optional model profile is qualified separately in `docs/MODEL_ASSET_V0_7_QUALIFICATION.md`. Broader browser/device qualification and stable API/migration policy remain release work.

## Optional authored motion and evidence workspace

`--family content --motion` creates a fresh client-owned explanation. Any client can add the capability manually without changing families. Read `docs/recipes/motion.md`, then the focused generated guide. Do not open Three.js source for an SVG isometric scene.

Use immutable authored steps rather than executable animation strings. The original player owns progression, D3 owns a finite transition, and source references point only to approved inert excerpts. The separate WorkspaceShell and SourceReader may be composed in custom UI without creating an IDE or copying the motion client.


## Optional result/run and context foundation

`--family analytics --foundation` creates a client-owned task and an opt-in runs block. Read only `docs/recipes/runs.md` and the generated guide initially. The task runtime remains authoritative; the journal observes it rather than executing independently. One artifact may have several existing renderers. Local history survives page changes, not closing or reloading the app.

Pure result/run/navigation/knowledge contracts are in `src/framework/foundation/index.ts`. UI components are explicit imports. Knowledge/search/context and generic ContextInspector can be used by a custom client without the runs workbench. Register a source-only `validateViewState` invariant for coherent combined navigation state; no callbacks belong in imported manifests.

For a compact public portfolio start with content, not the foundation workbench. `publication.json` supplies explicit static metadata without forcing any data/3D engines. See `docs/CLIENT_READINESS_V0_7.md`. Approved static models are a separate opt-in capability; general overlays and richer glTF/CAD behavior remain separate extensions.

## Optional approved static models

Use `--family spatial --model` only when an imported part/whole assembly materially helps the client. Start from the generated outline and `docs/recipes/models.md`. Run `model:inspect` on the approved GLB and author explicit node-index bindings against its SHA-256; do not infer engineering semantics from file names or geometry.

The browser requests the file only after the visitor selects 3D. Existing camera, picking, ContextInspector, SourceReader and StoryPlayer infrastructure is reused. Assembled/exploded/wireframe/isolate/cutaway are view modes only. A cutaway is uncapped visual clipping, not a CAD section. Unsupported textures, external dependencies, extensions, animation tracks, skins and morphs should fail at the boundary rather than cause an AI to bypass validation.

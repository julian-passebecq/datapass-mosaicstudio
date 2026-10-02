# DataPass MosaicStudio

**v0.5 alpha source SDK for AI-built technical websites.** Build client content under `clients/<id>/`, discover only the necessary capabilities, and keep reusable contracts/rendering under `src/framework/`.

Current branch: `feat/studio2-motion-evidence`, draft PR #6. This extends the qualified v0.4 without merging, deploying, publishing a package or modifying pinned donor repositories.

## Start with a small client

```sh
npm ci
npm run bootstrap
npm run client:families
npm run client:new -- my-project --family analytics --title "Client project"
npm run client:context -- my-project
npm run dev
# Open the printed address with ?app=my-project
npm run client:check -- my-project
npm run build:client -- my-project
```

Read `docs/recipes/START.md` and the generated `.generated/client-context/<id>/GUIDE.md`. Families are starter compositions, not restrictions: content, knowledge, analytics, spatial and replay. The actual build plan follows used blocks/resources and optional source-owned capability declarations.

A simple content/data site does not need Three.js. The root development repository still installs its pinned dependencies; context and production-bundle isolation are not yet separate minimal npm packages.

## New: authored motion without WebGL

```sh
npm run client:new -- process-demo --family content --motion
npm run client:context -- process-demo
npm run build:client -- process-demo
```

One small MotionSpec describes stations, tokens, links and authored steps. The same object IDs appear in a flat 2D diagram, an isometric SVG projection, a context inspector and public source excerpts. The compiler builds immutable target snapshots; seeking does not replay code or require a particular UI history.

The original VizForge StoryPlayer owns progression. D3 performs finite adjacent-step transitions rather than adding another autoplay or physics clock. Isometric SVG does not load Three.js or create a WebGL context. Source excerpts are inert, with exact line references; state/timing labels are authored explanations, not runtime measurements.

The new compositional WorkspaceShell and SourceReader are reusable separately from the motion block: optional rail/outline, tabs, main view, inspector and status without a filesystem, editor or notebook. SVG target snapshots and script-free HTML reports are explicit exports. Source code is omitted from reports by default.

Read `docs/MOTION_KIT.md`, the short `docs/recipes/motion.md` and the exact `docs/MOTION_V0_5_QUALIFICATION.md` record.

## Existing capabilities remain

Six public reference clients are included in the integrated review build:

| Route | Purpose |
| --- | --- |
| `?app=motion-reference` | Two authored process explanations, 2D/isometric SVG and exact source context |
| `?app=energy-replay-reference` | Supplied-sample engineering replay with optional 3D |
| `?app=experience-reference` | One selected context across 3D, map and documents |
| `?app=operations-reference` | Typed rows, filters, metrics, D3 and CSV |
| `?app=architecture-reference` | Artifact-backed architecture/schema review and presentation |
| `?app=wind-reference` | Original illustrative assembly, shared story and explicit computation tasks |

These are synthetic/author-owned acceptance examples, not final client websites, actual Foil'o engineering, live infrastructure or measured performance claims.

The root route remains the separate SQLRooms/DuckDB analytical workbench; `?sites=1` opens the reference gallery. Client builds have their own host/public directory and do not initialize the database by default. New client folders are not automatically published in that reference list.

The catalog now has **17 block types**. The motion capability is optional and does not add a new compulsory app family. Existing VizForge, ConceptMotion, Three.js and React Flow engines retain their roles rather than being replaced.

## Build and privacy boundaries

A selected output is `dist-clients/<id>/`. Its build checks actual rendered module inclusion and emits `studio-build.json`; undeclared Three.js or accidental workbench imports fail. Custom source components can declare their minimum `customCapabilities`; legacy undeclared components retain all engines with a warning.

This is not a sandbox for arbitrary repository code. Static sites expose their embedded content. Approve source excerpts, data and public assets before publishing. Domain filters, evidence tabs and view links are not access control. Saved input JSON may contain sensitive values even though source bodies and result data are excluded.

No deployment happens in a client build. Read `docs/AI_SITE_AUTHORING.md` for advanced state/task/export rules and `docs/FIRST_ENERGY_CLIENT.md` for the boundary between synthetic fixtures and a real energy client.

## Verification and release status

The final v0.5 implementation and completed workflow are recorded in `docs/MOTION_V0_5_QUALIFICATION.md`. Read that source-backed record rather than treating a pending PR or configured test suite as a successful gate. Existing clients remain regression targets; actual captures and independent generated-client outputs are inspected.

The project remains an alpha source SDK. A general v1 requires approved real-client acceptance, stable API/version/migration policy and broader browser/device/accessibility/performance qualification. This pass does not supply a general Scenario Engine, notebook/Python execution, GLTF/CAD import, live backend, PDF/PPTX/video encoder, DuckLake or a rewrite of AtlasNote/Cloud Diagram.

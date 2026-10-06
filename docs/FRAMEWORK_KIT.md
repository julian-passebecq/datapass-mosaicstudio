# Studio framework kit v0.2

This pass promotes the integrated Studio2 workbench into a **source-consumable website framework**, without deleting or replacing the workbench.

## Two entry points, one repository

- Workbench: the original SQLRooms/DuckDB-WASM/Mosaic/editor/pipeline/architecture/story/board application, now reached through `workbench-main.tsx`.
- Client websites: `?sites=1` or `?app=<id>` and independently built `dist-clients/<id>`. These enter through `client-main.tsx`, without creating a RoomStore or initializing DuckDB.

The three reference clients use the same app manifest, block registry, validated state and reusable renderers. Client source is separate under `clients/`; no copy of framework internals is placed in those folders.

## Delivered code

- Inert app/page/section/block manifests, structural JSON Schemas and semantic validators.
- Typed numbers/selects/toggles and view state; numeric field and slider controls.
- Small-data inline/derived/task contracts, provenance/layer labels and dependency-aware caching.
- Explicit bounded async tasks; progress, cancellation, input staleness, dependent-task invalidation and late-result rejection.
- Optional bounded same-origin JSON task transport (not a hosted Python service).
- Reviewable saved-input export/restore, exact app/version checks and atomic validation.
- Native text, code, metrics, tables, sorting/pagination/CSV and data catalog blocks.
- Original VizForge chart adapter and one shared original StoryPlayer coordinating narrative, analytical figure and 3D view state.
- Generic Three.js primitive scene, camera presets, explode transforms, phase, entity selection, accessible fallback and PNG capture.
- Existing architecture module mounted with client-owned resources; no second architecture renderer.
- Trusted custom TSX components as an escape hatch.
- Safe client scaffolder, per-client validation and build output, entry/asset isolation, AI authoring guide.
- A new scaffold is actually built and opened in the target-build acceptance test without changing framework source.

## Reference clients

`wind-reference` exercises procedural 3D, shared story, validated scenario inputs, pure calculations, explicit async results and provenance. Its constant-output LCOE model is deliberately illustrative and excludes many project-finance/engineering factors.

`operations-reference` exercises an ordinary small business app: input filters, derived totals, original D3 chart, table, CSV and data contracts. Empty margin is unavailable, not zero.

`architecture-reference` exercises the existing static artifact-review/presentation module inside a normal website, without a database.

## Reuse and boundaries

SQLRooms and UWData Mosaic still own their existing workbench concerns. The new SiteRuntime handles small client inputs/rows and explicit source callbacks; it is not a SQL parser, analytical query planner, notebook kernel or replacement Mosaic coordinator.

VizForge and ConceptMotion pins remain unchanged. Charts and shared story frames use the original VizForge validators/renderers/player. Three.js supplies real rendering and OrbitControls. Primitive scene JSON describes content; it does not replace a graphics engine. Three interpolation is a renderer animation, not a second story progression timer.

Existing architecture, pipeline, data explorer, SQL, linked views, stories, ConceptMotion and project board remain regression targets.

## Remaining work before calling it a general v1 release

- Qualify a real client-owned asset/data bundle, not only synthetic acceptance clients.
- Decide stable public SDK/package exports and version/migration policy from real-client feedback.
- Add GLTF/optimized 3D asset import and richer choreography only when required by a client brief.
- Integrate an actual approved computation service with authentication/operational limits where needed.
- Cross-browser/device/accessibility/performance qualification beyond the current Chromium gate.
- Refine optional SQL-backed client composition if a specific site needs more than small rows or explicit service tasks.

No remote Parquet, File X-ray, DuckLake/Delta, notebook editor, Hop backend, new IDE, cloud control plane, automated deployment or authentication system was added. No release completeness percentage or guaranteed number of future passes is implied.

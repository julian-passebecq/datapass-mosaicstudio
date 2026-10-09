# Visualization stack

What each visualization library owns in this repository, as implemented in 0.9. Read with `AGENTS.md` rules 3, 4, 9, 26, 27, 40 and `docs/ENGINE_CAPABILITY_MATRIX.md`. Capability flags come from `src/framework/capabilities.ts`; lazy loading is in `src/framework/registry.tsx`.

Rule for all of them: there is one progression clock per page (the VizForge StoryPlayer). View changes (camera, selection, projection, filters) must not rerun model or domain calculations.

## Summary

| Library | Owns | Must not | Capability flag |
|---|---|---|---|
| D3 viz kit | default `chart` renderer, crossfilter, 2D marks, 3D marks | start a story clock; query data itself | `__STUDIO_CHARTS__` |
| VizForge | story player, progression, figures | be replaced by another clock | `__STUDIO_STORIES__` (also used by motion, replay) |
| ConceptMotion | semantic explanation scenes | own site data or navigation | `__STUDIO_EXPLANATIONS__` |
| Authored motion | SVG/D3 step transitions, isometric projection | add a timer, load Three.js | `__STUDIO_MOTION__` |
| Concept spec renderers | iso, layer cake, 3D views of one concept spec | rerun anything on view change | none (client code) |
| Three.js | optional 3D: scene3d, model3d, viz3d, concept 3D | be loaded for 2D clients | `__STUDIO_3D__`, `__STUDIO_MODELS__` |
| React Flow | graphs: pipeline, architecture, explorer | execute pipelines | `__STUDIO_ARCHITECTURE__`, `__STUDIO_EXPLORER__` |
| SQLRooms + UWData Mosaic | workbench data, SQL, linked views | be copied into small sites | workbench only (not a site flag) |

## D3 viz kit

| Item | Detail |
|---|---|
| Owns | The default renderer of the `chart` block (bar, line, scatter and viz-only marks). Chart spec parsing and validation, scales, tokens, tooltips, crossfilter, SVG marks with canvas above the SVG mark limit, 2D/3D routing, finite motion tweens. |
| Must not | Run a story clock or autoplay. Use the d3 barrel (d3 modules only). Query data: it receives rows from the runtime dataset. |
| Entry files | `src/framework/blocks/Chart.tsx` (chooses path), `blocks/ChartViz.tsx`, `src/framework/viz/index.ts`, `viz/spec.ts`, `viz/crossfilter.ts` (pure filters, multi and interval), `viz/route.ts`, `viz/chart-marks.tsx`, `viz/webgl/` (3D marks, `detect.ts`). |
| Loaded by | `chart` block, flag `__STUDIO_CHARTS__`. `ChartViz` is a lazy chunk. The 3D engine `viz/webgl/engine.ts` (three.js) loads on first 3D mark only. `?webgl=0` forces the 2D fallback. |
| Opt-out | Per block `renderer:'vizforge'`; per page `?viz-chart=0`; per build `VITE_DP_VIZ_CHART`. `renderer:'viz'` forces the kit and enables viz-only options (`chartUsesViz` in `blocks/chart-flag.ts`). |
| Used by | `operations-reference`, `wind-reference`, `experience-reference`, `foundation-reference` (chart blocks found by grep of `app.ts`); runs and replay result charts; custom dashboards in some clients. Not exhaustive for custom TSX. |

## VizForge

| Item | Detail |
|---|---|
| Owns | The original story player (`StoryPlayer`), story specs (`parseStory`, `parseVisualization`), `Figure` and `StoryView` adapters, example catalogue and gallery. The single progression owner: motion and replay controllers wrap the same player. |
| Must not | Be forked or duplicated. Nothing else may add an autoplay timer. Seek, reverse and restore select deterministic targets and never re-execute domain actions. |
| Entry files | Upstream: `.upstream/vizforge` (ignored, commit-pinned, aliased as `@vizforge/*` in `vite.config.ts`). Site use: `src/framework/stories/react.tsx`, `blocks/Story.tsx`, `blocks/Chart.tsx` (legacy path), `motion/controller.ts`, `replay/controller.ts`. Workbench: `src/panels/Stories.tsx`. |
| Loaded by | `story-controls` and `story-figure` blocks, flag `__STUDIO_STORIES__`; also `motion` and `replay`. |
| Used by | `wind-reference`, `model-reference` (story blocks); `operations-reference` data referred to as the existing VizForge ranking; workbench module `stories`. |

## ConceptMotion

| Item | Detail |
|---|---|
| Owns | Semantic explanation scenes: `ConceptScene`, loop frames, recommended viewport. Algorithm visuals in the Concept lab. |
| Must not | Own site data, selection or navigation. Be reimplemented in D3 or React Flow. |
| Entry files | Upstream `.upstream/conceptmotion` (aliased `@conceptmotion/*`). `src/framework/blocks/Explanation.tsx`, `src/framework/explanation.ts`, `src/panels/Concepts.tsx`. `src/dom-compat.d.ts` notes the DOM `moveBefore` detection. |
| Loaded by | `explanation` block, flag `__STUDIO_EXPLANATIONS__`; workbench module `explain`. |
| Used by | `experience-reference`; workbench Concept lab. |

## Authored motion (SVG/D3)

| Item | Detail |
|---|---|
| Owns | Authored 2D and isometric step-by-step motion. One finite D3 transition per adjacent step. Semantic IDs for annotations. Static SVG and report export. Spec v1 and v2 (`docs/contracts/motion*.schema.json`). |
| Must not | Create timers or callbacks (v2 command windows are pure samples of the transition). Import D3, React or Three.js from the pure authoring entry. Build a physics engine, CAD importer or second player. Force Three.js or the data workbench. |
| Entry files | `src/framework/motion/`: `compile.ts`, `controller.ts` (wraps the VizForge StoryPlayer), `Motion.tsx`, `renderer.ts`, `export.ts`, `migrate.ts`, `AGENTS.md`. |
| Loaded by | `motion` block, flag `__STUDIO_MOTION__`. |
| Used by | `motion-reference`. |

## Concept spec renderers (isometric, layer cake, 3D)

| Item | Detail |
|---|---|
| Owns | Three views of one `datapass.concept-spec/1` document: isometric SVG (`iso.ts`), layer cake SVG (`flat.ts`), 3D scene (`three/`). Layout, routing, navigation state over layers and domains. |
| Must not | Evaluate anything in the spec (it is data). Reload the spec on view change. |
| Entry files | `src/framework/concept/index.ts` (`CONCEPT_RENDERINGS`, `conceptSvg`), `iso.ts`, `flat.ts`, `three/world.ts`, `react/ConceptStage.tsx` and `react/ConceptFilm.tsx` (both lazy imported by `clients/concept-viewer/ConceptWorkbench.tsx`). |
| Loaded by | Client code; no site capability flag. The 3D chunk loads when the `3d` view is chosen. The standalone `dist-standalone/concept-viewer.html` inlines Three.js. |
| Used by | `concept-viewer`, `arch-atlas`. |

## Three.js

| Item | Detail |
|---|---|
| Owns | Optional 3D only: `scene3d` (shared `SceneViewport`), `model3d` (static GLB through the pinned GLTFLoader), viz 3D marks, concept 3D scene, and client-owned viewports. |
| Must not | Be added to a compact portfolio or ordinary analytical client without a spatial need. Provide a model-specific render or playback loop (reuse the shared viewport and the StoryPlayer). Load unsupported textures, codecs, animations or CAD behaviour. Rerun domain calculations on camera, selection, explode, wireframe, isolate, cutaway or annotation changes. |
| Entry files | `src/framework/scene-renderer/` (`renderer.ts`, `SceneViewport.tsx`, `camera-transition.ts`), `blocks/Scene3D.tsx`, `model-assets/` (`glb.ts`, `ModelViewport.tsx`, `ModelBlock.tsx`), `viz/webgl/engine.ts`, `concept/three/world.ts`. Client viewports: `clients/fabric-bricks/`, `galaxy-navigator/Galaxy3D.tsx`, `param-lab/viewport.ts`. |
| Loaded by | `scene3d` -> `__STUDIO_3D__`. `model3d` -> `__STUDIO_MODELS__` plus `spatial`. `explorer` or `replay` with a `scene` resource -> `spatial`. A `custom` block without `customCapabilities` retains every renderer. |
| Used by | `wind-reference` (scene3d), `model-reference`, `fabric-bricks`, `galaxy-navigator`, `param-lab`, `concept-viewer` (3D view). |

## React Flow

| Item | Detail |
|---|---|
| Owns | Node-edge graphs and layout interaction: pipeline designer, architecture review, explorer relations. Architecture import adapters and exports (JSON, SVG, HTML). |
| Must not | Execute pipelines ("no execution engine is attached"). Add a generic orchestration engine. |
| Entry files | `src/panels/Pipeline.tsx`, `src/panels/Architecture.tsx`, `src/architecture/`, `src/framework/blocks/Architecture.tsx`, `src/framework/explorer/`. Package `@xyflow/react` 12.8.5. |
| Loaded by | `architecture` block -> `__STUDIO_ARCHITECTURE__`; `explorer` block -> `__STUDIO_EXPLORER__` (capability catalog lists React Flow as its engine). Workbench modules `pipeline`, `architecture`. |
| Used by | `architecture-reference`, `experience-reference`; workbench. |

## SQLRooms and UWData Mosaic

| Item | Detail |
|---|---|
| Owns | The workbench data side: DuckDB-WASM connection, room store, tables, SQL editor, Mosaic coordinator, selections and vgplot-based linked views. |
| Must not | Become a new SQL engine or a replacement Mosaic query coordinator in the small site runtime. Appear in the compact portfolio or selected-client builds by default. |
| Entry files | `src/store.ts` (`createWasmDuckDbConnector`, room store), `src/App.tsx`, `src/panels/Linked.tsx` (`VgPlotChart`, `DataTableExplorer`, `mosaic.getSelection`), `Sql.tsx`, `Explore.tsx`, `Notebook.tsx`. Examples under `.upstream/sqlrooms-examples`. |
| Loaded by | Workbench entry (`src/workbench-main.tsx` -> `App`). Stories, concept and architecture embeds skip it (`?embed=1&module=...`). No site capability flag. |
| Used by | Workbench modules `explore`, `linked`, `sql`, `notebook` (SQL cells). No client site. |

## Notebook (0.9)

The notebook adds no renderer. It shows results with the existing `ArtifactView` (`src/framework/foundation/ArtifactView.tsx`), which builds a `datapass.web-app` page from one artifact and uses the normal block renderers (table, chart and so on). SQL results become artifacts in `src/workspace/sql-artifact.ts`. Python cells call an allowlisted local runtime (`datapass.runtime/1`); the browser never sends code.

## Not verified

- The "Used by" lists come from grep of block literals in `clients/*/app.ts` and imports. Clients that build blocks through helpers or custom TSX may use more engines. `npm run client:context -- <id>` prints the real plan for one client.
- Exact entry file of the explorer map renderer (`explorer/MapView.tsx`) was not read to confirm whether it uses React Flow or plain SVG.

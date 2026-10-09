# Product inventory 0.9

Purpose: list what exists, so nothing is dropped silently. Source: the code and docs of this branch (`package.json` version 0.9.0). Status values: **kept** (existed before 0.9, unchanged in role), **new** (added in 0.9), **draft** (declared draft or provisional in its own docs).

"New" means new in 0.9 according to the branch history and code comments. Where this could not be proven from the repo, the row says "kept" only if the item is documented in a 0.8 doc.

## 1. Routes and entry points

`src/main.tsx` picks one of two separate entry graphs: `?app=` or `?sites=` loads `src/client-main.tsx`, everything else loads `src/workbench-main.tsx`.

| Name | Where | Status | How to reach it |
|---|---|---|---|
| Workbench (all modules) | `src/workbench-main.tsx`, `src/App.tsx` | kept | `/` |
| Start module by id | `src/store.ts` (`requestedModule`) | new | `?module=<id>` (unknown id falls back to the saved module, else `explore` with samples or `notebook` without) |
| Blank workspace | `src/store.ts` | new | `?workspace=blank` (no samples for this visit) |
| Synthetic sample | `src/store.ts` | new | `?sample=operations` |
| Runtime link | `src/workspace/runtime.ts` `connectionFromHash`, `src/panels/Notebook.tsx` | new | `#runtime=http://127.0.0.1:<port>&token=<token>` (loopback only; fragment removed from the address bar; user consent required) |
| Embedded standalone module | `src/workbench-main.tsx` | kept | `?embed=1&module=stories`, `explain` or `architecture` (no RoomStore, no database) |
| Embedded full workbench | `src/App.tsx`, `src/store.ts` | kept | `?embed=1` with any other module (catalog collapsed, saved workspace not loaded or written) |
| Client site (one app) | `src/client-main.tsx`, `src/ClientRouter.tsx` | kept | `?app=<client-id>` |
| Reference catalogue of clients | `src/ClientRouter.tsx` | kept | `?sites=1` (also shown when `?app=` has no valid id) |
| Site page | `src/framework/Site.tsx` | kept | `&page=<page-id>` |
| Site theme / capture | `src/framework/Site.tsx` | kept | `&theme=`, `&capture=` |
| Chart renderer override | `src/framework/blocks/chart-flag.ts` | kept | `&viz-chart=0` (VizForge) or `=1` (viz kit) |
| WebGL fallback test | `src/framework/viz/webgl/detect.ts` | kept | `&webgl=0` or `off` |
| Architecture present mode | `src/panels/Architecture.tsx` | kept | `?module=architecture&present=1` |
| Concept viewer in site runtime | `clients/concept-viewer/ConceptViewer.tsx` | kept | `?app=concept-viewer&spec=examples/<file>.json&view=isometric\|layered\|3d` |
| Standalone concept viewer | `dist-standalone/concept-viewer.html` (source `clients/concept-viewer/standalone/`) | kept | open the file (file://) or any static host; rebuild with `npm run build:concept-standalone` |

### Standalone concept viewer: inputs and embed options

| Item | Where | How |
|---|---|---|
| Embedded examples | `clients/concept-viewer/public/examples/` | tabs in the page |
| Open file / drop / paste JSON | `clients/concept-viewer/ConceptWorkbench.tsx` | button, drag onto the window, paste box (dropped in `chrome=embed`: disabled) |
| `?src=<https URL>` | `clients/concept-viewer/standalone/main.tsx`, README | https anywhere, http only on localhost; 256 KB; no cookies or referrer |
| Embed message in | `clients/concept-viewer/standalone/embed.ts` | parent posts `{type:"datapass.concept-spec/load", spec, options?}`; spec is an object or JSON text |
| Embed options | same file | `view: isometric\|layered\|3d`, `fit: boolean`, `chrome: full\|embed`, `theme: light\|dark\|auto`; invalid values are ignored |
| Embed message out | same file | `{type:"datapass.concept-spec/ready", specVersion, result?}` once listening and after each load |
| Film mode | `clients/concept-viewer/README.md` | `&film=1&paused=1&chrome=0&t=<s>`, `window.__conceptFilm.seek(t)` |

## 2. Workbench modules

From `src/core/host.ts` `modules` (all `status: implemented`). Panels are in `src/panels/`.

| Module id | Title | Panel file | Engine (as declared) | Status |
|---|---|---|---|---|
| `notebook` | Notebook (SQL and Python cells) | `Notebook.tsx`, `src/workspace/notebook.ts` | DuckDB-WASM + local runtime adapter | new |
| `explore` | Data explorer | `Explore.tsx` | SQLRooms / DuckDB-WASM | kept |
| `linked` | Linked views | `Linked.tsx` | SQLRooms / UWData Mosaic | kept |
| `sql` | SQL workspace | `Sql.tsx` | SQLRooms SQL Editor | kept |
| `pipeline` | Pipeline designer | `Pipeline.tsx`, `src/core/pipeline.ts` | React Flow / DataPass | kept |
| `stories` | Visual stories | `Stories.tsx` | VizForge | kept |
| `explain` | Concept lab | `Concepts.tsx` | ConceptMotion | kept |
| `board` | Project board | `Board.tsx` | DataPass | kept |
| `architecture` | Architecture review | `Architecture.tsx`, `src/architecture/` | React Flow / DataPass architecture artifacts | kept |

Other workbench files: `ShellPanels.tsx` (catalog and assets panels, file picker), `Common.tsx` (shared result table, CSV export), `src/workspace/persist.ts` (saved workspace), `src/workspace/runtime.ts` (runtime client), `src/workspace/sql-artifact.ts` (SQL result to artifact).

## 3. Block types (19)

Defined in `src/framework/types.ts` (`Block` union). Dispatch in `src/framework/registry.tsx`. A missing capability in a build throws "... not included in build".

| Block `type` | Renderer / component | Capability flag | Status |
|---|---|---|---|
| `text` | `blocks/Basic.tsx` | always | kept |
| `metric` | `blocks/Basic.tsx` | always | kept |
| `input` | `blocks/Basic.tsx` | always | kept |
| `table` | `blocks/Basic.tsx` | always | kept |
| `task` | `blocks/Basic.tsx` | always | kept |
| `catalog` | `blocks/Basic.tsx` | always | kept |
| `code` | `blocks/Basic.tsx` | always | kept |
| `chart` | `blocks/Chart.tsx` (viz kit by default, VizForge with `renderer:'vizforge'`) | `__STUDIO_CHARTS__` | kept |
| `scene3d` | `blocks/Scene3D.tsx` (shared SceneViewport, Three.js) | `__STUDIO_3D__` | kept |
| `story-controls` | `blocks/Story.tsx` (VizForge) | `__STUDIO_STORIES__` | kept |
| `story-figure` | `blocks/Story.tsx` (VizForge) | `__STUDIO_STORIES__` | kept |
| `architecture` | `blocks/Architecture.tsx` (React Flow) | `__STUDIO_ARCHITECTURE__` | kept |
| `explorer` | `explorer/Explorer.tsx` (map, library, optional scene) | `__STUDIO_EXPLORER__` | kept |
| `explanation` | `blocks/Explanation.tsx` (ConceptMotion) | `__STUDIO_EXPLANATIONS__` | kept |
| `replay` | `replay/Replay.tsx` | `__STUDIO_REPLAY__` | kept |
| `motion` | `motion/Motion.tsx` (SVG/D3 + VizForge player) | `__STUDIO_MOTION__` | kept |
| `model3d` | `model-assets/ModelBlock.tsx` (Three.js, GLTFLoader) | `__STUDIO_MODELS__` | kept |
| `runs` | `foundation/RunWorkbench.tsx` | `__STUDIO_RUNS__` | kept |
| `custom` | trusted TSX in `definition.components` | per `customCapabilities`, else all | kept |

Capability planning: `src/framework/capabilities.ts` (`planCapabilities`). Machine-readable lists: `docs/contracts/components.json`, `docs/contracts/capabilities.json`.

## 4. Renderers and engines

Details in `docs/VISUALIZATION_STACK.md`.

| Engine | Where | Status |
|---|---|---|
| D3 viz kit | `src/framework/viz/` | kept (default chart renderer since CHART-N1a/N1b, see ROADMAP) |
| VizForge | `.upstream/vizforge` via `@vizforge/*` aliases | kept |
| ConceptMotion | `.upstream/conceptmotion` via `@conceptmotion/*` aliases | kept |
| Authored motion (SVG/D3) | `src/framework/motion/` | kept |
| Concept spec renderers: isometric, layer cake, 3D | `src/framework/concept/` (`iso.ts`, `flat.ts`, `three/`) | kept |
| Three.js | `scene-renderer/`, `model-assets/`, `viz/webgl/`, `concept/three/` | kept |
| React Flow | `src/panels/Pipeline.tsx`, `Architecture.tsx`, `blocks/Architecture.tsx`, explorer | kept |
| SQLRooms + UWData Mosaic | `src/store.ts`, `src/panels/Linked.tsx`, `Sql.tsx`, `Explore.tsx` | kept |
| DuckDB-WASM | `src/store.ts` (`createWasmDuckDbConnector`) | kept |

## 5. Commands (`package.json` scripts)

| Script | What it does |
|---|---|
| `dev` | Vite dev server on 127.0.0.1 (runs `predev` first) |
| `predev` | bootstrap upstreams, then prepare assets |
| `bootstrap` | `scripts/bootstrap-upstreams.mjs`: fetch the pinned `.upstream/` trees |
| `typecheck` | `tsc --noEmit` |
| `test` | Node unit tests, `tests/*.test.mjs` |
| `build` | bootstrap, prepare assets, typecheck, `vite build` |
| `preview` | Vite preview server on 127.0.0.1 |
| `test:browser` | Playwright suite |
| `test:fixtures` | build test fixtures (`scripts/make-test-fixtures.py`) |
| `contracts` | export JSON contracts to `docs/contracts/` |
| `contracts:check` | verify exported contracts and strict-validate the two example concept specs |
| `concept:validate` | validate concept spec files (`scripts/concept-validate.mjs`) |
| `build:concept-standalone` | rebuild `dist-standalone/concept-viewer.html` |
| `client:capture` | capture screenshots of a client |
| `client:dev` | dev server for one client (`-- <id> --port N`) |
| `client:new` | scaffold a new client (does not overwrite existing folders) |
| `client:check` | validate clients |
| `test:visual-contracts` | visual contract checks (`scripts/check-visuals.mjs`) |
| `build:client` | production build of one client (`-- <id>`) |
| `test:client-builds` | build all clients, then run the performance gate |
| `test:client-performance` | payload budget gate only |
| `client:context` | generate the focused authoring guide for one client (`-- <id>`) |
| `client:families` | list client families |
| `model:inspect` | inspect a GLB model |
| `test:viz-gallery` | viz gallery test |
| `record:gallery` | record the viz gallery video (`tools/record_gallery.mjs`) |
| `test:python` | Python unit tests in `py/` |
| `test:python-bridge` | Python bridge smoke test |
| `service:python` | start the Python artifact service (`py/service/app.py`) |
| `test:python-service` | service smoke test |
| `test:artifact-watch` | artifact watch smoke test |
| `test:artifact-lineage` | lineage smoke test |
| `test:coding-lab` | animated-coding-lab smoke test |
| `test:engine` | engine consolidation test |
| `test:python-runtime` | Python tests in `py/service/` (runtime) |
| `test:workbench` | workbench authoring unit test + notebook browser spec (new in 0.9) |
| `sdk:pack` | build the SDK release archive and manifest |
| `sdk:verify` | verify an SDK release archive |
| `preview:validate` | validate a `datapass.preview/1` file |

## 6. Client families and clients

Families: `src/framework/capabilities.ts` `appFamilies`, list with `npm run client:families`, guides in `docs/recipes/`. Start at `docs/recipes/START.md`.

| Family id | Template | Guide | Default capabilities |
|---|---|---|---|
| `content` | basic | `docs/recipes/content.md` | none |
| `knowledge` | knowledge | `docs/recipes/knowledge.md` | explorer |
| `analytics` | analytics | `docs/recipes/analytics.md` | charts |
| `spatial` | spatial | `docs/recipes/spatial.md` | explorer, spatial |
| `replay` | replay | `docs/recipes/replay.md` | charts, replay |

Other recipes: `explanation.md`, `models.md`, `motion.md`, `runs.md`, `stories.md`, `custom-visuals.md`, `public-site.md`.

Clients in `clients/`. "Public reference" = listed in `AGENTS.md` rule 17. Family comes from `client.config.json`; a blank means no profile file.

| Folder | Family | Class | Notes |
|---|---|---|---|
| `wind-reference` | none | public reference | chart, scene3d, story blocks |
| `operations-reference` | none | public reference | chart block |
| `architecture-reference` | none | public reference | architecture block |
| `experience-reference` | none | public reference | architecture, chart, explanation |
| `energy-replay-reference` | replay | public reference | |
| `motion-reference` | content | public reference | |
| `foundation-reference` | analytics | public reference | runs, chart, custom |
| `model-reference` | spatial | public reference | story-controls plus model resources |
| `fabric-bricks` | spatial | draft | README: "Status: DRAFT (2026-10-06)", synthetic and provisional, no further investment |
| `fabric-gallery-reference` | analytics | not in rule 17 (client prototype) | custom dashboard |
| `python-wind-reference` | analytics | not in rule 17 (client prototype) | live Python artifact (bridge) |
| `concept-viewer` | spatial | not in rule 17 (tool client) | opens concept spec v1 |
| `arch-atlas` | spatial | not in rule 17 (client prototype) | architecture atlas, concept visuals |
| `galaxy-navigator` | content | not in rule 17 (client prototype) | GALAXY-N2 target in ROADMAP |
| `param-lab` | spatial | not in rule 17 (client prototype) | has its own geometry worker |
| `portfolio-showcase` | content | not in rule 17 (client prototype) | compact portfolio |
| `animated-coding-lab` | content | not in rule 17 (client prototype) | `npm run test:coding-lab` |

"Client prototype" is this document's label for folders with no declared status; none of them says "draft" in the files read. Check each README before relying on it.

## 7. Readers, importers and exports

### Importers

| What | Where | Limits and behaviour | Status |
|---|---|---|---|
| CSV, JSON, Parquet data file | `src/store.ts` `importFile`, picker in `ShellPanels.tsx` | extensions `.csv .json .parquet` only; Parquet via a registered file handle that is dropped after use | kept |
| Pipeline (ADF-style) JSON | `src/panels/Pipeline.tsx`, `src/core/pipeline.ts` `parsePipeline` | max 2 MiB; static graph, nothing executes | kept |
| Architecture: `datapass.architecture`, dbt manifest, dbt catalog, pipeline | `src/panels/Architecture.tsx`, `src/architecture/adapters.ts` | review step before accept; user file marked "unverified" | kept |
| Concept spec: open file, drop, paste, `?spec=`, `?src=`, embed message | `clients/concept-viewer/` | bounded JSON, full validation, invalid file keeps current spec | kept |
| Workspace file | `src/workspace/persist.ts` `importWorkspace`, `Notebook.tsx` | max 1 MiB at the picker, 512 KiB document; refuses newer versions; nothing runs after import | new |
| Draft v1 migration | `importWorkspace` | `datapass.studio2.draft` v1 (fields `module, layout, pipeline, board, note`) becomes a workspace | new |
| Saved workspace in browser | `loadWorkspace` / `saveWorkspace`, key `datapass.workspace` | rejected documents are backed up under `datapass.workspace.rejected` | new |
| Static artifact | `src/framework/foundation/artifact-loader.ts` | `clients/<id>/public/artifacts/<artifact-id>.json`, same origin only | kept |
| Live (http) artifact | same file, `ArtifactSourceSpec {kind:'http'}` | http(s) service, no cookies, validated like a static file | kept |
| Runtime run records | `src/workspace/runtime.ts` | loopback origin with explicit port, per-launch token | new |
| Journal run records | `src/framework/foundation/journal.ts` | bounded, in memory | kept |
| GLB models | `src/framework/model-assets/` | bounded static GLB profile, hash-checked | kept |

### Exports

| What | Where | Status |
|---|---|---|
| Result rows CSV | `src/panels/Common.tsx` (`Results`), `Notebook.tsx` (`<cell>.csv`) | kept (notebook button new) |
| Draft | `src/App.tsx` `exportDraft` -> `mosaicstudio-draft.json` (`datapass.studio2.draft` v1) | kept |
| Workspace | `Notebook.tsx` -> `mosaicstudio-workspace.json` | new |
| Pipeline JSON | `Pipeline.tsx` | kept |
| Architecture JSON / SVG / HTML report | `Architecture.tsx` -> `architecture-review.{json,svg,html}`; source text only on opt-in | kept |
| Artifact JSON | `src/framework/foundation/ArtifactView.tsx` | kept |
| Run record export | `RunJournal.exportRecord` (terminal runs only) | kept |
| Motion SVG and report | `src/framework/motion/export.ts` (`motionSvg`, `motionReport`) | kept |
| Concept SVG (isometric, layer cake) | `src/framework/concept/index.ts` `conceptSvg` | kept |
| Concept film | `scripts/record-concept-film.mjs` | kept |
| Viz gallery video | `tools/record_gallery.mjs`, `docs/media/viz-gallery/` | kept |
| Client screenshots | `npm run client:capture` | kept |
| SDK release archive + manifest | `scripts/sdk-pack.mjs` | new |

Run and journal exports hold result data and are separate from saved UI state (AGENTS.md rule 33).

## 8. Contracts

| Contract | Where | Status |
|---|---|---|
| `datapass.concept-spec/1` (spec v1) | `spec/concept/v1/` (schema, 2 examples), `src/framework/concept/schema.ts`, `docs/CONCEPT_SPEC.md` | kept |
| `datapass.artifact` v1 | `src/framework/foundation/artifact.ts`, `py/datapass_artifact.py`, `docs/contracts/artifact.schema.json` | kept |
| `datapass.preview/1` | `spec/preview/v1/` (`preview.schema.json`), `scripts/preview-validate.mjs` | new |
| `datapass.runtime/1` | `py/service/runtime.py`, `py/service/app.py`, client `src/workspace/runtime.ts` | new |
| `datapass.workspace` v1 | `src/workspace/persist.ts` | new |
| `datapass.sdk-release` v1 | `scripts/sdk-pack.mjs`, `scripts/sdk-verify.mjs` | new |
| `datapass.client-profile` v1 | `clients/<id>/client.config.json`, `docs/contracts/client-profile.schema.json` | kept |
| `datapass.studio2.draft` v1 | `src/App.tsx` (export), `persist.ts` (migration only) | kept (legacy) |
| `datapass.architecture` | `src/architecture/model.ts` | kept |
| Web app manifest, web state | `docs/contracts/web-app.schema.json`, `web-state.schema.json` | kept |
| Other schemas | `docs/contracts/`: explanation, explorer, knowledge-context, model3d, motion, motion-v2, replay, run-record, run-spec, scene3d, source-artifact, navigation, capabilities, families, components | kept |

Policy: `docs/API_VERSION_MIGRATION_POLICY.md`. Check or regenerate with `npm run contracts:check` / `npm run contracts`.

## Existing acceptance IDs found

Searched `docs/`, `handoff/` and client READMEs.

| ID | Where | Meaning in the file |
|---|---|---|
| CHART-N1a, CHART-N1b | `handoff/ROADMAP.md` line 7 | chart blocks move to the viz kit; landed in 0.8 rc.4; default switch targeted for 0.9 |
| GALAXY-N2 | `handoff/ROADMAP.md` line 6 | Galaxy Navigator gets 3D and other views; target 0.9 |
| VIZ-N1, VIZ-N2 | `docs/media/viz-gallery/README.md` | viz gallery product video (VIZ-N2 in its title) |
| ADR-FACTORY-EXECUTION-001 | `docs/UPSTREAM_AUDIT.md` | upstream decision record, not an acceptance ID |

Qualification documents with no per-item IDs: `docs/ENGINE_QUALIFICATION.md`, `EXPERIENCE_V0_3_QUALIFICATION.md`, `FAMILIES_V0_4_QUALIFICATION.md`, `FOUNDATION_V0_6_QUALIFICATION.md`, `FRAMEWORK_V0_2_QUALIFICATION.md`, `MODEL_ASSET_V0_7_QUALIFICATION.md`, `MOTION_V0_5_QUALIFICATION.md`, `CLIENT_READINESS_V0_6.md`, `CLIENT_READINESS_V0_7.md`, `RELEASE_0.8_RC.md`, `FIVE_CLIENT_ACCEPTANCE_HANDOFF.md`.

**No canonical feature or UX CSV exists in this repository.** The only `.csv` file outside dependencies is the test fixture `tests/fixtures/sample.csv`. Feature and acceptance tracking is spread over the documents above and `handoff/ROADMAP.md`.

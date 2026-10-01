# DataPass MosaicStudio

Web-first application framework and analytical workbench. The v0.2 **source SDK** lets a client own its pages, content, data and models under `clients/<id>/`, while Studio owns reusable state, layouts and renderers. It is not a published npm package, a notebook IDE or a source-compatible Streamlit clone.

Development is isolated on `feat/studio2-framework-kit`, based on the qualified architecture/foundation branches. No original Studio, Mosaic, Factory, Hop, Data X-ray or VS Code repository is replaced.

## Build a client website

Node 22.16+, npm and Git are required. Initial setup retrieves public, commit-pinned visual-engine sources. Python is not a website runtime requirement.

```sh
npm ci
npm run client:new -- my-client --title "Client project"
npm run dev
# Open ?app=my-client at the printed address
npm run client:check -- my-client
npm run build:client -- my-client
```

The isolated output is `dist-clients/my-client/`. No deployment occurs. Use `--custom` with `client:new` to include a client-owned TSX component. Scaffolding refuses existing folders. The default production review build includes only the three public reference clients, not every client directory.

Start with [AI authoring](docs/AI_SITE_AUTHORING.md), [component catalog](docs/contracts/components.json), [framework scope](docs/FRAMEWORK_KIT.md) and [new-client work order](docs/AI_CLIENT_BRIEF.md).

## Reference acceptance clients

Open `?sites=1`, or select a client directly:

| Client | Exercises |
|---|---|
| `?app=wind-reference` | Real Three.js assembly, camera/part selection, explode/phase, original VizForge shared story, indicative scenario model and explicit tasks |
| `?app=operations-reference` | Input filters, cached derived indicators, original D3 chart, sorted/paginated table, CSV and dataset contracts |
| `?app=architecture-reference` | Existing architecture review, declared dependencies, schema snapshots, presentation and report exports |

All three are **synthetic framework acceptance clients**, not final customer websites or validated domain models. Their client-only routes do not initialize DuckDB/SQLRooms. `build:client` selects a single source graph/public directory and avoids copying the workbench WASM assets.

## Reusable website blocks

Text, code, metrics, validated inputs/sliders, tables, charts, tasks, data catalog, 3D scenes, coordinated story controls/figures, architecture and trusted custom React components. Definitions are inert; executable calculations and custom components stay in trusted source. JSON Schemas help authors; runtime validators enforce semantic references and bounds.

Typed small-data bindings declare input and upstream dependencies. UI/camera changes do not invalidate unrelated model calculations. Explicit async tasks support progress, cancellation, timeouts and stale-result rejection. Saved inputs are exported/restored through a review dialog; they do not contain dataset files or computed task results.

## Original analytical workbench remains

Open the root without `app` or `sites`. Existing modules are unchanged in scope:

- SQLRooms + DuckDB-WASM data explorer, local CSV/JSON/Parquet, schema/profile, paginated rows and CSV.
- Actual SQLRooms SQL editor and UWData Mosaic coordinated filtering.
- React Flow pipeline designer and bounded inert ADF/Fabric/DataPass imports; no orchestrator is run.
- Original VizForge visual stories and ConceptMotion semantic explanations.
- Project Kanban and architecture-review workspace.

Direct workbench routes use `?module=explore`, `linked`, `sql`, `pipeline`, `stories`, `explain`, `board` or `architecture`. Narrative/architecture standalone views also accept `&embed=1`. Workbench import limits remain 64 MiB per data file; data is materialized in browser memory, not lazy multi-gigabyte remote access. Reloading discards imported workbench data and unsaved state.

## Boundaries and provenance

- SQLRooms owns its database/editor/layout infrastructure. UWData Mosaic owns cross-filter query coordination.
- VizForge owns analytical grammar/D3/StoryPlayer; ConceptMotion owns semantic explanations. Pins in `upstreams.lock.json` are retained.
- Three.js owns WebGL2 rendering. The scene block currently describes primitives, not GLTF/CAD/physics/video generation.
- Bronze/Silver/Gold are optional metadata layers, not DuckLake/Delta tables.
- `createJsonTask` is a bounded same-origin transport adapter, not an implemented/hosted Python service. A real service must independently validate, authorize and limit work.
- No remote Parquet, X-ray port, DuckLake, notebook server, native host, authentication, cloud deployment manager or automatic publication is added here.
- Client build isolation does not prevent a developer from explicitly importing private data into source. Review every public bundle and exported input file before sharing.

See [workbench architecture](docs/ARCHITECTURE.md), [architecture review](docs/ARCHITECTURE_REVIEW.md), [upstream audit](docs/UPSTREAM_AUDIT.md), [native host boundaries](docs/HOST_PORTS.md) and [notices](THIRD_PARTY_NOTICES.md).

## Qualification

```sh
npm run contracts:check
npm test
npm run build
npm run client:check
npm run test:visual-contracts
python -m pip install duckdb==1.4.3
npm run test:fixtures
npx playwright install chromium
npm run test:browser
npm run test:client-builds
```

Python DuckDB creates tiny synthetic test fixtures only. The browser gate opens real production HTTP pages; the target-build gate builds and opens all reference clients plus a fresh TSX scaffold, verifies source files stayed unchanged, and checks that unrelated clients/WASM are absent. Physical GPU/mobile/Safari/Firefox support is not inferred from hosted Chromium/software rendering.

Consult the exact GitHub Actions run before claiming the complete gate passed. The bounded workflow preserves source, builds, screenshots and failure evidence, and never deploys or merges. The first successful framework run records the genuine npm lock and generated schemas; subsequent runs use the frozen lock and schema drift checks.

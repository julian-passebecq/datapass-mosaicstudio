# DataPass MosaicStudio

Web-first Studio 2: actual SQLRooms + DuckDB-WASM + UWData Mosaic, with the existing DataPass VizForge and ConceptMotion engines. This is an implemented integration foundation, not a complete Streamlit-compatible Python framework.

Work is isolated on `feat/sqlrooms-studio2-foundation`. The original Studio, Mosaic Workbench, Factory, Data X-ray, Hop and VS Code repositories are not replaced or modified.

## Run

Node 22.16+ and Git are required for development. Python is not required to use the web app. The first source setup needs network access to npm and the commit-pinned public donor repositories.

```sh
npm install
npm run dev
```

Once `package-lock.json` is committed by the successful first qualification run, use `npm ci` instead of `npm install`.

```sh
npm test
npm run build
npm run preview
```

`build` retrieves exact upstream commits, prepares same-origin WASM/worker assets, type-checks real source and builds with Vite. It never fetches private DataPass repositories or client files. Do not use `--legacy-peer-deps` to bypass incompatible packages.

## Implemented surfaces

| Surface | Actual engine and behavior |
|---|---|
| Data explorer | Open CSV/JSON/Parquet locally; actual DuckDB rows, schema, on-demand SUMMARIZE, Parquet file metadata; paginated preview and CSV export |
| Linked views | Actual SQLRooms Mosaic slice and one UWData coordinator shared by charts and table; scatter brushing and region selection |
| SQL workspace | SQLRooms' existing tabbed editor, real DuckDB SQL, result limits and explicit run/cancel controls |
| Pipeline designer | React Flow canvas, editable/movable activities, dependencies, cycle diagnostics, bounded ADF/Fabric JSON import, source inspector and DataPass JSON export |
| Visual stories | Original VizForge StoryView/StoryPlayer and D3 renderers, not a reimplementation |
| Concept lab | Original ConceptMotion semantic renderer and canonical algorithm frames, with manual/playback controls and reduced-motion behavior |
| Project board | Session-local Kanban consumer with keyboard-accessible status editing and explicit draft export |

The default renewable-operations data is deliberately synthetic. Software execution is real; the values are not client measurements.

## Web applications, not only a workbench

The selected module can be opened directly with `?module=linked`, `?module=pipeline`, `?module=stories`, `?module=explain`, `?module=sql`, `?module=board` or `?module=explore`.

`?module=explain&embed=1` and `?module=stories&embed=1` render narrative views without creating a RoomStore or initializing DuckDB. They can be composed into a portfolio, documentation page or client website. Data modes retain the shared database host. This is browser composition, not a qualified VSIX/Electron adapter or SSR integration.

## Data and execution boundaries

- Files are opened into the browser session, with a 64 MiB per-file cap. Import currently loads a file into an in-memory table: this is **not** a promise of zero-copy or lazy multi-gigabyte Parquet access.
- Reloading discards imported data and unsaved application state. Draft exports are explicit. The full draft format has no import/restore implementation yet; pipeline JSON has its own validated round trip.
- SQL is intentionally real and may modify the in-memory database. Original source files are not overwritten.
- The pipeline canvas does **not** run ADF, Airflow, Hop, Fabric or arbitrary imported source code. Its exported document is not an Azure deployment artifact. Only bundled demo queries may be opened for explicit review/run in the SQL editor.
- Browser DuckDB is not DuckLake. No DuckLake catalog, Python kernel, native filesystem, authentication, cloud scheduler, collaboration or deployment service is supplied here.
- No runtime CDN is required: WASM and workers are copied to same-origin assets. Production preview carries a restrictive CSP; `_headers` is generated for compatible static hosts. Inspect hosting headers before publishing.

## Reuse, not a restart

`upstreams.lock.json` records the exact source commits. `scripts/bootstrap-upstreams.mjs` verifies fetched Git identities and keeps sources in ignored `.upstream/`. Selected source imports are intentional; entire donor apps are not bundled as iframes.

- VizForge: `Fluent2_J_Viz/src/adapters/react.tsx`, its story engine, D3 renderers and example specifications.
- ConceptMotion: `project/conceptmotion_studio/packages/{core,svg,react}` and the canonical algorithm visual definitions.
- SQLRooms: actual shell/database/Mosaic/editor packages; example source audited separately.
- Fluent: genuine Fluent v9 controls. The compact application shell is DataPass CSS, not a claim that every layout primitive is an official Fluent component.

See [architecture](docs/ARCHITECTURE.md), [source/example audit](docs/UPSTREAM_AUDIT.md), [host roadmap](docs/HOST_PORTS.md) and [third-party notes](THIRD_PARTY_NOTICES.md).

## Qualification

Core tests, strict TypeScript checks, production builds and real Chromium interactions are separate gates. The workflow is bounded to one job, 12 minutes and three-day evidence retention. It does not deploy anything. The first successful run records its genuinely generated npm lock on this feature branch only, with a non-force push. No automatic merge is configured.

```sh
python -m pip install duckdb==1.4.3
npm run test:fixtures
npx playwright install chromium
npm run test:browser
```

Python DuckDB is used only to create tiny synthetic Parquet test fixtures, not as the application runtime. Browser tests navigate the real built app, perform file imports, execute SQL, interact with graphs, use original visual engines and inspect actual downloads. See each run's `studio-web-evidence` artifact; a workflow definition alone is not a passing test result.

Do not describe this as a complete notebook platform, full Data X-ray port, or universal Streamlit replacement. The next useful work is to connect another real client and reuse existing pure lineage/data contracts, not recreate editors, orchestration backends or a second visualization engine.

# foil-wind

Runs, measurements, SQL results and a run-vs-run comparison over **synthetic** capture runs of the FOIL Native
`foil-wind-lab` producer (`foil.export` v1 bundles). Selected-client build only: not a rule 17 reference client,
not in the default workbench, no deployment implied.

## Data rule: nothing from the producer is committed

- The committed data is `placeholder/foil-wind-placeholder.json`: **hand-made placeholder, not FOIL output, not
  Foil'O physics**. Three runs of six samples, every number typed by hand.
- `public/artifacts/*.json` are generated from that placeholder by `py/build_data.py` (a test fails when they are stale).
- A real export is read only on the builder's disk at build time and written into `dist-clients/foil-wind/`
  (git-ignored). The export folder must be outside the repository.
- `py/foil_export_adapter.py` is the only file that knows the export's field names. It accepts only
  `format: foil.export`, `version: 1`, `data_classification: SYNTHETIC`, producer `foil-wind-lab`, sealed capture
  runs. It checks every file it reads against the byte count and sha256 listed in `export.json`. Campaign bundles are
  counted and skipped. Any other problem stops the build with a readable message.

Labels on every page: synthetic, invented surrogate, power and energy are operational proxies and not yield. No
Foil'O physics, model accuracy or validation is claimed.

## What runs where

| Part | Where | How |
|---|---|---|
| Adapter, time buckets (at most 240 per run) | Python, build time | `py/foil_export_adapter.py`, `py/build_data.py` |
| SQL | Python `sqlite3` (standard library), build time, read-only connection | committed queries in `queries.json`; the page shows each query and its result table |
| Run-vs-run comparison | Python, build time, every ordered pair of runs | artifact `foil-wind-comparison`: `delta` = B - A, `deltaPct` relative to \|A\|, `direction` (B higher / B lower / No change) and `chartPct` (the percentage only for a real change) |
| Comparison chart | viz renderer (pinned: the VizForge ranking adapter refuses negative bars) | signed horizontal bars of `chartPct`, coloured by `direction`; no rank column; no-change rows stay in the table only |
| Compare task | browser, `SiteRuntime` task `compare` | explicit button, cancellable, stale after an input change; it fetches and validates the Python result for the chosen pair and computes nothing |

Run slots `run-1` ... `run-8` follow the sorted run ids (at most 8 runs; the source note says when more were found).
No SQL engine, DuckDB, SQLRooms, Three.js or service ships in the client bundle.

## Optional product loop (F212): the "Saved runs" page

The static pages above work without Python. The **Saved runs** page adds the V2 loop for a local user who starts the
approved producer `py/serve.py`: the unchanged runtime of `py/service/app.py` plus one allowlisted model,
`foil-wind-compare`, which compares two run slots of the committed hand-made placeholder with the build step's own
`build_data.compare_pair` (one row per metric). It never reads `FOIL_EXPORT_DIR` or a local export.

```sh
DATAPASS_SERVICE_ORIGINS=http://127.0.0.1:21481 python clients/foil-wind/py/serve.py --port 24812 --results-dir <folder outside Git>
STUDIO_CLIENT=foil-wind npx vite preview --config vite.client.config.ts --strictPort --port 21481
```

Open the printed link and press Connect; run, save, compare two saved results A/B, export a provenance bundle, and
reopen them by hash after a restart ("Not recomputed"). The client CSP allows exactly `http://127.0.0.1:24812`.
`npm run test:product-loop` runs the journey on this client and on `contoso-shape-analytics`.

## Commands

```sh
# Placeholder (what CI and a fresh clone see)
python clients/foil-wind/py/build_data.py          # regenerate public/artifacts from the placeholder
npm run client:check -- foil-wind
npm run build:client -- foil-wind

# A local foil.export v1 bundle, or a folder of bundles (e.g. the producer's .foil-exports), outside the repo
FOIL_EXPORT_DIR=/path/to/exports node --experimental-strip-types clients/foil-wind/build-export.mjs
#   PowerShell: $env:FOIL_EXPORT_DIR='C:\path\to\exports'; node --experimental-strip-types clients/foil-wind/build-export.mjs

# Checks
node --experimental-strip-types --test tests/foil-wind.test.mjs       # artifacts, freshness, Python adapter tests, compare task
node scripts/preview-validate.mjs dist-clients/foil-wind/preview.json --check-files
npx playwright test -c clients/foil-wind/qa/playwright.config.ts      # desktop + 390 px, reduced motion; FW_SHOTS=<dir> saves screenshots
```

`build-export.mjs` runs `build:client` (placeholder), then the Python data step with `--export` straight into
`dist-clients/foil-wind/artifacts`, re-validates every artifact and regenerates `preview.json`. On a rejected export
it removes the half-built folder and exits non-zero.

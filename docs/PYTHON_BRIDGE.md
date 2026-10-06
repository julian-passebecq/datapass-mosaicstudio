# Python bridge: any Python producer to a Studio page

Any Python code computes; Studio renders the result with its provenance. A plain script, a Jupyter notebook, marimo, Streamlit, a FastAPI service, a Databricks/dbt job or an Airflow task all produce the same thing: a `datapass.artifact` v1 JSON file written with `py/datapass_artifact.py` (standard library only). The contract is `src/framework/foundation/artifact.ts`; the browser re-validates every file and never runs a calculation. No producer is privileged.

## Three commands

```sh
python py/wind_reference_model.py                  # 1. any producer writes clients/<client>/public/artifacts/<id>.json
npm run build:client -- python-wind-reference      # 2. check and build the client that references it by id
npm run client:dev -- python-wind-reference        # 3. look at it (or: npm run test:python-bridge on the build)
```

## Three tiny producers (same model, `py/wind_reference_model.py`)

```python
# Plain script / job / service handler
from wind_reference_model import table, build_artifact
build_artifact(table())
```
- Jupyter: `py/notebooks/wind_reference.ipynb` (one code cell calling `model.build_artifact(model.table(k=2.0))`).
- marimo: `py/notebooks/wind_reference.py` (`marimo edit`; a slider for k, then the same call).

Any other tool does the same: call `to_artifact(...)` at the end of the run and write into the client public dir (or copy the file there in CI).

## Writing an artifact (`py/datapass_artifact.py`)

```python
from datapass_artifact import to_artifact, write_manifest
to_artifact(rows_or_dataframe, id="wind-aep-weibull", title="...", source="jobs/aep.py",
            row_key="id", units={"aep": "MWh/yr"}, run_id="run-42",
            representations=[{"id": "table", "title": "Rows", "kind": "table"},
                             {"id": "aep-8", "title": "AEP", "kind": "metric", "row": "mean-8-0", "column": "aep"}],
            out_dir="clients/<client>/public/artifacts")
write_manifest("clients/<client>/public/artifacts")
```

It enforces the TypeScript rules early: ids `^[a-z][a-zA-Z0-9_-]{0,79}$`, provenance `synthetic | provided | computed` (+ optional `runId`), representations `table | chart | metric | text | json` (≤ 12), ≤ 10 000 rows, ≤ 40 columns, finite numbers, 1 MB compact UTF-8 JSON. Aggregate in Python; `parquet_sidecar=True` writes `<id>.parquet` for other tools when pyarrow is installed (the page never reads it).

## Studio side

```ts
import {artifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
components:{aep:artifactSource('wind-aep-weibull',['aep-8','table'])}, customCapabilities:{aep:['charts']}
```

`loadArtifact(id)` fetches `artifacts/<id>.json` beside the page (same origin), bounds its size, parses, validates and checks the id. A missing, malformed or invalid file shows a `role="alert"` error state with the reason; nothing partial is rendered.

## Tests

`npm run test:python` · `node --experimental-strip-types --test tests/python-artifact.test.mjs` (Python writes, node validates; fails if the committed artifact is stale) · `npm run test:python-bridge` (browser smoke on the built client).

The wind numbers are ILLUSTRATIVE (generic power curve, Weibull k=2, no losses), not FOIL data.

## Level 2.5: live file (dev server follows any producer)

Any producer that rewrites `clients/<client>/public/artifacts/<id>.json` updates an open dev page in under 2 s, without a reload and without losing view state (table sort, chosen mode). Nothing is privileged: a script loop, a Jupyter cell, a marimo slider or a job all just write the file.

```sh
npm run client:dev -- python-wind-reference      # 1. open the page, choose "Live file" (or add &file=1)
python py/examples/live_slider.py                # 2. rewrites wind-aep-live-file.json every second (Ctrl+C to stop)
```

- Write with `watch_write(path, artifact)` from `py/datapass_artifact.py`: it validates, writes a temp file in the same folder and renames it over the target (`os.replace`), so the page never reads a half-written file. `to_artifact(..., out_dir=...)` uses it too.
- Dev server: `scripts/artifact-watch-plugin.mjs` (Vite, `apply:'serve'`, never in a build) watches the client's `public/artifacts/`, debounces per id (60 ms) and drops rewrites with identical bytes (sha256), then pushes the HMR custom event `datapass:artifact-changed {id, sha256}`. `ArtifactSource` refetches that static artifact (latest wins), re-validates it and re-renders in place; a "Live file" badge shows the last update time.
- An invalid rewrite never replaces the view: the last valid result stays and a `role="alert"` toast gives the validation error until a valid file arrives.
- Jupyter or marimo: call it from a cell; with marimo, every slider move re-runs the cell and the page follows.

```python
import sys; sys.path.insert(0, "py")                  # repo root as working directory
from datapass_artifact import watch_write
import wind_reference_model as model
from examples.live_slider import artifact_for          # or build your own with to_artifact(...)
watch_write(model.DEFAULT_OUT / "wind-aep-live-file.json", artifact_for(k.value))   # k = mo.ui.slider(1.5, 3.0, step=0.1)
```

- Tests: `npm run test:python` (atomic write under a concurrent reader) · `node --test tests/artifact-watch.test.mjs` (debounce, sha dedupe, dev-only plugin) · `npm run test:artifact-watch` (Playwright on `client:dev`: rewrite shown in < 2 s with the sort kept; invalid file gives the toast and keeps the data).

## Level 3: live service (compute on demand, same contract)

A producer can also answer on demand. `py/service/app.py` is one example (FastAPI, prototype): it returns the same `datapass.artifact` v1 document a script would write, so Studio validates and renders it identically. Any other HTTP producer that returns a valid artifact works the same way.

```sh
python -m venv .venv && .venv/Scripts/python -m pip install -r py/service/requirements.txt   # once (bin/python on Linux/macOS)
.venv/Scripts/python py/service/app.py                                                       # 1. service on http://127.0.0.1:8765
npm run client:dev -- python-wind-reference                                                  # 2. open the page, choose "Live (FastAPI)"
```

- Endpoints: `GET /health`, `GET /artifacts/{id}` (precomputed files from the client public dir), `POST /compute/wind-reference` with `{k: 1..4, c: 3..15 m/s at 100 m, hubHeight: 40..250 m}` (pydantic; unknown fields and non-numbers get 422). The answer is artifact `wind-aep-live` (provenance `computed`, ILLUSTRATIVE) whose `runId` is `run-` + 16 hex of sha256(model version + inputs): same inputs, same run.
- Studio: `ArtifactSource` takes `source={kind:'http',url,body?,id?}` (POST when `body` is set) and an optional `fallback` source. Each input change aborts the previous request and only the latest answer is shown (debounced 200 ms; the previous result stays visible while recomputing). When the service is down or rejects the inputs, the fallback static artifact is shown under a `role="alert"` banner with the reason. `?service=http://127.0.0.1:<port>` overrides the service URL; `?live=1` opens in live mode.
- Security (prototype, **no authentication**): binds 127.0.0.1 only, answers only loopback `Host` headers (DNS-rebinding guard), CORS only for the Vite dev origin (`http://127.0.0.1:5173`, `http://localhost:5173`; override with `DATAPASS_SERVICE_ORIGINS`), request bodies ≤ 2 KB with a `Content-Length`, `Cache-Control: no-store`. The browser loader accepts only loopback or same-origin service URLs, never sends cookies and bounds request and response sizes. Built clients keep `connect-src 'self'`, so they show the static fallback unless a deployment adds the service origin to its CSP. Do not expose the service on a network.
- Tests: `.venv/Scripts/python -m unittest discover -s py/service -p "test_*.py"` (TestClient: valid, 422, deterministic runId, guards) · `tests/python-artifact.test.mjs` (a service response validates in node; skipped without fastapi) · `npm run test:python-service` after `npm run build:client -- python-wind-reference` (Playwright: starts the service; an input change gives a new metric; a stopped service gives the fallback banner).

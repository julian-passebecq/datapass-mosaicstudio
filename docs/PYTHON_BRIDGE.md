# Python bridge: notebook to Studio page

Python (marimo, Jupyter or a plain script) computes. Studio renders the result with its provenance. The contract is `datapass.artifact` v1 (`src/framework/foundation/artifact.ts`); the browser re-validates every file and never runs a calculation.

## Three commands

```sh
# 1. Compute and write clients/<client>/public/artifacts/<id>.json (+ manifest.json)
marimo edit py/notebooks/wind_reference.py      # or, without marimo: python py/wind_reference_model.py
# 2. Check and build the client that references the artifact by id
npm run build:client -- python-wind-reference
# 3. Look at it (dev server with hot reload) or smoke-test the build
npm run client:dev -- python-wind-reference     # then: npm run test:python-bridge
```

## Python side (`py/datapass_artifact.py`, standard library only)

```python
from datapass_artifact import to_artifact, write_manifest
to_artifact(rows_or_dataframe, id="wind-aep-weibull", title="...", source="py/notebooks/x.py",
            row_key="id", units={"aep": "MWh/yr"},
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

`loadArtifact(id)` fetches `artifacts/<id>.json` beside the page (same origin), bounds its size, parses, validates and checks the id. A missing, malformed or invalid file shows a `role="alert"` error state with the reason; nothing partial is rendered. Without `show`, the switchable `ArtifactView` is used.

## Tests

`npm run test:python` (Python unit tests) · `node --experimental-strip-types --test tests/python-artifact.test.mjs` (cross-language: Python writes, node validates; also fails if the committed artifact is stale) · `npm run test:python-bridge` (browser smoke on the built client).

The wind numbers are ILLUSTRATIVE (generic power curve, Weibull k=2, no losses), not FOIL data.

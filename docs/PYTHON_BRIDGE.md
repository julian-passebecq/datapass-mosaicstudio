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

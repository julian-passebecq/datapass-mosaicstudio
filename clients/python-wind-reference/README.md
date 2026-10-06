# Wind / Python artifact reference

Proof of the Python bridge (docs/PYTHON_BRIDGE.md): any Python producer calling `py/wind_reference_model.py` (plain script, `py/notebooks/wind_reference.ipynb` for Jupyter, `py/notebooks/wind_reference.py` for marimo) writes `public/artifacts/wind-aep-weibull.json`; the page loads it by id, validates it as `datapass.artifact` v1 and shows the metric, table, chart and provenance. No calculation runs in TypeScript.

Values are ILLUSTRATIVE (generic power curve, Weibull k=2, no losses). Not FOIL data, not a real turbine, not a site assessment. Never put FOIL-private or client data in this folder.

Lineage page (`?page=lineage`): each displayed value -> representation -> artifact (run, provenance kind, producer, input hash) -> declared inputs -> exact source lines. The producer declares this with the optional `producer` / `inputs` / `dependsOn` provenance fields and `cite()` (py/datapass_artifact.py); `write_sources` copies the cited file to `public/sources/<path>.txt` for the citation panel. Older artifacts without these fields stay valid. Browser check: `npm run build:client -- python-wind-reference && npm run test:artifact-lineage`.

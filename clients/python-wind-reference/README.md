# Wind / Python artifact reference

Proof of the Python bridge (docs/PYTHON_BRIDGE.md): `py/notebooks/wind_reference.py` (marimo) or `python py/wind_reference_model.py` writes `public/artifacts/wind-aep-weibull.json`; the page loads it by id, validates it as `datapass.artifact` v1 and shows the metric, table, chart and provenance. No calculation runs in TypeScript.

Values are ILLUSTRATIVE (generic power curve, Weibull k=2, no losses). Not FOIL data, not a real turbine, not a site assessment. Never put FOIL-private or client data in this folder.

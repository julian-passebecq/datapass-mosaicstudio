# LINEAGE-K real UI check (2026-10-23)

Bug: changing the Weibull shape k in the marimo notebook changed the rows, but the exported artifact still said k=2 in its
title, source and declared inputs, and its `inputHash` stayed the same. Fix: `build_artifact(rows, k=...)` (py/wind_reference_model.py),
which both notebooks now call with the same k as `table()`.

What was checked (results in `evidence.json`, produced by `ui-check.mjs`):

1. `marimo run py/notebooks/wind_reference.py` (marimo 0.25.2, Python 3.12.14) on 127.0.0.1:20431. Playwright opened the real app,
   waited for the default export (k=2), moved the "Weibull shape k" slider to 2.7 with the keyboard (aria-valuenow 2.7) and waited for
   the notebook to rewrite the artifact. Rows changed (AEP at 8 m/s 9925.5 -> 9823.9 MWh/yr), title and source say k=2.7, declared
   input k = 2.7, inputHash `de3e05a027f5...` -> `e5ed7952c947...`.
2. marimo stopped. `npm run build:client -- python-wind-reference` packaged the exported artifact unchanged (same sha256).
   The built site, served under the production CSP on 127.0.0.1:20432, reopened the saved result: Annual energy page and Lineage page
   show title k=2.7, input k 2.7 and input hash `e5ed7952c947`. Only 11 static GETs, no websocket, no compute/kernel/task call,
   artifact file not rewritten, no console errors.
3. The committed artifact was then regenerated at the default k=2 (`python py/wind_reference_model.py`).

Packaging does not rerun numerics: covered by `test_parameter_change_updates_input_hash_without_recomputing_rows`
(py/test_marimo_producer.py, profiler on `table`/`annual_energy_mwh`).

ILLUSTRATIVE values only: generic power curve, Weibull wind, no losses. Not FOIL data, not a site assessment.

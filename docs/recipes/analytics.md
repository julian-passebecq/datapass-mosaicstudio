# Analytics family

Use `--family analytics`: a working filter, chart and data table. No Three.js or graph library is needed.

Datasets declare typed columns, a row key, provenance, inputs and upstream dependencies. Source bindings supply inline rows or compute derived rows. Recalculation follows declared dependencies rather than all UI events. Camera and other unrelated view state must not trigger financial or scientific computations.

Charts use the existing VizForge adapter. The simple bar chart is bounded to 30 nonnegative categories. Line/scatter X must be numeric. Missing values are not zero, and ambiguous rows require an explicit domain decision, not a prettier interpolation.

Use the `task` block and a trusted task binding for bounded asynchronous computation; run it only after a visitor requests it. A backend is optional and not provided merely by choosing this family.

The small website runtime is capped at 10,000 rows / 40 columns. The separate SQLRooms/Mosaic workbench remains the existing SQL and larger-data foundation. Do not copy it into a client bundle to show three indicators.

Reference: `clients/operations-reference`. Read the generated client context for exact blocks, not the whole visual-engine source.

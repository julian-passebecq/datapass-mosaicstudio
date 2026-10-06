# Analytics family

Use `--family analytics`: a working filter, chart and data table. No Three.js or graph library is needed.

Datasets declare typed columns, a row key, provenance, inputs and upstream dependencies. Source bindings supply inline rows or compute derived rows. Recalculation follows declared dependencies rather than all UI events. Camera and other unrelated view state must not trigger financial or scientific computations.

Chart blocks render through the d3 viz kit (`src/framework/viz`) by default. Set `renderer: 'vizforge'` on a block to keep the existing VizForge adapter for that block, or opt a whole build/page/document out with `VITE_DP_VIZ_CHART=0`, `?viz-chart=0` or `<html data-viz-chart="off">`. The viz-only options (`series`, `y2`, `sort`, `stack`, `orientation`, `previous`, `selection`) still need an explicit `renderer: 'viz'`. On the VizForge path the simple bar chart is bounded to 30 nonnegative categories. Line/scatter X must be numeric. Missing values are not zero, and ambiguous rows require an explicit domain decision, not a prettier interpolation.

Use the `task` block and a trusted task binding for bounded asynchronous computation; run it only after a visitor requests it. A backend is optional and not provided merely by choosing this family.

The small website runtime is capped at 10,000 rows / 40 columns. The separate SQLRooms/Mosaic workbench remains the existing SQL and larger-data foundation. Do not copy it into a client bundle to show three indicators.

Reference: `clients/operations-reference`. Read the generated client context for exact blocks, not the whole visual-engine source.

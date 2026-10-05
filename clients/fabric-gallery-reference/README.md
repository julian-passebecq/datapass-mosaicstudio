# Viz gallery / reference app (prototype, VIZ-N1)

A Fabric-app-like dark/light analytics page built only from `src/framework/viz/`.
All data is **synthetic** (`data.ts`, seeded PRNG, 50,000 orders). No branding, no client data.

- Visuals: KPI cards (count-up + sparkline), stacked/grouped bars, 48-store bar chart (>30 bars),
  stacked area by region, donut, region x month heatmap, 50k-point Canvas scatter with a 2D brush.
- Crossfilter: `fg-region`, `fg-category`, `fg-channel` are `multi` view fields; `fg-discount` and
  `fg-margin` are `interval` view fields. Each visual ignores its own dimension.
- Capture: `?capture=1` settles every tween at once; every chart exposes `data-viz-settled`.
- Acceptance: `npm run test:viz-gallery` (bundle budget, brush, crossfilter, reduced motion,
  first paint, two identical captures per theme).

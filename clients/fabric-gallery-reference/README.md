# Viz gallery / reference app (prototype, VIZ-N1 + VIZ-N2)

A Fabric-app-like dark/light analytics report built only from `src/framework/viz/`.
All data is **synthetic** (`data.ts`, seeded PRNG, 120,000 orders). No branding, no client data.

## Pages

- **Overview** (`?page=dashboard`): KPI cards (count-up + sparkline), stacked/grouped bars,
  48-store bar chart (>30 bars), stacked area by region, donut, region x month heatmap,
  120k-point Canvas scatter with a 2D brush.
- **3D explorer** (`?page=explorer-3d`): 3D columns (region x month revenue), a density surface
  z = f(margin, discount) with a wireframe toggle, and a 120k-point cloud
  (discount x margin x log revenue) with orbit and a screen-space lasso. A selection panel shows
  the brushed orders with a 2D bar chart. three.js is a lazy chunk loaded on this page only.

## Shared state (crossfilter)

`fg-region`, `fg-category`, `fg-channel` are `multi` view fields; `fg-discount` and `fg-margin`
are `interval` view fields. Both pages read the same fields (`gallery-state.ts`), and each visual
ignores its own dimension. In 3D, a column click toggles its region, and a lasso writes the
brush as the bounding box of the lassoed points on discount and margin, so the 2D scatter shows
the same brush. Without WebGL (or with `?webgl=0`), each 3D visual renders its 2D equivalent
(heatmap, heatmap, Canvas scatter) with a note.

## Capture and video

- `?capture=1` settles every tween at once; every chart exposes `data-viz-settled`.
- `?record=1` puts every tween (count-ups, transitions, camera keyframes) on one `VirtualClock`
  (`window.__vizClock`); `tools/record_gallery.mjs` advances it 1/30 s per frame and screenshots
  each frame, so the video has no blended frames. Output: `docs/media/viz-gallery/`.

## Acceptance

`npm run test:viz-gallery` (bundle budget and WebGL chunk size, lazy chunk only on the 3D page,
brush, crossfilter 2D and 3D both ways, lasso, WebGL fallback, reduced motion, first paint,
two identical captures per theme and for the 3D page).

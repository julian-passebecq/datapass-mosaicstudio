# Concept viewer

Opens any **concept spec v1** file (`docs/CONCEPT_SPEC.md`) and switches between its three framework renderings: isometric 2D (Motion v2), layer cake 2D, and the lazy 3D scene. Family: spatial. No AI features.

- Open: example tabs, **Open file**, drag-and-drop a `.json` onto the window, or `?app=concept-viewer&spec=examples/<file>.json` (relative paths only).
- Rendering: header buttons or `&view=isometric|layered|3d`. Both SVGs download from the header.
- An invalid file shows every issue (`path: message`) and keeps the current spec.
- Film: `&film=1&paused=1&chrome=0&t=<s>`; `window.__conceptFilm.seek(t)`; record with `scripts/record-concept-film.mjs --app concept-viewer --spec examples/forecast-app.concept.json`.

Examples (`public/examples/`): `forecast-app` (Fabric-style forecasting app, synthetic), `cloud-data-platform` (synthetic), `datapass-stack` (documented; must stay identical to `clients/arch-atlas/specs/datapass-stack.concept.json`, a unit test checks it).

Smoke: `npm run client:dev -- concept-viewer --port 5194`, then `VIEWER_URL=http://127.0.0.1:5194 npx playwright test -c clients/concept-viewer/qa/playwright.config.ts`. It checks the three renderings per example with real `getBBox()` no-clip assertions and writes captures to `qa/captures/`.

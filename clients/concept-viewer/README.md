# Concept viewer

Opens any **concept spec v1** file (`docs/CONCEPT_SPEC.md`) and switches between its three framework renderings: isometric 2D (Motion v2), layer cake 2D, and the lazy 3D scene. Family: spatial. No AI features.

- Open: example tabs, **Open file**, drag-and-drop a `.json` onto the window, or `?app=concept-viewer&spec=examples/<file>.json` (relative paths only).
- Rendering: header buttons or `&view=isometric|layered|3d`. Both SVGs download from the header, always at full size.
- Isometric pan/zoom (`PanZoom.tsx`): starts fitted to the stage width, zoomed in further when needed so every node label is at least 11 px on screen; wheel zooms around the pointer, drag pans (a drag never selects), **Fit** returns to the stage width.
- An invalid file shows every issue (`path: message`) and keeps the current spec. Warnings (unknown fields ignored, missing or newer `specVersion`) are listed without blocking. Node and flow `evidence` refs show in the node panel.
- The UI lives in `ConceptWorkbench.tsx`; `ConceptViewer.tsx` hosts it in the site runtime, and `standalone/` hosts it as one self-contained HTML file.

## Standalone file

`dist-standalone/concept-viewer.html` (committed; regenerate with `npm run build:concept-standalone`) is the same viewer with everything inline, Three.js included. Double-click it (file://) or put it on any static host. It opens the embedded examples, a picked or dropped file, pasted JSON (**Paste**), or a URL (**URL** button or `?src=https://…`; `&view=` works too).

- `?src=` limits: `https://` anywhere, `http://` only on localhost/127.0.0.1, no user name or password in the URL, 256 KB. The request sends no cookies and no referrer. The server must allow cross-origin reads (`Access-Control-Allow-Origin: *`, as raw.githubusercontent.com and GitHub Pages do), because a file:// page has the origin `null`. A file on the same computer cannot be read by URL: drop it instead.
- The file sets its own Content-Security-Policy (`default-src 'none'`, the inline script by hash, `connect-src https:` plus localhost). A host that serves it with a stricter CSP header must still allow that script hash, inline styles, and `connect-src` for the URLs you pass in `?src=`.
- Its header comment records the source commit and build date. Test: `tests/browser/concept-standalone.spec.ts` opens it over file:// with `tests/fixtures/concept/external-helpdesk.concept.json`, which is not part of any build.
- Film: `&film=1&paused=1&chrome=0&t=<s>`; `window.__conceptFilm.seek(t)`; record with `scripts/record-concept-film.mjs --app concept-viewer --spec examples/forecast-app.concept.json`.

Examples (`public/examples/`): `forecast-app` (Fabric-style forecasting app, synthetic), `cloud-data-platform` (synthetic), `datapass-stack` (documented; must stay identical to `clients/arch-atlas/specs/datapass-stack.concept.json`, a unit test checks it).

Smoke: `npm run client:dev -- concept-viewer --port 5194`, then `VIEWER_URL=http://127.0.0.1:5194 npx playwright test -c clients/concept-viewer/qa/playwright.config.ts`. It checks the three renderings per example with real `getBBox()` no-clip assertions and writes captures to `qa/captures/`.

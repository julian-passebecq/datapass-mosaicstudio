# UX03 journey: technical client to standalone delivery (0.9.0, 2026-10-09)
Windows, worktree technical-site-sdk-authoring-80110b. Scratch client removed afterwards.

1. PASS `npm run client:new -- ux03-journey --family content --motion --title "UX03 journey (synthetic)"`: created clients/ux03-journey (AGENTS.md, app.ts, client.config.json, CLIENT_GUIDE.md, motion.ts, README.md). Concept view: not added; the starter has no concept-spec resource (only an `explanation` block in docs/recipes/explanation.md). Recorded as gap.
2. PASS `client:check`: "Client OK: ux03-journey / 1 pages / 0 datasets". PASS `build:client`: built in 17.37s, 13 files, 0 artifacts, sourceCommit null (uncommitted changes).
3. PASS `preview:validate -- dist-clients/ux03-journey/preview.json --check-files`: valid datapass.preview/1, 13 files, all re-hashed. capabilities: [motion]; publication preview+noindex; entry index.html.
   sha256 assets/index-D4r00TfX.js (entry JS, 328 kB)= see preview.json; app-W5tKxWZx.js e0026dbf49d85f625ebfe32161dee75d01d897187804237c6035f5daed6c23cb; Motion-BaXeiDnL.js e76a22db95cb170122863d5f5ee5244cd5f8ca63a9fa9b4a5e3d454b2dab0fe6; Scope-Bf7PYe6o.js 5184ffb107df685e06a0354e61047bbbc51396cc5099158ce5b9488898cc11b0.
4. Served with `vite preview --outDir dist-clients/ux03-journey --port 4180`, Playwright chromium 1280x900.
   PASS console/page errors: 0 (normal and reduced-motion).
   PASS requests: 8, all http://localhost:4180 (index, 4 JS chunks, 2 CSS); no T3, DuckDB wasm, WebGL or three chunk. 1 svg, 0 canvas.
   PASS motion scene renders (Input/Process/Result, Example item, 3 steps); controls present: Previous/Play/Next, step select, 2D/ISO, SVG/HTML export. Reduced-motion emulation prints "Reduced motion: automatic playback is disabled" with manual steps available.
   PARTIAL source/provenance/evidence links: starter has none; panel says "No source excerpt supplied for this context"; only anchors are #site-main and ?app=ux03-journey. Sources is a tab (not exercised). Not checkable for existing files since none supplied.
   Screenshot: C:/Users/julia/AppData/Local/Temp/ux03/site.png (viewed, scene renders). Reduced-motion run screenshot was not saved (script path bug).
5. PASS file:// dist-standalone/concept-viewer.html: default example "Forecasting app" renders (11 svg, layers, isometric/layer-cake/film controls), 0 console errors, 1 request (the file itself, no T3). Screenshot not saved (script path bug); DOM/text checked only.
6. PASS server stopped (port 4180), clients/ux03-journey and dist-clients/ux03-journey deleted; git status shows no ux03 residue.

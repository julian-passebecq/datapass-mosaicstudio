# Selected-client payload, baseline 8b22d9c vs 0.9 branch (2026-10-09)

Method: `npm ci`, `npm run bootstrap`, `npm run build:client -- <id>`, then sum of individually gzipped
`*.js` (the gate's metric) plus raw/gzip of all JS+CSS+WASM in `dist-clients/<id>`.

| client | JS+CSS+WASM raw | JS+CSS+WASM gzip | JS-only gzip (gate metric) | approved baseline / budget | verdict |
|---|---|---|---|---|---|
| motion-reference | 535491 | 162538 | 155613 | 143839 / 184320 (180 KiB) | within budget |
| foundation-reference | 666327 | 210996 | 201657 | 179739 / 230400 (225 KiB) | within budget |
| wind-reference | 1135473 | 325993 | 320498 | 300869 / 378880 (370 KiB) | within budget |
| model-reference | 1208568 | 341548 | 334089 | 332948 / 419840 (410 KiB) | within budget |

Baseline (8b22d9c) and 0.9 branch figures are byte-identical for every client above.

Presence checks (grep of dist-clients/<id>, both revisions identical):
- DuckDB / .wasm: none in all four.
- Three.js/WebGL code (WebGLRenderer|GLTFLoader): none in motion and foundation; 1 lazy chunk in wind, 2 in model (optional 3D, loaded only on choice, as in baseline).
- python-service URL: none. T3 reference: none.
- `preview.json` (datapass.preview/1, mode preview, noindex): absent at baseline, present in all four on 0.9 (small metadata file, not JS/CSS/WASM, so not counted above).

Framework: `git diff 8b22d9c --stat -- src/framework` is empty, so no framework code changed since baseline.
(Whole branch diff vs baseline: 39 files, includes the uncommitted notebook workbench work, outside the selected-client builds.)

Performance gate: `npm run test:client-performance` could NOT run in either tree: it reads
`qa/client-builds/results.json`, produced only by the full 19-target `npm run test:client-builds`
(browser matrix), which was not run. Substitute: the four JS-only gzip figures were compared by hand to the
`clientBudgets` in scripts/check-client-performance.mjs (all pass; headroom 8-29 KiB).

Verdict: lazy capability packaging is unchanged by 0.9. No payload regression, no heavy capability leaked
into motion/foundation, preview.json is the only new artifact. Gate script itself still to be run via test:client-builds.

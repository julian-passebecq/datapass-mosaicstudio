# Studio 0.8 RC integration

Branch `release/studio-0.8-rc`, one integration baseline built from the stacked night PRs (2026-10-05). Nothing is tagged and nothing is merged to `main`.

## Base and merged branches
- **Base:** `feat/studio2-engine-consolidation` @ `1cf6dcc` (origin head; the local branch was 2 commits behind).
- Merged with `--no-ff` merge commits in this order. Every branch forks from `1cf6dcc`, so the stacks (#15→#20, #11→#12→#16→#17) merge without rewriting history.

| # | Branch | Head |
|---|---|---|
| 19 | fix/framework-night-gaps | cca94cb |
| 15 | feat/viz-kit-n1 | 3fd3628 |
| 20 | feat/viz-kit-n2-3d | bc1e85a |
| 11 | feat/python-artifact-bridge | 71cb3bb |
| 12 | feat/fastapi-artifact-service | 4928784 |
| 16 | feat/artifact-watch | d8273e9 |
| 17 | feat/artifact-lineage | fa59959 |
| 13 | proto/param-lab | da4964a |

**Not included, next pass:** Fabric Bricks (#14 `feat/fabric-bricks-autoplay`, #18 `feat/fabric-bricks-detail`). They belong to the separate client branch `client/fabric-bricks-v1`.

## Conflicts and resolutions
- `package.json` scripts (in #11, #12, #16 and #17): each stacked branch re-added `test:engine` next to its own script. Resolved as the union of all scripts, with a single `test:engine` line.
- `.gitignore` (in #12): kept both `docs/media/viz-gallery/.frames/` and `.venv/`.
- `package-lock.json` merged automatically, and `npm ci` passes on the result.

## Integration fix (1)
- `scripts/artifact-watch-plugin.mjs` (from #16): the plugin called `server.watcher.add(<client>/public/artifacts)` even when that folder did not exist. On Windows this stopped chokidar from covering the client files, so `client:dev` failed its "armed" barrier for every client without `public/artifacts`: wind-reference, param-lab and others. Only python-wind-reference became ready. The bug did not show up in #16 alone because its smoke only uses python-wind-reference. The fix adds the folder only when it exists and keeps the add/change handlers registered. After the fix, wind-reference and param-lab both reach ready in about 7–10 s.

## Test matrix (Windows 11, Node 26.9.0; Node 22.23.3 via `npx node@22`)
| Check | Before (base `1cf6dcc`, from #19 evidence) | After (this branch) |
|---|---|---|
| `npm test` Node 26 | 450/455 (5 Windows failures: symlink EPERM, CRLF) | **504/504** |
| `npm test` Node 22 | not recorded | **504/504** |
| `typecheck` | clean | **clean** (requires `npm run bootstrap` first) |
| `contracts:check` | drift (CRLF working copy) | **OK** |
| `client:check` | 9 clients OK | **11 clients OK** (adds param-lab, python-wind-reference) |
| `build:client` × 11 | n/a | **11/11 OK** |
| `test:client-builds` budgets | 16/16 | **16/16** (operations-reference 180,724 B gz) |
| `test:viz-gallery` | per #20 | **OK** (core 40,106 B gz / 40,960 budget; WebGL chunk 133,411 B lazy) |
| `test:python` (unittest) | per #11 | **14/14** |
| `test:python-bridge`, `test:python-service` | per #11/#12 | **OK**: real FastAPI run, not skipped |
| `test:artifact-watch`, `test:artifact-lineage` | per #16/#17 | **OK** (rewrite shown in 111 ms; lineage at 390 px) |
| param-lab smoke (`clients/param-lab/qa/smoke.mjs`) | per #13 | **FAIL → OK** after the integration fix |
| `test:visual-contracts` | – | **OK** |
| `build` + Playwright (`tests/browser`, includes 8 `motion-pro.spec` cases) | – | **87/87**: the first run had 1 failure because `tests/fixtures/sample.parquet` was missing; this is a setup step (`npm run test:fixtures`), and after it `studio.spec` passes 7/7 |

Setup notes for a fresh clone: `npm ci`, then `npm run bootstrap` (otherwise `tsc` and 3 tests fail on missing `@vizforge`/`@conceptmotion`), `npm run test:fixtures`, and Python with `fastapi` and `uvicorn` for the service smoke.

## Open API decisions (before the viz kit can become the default Chart)
`blocks/Chart.tsx` still renders through VizForge by default. The viz path stays behind `vizChartEnabled()`, which is OFF unless `VITE_DP_VIZ_CHART=1`, `?viz-chart=1` or `data-viz-chart="on"` is set. Still to decide:
1. **Block contract**: `series`/`color` encodings, `sort`, `stack`, several y columns (multi-Y), and a `selection` field on the chart block. This touches `types.ts`, `validate.ts`, the JSON schema and the catalog.
2. **Selection contract**: the additive `multi`/`interval` view fields (#15) versus the single `select`. Decide which ones the chart block emits.
3. **Visual parity**: capture the VizForge chart blocks in the reference clients, compare them with the viz path, and agree on the accepted diffs.
4. **Small SVG scatter**: today every point mark uses the Canvas scatter. Add an SVG renderer under the 5k-mark limit.
5. **Story / Replay**: they stay on VizForge. Decide at the N1 gate whether the VizForge families fold into `framework/viz` (a cross-repo decision).
6. After the flag defaults to on: remove `chart-input.ts` and update the docs and recipes. Viz core has about 850 B of budget left, so moving zod to a lazy path may be needed.

## Proposed tag (not created)
`studio-v0.8.0-rc.1` on the merge commit of this branch once it is accepted. `package.json` still reads `0.7.0-alpha.1`, and the bump is left to the release decision.

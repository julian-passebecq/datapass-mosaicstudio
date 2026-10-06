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

---

# rc.2: `release/studio-0.8-rc2` (2026-10-05)

Built on `release/studio-0.8-rc` @ `050731b`. It adds the client branches left out of rc.1 and closes the framework gaps the Animated Coding Lab found. Nothing is tagged, and nothing is merged to `main` or to the rc.1 branch.

## Merged branches (`--no-ff` merge commits, in this order)
| # | Branch | Head | Notes |
|---|---|---|---|
| 14 | feat/fabric-bricks-autoplay | e91dde8 | Also carries the 3 commits of `client/fabric-bricks-v1` that are not on its origin (f267eb4, 792ca63, 9203dc7) on top of 8ef760e/ac4281e. All 5 are included with their history. |
| 18 | feat/fabric-bricks-detail | 7b296d2 | Stacked on #14. |
| 21 | proto/portfolio-showcase | 0f2aa49 | |
| 22 | proto/animated-coding-lab | c8675ff | |

**Conflicts:** only `package.json` scripts (#22). `test:coding-lab` was added next to the existing `test:engine` line, and the union was kept. The other merges applied automatically.

## Framework gaps from #22, now fixed (all backwards compatible; tests in `tests/motion-rc2-gaps.test.mjs`, one per gap)
1. **Runtime-built specs:** `motion/react.ts` exports `createMotionController` (plus the `MotionController` and `MotionControllerOptions` types and `MOTION_SPEED`).
2. **Provenance `recorded`:** accepted on v2 only. v1 documents and unknown kinds still fail closed. The SVG and HTML exports describe it as a recorded trace with authored presentation. The `motion-v2.schema.json` contract was regenerated.
3. **Changing labels:** a new v2 `label` command (`{type:'label', entity, text}`, at most 80 characters, optional timing window) changes the displayed label in place while the identity stays the same. There is one write per property per step, and v1 rejects it. Existing scenes are unchanged, because every pose label equals the entity label.
4. **Z-order:** a token resting on a container's top face is drawn after that container, even when the container's centre is deeper. Tokens that are not on top keep the plain x+y order.
5. **Playback speed:** `createMotionController(spec, reduced, scheduler, {speed})` and `setSpeed()` divide each authored hold before it reaches the scheduler, so a fake scheduler sees exactly `holdMs / speed`. `MotionView.speed` divides the D3 transition. Speed never changes which snapshot a step selects. Allowed range: 0.25 to 4. A new speed applies from the next hold, so no second timer is created.
6. **SourceReader:** new props `onLineClick(line, artifact)`, `currentLine` (marked `aria-current` and kept in view inside the reader, never by scrolling the page), `lineInfo` (badge, label, disabled), `renderLine` and `compact`. A new `scrollToSourceLine(container, line)` API is exported. The default rendering is unchanged.
7. **motion.css:** the viewport SVG `min-width:440px` is now `min(440px,100%)`, so there is no horizontal scroll on a phone.

**Animated Coding Lab, workarounds removed:**
- It imports from `motion/react.ts` and declares `provenance: 'recorded'`.
- Each row is one `row-i` token whose label becomes the returned value (the second `out-i` token is gone).
- Tokens rest on their containers.
- Speed is a controller rate: one compiled spec, no recompile.
- The code pane is the framework `SourceReader`.
- The lab's `min-width` override is gone.

Its test and smoke now expect these changes. The stills were regenerated.

## Step 3
- The shared client budget file (`scripts/check-client-performance.mjs`) gains `portfolio-showcase` (137,517 B / 160 KiB) and `animated-coding-lab` (158,683 B / 185 KiB), and `test:client-builds` builds and smokes both. The matrix is now **18 targets**.
- The portfolio stats (`stats.generated.ts`) were regenerated: 14 clients, 523 tests. Its `--check` drift guard failed until this was done.
- **Fabric Bricks and `defineApp({limits:{sceneParts}})` (#19): not adopted, because it would not simplify anything.** The grouping in `kits.ts` (scene entities are part types) comes from the **64-entity** cap. `sceneParts` raises only the 128-part cap, and the largest kit has 126 parts, which already fits.

## Test matrix (Windows 11, Node 26.9.0; Node 22.23.3 via `npx node@22`; SHA a618ddb plus this doc)
| Check | rc.1 | rc.2 |
|---|---|---|
| `npm test` Node 26 | 504/504 | **523/523** |
| `npm test` Node 22 | 504/504 | **523/523** |
| `typecheck` | clean | **clean** |
| `contracts:check` | OK | **OK** (motion-v2 schema regenerated) |
| `client:check` | 11 clients | **14 clients OK** |
| `build:client` × all | 11/11 | **14/14** |
| `test:client-builds` + budgets | 16/16 | **18/18** (first run: one `acceptance-analytics` preview start timed out under load; the rerun passed) |
| `test:viz-gallery` | OK | **OK** (core 40,106 B gz) |
| `test:python`, `test:python-bridge`, `test:python-service` | OK | **OK** |
| `test:artifact-watch`, `test:artifact-lineage` | OK | **OK** (rewrite shown in 106 ms) |
| param-lab smoke | OK | **OK** |
| `test:visual-contracts` | OK | **OK** |
| `test:coding-lab` (built client, 390 px, captures) | – | **OK**: 31 steps line-matched, JS 158,683 B ≤ 185 KiB, captures stable |
| portfolio smoke | – | **OK**: JS 137,311 B gz, 390 px light and dark, reduced motion, captures stable |
| Fabric Bricks Playwright (`qa/visual.spec.ts`, dev client, swiftshader) | – | **5/5** (first cold run: 1 timeout waiting for the lazy WebGL canvas; warm rerun 5/5) |
| `build` + Playwright `tests/browser` (includes Motion Pro) | 87/87 | **87/87** |
| `test:engine` | not run | **FAIL, already on rc.1**: `immediate-restart-watch` reports "Immediate edit was lost". It fails the same way on `050731b` (checked in a throwaway worktree), and RC2 changes no dev-host code. The candidate fix is the open `fix/app-definition-hmr` (2e59ca0), which is outside this RC's branch list. |

## Proposed tag (not created)
`studio-v0.8.0-rc.2` on the merge commit of this branch once it is accepted, after deciding on `fix/app-definition-hmr` for `test:engine`.

---

# rc.3: `release/studio-0.8-rc3` (2026-10-06)

Built on `release/studio-0.8-rc2` @ `35777cc`. It fixes the Windows dev host so that `test:engine` passes, the last open item of rc.2. Nothing is tagged, and nothing is merged to `main` or to the rc.1/rc.2 branches.

## `fix/app-definition-hmr` was not the fix
Its commits (2e59ca0, and 1cf6dcc on its origin) are already ancestors of rc.1 (`050731b`) and of rc.2. Merging it changes nothing, so the failure had another cause.

## Root causes (Windows only; CI runs on Ubuntu, which hid them)
1. **Client edits were ignored by the dev host.** Vite hands `handleHotUpdate` a POSIX-style id (`D:/…/app.ts`), while `client-dev.mjs` compared it with the native root (`D:\…\clients\<id>\`). `startsWith` never matched, so a capability or publication edit never revalidated. That is the "Immediate edit was lost" failure. It is fixed by `isClientFile()`, which compares resolved paths, with a unit test for both separator styles (`tests/engine-authoring.test.mjs`).
2. **The host could not stop gracefully.** The CLI listened for stdin `end` but never resumed stdin, so the event never fired, and on Windows SIGTERM is TerminateProcess. The CLI now follows a piped stdin (never a TTY or an ignored stdin) once it is ready, then publishes `stopped` and exits 0. `test:engine` closes stdin instead of sending SIGTERM on Windows. A second host on a busy port still exits 1 with its own error.
3. **Qualification budgets were sized for an idle Linux runner.** Traced Vite restarts on this host: config re-resolution takes about 1 s when idle and up to 18 s under load, and arming takes 1 to 5 s. `engine-host-watch` now waits up to 60 s per edit, re-checks after its last wait (the in-process restart can starve the poll), and has a 300 s budget. Its timeout is reported by name.

`ENGINE_EVIDENCE_DIR` already gives each run its own output folder. The script refuses an existing folder on purpose, to keep earlier evidence, so it was left unchanged.

## Commits
`8da02ee` POSIX id fix · `ffe39d8` stdin stop · `87b5067` follow stdin only once ready, plus budgets · `5051d0a` and `52c91d1` restart-watch budgets · `09f44e6` portfolio stats (524 tests).

## Test matrix (Windows 11, Node 26.9.0; Node 22.23.3 via `npx node@22`; SHA 09f44e6 plus this doc)
| Check | rc.2 | rc.3 |
|---|---|---|
| `npm test` Node 26 | 523/523 | **524/524** |
| `npm test` Node 22 | 523/523 | **524/524** |
| `typecheck` | clean | **clean** |
| `contracts:check` | OK | **OK** |
| `client:check` | 14 clients | **14 clients OK** |
| portfolio `stats.mjs --check` | OK | **OK** (regenerated) |
| `test:client-builds` + budgets | 18/18 | **18/18** |
| `test:artifact-watch` (client:dev with piped stdin) | OK | **OK** (rewrite shown in 115 ms) |
| param-lab smoke (client:dev with ignored stdin) | OK | **OK** |
| `build` + Playwright `tests/browser` (includes Motion Pro) | 87/87 | **87/87**. Another session's preview held port 4173 all night, so the suite ran on a private port (4187) with Chromium mapping `127.0.0.1:4173` to it, and pages kept their origin. First pass: 84 passed. `studio.spec` Parquet needed `npm run test:fixtures` on the new worktree (7/7 after that). The two `public-metadata` tests call `route.fetch()` from Node, which reached the foreign server. A throwaway copy that fetched from 4187 passed 3/3. Nothing in the repo was changed for this. |
| `test:engine` × 3 (separate `ENGINE_EVIDENCE_DIR` each) | FAIL | **3/3 passed, 34 checks each** (SHA 52c91d1; `09f44e6` only regenerates portfolio stats) |

Not rerun, because rc.3 does not touch them: `test:viz-gallery`, Python tests, `test:artifact-lineage`, `test:visual-contracts`, `test:coding-lab`, portfolio smoke, Fabric Bricks Playwright.

## Proposed tag (not created)
**Ready to tag `studio-v0.8.0-rc.3` (not tagged)** on the merge commit of this branch once it is accepted.

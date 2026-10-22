# MosaicStudio V1 hardening — 2026-10-22

Three reproduced defects are fixed: unsafe release extraction paths, stale runtime pairing after storage errors, and unreadable mobile engineering provenance. Source, regressions and this evidence are delivered for review. No merge, deployment, tag or public package publication occurred.

## Source

Final implementation: `70c55bf784d5fc1fee6cf939c679c3107902d9da`, branch `codex/mosaicstudio-v1-hardening-20261022`, base `8e2baae2c04c911cbf66cbbfe942f27aff7a039d`. Later evidence-only commits are not the packaged implementation. Original checkout and other owners' worktrees were preserved.

- `055deab`: validate complete archive paths and extraction destinations; retain explicit runtime pairing after storage failures.
- `2412000`: reject ambiguous/orphan PAX metadata.
- `327866b`: remove an older stored pairing on memory-only connect whenever browser removal works.
- `70c55bf`: preserve readable mobile provenance with keyboard-accessible local table scrolling; wait for the actual Operations chart before mobile capture.

Archive checks cover the root and directories before root stripping, Windows aliases/device names/alternate streams, traversal, duplicate/case-colliding paths, file/directory collisions, empty archives and unsupported PAX metadata. Extraction preflights every destination before any write. Tests cover rejection without partial writes and byte-identical valid extraction. Independent comparison with Python's tar reader matched 396 SDK and 12 runtime files in the earlier supported checkpoint.

The pairing link keeps the last validated value in page memory when storage fails. Explicit replacement and disconnect win within the page. Memory-only connect removes stale persistence when possible. **Limit:** if both writes and removal are denied, the page cannot erase persisted consent across reload; the old stored entry may reappear after reload. Tests explicitly preserve this limitation.

The mobile Source column measured **50.3125 px** in the old package, below the regression's 180 px readability threshold. It now has a useful minimum width, compact rows and local keyboard scrolling without page overflow. This was found by actual screenshot review despite the previous no-page-overflow test passing.

## Actual checks

| Check | Source | Result |
|---|---|---|
| Full Node unit suite, concurrency 2 | `327866b` | **843 passed, 0 failed, 0 skipped** |
| Pinned Python suite | `327866b` | **53 passed, 1 optional marimo skip** |
| Pinned Python runtime suite | `327866b` | **62 passed** |
| Full Chromium suite on extracted workbench ZIP | `327866b` | **143 passed, 1 private-real-export skip, 0 failed** |
| Selected client builds/browser/assets/budgets | `2412000` code | **19 passed**; unchanged source digest; test-only dirty metadata limitation below |
| Final focused archive/pairing/run regressions | `70c55bf` | **19 passed** |
| Final TypeScript, source/client/visual contracts and production build | `70c55bf` | **PASS** |
| Final selected model-client build | `70c55bf` | **PASS** |
| Final affected Chromium checks on extracted ZIP | `70c55bf` | **32 passed, 0 skipped/failed** |
| Shipped SDK/runtime static verification | `70c55bf` | **PASS**: 396 SDK files, 12 runtime files, 6 candidate hashes, all 119 ZIP entries verified |
| Extracted shipped runtime, safe and demo profiles | `70c55bf` | **44 passed**, outside checkout; both services stopped |
| Runtime-backed consumer journeys: contoso-shape-analytics and foil-wind | `70c55bf` | **2 passed** |
| Installed Edge headless spot checks | `70c55bf` | **6 passed**, 0 failed |

The final client-only change does not alter framework/runtime/Python/unit-test bytes from `327866b`; broad unchanged suites were not rerun. Final affected tests cover model identity, shared selection, keyboard scrolling, mobile/reduced-motion controls, restore, invalid imports, asset refusal and SQL/autosave/reload. The full earlier suite includes real Jupyter Python → SQL → chart → export → restart/reopen without recomputation, controlled refusal and module-switch journeys. Its workbench was extracted from the candidate ZIP; its Python/Jupyter helpers ran from the unchanged source with pinned dependencies. The separate 44-probe run used the shipped runtime extracted outside the checkout.

The full browser skip is `FR04_REAL_DIR` unset: real client exports were not supplied. Public synthetic interoperability tests passed. The general Python skip is optional marimo; marimo execution remains unqualified. Node 26.9.0, Python 3.14.7, Playwright 1.63.0 and pinned package versions are recorded in `environment.json` and logs.

The 19-client suite covers eight public references, three compact examples and eight fresh scaffold clients. Its `src` digest stayed unchanged. Two new test-only storage regressions were added during the last generated builds, whose descriptors therefore reported a dirty tree. This is selected-client coverage, not a final clean-package receipt. Final `70c55bf` packages were produced only after a clean commit.

Expected failure proofs: initial archive regressions 4 failed/1 passed; initial storage regressions 5 failed; two reload regressions failed before cleanup; the new mobile readability assertion failed against the old ZIP before the CSS fix. These expected failures are distinct from passing qualification runs.

## CI boundary

| Exact tested source | Narrow Oracle ARM64 result | Downloaded CI artifact SHA-256 |
|---|---|---|
| `2412000` | 11 passed | `0d59f4b05388719a49fa47f2fd97f23bacb30def61800489d1978e7949adf390` |
| `327866b` | **13 passed, 0 failed/skipped** | `198e9e1694e003fadd5ca553687925c048b704ecba3f1464a3530d27ebe98250` |

**Final narrow CI is complete:** the coordinator ran the 13-test core request at `327866b` once on Oracle ARM64. Downloaded archive bytes match the receipt; the embedded receipt and log hashes were independently checked. All 309 selected input files have identical paths, modes and Git blob IDs at final client source `70c55bf`. This qualifies the narrow archive/pairing regression gate only. The earlier 11-test receipt is preserved as a checkpoint.

The coordinator owns CI submission. The completed final core checkpoint is `327866b`; all its requested gate inputs (package.json, scripts, src and the two regression files) are byte-identical at `70c55bf`, verified by the command in `ci-summary.json`. A receipt for an earlier SHA is not silently promoted to whole-product CI. Hosted CI was not enqueued; commits carry `[skip ci]`. Private carrier identifiers are omitted from this public repository. Whole-product hosted CI, provider/native and family release acceptance are not established by this pass.

## Candidate and private delivery

The immutable local folder is `candidate-70c55bf` under the campaign evidence directory; the parent campaign's private `result.json` records its absolute path. Candidate source is clean `70c55bf784d5fc1fee6cf939c679c3107902d9da`. No candidate binaries were uploaded to this public repository.

| File | Bytes | SHA-256 |
|---|---:|---|
| `datapass-mosaicstudio-workbench-0.13.0-hardening.zip` | 20,646,329 | `6aa09ffbc61b384f863a7a1d236542d1053a9c553e66a22ef46a1e261ab6bd23` |
| `dist-runtime/datapass-runtime-companion-0.13.0.tar.gz` | 53,576 | `58fae596eed0bd3758d6dba0f8f4afb175d3dec99117964383cdc25eee37942d` |
| `dist-runtime/runtime-companion.json` | 4,646 | `96c8b73ed4b0240e9d5fc0d060e494fcb1db408ad96179b2937543767ba633fc` |
| `dist-sdk/concept-viewer.html` | 974,386 | `382381cd7728b1af8c62bc25e094aa904d16a45a0d54eea156f3e0f7c80658b5` |
| `dist-sdk/datapass-mosaicstudio-sdk-0.13.0.tar.gz` | 838,624 | `64d053a0e2135088d82595649686dac799e5148ae94b833616fdeb89cd7c4dec` |
| `dist-sdk/sdk-release.json` | 67,542 | `c1138f6aa4d64bcd5990c10a5a0fd7bd8ae2578a97cdbd54f1838b1745f347ac` |

The workbench ZIP uses sorted paths, fixed timestamps and permissions. Every ZIP entry was read back and compared to the build. All six declared candidate hashes were checked, then the verifiers shipped inside the extracted SDK ran against the candidate. The standalone viewer is the unchanged committed 0.13.0 viewer, with its existing embedded provenance. `tools/package_candidate.py` and `tools/verify_candidate.py` reproduce packaging/verification of trusted local outputs; they refuse existing output directories. The original local verification was followed by the private publication receipt below.

After a clean checkout, dependencies and production build, the packaging recipe is `npm run sdk:pack`, `npm run runtime:pack`, then `python tools/package_candidate.py <repo> <new-candidate-dir>` and `python tools/verify_candidate.py <candidate-dir> <new-consumer-dir>` (use the scripts in this receipt's tools folder). Run the extracted SDK's `scripts/runtime-verify.mjs <candidate-dir>/dist-runtime --python <pinned-python> --port <free-port-above-20000>` for the live 44-probe check. For browser verification, serve `<new-consumer-dir>/workbench` with Vite preview on 127.0.0.1:4173, set `PW_REUSE_SERVER=1`, and run the documented Playwright files; the full suite requires the pinned Jupyter environment. Do not collide with another owner's ports.


The tested candidate was subsequently published as a separately named review bundle
on the campaign's existing private prerelease. Both assets were downloaded and
compared byte-for-byte; all **50 bundle entries** and all **six original candidate
files** passed hash verification. The bundle includes the exact `70c55bf` source
archive and the `35b78f6` evidence snapshot, so later receipt-only commits do not
change the tested package identity. Bundle SHA-256:
`032262997571695aee50ad82da72e1fbbd73235198804d50fb7ce420ea6034cd`.
See `private-publication-verification.json`; authenticated URLs stay in the
campaign's private handoff. This is a private qualified candidate, with the
remaining acceptance gates below still open. All 40 original public evidence
files were independently downloaded from the exact GitHub commit archive and
compared to local Git object bytes (`github-evidence-verification.json`).

## Visual evidence

Actual browser PNGs were inspected, including independent read-only review of the mobile defect and fix. Final [mobile provenance](screenshots/engineering-mobile-source.png), [mobile model page](screenshots/engineering-mobile.png), [desktop engineering](screenshots/engineering-desktop.png), [mobile Operations chart](screenshots/operations-mobile.png) and [desktop Operations](screenshots/operations-desktop.png) show readable text, direct controls and synthetic labels. The [old mobile capture](screenshots/engineering-mobile-before.png) preserves the reproduced defect. Partial table columns in the final full-page image reflect the deliberately scrolled test state; the separate source capture shows readable provenance.

The first Operations captures showed “Loading chart…” and were excluded from settled approval. The revised browser test now waits for the SVG before checking overflow and taking the mobile screenshot. Geometry, data and runtime results here are supplied synthetic/illustrative fixtures, not scientific, engineering or real-client acceptance.

## Problems, questions and restart pointers

- No known material implementation defect remains from this pass. Browser storage cannot be revoked across reload when removal is denied; this is recorded above.
- Optional marimo and private real-client exports remain unqualified. No cloud/provider execution or physical native-dialog acceptance is claimed.
- Full-product CI and final release/publication approval remain owner gates. Narrow CI scope is explicit above.
- Standard Vite chunk-size and Rollup annotation warnings remain in the logs; they did not fail the build.
- No implementation question requires a user decision. The next owner action is review of this branch and any separately authorized release/publication decision.
- Resume from `70c55bf784d5fc1fee6cf939c679c3107902d9da` and this receipt. Preserve prior candidates `2412000` and `327866b`; do not overwrite them. Do not rerun unchanged suites or submit duplicate CI. Follow any new changes with affected qualification and a new candidate.

`checks.json` retains exact source/times/exit codes. Browser summaries retain per-test outcomes without raw traces. Sanitized logs and screenshot/file hashes are included for external review. Raw traces and private runner receipts stay in the campaign evidence folder. `releasePass=false`.

The immutable private bundle contains the earlier evidence snapshot where final narrow CI was pending. This later source-repository supplement closes that narrow gate without replacing the bundle or changing its candidate bytes.

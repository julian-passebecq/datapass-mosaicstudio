# REL 0.13.1 — release receipt (DataPass MosaicStudio)

Patch release of 2026-10-23: 0.13.0 plus the V1 hardening (#102: release archive extraction, runtime pairing, mobile engineering provenance) and the notebook lineage fix (#103: the exported wind reference artifact records the Weibull `k` the notebook used). Built from the exact commit **`60c7cac75332cabcf0aa689b2c1988b54130bbae`** (squash of #104, "release: DataPass MosaicStudio 0.13.1 (hardening #102 + lineage k #103)"), tree `22d4895e315e4e34fc97b9ea84982080f81e43c7`. The build tree (a fresh clone under `%TEMP%`, detached at that commit) was clean before and after every step (`npm ci`, build, packing, manifest, verify). CI: PR head `02c3217` passed [Studio web gate run 39872227773](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39872227773) (check `web`, success; the branch was up to date with `0086dcc` at merge); the push of `60c7cac` passed [run 39874217854](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39874217854).

Scope: re-qualified on the shipped bytes (companion, workbench zip, SDK archive), not inferred from 0.13.0. No contract, stored format or wire changed: `datapass.engineering/1` schema sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83` as in 0.13.0. Nothing was tagged, publicly published or deployed; no licence decision. All data synthetic; models ILLUSTRATIVE. Studio does no science. T3 is not a dependency.

## Gates (S01-S10, re-run for the patch)

Vocabulary: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE_WITH_REASON`. Same gate list as [`REL-0.13.0.md`](REL-0.13.0.md); every row below was observed on `60c7cac` or its shipped bytes.

| Gate | Status | Evidence |
|---|---|---|
| S01 Baseline identified, changes tied to a gap | PASS | Baseline 0.13.0 `7adbbb7`. Gaps: unsafe archive paths, stale runtime pairing, unreadable mobile provenance (#102, reproduced before the fix in `qa/V1-HARDENING-20261022/`); notebook artifact lineage stuck at `k=2` (#103, `qa/LINEAGE-K-20261023/`). Contract `datapass.engineering/1` unchanged. |
| S02 Packaged runtime auth/origin/host/input, legacy routes | PASS | `runtime-verify` (the SDK's own script) on the **shipped** companion: 44 PASS, 0 FAIL. Start `--profile safe`: `/health` and `/ready` 401 without token, 200 with it (`ready: true`, no token in body); `/compute/*`, `/docs`, `/openapi.json` 404; after stop the port was closed and the PID gone. |
| S03 Submit/progress/cancel/error/late response | PASS | `test:product-loop` 2 passed on `60c7cac` (ports rewritten in a clone), including the controlled cancel and failure. CI runs `tests/runtime-lifecycle.test.mjs` with the runtime. |
| S04 Semantic selection across projections | PASS | CI full browser suite on the PR head, including `engineering-selection.spec.ts` with the new mobile provenance check (#102). |
| S05 Captured results reopen with zero compute requests | PASS | JOURNEY-01 on the unzipped zip: reopen 0 `POST /runs`, 0 Jupyter calls, store unchanged. Lineage: the `k=2.7` artifact reopens with 0 POST, 0 websocket, only static GETs (Q5). |
| S06 Bad hashes, unknown versions, invalid imports reject atomically | PASS | Tampered bundle refused `DP-BUN-003`, open view kept; tampered SQL hash refused then restored (rollback check); unknown cell kind kept aside with bytes identical to the injected bytes. Archive paths refused before any write (`tests/archive-boundary.test.mjs` in CI). |
| S07 Existing Python/notebook preserved; optional marimo explicit | PASS | `test:python` on the build tree: 60 tests, 58 OK, 2 skipped (both marimo executions `NOT_QUALIFIED: marimo not installed`). The non-default `k` marimo path was qualified locally with marimo 0.25.2 in #103. |
| S08 New engineering consumer and supported older artifacts | PASS | Q3: SDK tarball npm-installed in a fresh consumer; corpus 59/59, 17/17 c14n vectors, companion Python 59/59; 0.8.1 artifact byte-exact (`edb1de12…`). |
| S09 Pack/install/start/stop in a clean path; no secrets; bytes verified | PASS | Clean build tree; `sdk:verify` PASS (396 files, 4 contracts); companion 12 files; workbench zip built twice, same sha256. Confidentiality scan 532 files, 0 real hits. Re-download 8/8, `sha256sum -c` 7/7 OK, `sdk:verify` PASS. |
| S10 Exact-head CI | PASS | Table below. |

### S10 — CI per head

| PR | Head | PR run (head) | Main push run (merge commit) |
|---|---|---|---|
| #102 hardening | `4a88c5eaf1894146f87aeebc2a972e0a58c02537` | [39865480642](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39865480642) success | `40629d6`: no push run (the squash message carries `[skip ci]` from its commits) |
| #103 lineage k | `9bd650d02b2a3c622e1674c7ba4f2110444e9d76` | [39869161789](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39869161789) success | `0086dcc` [39871190384](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39871190384) success |
| #104 release commit | `02c3217f760fcc8130c53f7d2f86233442a08d0a` | [39872227773](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39872227773) success | `60c7cac` [39874217854](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39874217854) success |

CI runs on GitHub Actions (public repo). CI does not install marimo.

### Separate statuses

| Level | Status |
|---|---|
| Implementation (source) | PASS: #102, #103 merged, released by #104 |
| Local qualification | PASS: Q1-Q5 below on the shipped bytes |
| CI qualification | PASS: S10 |
| Scientific acceptance | NOT_APPLICABLE_WITH_REASON: Studio performs no science; models ILLUSTRATIVE, fixtures synthetic |
| Cloud | NOT_RUN: no cloud target in scope |
| Publication | Private vault only; **NOT public** (no tag, release, Marketplace or deployment) |

## What changed since 0.13.0 (`7adbbb7..60c7cac`)

- #102 `40629d6`: `scripts/sdk-verify.mjs` and `scripts/runtime-verify.mjs` validate every archive path and destination before extracting (traversal, Windows aliases and device names, alternate streams, duplicates and case collisions, file/directory collisions, empty archives, ambiguous or orphan PAX metadata); `src/framework/compute/runtime-task.ts` keeps an explicit pairing in page memory when storage fails and removes a stale stored pairing on a memory-only connect; mobile provenance in `clients/model-reference/`. Evidence: `qa/V1-HARDENING-20261022/`.
- #103 `0086dcc`: `build_artifact(rows, k=...)` in `py/wind_reference_model.py`, both notebooks pass the same `k`; committed `python-wind-reference` default artifact regenerated at `k=2` (6,188 bytes, `7ca77cb8…`, rows unchanged). Evidence: `qa/LINEAGE-K-20261023/`.
- #104 `60c7cac`: version 0.13.1, release notes, `docs/CONSUMING.md` (0.13.0 → 0.13.1 and rollback), licence inventory (pycparser 3.11 → 3.12, licence unchanged), standalone viewer rebuilt.
- SDK archive: 396 files (unchanged count), 4 contracts. Runtime companion: 12 files, service 0.5.0, starts `--profile safe`; it now ships the fixed `py/wind_reference_model.py`. Workbench `dist/`: 119 files.

## Distribution

Local release folder (owner machine, not committed): `<releases>/datapass-mosaicstudio/0.13.1-60c7cac/`. `sha256sum -c SHA256SUMS`: 7 of 7 OK.

| File | Bytes | sha256 |
|---|---:|---|
| `datapass-mosaicstudio-sdk-0.13.1.tar.gz` | 840,467 | `0c7b5449c75bc650bf19d78315e619fba999a3a6b579bb895a5ce8d24384af39` |
| `datapass-mosaicstudio-workbench-0.13.1.zip` | 20,655,611 | `9f80a3eb1054fa249961c56a04641c76567397b8e238e358d8560c5a7042ef0d` |
| `datapass-runtime-companion-0.13.1.tar.gz` | 53,724 | `cc712ee0b9e4bd51e3f4690c8b65c2ec54bd7b6d716f0d35bdb43cd2d7ac0827` |
| `concept-viewer.html` | 974,386 | `c2184cf5cb45fc66e115c969b765df711df905531d8b3689fe08eb3f54fdf75b` |
| `sdk-release.json` | 67,542 | `e49debddf78a0a8284b444479fcb3f4bd6aab76cf74d6feb8ea0e63172347e4e` |
| `runtime-companion.json` | 4,646 | `ac910f63e9574189c2936fe498a4feb1bb1ebe14e703a154f3f73668f6098a91` |
| `release-manifest.json` | 23,338 | `4b3ca8dd11e6bf4e3281aa1151e8cc34d2290bf1e3379ad5a4c6431a50684e55` |
| `SHA256SUMS` | 668 | `e34fc1809662ade9686567986ea7105d791cb920686b6d79f364f9b5cf8432de` |

- Build: `npm ci` exit 0 (npm 11 esbuild install-scripts warning), `npm run build` exit 0 (chunk-size warning), `sdk:pack` 396 files, `sdk:verify` PASS (4 contracts), `runtime:pack` 12 files (service 0.5.0, start `--profile safe`), `runtime-verify` 44 PASS, 0 FAIL.
- Release manifest trees: workbench `12bbcec71beda44f…` (119 files, 90,792,968 bytes), concept-viewer `ee020a69b6f17154…`, SDK `76e5b2ab7b0b71b0…` (3 files).
- Workbench zip: deterministic recipe of [`FIN-0.11.0.md`](FIN-0.11.0.md); built twice, identical sha256 `9f80a3eb…`.
- Packaging reruns no numerics: `sdk:pack` and `runtime:pack` are `git archive`s of the commit and the zip is a byte copy of `dist/`; no Python ran while packaging. A fresh `k=2` export by the shipped companion is byte-identical to the committed artifact (`7ca77cb8…`).

## Tests

| Check | Target | Result |
|---|---|---|
| CI Studio web gate (typecheck, unit, contracts, licence check, browser suite) | PR #104 head and `60c7cac` push | PASS |
| `npm run test:python` (release venv) | build tree `60c7cac` | 60 tests: 58 OK, 2 skipped (marimo NOT_QUALIFIED) |
| `npm run test:engineering-corpus` | build tree `60c7cac` | node 8/8, Python 11 OK |
| `npm run test:product-loop` | clone of `60c7cac`, ports rewritten (21491/21481 → 24591/24581, runtimes → 28591/28592) | 2 passed (contoso-shape-analytics, foil-wind) |

## Qualification on the shipped bytes

Headless Chromium 153.0.8010.12, Node 26.9.0, Python 3.14.7 in a fresh venv (pinned `py/service/requirements*.txt` + `duckdb==1.4.3`), ports 24500-24599 and 28500-28599, working copy of the release folder (`sha256sum -c` 7/7 OK). Tokens are redacted in every log.

| Lane | Result | Detail |
|---|---|---|
| Q1 packaged runtime | PASS | `runtime-verify` on the shipped companion 44 PASS, 0 FAIL (safe + demo). `--profile safe`: health and `/ready` 401 without token, 200 with it; `/compute/*`, `/docs`, `/openapi.json` 404; after stop the port was closed and the PID gone |
| Q2 workbench journey | PASS | JOURNEY-01 on the unzipped zip with the packaged runtime and Jupyter from the companion `py/`: 1 passed, 18/18 steps; save 4 results and the notebook; reopen 0 `POST /runs`, 0 Jupyter calls, store unchanged; headers equal `_headers` on 3/3 documents; 0 CSP violations (only the deliberate non-loopback probe was blocked); 0 page errors; 0 external requests. Tampered bundle refused `DP-BUN-003`, open view kept (1 passed) |
| Q3 SDK consumer | PASS | SDK tarball npm-installed in a consumer under `%TEMP%`; installed engineering files equal `sdk-release.json`; corpus 59/59 (11 accept, 48 reject), 17/17 c14n vectors, companion Python 59/59; 0.8.1 artifact byte-exact and valid in TS and Python; `sdk-verify` from the installed package PASS |
| Q4 upgrade/rollback | PASS | `release-rollback-check.mjs` 0.13.0 → 0.13.1 → 0.13.0 → 0.13.1 on both unzipped zips and both companions, one store: 5/5 steps, reopen without recomputation, tampered SQL hash refused then restored. Unknown-cell-kind variant 6/6, kept-aside bytes equal the injected bytes. 0.13.0 folder still 7/7 OK, `SHA256SUMS` `16bfbdbe…` unchanged |
| Q5 lineage `k` | PASS | Export with the shipped companion's `py/wind_reference_model.py` (sha256 equals the commit blob): `k=2` → `7ca77cb8…` (byte-identical to the committed artifact), `k=2.7` → `cf5fc4e6…` with title, source and declared input `k=2.7`, `inputHash` `e5ed7952…` (vs `de3e05a0…` at `k=2`), AEP at 8 m/s 9,823.9 vs 9,925.5 MWh/yr; `k=NaN` refused before writing. The `k=2.7` file then opened in the shipped 0.13.1 workbench (`?artifact=1`, its own `_headers`) and in the 0.13.0 workbench (rollback): title and input `k` 2.7, input hash shown, only static GETs, 0 POST, 0 websocket, no runtime or Jupyter call, file unchanged, 0 console errors |

## Private delivery

Destination: existing private vault, generic package `datapass-mosaicstudio-sdk`, version path **`0.13.1-60c7cac`** (new immutable path, pre-granted by the owner rules). Vault URLs, identifiers and names are deliberately not recorded in this public repository.

- Before upload every file URL of the new path answered 404; a known 0.13.0 file downloaded with auth (`SHA256SUMS` `16bfbdbe…`).
- Confidentiality scan (532 files: loose files plus the unpacked SDK, companion and workbench): 0 real hits. Benign only, the same as 0.13.0: upstream DuckDB-wasm build paths `/home/runner/...`, `APPDATA` placeholders in `docs/RUNTIME_COMPANION.md`, the recovery folder name in `docs/RECOVERY_2026-10-10.md` (public since 0.10.0), policy sentences, the upstream js-sha256 author e-mail in DuckDB worker bundles.
- Uploaded 2026-10-23T00:08:48Z-00:09:05Z, 8 files (HEAD 404 checked before each PUT). Registry sha256 equals the table above for 8/8 files.
- Authenticated re-download into a fresh empty folder: `sha256sum -c` 7/7 OK, `SHA256SUMS` itself `e34fc180…`, `sdk:verify` PASS, `runtime-verify --no-start` PASS.
- Anonymous requests: package files 401, project API 404.
- Previous versions untouched: file lists of `0.10.0-e7db854` (1), `0.11.0-0bc8c8c` (6), `0.11.1-3575e6b` (6), `0.12.0-c6f5b97` (8), `0.13.0-7adbbb7` (8) equal before and after.

## Not run

- Edge, Positron, other browser channels; cross-OS.
- marimo execution in CI and in the release venv (NOT_QUALIFIED; the non-default `k` path was qualified locally with marimo 0.25.2 in #103). Q5 exports through the same `table()` + `build_artifact()` calls the notebooks make, without marimo.
- Stock `scripts/release-upgrade-check.mjs`: not applicable (hard-codes the 0.9.0 → 0.10.0 refusal); replaced by the unknown-cell-kind variant (Q4).
- E2E-06 (native agent in T3): NOT_RUN / BLOCKED, history only. Cloud: NOT_RUN.

## Known limits, omissions and issues

1. If browser storage refuses both the write and the removal, an older stored runtime pairing can come back after a reload (#102, tested and documented).
2. Artifacts exported by 0.13.0 from a notebook with `k` ≠ 2 still declare `k=2`; re-export with 0.13.1 (`docs/CONSUMING.md`).
3. Cancel is cooperative; coverage in a run receipt is declared by the producer; `approval-request` is presentation only (as in 0.13.0).
4. The standalone viewer header names source commit `7e50355` (built on the release branch before the squash); its content equals the committed `dist-standalone/concept-viewer.html`.
5. `release-manifest.json` does not list the runtime companion; `runtime-companion.json` and `SHA256SUMS` do.
6. The reused JOURNEY-01 spec still labels its first step "identical to 3575e6b"; the runtime and Jupyter it started were the 0.13.1 companion `py/`.
7. `#102`'s merge commit has no main push run (`[skip ci]` in its squash message); its PR head run and the later `0086dcc` / `60c7cac` push runs cover it.
8. Licence and any public publication remain an owner gate. Release 0.13.0 and its folder are unchanged.

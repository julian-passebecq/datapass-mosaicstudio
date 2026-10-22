# REL 0.13.0 — release receipt (DataPass MosaicStudio)

Minor release of 2026-10-22, lane `01-mosaicstudio` (engineering consumer): the frozen contract `datapass.engineering/1` (#96), the runtime boundary with the `safe` profile as default (#97), selection binding, marimo producer check and 0.8.1 consumer (#98), and the client run lifecycle with engineering blocks (#99). Built from the exact commit **`7adbbb7973756373090ce4872c54bf5f3ea2dacc`** (squash of #100, "release: DataPass MosaicStudio 0.13.0 (lane 01 engineering consumer)"), tree `4323aa2c982794df1f9dff04ad3037ad7e9b462c`. The build tree was clean before and after every step (`npm ci`, build, packing, manifest, verify). CI: PR head `b59e57d` passed [Studio web gate run 39709507701](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39709507701) (check `web`, success; the branch was up to date with `7cb3e4d` at merge); the push of `7adbbb7` passed [run 39711109567](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39711109567).

Scope: re-qualified on the shipped bytes (companion, workbench zip, SDK archive), not inferred from 0.12.0. Nothing was tagged, publicly published or deployed; no licence decision. All data synthetic; models ILLUSTRATIVE. Studio does no science: no CAD, physics or AI result is produced or approved here. T3 is not a dependency.

## Lane-01 gates (S01-S10)

Vocabulary: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE_WITH_REASON` (FOIL handoff 2026-10-22, `07_ACCEPTANCE_AND_RELEASE.md`). S01-S09 define the local Studio slice; S10 is CI qualification.

| Gate | Status | Evidence |
|---|---|---|
| S01 Baseline identified, existing capabilities reused, changes tied to a gap | PASS | Baseline `6ab0756` (0.12.0 receipt merge) inspected per gate before any change (lane plan): legacy routes open, no idempotency, no `cancelRequested`, no readiness, three disagreeing canonical JSON forms, no unit-mismatch reason, untested marimo app. Reused: `useSelection`/view fields, `ArtifactView`, `DurableRuns`, `runtime.ts` stale guard, product loop, bundle and artifact corpora. New contract only where no form existed: `datapass.engineering/1` + `datapass-c14n/1` (#96, `d20ecd6`; schema sha256 `6ba8ee85…5a83`; corpus 11 valid / 48 invalid / 17 c14n vectors, TS and Python identical). Pinned 0.10 files untouched (`tests/release-0.10.test.mjs`). |
| S02 Packaged runtime auth/origin/host/input, legacy-route disposition | PASS | #97 `20128a8`: `safe` default, legacy `/artifacts/*`, `/compute/*`, `/docs`, `/redoc`, `/openapi.json` → 404; `demo` keeps them behind loopback Host + Origin. `runtime-verify` on the **shipped** companion: 44 PASS, 0 FAIL (no/wrong/query token 401, foreign Origin 403, wrong Host 400, 411/413, traversal 422, legacy 404). Start `--profile safe`: `/ready` 401 without token, 200 with it, no token in body. |
| S03 Real submit/progress/cancel/error/late response, no hidden fixture fallback | PASS | #97 server (`Idempotency-Key`, 409 on changed payload, `cancelRequested`, `/ready`), #99 `7cb3e4d` client: `tests/runtime-lifecycle.test.mjs` with `DATAPASS_REQUIRE_RUNTIME=1` 17 pass against the unchanged service `create_app` (genuine half) plus a labelled fault-injection stub; product loop adds one controlled cancel and one controlled failure. Limit: cancel is cooperative. |
| S04 Semantic selection across projections; view state does not change identity | PASS | #98 `1d64024`: `binding.ts` (`unmapped` never animates, `inferred` only after opt-in, `designDigest` ignores camera/selection/isolate/explode/time cursor/view token); `tests/browser/engineering-selection.spec.ts` + `model-assets.spec.ts` 20/20 locally and in CI. Limit: 3D round trip through the part label buttons, not canvas picking. |
| S05 Captured results/comparisons reopen with zero compute requests | PASS | #99 product loop: reopen 0 `POST /runs`, view-only changes 0 `POST /runs`. Release: `test:product-loop` 2 passed on `7adbbb7` (ports rewritten in a copy); JOURNEY-01 on the unzipped zip reopened with 0 `POST /runs`, 0 Jupyter calls, store unchanged. No LLM or build request exists in this path. |
| S06 Bad hashes, unknown versions, invalid imports reject atomically | PASS | #98/#99: invalid or non-JSON engineering records refused, current record kept; A/B refuses unit mismatch with a reason. Release: tampered bundle refused `DP-BUN-003`, open view kept (1 passed); tampered SQL hash refused then restored (rollback check); unknown cell kind kept aside with bytes identical to the injected bytes. |
| S07 Existing Python/notebook preserved; optional marimo explicit | PASS | #98 `py/test_marimo_producer.py`: AST check passes; execution reports `NOT_QUALIFIED: marimo not installed` (explicit skip, not a pass) in CI and in the release venv. Qualified once locally with marimo 0.25.2 in a temp venv (3/3). Release `test:python` 54 OK, 1 skipped (that marimo test); JOURNEY-01 Jupyter cells saved and reopened. |
| S08 New engineering consumer and supported older artifacts | PASS | #98: consumer accepts the generic record and the synthetic FOIL-adapter fixture; `python-wind-reference` renders the byte-exact 0.8.1 artifact. Release Q3: SDK tarball npm-installed in a fresh consumer, engineering files equal `sdk-release.json`, 59/59 corpus records, 17/17 c14n vectors, companion Python agrees 59/59; 0.8.1 artifact byte-exact (`edb1de12…`) and valid in TS and Python. |
| S09 Pack/install/start/stop in a clean path; no secrets; release bytes verified | PASS | Clean build tree; `sdk:verify` PASS (396 files, 4 contracts); companion 12 files; workbench zip built twice, same sha256. Start/stop outside any checkout: port closed and PID gone after stop. Confidentiality scan 532 files, 0 real hits. Re-download 8/8, `sha256sum -c` 7/7 OK, `sdk:verify` PASS. |
| S10 Exact-head CI | PASS | Check `web` (Studio web gate) success on each PR head, table below. |

### S10 — CI per head

| PR | Head | PR run (head) | Main push run (merge commit) |
|---|---|---|---|
| #96 contract | `acd0e58a574c0028da376e6429373aba39cf68ca` | [39695255859](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39695255859) success | `d20ecd6` [39697842618](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39697842618) success |
| #97 runtime boundary | `c3001f2bab2f225592dfa440daec7637afdc986a` | [39701193940](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39701193940) success | `20128a8` [39702982644](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39702982644) success |
| #98 selection binding | `c21e6b58bf4893b5991c9db614a9b67f8a391a02` | [39704726911](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39704726911) success | `1d64024` [39706571301](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39706571301) success |
| #99 run lifecycle | `fd440a068394c060817c2d7ae8847f3771488655` | [39707125006](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39707125006) success (a duplicate PR run 39707123141 and push run 39707119219 were cancelled by the concurrency group; push run 39707119234 success) | `7cb3e4d` [39708468341](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39708468341) success |
| #100 release commit | `b59e57d52b9d43d2546851b72e0b8927d72ba0db` | [39709507701](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39709507701) success | `7adbbb7` [39711109567](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/39711109567) success |

CI runs on GitHub Actions (public repo). CI does not install marimo (S07 execution NOT_QUALIFIED there).

### Separate statuses

| Level | Status |
|---|---|
| Implementation (source) | PASS: #96-#99 merged, released by #100 |
| Local qualification | PASS: S01-S09 above, Q1-Q4 below on the shipped bytes |
| CI qualification | PASS: S10, every PR head and every merge commit |
| Scientific acceptance | NOT_APPLICABLE_WITH_REASON: Studio performs no science; models are ILLUSTRATIVE and fixtures synthetic. Not granted by this release |
| Cloud | NOT_RUN: no cloud target in scope |
| Publication | Private vault only; **NOT public** (no tag, release, Marketplace or deployment) |

## What changed since 0.12.0 (`c6f5b97..7adbbb7`)

- Contract `datapass.engineering/1` (frozen, #96): `spec/engineering/v1/engineering.schema.json` (sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83`), `src/framework/engineering/contract.ts`, Python mirror `py/datapass_engineering.py`, codes `DP-ENG-001..016`. Unchanged since `d20ecd6`.
- Runtime `datapass.runtime/1` additive wire (#97): `Idempotency-Key`, `cancelRequested`, authenticated `GET /api/runtime/v1/ready`; service `datapass-artifact-service` 0.5.0, `safe` profile default (**operationally breaking** for callers of legacy routes: pass `--profile demo` or migrate). Upgrade and rollback: `docs/CONSUMING.md`; FOIL Studio consumer guide: `docs/UPGRADE_FOIL_STUDIO_0.13.md`.
- Client run lifecycle, previous-result label, engineering blocks, unit-mismatch reason (#99); selection binding, marimo producer test, 0.8.1 consumer (#98).
- SDK archive: 385 → 396 files, 4 contracts (was 3). Runtime companion: 11 → 12 files (adds `py/datapass_engineering.py`), starts `--profile safe`. Workbench `dist/`: 119 files.

## Distribution

Local release folder (owner machine, not committed): `<releases>/datapass-mosaicstudio/0.13.0-7adbbb7/`. `sha256sum -c SHA256SUMS`: 7 of 7 OK (re-checked when writing this receipt).

| File | Bytes | sha256 |
|---|---:|---|
| `datapass-mosaicstudio-sdk-0.13.0.tar.gz` | 837,859 | `db0d32b04fc073c5fcff53e3d22c21f15c42f0096afff59afaa2109ce1d0fe6b` |
| `datapass-mosaicstudio-workbench-0.13.0.zip` | 20,655,553 | `d4df7b096d64241d449a8091c2ba162f72dea2774175bafe0c98319b623a2c1b` |
| `datapass-runtime-companion-0.13.0.tar.gz` | 53,577 | `51e4399cc0baedc5082c5276d01ecff9cab02c150a5da89b502597d158ced88d` |
| `concept-viewer.html` | 974,386 | `382381cd7728b1af8c62bc25e094aa904d16a45a0d54eea156f3e0f7c80658b5` |
| `sdk-release.json` | 67,542 | `85a53def01da32bb69fb8e37aa3e3c2cef2c07131901023e406a8ddaa29ddf95` |
| `runtime-companion.json` | 4,646 | `33148d0558b0bb9d6a3ba842d853202334dc7741b88ad2ef4310dd444db64dee` |
| `release-manifest.json` | 21,160 | `d6c1fcd8774a588ccaf9162151d2b020c482107e44bd726584c8d15bd1d80efd` |
| `SHA256SUMS` | 668 | `16bfbdbe671eb76db13852d7c0a4b5563c222e067bc7901cc316220b4366f8fd` |

- Build: `npm ci` exit 0 (npm 11 esbuild install-scripts warning), `npm run build` exit 0 (chunk-size warning), `sdk:pack` 396 files, `sdk:verify` PASS (4 contracts), `runtime-pack` 12 files (service 0.5.0, start `--profile safe`), `runtime-verify` 44 PASS, 0 FAIL.
- Release manifest trees: workbench `6e7d57088f72ea84…` (119 files, 90,792,787 bytes), concept-viewer `064c1fad9e2903b8…`, SDK `4c7b0321dba6b9f6…` (3 files).
- Workbench zip: deterministic recipe of [`FIN-0.11.0.md`](FIN-0.11.0.md); built twice, identical sha256 `d4df7b09…`.

## Tests

| Check | Target | Result |
|---|---|---|
| `npm run typecheck` | release branch #100 | PASS |
| `npm test` | release branch #100 | 830 tests: 827 pass, 0 fail, 3 skipped (pre-existing) |
| `npm run contracts:check`, `license-inventory --check` | release branch #100 | PASS (artifact 119, bundle 23, engineering 80 files) |
| `npm run test:python` | build tree `7adbbb7` | 54 OK, 1 skipped (marimo NOT_QUALIFIED) |
| `npm run test:engineering-corpus` | build tree `7adbbb7` | node 8/8, Python 11 OK |
| `npm run test:product-loop` | build tree `7adbbb7`, ports rewritten in a copy | 2 passed (contoso-shape-analytics, foil-wind) |
| CI Studio web gate (full suite incl. browser tests) | PR #100 head and `7adbbb7` push | PASS |

## Qualification on the shipped bytes

Headless Chromium 153.0.8010.12, Node 26.9.0, Python 3.14.7 in a fresh venv (pinned `py/service/requirements*.txt` + `duckdb==1.4.3`), ports 24460-24499 and 28460-28499, working copy of the release folder (`sha256sum -c` 7/7 OK). Tokens are redacted in every log.

| Lane | Result | Detail |
|---|---|---|
| Q1 packaged runtime | PASS | `runtime-verify` on the shipped companion 44 PASS, 0 FAIL (safe + demo start). `--profile safe`: health and `/ready` 401 without token, 200 with it (`ready: true`, no token in body); `/compute/*`, `/docs`, `/openapi.json` 404; after stop the port was closed and the PID gone |
| Q2 workbench journey | PASS | JOURNEY-01 on the unzipped zip with the packaged runtime: 1 passed, 18/18 steps; save 4 results and the notebook; reopen 0 `POST /runs`, 0 Jupyter calls, store unchanged; headers equal `_headers` on 3/3 pages; 0 CSP violations; 0 page errors; 0 external requests. Separate: tampered bundle refused `DP-BUN-003`, open view kept (1 passed) |
| Q3 SDK consumer | PASS | SDK tarball npm-installed in a consumer under `%TEMP%`; installed engineering files equal `sdk-release.json`; corpus 59/59 (11 accept, 48 reject), 17/17 c14n vectors, companion Python 59/59; legacy 0.8.1 artifact byte-exact and valid in TS and Python; `sdk-verify` from the installed package PASS |
| Q4 upgrade/rollback | PASS | `release-rollback-check.mjs` 0.12.0 → 0.13.0 → 0.12.0 → 0.13.0 on both unzipped zips and both companions, one store: 5/5 steps, reopen without recomputation, tampered SQL hash refused then restored. Unknown-cell-kind variant 6/6, kept-aside bytes equal the injected bytes. 0.12.0 folder still 7/7 OK, `SHA256SUMS` `2272ec04…` unchanged |

Deviation: twice, files created under a first `%TEMP%` working folder disappeared during qualification; Q2-Q4 were re-run in a second `%TEMP%` folder. The results above are from that re-run.

## Private delivery

Destination: existing private vault, generic package `datapass-mosaicstudio-sdk`, version path **`0.13.0-7adbbb7`** (new immutable path, pre-granted by the owner rules). Vault URLs, identifiers and names are deliberately not recorded in this public repository.

- Before upload every file URL of the new path answered 404; a known 0.12.0 file downloaded with auth (`2272ec04…`).
- Confidentiality scan (532 files): 0 real hits. Benign only: upstream DuckDB-wasm build paths `/home/runner/...`, `$LOCALAPPDATA` placeholders in `docs/RUNTIME_COMPANION.md`, the recovery folder name in `docs/RECOVERY_2026-10-10.md` (public since 0.10.0), policy sentences, the upstream js-sha256 author e-mail in DuckDB worker bundles.
- Uploaded 2026-10-22T02:50Z, 8 files. Registry sha256 equals the table above for 8/8 files.
- Authenticated re-download into a fresh empty folder: `sha256sum -c` 7/7 OK, `SHA256SUMS` itself `16bfbdbe…`, `sdk:verify` PASS, `runtime-verify --no-start` PASS.
- Anonymous requests: package files 401, project API 404.
- Previous versions untouched: file lists of `0.10.0-e7db854` (1), `0.11.0-0bc8c8c` (6), `0.11.1-3575e6b` (6), `0.12.0-c6f5b97` (8) equal before and after.

## Not run

- Edge, Positron, other browser channels; cross-OS.
- marimo execution in CI and in the release venv (NOT_QUALIFIED; qualified once locally in a temp venv, #98).
- Stock `scripts/release-upgrade-check.mjs`: not applicable (step 5 hard-codes the 0.9.0 → 0.10.0 Jupyter refusal); replaced by the unknown-cell-kind variant (Q4).
- E2E-06 (native agent in T3): NOT_RUN / BLOCKED, history only; gates nothing.
- Cloud: NOT_RUN. Lanes 02 (foil-studio-3d) and 03 (foil-ai) and the combined gates I01-I05: not this lane.

## Known limits, omissions and issues

1. Cancel is cooperative: a model that never checks keeps running; an unconfirmed cancel stays "cancel requested".
2. Coverage (`consumed`, `ignored`, `fixed`) in a run receipt is declared by the producer, not verified by Studio.
3. The 3D selection round trip goes through the part label buttons, not canvas picking.
4. `approval-request` is presentation only; Studio never issues, stores or checks approvals.
5. The standalone viewer header names source commit `7cb3e4d` (built before the squash); its content equals the committed `dist-standalone/concept-viewer.html`.
6. `release-manifest.json` does not list the runtime companion; `runtime-companion.json` and `SHA256SUMS` do.
7. The reused JOURNEY-01 spec still labels its first step "identical to 3575e6b"; the runtime it started was the 0.13.0 companion `py/`.
8. The 0.13.0 → 0.12.0 rollback section of `docs/CONSUMING.md` is worked out from the sources; Q4 then ran the rollback check on the shipped bytes (PASS).
9. Licence inventory: nine unpinned transitive Python packages resolve to newer versions; licences unchanged, review list still 3.
10. Licence and any public publication remain an owner gate. Release 0.12.0 and its folder are unchanged.

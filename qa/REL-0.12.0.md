# REL 0.12.0 — release receipt (DataPass MosaicStudio)

Minor release of 2026-10-16, lane `01-mosaicstudio`: the approved V2 block F201-F213 plus the CSP-1 fix (#77, zod `jitless`). Built from the exact commit **`c6f5b97bfa3e4d80a4844e7f82470d1ff9159d9b`** (squash of #94, "release: DataPass MosaicStudio 0.12.0 (V2: F201-F213)"). In the detached build worktree `git rev-parse HEAD` gave that commit (tree `76eeae05b5f79dcd65fa031af7ccc4a41e7b326f`), `git status --porcelain` was empty before and after `npm ci`, the build, the packing, the manifest and the verify steps, and `sdk-release.json`, `runtime-companion.json` and `release-manifest.json` record `sourceTreeClean: true`. CI: PR head `0ecd067` passed [Studio web gate run 38933904200](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/38933904200) (check `web`, success); the push of `c6f5b97` passed [run 38936093714](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/38936093714).

Scope: the release was re-qualified end to end on the shipped bytes (workbench zip, SDK archive, runtime companion), not inferred from 0.11.1. Nothing was tagged, publicly published or deployed; no licence decision. All data synthetic. **T3 is not a dependency** (owner, 2026-10-16): nothing below needs or contacts T3, and E2E-06 (native agent in T3) stays NOT_RUN/BLOCKED as history only.

## What changed since 0.11.1 (`3575e6b..c6f5b97`)

- **V2 features**, all squash-merged on green CI (status per feature: [`handoff/01-mosaicstudio/v2-night-2026-10-16/STATUS.md`](../handoff/01-mosaicstudio/v2-night-2026-10-16/STATUS.md)): F203 run-state vocabulary (#81), F204 StorageAdapter facade (#80), F209 diagnostic codes TS + Python (#82), F201 Python runtime companion archive (#83), F202 ComputeAdapter (#84), F213 client status (#85), F205 cross-tab conflicts (#86), F210 doctor (#87), F206 durable site runs (#88), F211 `datapass` CLI (#89), F207 A/B survives reopen (#90), F208 provenance bundle `datapass.bundle` v1 (#91), F212 product loop on two consumers (#92).
- **CSP-1** (#77): `src/main.tsx` sets zod `jitless: true` before any module loads, so the eight bundled zod 4 copies no longer probe `new Function` under the shipped CSP. Policy unchanged.
- Contracts: added `spec/bundle/v1/bundle.schema.json` and `docs/contracts/diagnostic-codes.json`; `docs/contracts/client-profile.schema.json` gains the client `status` field (F213). `src/workspace/persist.ts` is byte-identical to 0.11.1 (0.10 READY pin).
- Workbench `dist/`: 112 → 117 files. 51 unchanged, 1 changed (`index.html`), 65 added, 60 removed; every added or removed file is a renamed hashed bundle under `assets/` (new chunks include `BundleExport`, `bundle`, `kv`, `result-store-client`, `run-state`, `validate`; `guards-*.js` dropped). `_headers` is unchanged from 0.11.1.
- SDK archive: 347 → 385 files, 38 added, 0 removed (`src/framework/compute|diagnostics|storage/*`, `BundleExport.tsx`, `DurableRuns.tsx`, `SavedComparison.tsx`, `bundle.ts`, the bundle schema, `scripts/datapass.mjs`, `doctor.mjs`, `runtime-pack.mjs`, `runtime-verify.mjs`, `make-bundle-corpus.mjs`, `docs/RUNTIME_COMPANION.md`, `DIAGNOSTIC_CODES.md`, `contracts/diagnostic-codes.json`, `recipes/bundle.md`). Shared files whose content changed were not counted.
- New artifact: **runtime companion** `datapass-runtime-companion-0.12.0.tar.gz` (11 files, service `datapass-artifact-service` 0.4.0, 7 pinned requirements), first delivered with this release.
- Standalone viewer: content changed, same byte size as 0.11.1. Full lists: [`REL-0.12.0/diff-vs-0.11.1.json`](REL-0.12.0/diff-vs-0.11.1.json).

## Distribution

Local release folder (owner machine, not committed): `<releases>/datapass-mosaicstudio/0.12.0-c6f5b97/`. `sha256sum -c SHA256SUMS`: 7 of 7 OK.

| File | Bytes | sha256 |
|---|---:|---|
| `datapass-mosaicstudio-sdk-0.12.0.tar.gz` | 789,228 | `405921afe5230da53eded7ae624d421c4a9ae708c3298e7b368f063f53d0a352` |
| `datapass-mosaicstudio-workbench-0.12.0.zip` | 20,642,967 | `1eb9789b7d7b4b251e8e86a5fe22d8ce095cf9b0e5db9ef16837be148ef09a25` |
| `datapass-runtime-companion-0.12.0.tar.gz` | 41,390 | `b4c1614d02a72dc07d29a8966d6387b9843b31ce9bd5ee70710559e9201d5f87` |
| `concept-viewer.html` | 974,386 | `d98d78cd2f74e69ce9c19069ffa6e9c99512d143af1aaf3503f429a6c6159b81` |
| `sdk-release.json` | 65,447 | `49a1c3b04b153a6c4f93d88fc02565d5f39370306dea795adcf62116d60e00e3` |
| `runtime-companion.json` | 4,198 | `cf846106d316e56d0f8acfed585c5b5689e94069ece009070686a3070ff9fc16` |
| `release-manifest.json` | 20,818 | `443079233befef078cd608466a271f86fb857cfad3b68896494a7cbe080fa4ae` |
| `SHA256SUMS` | 668 | `2272ec0445324e5762d9f254b8bdbeeef0b8e5f9c69048248281149bd600fabd` |

- `sdk-release.json` and `runtime-companion.json`: `sdkVersion 0.12.0`, `sourceCommit c6f5b97…`, `sourceTreeClean true`. `sdk:verify` on the release folder: 385 files, 1 standalone file, 3 contracts. `runtime-verify --no-start` on the release folder: PASS.
- Release manifest trees: workbench `a4398207543776c3…` (117 files, 90,759,990 bytes), concept-viewer `16f267980ff889c5…` (974,386 bytes), SDK `f27ceb454962f936…` (3 files, 1,829,061 bytes). The manifest script does not cover the companion; its hashes are in `runtime-companion.json`, and `SHA256SUMS` covers both.
- Workbench zip: the deterministic recipe of [`FIN-0.11.0.md`](FIN-0.11.0.md) (Python `zipfile`, sorted paths, prefix `datapass-mosaicstudio-workbench-0.12.0/`, no directory entries, 1980-01-01, mode 0100644, deflate 9). The script was first checked against 0.11.1: re-zipping the unzipped 0.11.1 zip gave its exact bytes (`652677ce…`). 0.12.0 built twice: identical sha256 `1eb9789b…`.
- Build steps: `npm ci` exit 0 (10m12s; known npm 11 esbuild postinstall warning), `npm run build` exit 0 (2m04s; App chunk over 2000 kB warning), `sdk:pack` 385 files, `sdk:verify` PASS, `runtime-pack` 11 files, `runtime-verify` PASS (11.8 s: extracted outside any checkout, health OK, 401 without token, 404 for an absent artifact dir, one ILLUSTRATIVE run of 8 rows, `datapass.artifact` v1).

## Tests

| Check | Target | Result |
|---|---|---|
| Unit suite `node --test tests/*.test.mjs` | release branch #94 | exit 0, about 797 passing (incl. release-0.10, sdk-release, doctor, runtime-companion, preview-contract) |
| `typecheck` (after `npm run bootstrap`) | release branch #94 | PASS |
| `npm run contracts:check` | build tree `c6f5b97` | PASS (contracts match sources, both concept examples OK, artifact corpus 119 files, bundle corpus 23 files) |
| `license-inventory --check` | build tree `c6f5b97` | PASS: 792 npm packages, 27 to review |
| `npm run test:python-runtime` / `npm run test:python` | build tree, companion venv first on PATH | 49 OK / 40 OK, 0 failed, 0 skipped |
| `sdk:verify` | release folder, `datapass verify`, authenticated re-download | PASS all three (385 files, 1 standalone, 3 contracts, commit `c6f5b97bfa3e`) |
| `runtime-verify` | build tree output, release folder (`--python <venv>`), release folder `--no-start` | PASS all three |
| CI Studio web gate (full suite incl. browser tests, client builds, SDK archive check) | PR #94 head and `c6f5b97` push | PASS |

## Qualification on the shipped bytes

Three qualification lanes, headless Chromium 153.0.8010.12 only, Python 3.14.7 in fresh venvs with the pinned `py/service/requirements*.txt` and `duckdb==1.4.3`, dev ports 24390-24459 and 28400-28459. Release folder `sha256sum -c` 7 of 7 OK before each lane. Runtime and Jupyter tokens are redacted in every log.

### Q1 — installed workbench: PASS

| Check | Result | Evidence |
|---|---|---|
| Static `_headers` smoke on the **unzipped release zip** | PASS | served CSP equals `_headers`; runtime connected through the consent; loopback `ws://` not CSP-blocked; non-loopback fetch blocked by `connect-src` |
| JOURNEY-01 under `_headers` (`qa/REL-0.11.1/journey01-headers.spec.ts`, runtime and Jupyter Server 2.21.1 from the **companion** `py/`, `DATAPASS_REQUIRE_JUPYTER=1`) | PASS, 1 passed (46.2 s), 15 of 15 steps | save "4 results and the notebook" with sha256 checked; reopen 4 cells, "Not recomputed", 0 `POST /runs`, 0 Jupyter calls, store hashes unchanged; served headers equal `_headers` on 3 of 3 documents; **0 CSP violations** (16 on the 0.11.1 zip: CSP-1 fixed); the only CSP console lines are the 2 deliberate `192.0.2.1` probe reports; cross-app re-export `6d896cd3…`, as in 0.11.1 |
| Security | PASS | journey: 0 page errors, 0 dialogs, 0 external requests, Jupyter token not in service logs. Probe: no token 401 on health, models, `POST /runs` and the notebook store; wrong token 401; foreign Origin with the token 403; token in the query string 401; non-loopback `Host` 400; no `0.0.0.0` bind. The runtime token appears once, by design, in the local "DataPass runtime ready" connect line, never in request logs |
| No T3 | PASS | 0 T3 processes before and after; no T3 endpoint contacted; grep over workbench, SDK and companion finds only a WebGL constant false positive and minified identifiers |

Evidence: [`REL-0.12.0/journey01/`](REL-0.12.0/journey01/) (journey log, exports with their hashes, reopen screenshot), [`REL-0.12.0/security/`](REL-0.12.0/security/).

### Q2 — SDK, CLI and clients: PASS

| Check | Result | Evidence |
|---|---|---|
| JOURNEY-02 from the extracted SDK (fresh non-git folder) | PASS | `npm ci`, `bootstrap` (3 upstreams pinned), `datapass new release-check --family content` (framework files hash-identical before and after), `check` "Client OK: release-check / 1 pages / 0 datasets / prototype", `context`, `new` again over the same id refused (exit 1, no overwrite), `build` ("No deployment was performed"), `preview-validate --check-files` (9 files re-hashed); served page at 1440x960 and 390x844: HTTP 200, 0 console errors, 0 external or failed requests, 0 px overflow |
| `datapass` CLI | PASS | `--help`/`help` list 10 commands; unknown command exits 2; `doctor` 12 pass, 1 warn (global Python not a venv), 0 fail, 2 skip; `doctor --python <venv>` 13 pass, 0 warn; `doctor --json` gives `datapass.doctor` v1; `doctor --ci` exit 0 |
| 10 selected-client builds (8 public references, `contoso-shape-analytics`, `foil-wind`) | PASS, 10 of 10 exit 0 | no `.wasm` in any build; no cross-client source path; Three.js / `WebGLRenderer` only in wind, energy-replay, experience and model references; each `preview.json` has `sourceCommit c6f5b97`; status `reference` for the 8 public references, `prototype` for the two others; all 10 pages at 1440 and 390 wide: HTTP 200, 0 console errors, 0 px overflow |
| F213 missing status refused | PASS | `check` and `build` exit 1 with `DP-CLI-001`, no output produced; `reference` on a non-public client refused |
| Runtime companion install and start (outside any checkout) | PASS | health 401 without token, 200 with it (`datapass.runtime/1`, service 0.4.0, `illustrative: true`); `POST /runs` without token 401 |

Evidence: [`REL-0.12.0/sdk-clients/`](REL-0.12.0/sdk-clients/) (client build table, JOURNEY-02 browser result and screenshot).

### Q3 — A/B, product loop and rollback: PASS (one stock script not applicable)

| Check | Result | Evidence |
|---|---|---|
| F212 `npm run test:product-loop` | PASS, 2 passed (contoso-shape-analytics 30.3 s, foil-wind 39.9 s) | saved result hashes identical after producer restart, "Not recomputed", 0 runtime run requests after reopen |
| F207 A/B survives reopen | PASS | `ab.sameAfterReopen` true for both consumers (contoso total margin 21,045.6 → 20,168.7, −876.9) |
| F208 bundle export and re-import | PASS | bundle valid in TypeScript and Python for both consumers, token-free; `tests/browser/bundle-export.spec.ts` 2 passed (same hashes on re-import, tampered bundle refused keeping the view) |
| F205 cross-tab conflict | PASS | `tests/browser/workspace-conflict.spec.ts` 1 passed |
| Rollback 0.11.1 → 0.12.0 → 0.11.1 → 0.12.0 (`release-rollback-check.mjs`, both unzipped release zips, one persistent profile and store) | PASS | every `results/*.json` hash identical after every step; reopen without recomputation in steps 2-4; tampered SQL hash refused ("nothing was opened"), then restored |
| Stock `release-upgrade-check.mjs` | **NOT APPLICABLE** (step 5 fails) | the script hard-codes the 0.9.0 → 0.10.0 expectation that the old build refuses Jupyter cells; 0.11.1 already supports them and 0.12.0 adds no cell kind, so 0.11.1 opens the 0.12.0 workspace normally. Steps 1-4 pass. Not a product failure |
| Unknown cell kind kept aside (variant of the upgrade script, not committed) | PASS | 0.12.0 refuses a synthetic `hologram` cell and keeps its bytes aside unchanged (sha256 equal to the injected bytes); 0.11.1 then loads the same profile and the kept-aside bytes are still unchanged |
| 0.11.1 folder integrity | PASS | 5 of 5 OK; `SHA256SUMS` sha256 still `3548a06e…` |

Deviation: the product loop hard-codes its ports, so it ran in a working copy with ports rewritten and the two consumers rebuilt there; test logic and tree otherwise equal `c6f5b97`. The 0.11.1 side of the rollback used `py/` from `git archive 3575e6b` (0.11.1 shipped no companion). Evidence: [`REL-0.12.0/ab-rollback/`](REL-0.12.0/ab-rollback/) (loop receipts, rollback record and screenshot, both upgrade records).

## Private delivery

Destination: the existing private vault (pre-granted for a new immutable path, owner rules V5.7 of 2026-10-13). Generic package `datapass-mosaicstudio-sdk`, new version path **`0.12.0-c6f5b97`**, 8 files. Vault URLs and identifiers are deliberately not recorded in this public repository.

- Before upload every file URL of the new path answered an authenticated 404 (a known 0.11.1 file answered 200), and the upload sent a HEAD before each PUT, ready to stop on an existing file.
- Confidentiality scan before upload (518 files: SDK 385, workbench 117, companion 11, 5 loose files): no secret, token, key, Windows user path, owner e-mail, vault name or id, transcript or client data. Benign hits only: `$LOCALAPPDATA` placeholder install paths in `docs/RUNTIME_COMPANION.md`, the recovery folder name in `docs/RECOVERY_2026-10-10.md` (public since 0.10.0), policy sentences, and the upstream js-sha256 author e-mail in the DuckDB worker bundles.
- Uploaded 2026-10-16T17:40Z-17:41Z. The registry's `file_sha256` equals the table above for 8 of 8 files.
- Authenticated re-download into a fresh empty folder: `sha256sum -c SHA256SUMS` 7 of 7 OK, `SHA256SUMS` itself `2272ec04…`, `sdk:verify` PASS.
- Anonymous requests: package files HTTP **401**, project API HTTP 404.
- Previous versions untouched: registry file lists for `0.10.0-e7db854` (1 file), `0.11.0-0bc8c8c` (6) and `0.11.1-3575e6b` (6) are equal before and after the upload.
- No tag, public publication, Marketplace or deployment.

## Not run

- Negative test that the workbench makes no runtime call before the Connect click (the consent was exercised positively in every journey open).
- Edge, Positron or other browser channels; cross-OS; real user profiles.
- E2E-05 joint run (Contoso Gold → Mosaic → React on one SHA set): optional evidence, not a release gate.
- **E2E-06 (native agent in T3): NOT_RUN / BLOCKED, kept as history only.** It gates nothing in 0.12.0 or later.

## Omissions and known issues

1. The standalone viewer header names source commit `9a9c0212ca2d` (built on the release branch before the #94 squash), not `c6f5b97`; the viewer sources are identical and the release copy equals the committed `dist-standalone/concept-viewer.html`. Same kind of omission as 0.11.1 (omission 2 there).
2. `release-manifest.json` does not list the runtime companion (the script does not cover it); `runtime-companion.json` and `SHA256SUMS` do.
3. The reused JOURNEY-01 spec still labels its first step "identical to 3575e6b"; the runtime it started was the 0.12.0 companion `py/`.
4. `datapass new` with no id and `datapass context <unknown>` exit 1 with a raw Node stack trace instead of a short message (same as the npm scripts). The `datapass` bin is not linked inside the SDK folder; `node scripts/datapass.mjs`, as documented, works.
5. The licence inventory was regenerated from a fresh venv: eight unpinned transitive Python packages resolve to newer versions; licences unchanged, review list still 3.
6. Carried and unchanged: lineage table layout on `?artifact=1`, npm 11 esbuild postinstall warning, App chunk over 2000 kB, E2E-05 PARTIAL.
7. Licence and any public publication remain an owner gate. Release 0.11.1 and its folder are unchanged.

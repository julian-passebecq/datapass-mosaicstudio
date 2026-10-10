# FR-07 Ship the SDK and browser application (0.10.0)

Packet `galaxy-full-release-2026-10-10/01-mosaicstudio`, branch `claude/full-release-packaging` from `origin/main` `4a723bb` (FR-01..FR-06 merged). Release commit (all code and `docs/`, the content of every output below): **`ec8d1f3c85a10d3ad943fc5deecb939c20439d0c`**. Later commits on the branch add only `qa/` and `handoff/` files, which are not part of the SDK archive or any build.

Windows 11 Pro 10.0.26300, Node 26.9.0, npm 11.19.1, Python 3.14.7 (venv under `%TEMP%` with `py/service/requirements.txt`, `requirements-jupyter.txt` and `duckdb==1.4.3`), Playwright 1.63.0 with Chromium 153.0.8010.12, Microsoft Edge 154.0.4258.62, Positron 2026.10.0 build 297. Everything below used synthetic data.

## What changed in the repository

- `package.json` and `package-lock.json`: version 0.10.0. Nothing else in the lock changed.
- `dist-standalone/concept-viewer.html` regenerated from a clean tree. Besides the 0.10.0 header it now contains FR-01's Unicode text-length guard (`src/framework/guards.ts`): the committed viewer had been built before FR-01 merged, so its inline script and CSP hash were stale.
- License honesty: `scripts/sdk-pack.mjs` and `docs/CONSUMING.md` said "private repository", which is false (the GitHub repository is public). They now say that no license is granted and that public SDK publication is NOT_AUTHORIZED. No license was chosen or invented.
- `scripts/license-inventory.mjs` writes `docs/licenses/third-party-inventory.json` and `docs/licenses/THIRD_PARTY_INVENTORY.md` from `package-lock.json` (lockfile v3 records each package's declared license) and from `importlib.metadata` of the pinned Python venv. `--check` compares the npm section with the lock; `tests/release-0.10.test.mjs` runs that comparison.
- `tests/browser/release-qualification.spec.ts`: the first useful task on the production build (blank start, a DuckDB SQL cell, autosave, reload) and the committed standalone viewer over `file://` (identifies 0.10.0, renders, makes no network request). It runs in CI with the rest of the suite.
- `playwright.config.ts`: optional `PW_CHANNEL` (for example `msedge`) for local native-browser runs; CI leaves it unset.
- `scripts/release-upgrade-check.mjs` (executed upgrade/rollback), `scripts/qualify-positron.mjs` (Positron Viewer check) and `scripts/release-manifest.mjs` (sha256 of every output, with a reproducibility comparison).
- `tests/release-0.10.test.mjs`: one version everywhere, no invented license, the inventory matches the lock, READY hashes equal the committed contract bytes, OUTCOME keeps every original row and leaves publication and Fabric off, `RELEASE_0.10.md` maps every row and journey.
- Docs: `docs/RELEASE_0.10.md`, the 0.9.0 → 0.10.0 upgrade and rollback notes in `docs/CONSUMING.md`, a 0.10.0 pointer in `README.md`.

## Release outputs (built from `ec8d1f3`)

Built in this worktree with `npm run build`, `npm run sdk:pack`, `npm run sdk:verify -- dist-sdk` and `npm run build:client -- <id>` for the eight public reference clients, then hashed with `node scripts/release-manifest.mjs`. The tree hash is the sha256 of the sorted `sha256  path` lines of every file in the output.

| Output | Files | Bytes | Tree sha256 |
|---|---|---|---|
| SDK archive `datapass-mosaicstudio-sdk-0.10.0.tar.gz` (335 files inside) | 1 | 659,948 | archive sha256 `b90dfab704f9d9af41729b44afc1c9faf303fff63db8de7352346cff959e45fd` |
| SDK release folder `dist-sdk/` (archive, viewer, `sdk-release.json`) | 3 | 1,691,271 | `d484d1d8c036f897c9388d8f08ab2b60d5fc39911695545e6ee42bea3bec50ce` |
| Browser workbench `dist/` | 112 | 90,672,787 | `f840b4cadee594cce236764f7d6febad1e5065887750804b8145460886be0f99` |
| Standalone concept viewer (file sha256 `9fd78f03cf8f7c1a2a59af68c16ad044590c401fa7a63eb81a5678205239a4e7`) | 1 | 974,316 | `0a68095e0b5d3858b21c389237880de1559b63b24290609e8e7c416fc4b6423e` |
| `dist-clients/architecture-reference` | 18 | 778,699 | `0491473fa99c7fb06d17ab65e950544e8305174e72cfd0d303992c28b78f958e` |
| `dist-clients/energy-replay-reference` | 20 | 1,154,507 | `55ba762c6c34115b97d0dec270d67768486ffffc4d9a5b1794033e713ed7c7be` |
| `dist-clients/experience-reference` | 28 | 1,543,646 | `f447ac427bb3651ce11242794cee6e9b397a3cd6e5695930829e8d68f762eed7` |
| `dist-clients/foundation-reference` | 18 | 678,537 | `8df40efa27b37ec78bd0ed05606091bcbfca2b5c6b78609bf1d8dd73225653bf` |
| `dist-clients/model-reference` | 17 | 1,219,675 | `2a687a83dddf37ec8522b058cf69651e3134c1fcef7ad7e43d317cb7e99b5efe` |
| `dist-clients/motion-reference` | 14 | 543,368 | `68aaf1b97b0b68fed3e092f63f72e21bb0fd25ac95163b745cb8d600d6a44ced` |
| `dist-clients/operations-reference` | 13 | 612,708 | `99e443f2338fa73d06c4d288ccd86da9465e395da5663f05c0db04dfa989c54a` |
| `dist-clients/wind-reference` | 16 | 1,143,307 | `a60913a0bc68ac6ed4e9d2c3153b2de9697efb9d63d01aad145971def90289d5` |

The binaries and the full per-file manifests stay in the owner's local evidence folder (`FR-07/outputs/`, `FR-07/manifest-worktree/`, `FR-07/manifest-clean/`); only these hashes are committed.

**Reproducibility and clean install.** A fresh `git clone` of the pushed branch in `%TEMP%`, detached at `ec8d1f3`, ran `npm ci` (352 s), `npm run build` (439 s), `sdk:pack` + `sdk:verify` and the eight client builds. Its manifest compared with the worktree manifest: **all 11 outputs IDENTICAL**, byte for byte, including the SDK archive hash. On the same machine, the same commit gives the same bytes. A build on another OS or Node version was not compared. The clone then ran `tests/browser/release-qualification.spec.ts` against its own `vite preview` on port 24175: 2 passed.

## Upgrade from 0.9.0 and rollback (executed)

`node scripts/release-upgrade-check.mjs --old <0.9.0 checkout> --new <0.10.0 checkout> --port 24180`. The 0.9.0 checkout is a `git archive` of `6f45dd0` with `npm ci` and `npm run build`. Both builds are served in turn by their own `vite preview` on the same origin, with one persistent browser profile that is closed between steps (Playwright Chromium). Result: **PASS**, six steps:

| Step | Served | Observed |
|---|---|---|
| 1 | 0.9.0 | Blank workspace, a SQL cell run (42), autosaved |
| 2 | 0.10.0 | Upgrade: same cell text restored, runs again, no notice, nothing kept aside |
| 3 | 0.9.0 | Rollback with SQL cells only: restored unchanged |
| 4 | 0.10.0 | A Python (Jupyter) cell added and autosaved (cells `sql,jupyter`) |
| 5 | 0.9.0 | Rollback refuses the unknown cell kind with the documented notice, opens blank, and keeps the 0.10.0 document under `datapass.workspace.rejected` with the same sha256 (`03bbb232…`) |
| 6 | 0.10.0 | That kept-aside document imported back with *Import workspace*: both cells return |

Screenshot of step 5: `qa/FR-07/rollback-0.9.0-keeps-aside.png`. Full record with per-step storage hashes: local evidence `FR-07/upgrade-chromium/upgrade-rollback.json`.

## Windows browser qualification

Port-rewritten copies (4173 → 24173, runtime 28798, `DATAPASS_SERVICE_ORIGINS` set to the page origin) of release-qualification, concept-standalone, consumer-interop, workbench-notebook (UX01, UX02, UX04) and workbench-jupyter (E2E-01 and its negative tests), 20 tests, against the production build of the same code.

| Run | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|
| Chromium, first | 17 | 2 | 1 | UX02 and UX04 could not reach the runtime: the port-rewritten page origin was not in the service's CORS list. This was a harness setting (`DATAPASS_SERVICE_ORIGINS`), not a product change; the rerun with it set passed 3/3 |
| Edge (`PW_CHANNEL=msedge`) | 18 | 1 | 1 | E2E-01 interrupt step: the kernel was still `running` 60 s after Interrupt. The rerun of E2E-01 alone passed 1/1. FR-02 recorded the same symptom once under full CPU; cause not established |
| Chromium, final | 18 | 1 | 1 | consumer-interop *embed fit*, 3D at 1280x760: the probe never returned within 30 s (`last verdict: (not run)`). It passed in the two other runs, and its rerun passed. FR-04 recorded the same once; cause not established |

The skipped test is FR-04's private qualification, which needs the owner's local real exports. The PC was shared with other sessions (about 48 node processes) during these runs. The two intermittent failures both involve a CPU-bound step: a kernel interrupt, and a WebGL frame under SwiftShader. Committed screenshots of public synthetic views: `qa/FR-07/edge-workbench-sql.png`, `qa/FR-07/edge-concept-viewer-file.png`.

## Positron (native host, no VSIX)

`node scripts/qualify-positron.mjs --url http://127.0.0.1:24190/` against `vite preview` of the same build. Positron 2026.10.0 (code 1.134.0, commit `73a7e19e`), driven by Playwright's Electron driver with a fresh `--user-data-dir` and an empty `--extensions-dir`. The script ran *Viewer: Open URL in Viewer*. The workbench loaded in the Viewer frame (`?_positronRender=0`), DuckDB-WASM reported ready, and a SQL cell returned 42. **PASS.** On first start, Positron installed its own 14 bundled extensions into the fresh profile (Ruff, Jupyter, Pyrefly, Quarto, Posit tools and others). None is a DataPass or Mosaic extension, and `datapass-mosaic-vscode` was neither installed nor read. Screenshot: `qa/FR-07/positron-viewer-sql.png`.

## Unit, contract and Python tests (local, release code)

- `npm test`: 653 tests, 650 pass, 1 skipped, 2 fail. The 2 failures are the READY/OUTCOME checks of `tests/release-0.10.test.mjs`, run before those hand-off files were written. The rerun after they were committed is in `receipts/FR-07.json`.
- `npm run typecheck` (inside `npm run build`): clean. `npm run contracts:check`: no drift.
- `npm run test:python`: 20 OK. `npm run test:python-runtime`: 38 OK.

## License and third-party inventory

- This repository: no LICENSE/COPYING file and no `license` field, in the tree or in its history (`git log --all` for those paths and for the field). **Public SDK publication: NOT_AUTHORIZED** until the owner decides a license. Upstream VizForge and ConceptMotion sources: no license found (`THIRD_PARTY_NOTICES.md`), so no separate grant either.
- npm: 792 packages, 611 in the production tree. 27 are flagged for review:
  - `@img/sharp-*` libvips binaries (LGPL-3.0-or-later), native Node tooling pulled in by `ndarray-pixels`, never bundled into browser output;
  - `json-bignum` (declares no license; used by `apache-arrow`);
  - `lightningcss` (MPL-2.0, development only).
- Python: 90 distributions in the pinned venv. 3 are flagged for review: `certifi` and `fqdn` (MPL-2.0), `nest-asyncio2` (declares only "BSD"). They are installed by the user for the optional local service and are not shipped in any build or archive.

## Omissions

- Nothing was tagged, released, published, uploaded or deployed. Public distribution and the Fabric runtime stay NOT_AUTHORIZED.
- Builds were compared on one Windows machine only; a cross-OS byte comparison was not done. CI builds on ubuntu as its own check.
- The merged-main SHA and the post-merge CI belong to the verify step; `OUTCOME.json` leaves `final_main_sha` null.
- UX03 (new light client with a concept and a motion scene, then standalone with source links) was not re-executed; it stays PARTIAL from 0.9.
- E2E-05, E2E-07 and E2E-08 (cross-product) were not executed. E2E-06 is BLOCKED on T3.

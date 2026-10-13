# FIN 0.11.0 — release receipt (DataPass MosaicStudio)

Finition pass of 2026-10-13, lane `01-mosaicstudio`. This receipt records a **local, private** release build of **0.11.0** from the exact commit **`0bc8c8c5b872b1d2a12ae8dcd054acc9e792b085`** (squash of #66, "release: DataPass MosaicStudio 0.11.0"). `git rev-parse HEAD` in the build worktree gave that commit and `git status` was clean; `sdk:pack` recorded `sourceTreeClean: true`. CI on that commit: [Studio web gate run 38458744785](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/38458744785) (push, success).

Nothing was tagged, published, uploaded, pushed as a release or deployed. No licence decision was made. `private_delivery` is **STAGED**: the files sit in the owner's local release folder and have not been placed in any vault.

Everything below used synthetic data only (the in-repo fixtures `tests/fixtures/sample.csv`, `tests/fixtures/interop/contoso-shape.synthetic.artifact.json`, `react-shape.synthetic.concept.json`, and the `wind-reference` allowlisted model).

## Distribution

Local release folder (owner machine, not committed): `<releases>/datapass-mosaicstudio/0.11.0-0bc8c8c/`. `sha256sum -c SHA256SUMS`: 5 of 5 OK.

| File | Bytes | sha256 | Note |
|---|---:|---|---|
| `datapass-mosaicstudio-sdk-0.11.0.tar.gz` | 678,205 | `dc2c374ebac661b0fc27aab701f063fb3c8b403df12fc6de28a220bb1d89405d` | SDK archive, 339 files; `sdk:verify`: 339 files, 1 standalone file, 3 contracts |
| `sdk-release.json` | 57,662 | `645e477fc0ac4bc8b37b384d371df1fda759b5adbfa88d00542e26bde7f29bfe` | `sdkVersion 0.11.0`, `sourceCommit 0bc8c8c…`, `sourceTreeClean true` |
| `concept-viewer.html` | 974,386 | `caf2a1269cadc9ccafe403471d1d1eee6201f5849f9ac1e89503610d21ea1a0e` | committed `dist-standalone/concept-viewer.html`, byte-identical to the copy `sdk:pack` hashed |
| `datapass-mosaicstudio-workbench-0.11.0.zip` | 20,612,885 | `98df8537d96aee9fe26b75f7d14a64af09b64a4cfebe85749550df576d452072` | `npm run build` `dist/`: 112 files, 90,690,806 bytes, tree sha256 `a48342ab9472871a…`; deterministic zip (sorted paths, 1980-01-01, mode 0644, deflate 9), rebuilt to identical bytes |
| `release-manifest.json` | 20,011 | `bef9ce37468ece3634c5320101d887c682ad2cc73d97dae50601da8ed195ad52` | `node scripts/release-manifest.mjs` on the clean tree: workbench tree `a48342ab9472871a…`, concept-viewer tree `624816a4458ed04c…`, SDK 3 files 1,710,253 bytes tree `6da45fe9b26c0915…` |
| `SHA256SUMS` | 472 | — | covers the five files above |

The repository has no zip script; the workbench zip was made with Python `zipfile` by a small script kept in the local evidence folder.

## Pins

| Layer | Pin |
|---|---|
| Product | DataPass MosaicStudio **0.11.0** (`package.json`), SDK `sdkVersion 0.11.0` |
| Source | `0bc8c8c5b872b1d2a12ae8dcd054acc9e792b085` (canonical source = package source) |
| Package | SDK archive sha256 `dc2c374ebac661b0fc27aab701f063fb3c8b403df12fc6de28a220bb1d89405d` |
| Upstream engines (bootstrap) | VizForge `7aaa8fa`, ConceptMotion `30e6963`, sqlrooms-examples `cb3b6d0` |

Contracts (file sha256 at `0bc8c8c`; the first three are the ones `sdk-release.json` records):

| Contract | Source file | sha256 |
|---|---|---|
| `datapass.artifact/1` | `src/framework/foundation/artifact.ts` (SDK contract file) | `cfcbb43700034148d71a21079063e41b313f1819b04fb550bf888035f1b8856f` |
| `datapass.artifact/1` | `docs/contracts/artifact.schema.json` (JSON Schema) | `74aee5fe7d5b4fc7bab2e51620e9a5948aefa793a59b14c08ae221bf5fb4cb05` |
| `datapass.artifact/1` | `py/datapass_artifact.py` (Python validator, not in the SDK) | `d6621c7f37ea723c538009fcf3d237afa88a4a2e9a25e1248815da9eb226d795` |
| `datapass.concept-spec/1` | `spec/concept/v1/concept-spec.schema.json` | `951197aab0c623e4603605c297e2a261b7551fdb6a088fcc1a2070b3d975782b` |
| `datapass.preview/1` | `spec/preview/v1/preview.schema.json` | `ede4a49842b47c76bada4d94c74bfb48adf0d2c887bfc43d000314f03bf194b2` |
| `datapass.workspace` v1 | `src/workspace/persist.ts` (no separate schema file; validation lives in source) | `12421daa471bfc5fa397fb1e818e8deca20c06f8320a2eb488d5272743c40b3f` |

## Verdicts

| Requirement | Verdict | Evidence |
|---|---|---|
| FIN-01 Contract closure | **PASS** | Audit of `4623b04`: nine modules `status:'implemented'` (`src/core/host.ts`), nineteen `Block` kinds (`src/framework/types.ts`) matching `docs/PRODUCT_INVENTORY_0.9.md`; engines unchanged (VizForge, ConceptMotion, React Flow, Three.js, SQLRooms/Mosaic, D3). `tests/contracts.test.mjs` passes. #65 and #66 touched only the notebook, result store and docs. |
| FIN-02 Usable authoring | **PASS** | JOURNEY-01 on `4623b04` found JOURNEY-BUG-1 (leaving the Notebook reset results and shut the kernel) and JOURNEY-GAP-1 (allowlisted-model results not in the result store). Both fixed in #65 (`5090bd0`, CI web pass) with a new browser test; JOURNEY-01 then passed on the installed 0.11.0 build. |
| FIN-03 Interop | **PASS** (local scope) | `contracts:check`, `test:artifact-corpus` (115 files), `py/test_datapass_artifact.py` 14/14, preview fixture valid. TS and Python validators agree on provenance and dependsOn checks. `docs/CONSUMING.md` now maps Studio provenance terms to verified/inferred (nothing maps to verified). E2E-01 reused at its SHA; E2E-05 NOT_EXECUTED and E2E-06 BLOCKED as before (need the Contoso pipeline / React trace and a T3 agent). |
| FIN-04 Old work | **PASS — nothing to integrate** | See below. |
| FIN-05 Final distribution | **PASS** | A new immutable 0.11.0 version was built from `0bc8c8c` (contains #65) rather than claiming equivalence with the earlier SDK archive. SDK archive + manifest, standalone viewer and workbench zip installable outside a checkout (JOURNEY-01/02). |
| FIN-06 Delivery | **PASS (local) / STAGED** | New client from the SDK package (JOURNEY-02), workbench and cross-app import/export (JOURNEY-01). Vault upload not done: needs the owner's grant. Licence and public publication remain a separate owner gate. |
| JOURNEY-01 | **PASS** | Installed workbench zip, see below. 1 passed, 4.1 min. |
| JOURNEY-02 | **PASS** | SDK archive in a fresh folder outside any git work tree, see below. |

### JOURNEY-01 — installed workbench

The release zip was unzipped to a temporary folder and served by a plain Node static server on `127.0.0.1:24311` (no `_headers`). Python runtime on 28821 and Jupyter Server on 28822, from `py/` at `0bc8c8c` (py/ is deliberately not in the SDK), with `DATAPASS_SERVICE_ORIGINS` set to the page origin and `DATAPASS_REQUIRE_JUPYTER=1`. Playwright 1.63.0, Chromium 153.0.8010.12.

1. Blank workspace, consent to the loopback runtime (0 catalog rows).
2. Import `sample.csv` → table `data_1_sample`.
3. Pair the Jupyter kernel.
4. Explicit SQL run; result shows North and 40.
5. Chart and table representations (Rows / total by region / JSON) with no rerun.
6. Export the SQL result as `datapass.artifact` JSON.
7. Approved Python: allowlisted `wind-reference` model run, artifact exported.
8. Jupyter Python published as SQL table `synthetic` (24 rows).
9. Dependent SQL on it plus a chart.
10. Save results to store: "Saved 4 results and the notebook"; each file's sha256 equals its name.
11. Close: context closed, Jupyter stopped, runtime restarted.
12. Open from store: 4 cells, same result sha, "Not recomputed", 0 `POST /runs`, 0 Jupyter calls, store hashes unchanged. The model cell also reopened from its saved sha (the #65 fix).
13. Cross-app import: the synthetic Contoso-shape artifact (sha256 `d652f72e5f2b024304719d5ff1f45e023572727c4af6a8af19dbd22c33805591`) opened at `?artifact=1`: `orchard-monthly-yield`, 12 rows, input hash matches.
14. Re-exported as `datapass.artifact` JSON.
15. The synthetic React-shape concept spec opened in the release `concept-viewer.html` over `file://`: 8 nodes, 0 warnings, 0 network requests.

Totals: 0 page errors, 0 external requests, Jupyter token absent from service logs. `py/datapass_artifact.py` accepted all three exports one by one and as a set:

| Export | Bytes | sha256 |
|---|---:|---|
| SQL result | 1,368 | `7d9c63046edb5a80b2a6e998dc10cebc0d6f725d8256d30e4674495289af5ec5` |
| Python model result | 4,121 | `e6e3ab2fb5c429d825fc8c44639e6f5a5bbb5ff33d7c90bf29070fcbc8488aff` |
| Cross-app re-export | 8,594 | `6d896cd3e9a2215b8db1366629118090016cd5a7924bb6d38fe3e28bd4317e65` |

Screenshot: [`FIN-0.11.0/journey01-reopened-from-store.png`](FIN-0.11.0/journey01-reopened-from-store.png) (step 12).

### JOURNEY-02 — new client from the SDK package

In a fresh temporary folder confirmed not to be inside a git work tree:

1. Untar the archive (exit 0; see omission 3 about Git Bash tar).
2. `node sdk/scripts/sdk-verify.mjs <release folder>`: 339 files, 1 standalone file, 3 contracts, commit `0bc8c8c5b872`.
3. `npm ci` (exit 0, 406 s). 4. `npm run bootstrap` (engines pinned as above).
5. `client:new finition-check --family content`: created, framework files unchanged.
6. `client:check`: "Client OK: finition-check / 1 pages / 0 datasets".
7. `build:client`: exit 0, "No deployment was performed"; `preview.json` 9 files, `sourceCommit null` (expected without `.git`).
8. `preview-validate --check-files`: valid `datapass.preview/1`, all files re-hashed.
9. Served as plain static files on port 24321, opened at 1440×960 and 390×844: HTTP 200, 0 console/page errors, 0 external or failed requests, 0 T3 references, 0 px horizontal overflow. Screenshots inspected.

Screenshots: [`FIN-0.11.0/journey02-new-client-desktop.png`](FIN-0.11.0/journey02-new-client-desktop.png), [`FIN-0.11.0/journey02-new-client-mobile.png`](FIN-0.11.0/journey02-new-client-mobile.png).

## FIN-04 old-work decision

Compared read-only against `origin/main` `4623b04`; **nothing integrated**.

- **PR #45** (`chatgpt/mosaic-v1-20261010`, WIP): its notebook model is superseded by main's tested notebook, Jupyter runtime and result store; its Pyodide self-hosting would add a new engine (not an accepted criterion, and the packet forbids new engines); its workflow duplicates main's recovery pattern. Keeping it open or closing it as superseded is an owner decision.
- **Fabric Bricks snapshot**: committed work is already an ancestor of main. The uncommitted "Fabric concepts map" is an authored teaching schematic, not a source-backed Fabric architecture. It stays **draft**, as main's README and handoff already state; Fabric runtime remains NOT_AUTHORIZED.
- **viz-n1 snapshot**: already an ancestor of main; the only extra content is an unsourced prototype gallery. Stays **draft**.

## Omissions and known issues

1. The release ships the committed `dist-standalone/concept-viewer.html`. Rebuilding it at `0bc8c8c` gives a file that differs only in header metadata (build commit `5090bd0` → `0bc8c8c`, timestamp, source link); the rebuild was reverted so the tree stayed clean.
2. The workbench's shipped `_headers` sets CSP `connect-src 'self' blob:` with no loopback, while `vite preview` allows `http://127.0.0.1:*`. A static host that applies `_headers` would block the loopback runtime and Jupyter. Found by reading the file, not executed; JOURNEY-01 used a server without `_headers`.
3. Docs gap: `docs/GUIDE-0.11.md`'s `tar -xzf <release-folder>/…` fails in Git Bash with a drive-letter path unless `--force-local` is added (Windows `tar.exe` not tried).
4. npm 11 skipped esbuild's postinstall script (allowScripts warning); builds still succeeded.
5. Observed in the JOURNEY-01 cross-app screenshot (step 13), not asserted by the journey: the "Declared lineage" evidence table on the `?artifact=1` page renders in a very narrow column, so its cells wrap character by character. The data is correct; the layout is not. Not fixed in this pass.
6. The 8 reference clients were not rebuilt; no cross-OS reproducibility check; no Edge or Positron run; the cancel/interrupt and module-switch probes were not repeated on the installed build (they are covered by the browser test added in #65).
7. Repo test suites were not rerun locally for the release build; CI on `0bc8c8c` passed.
8. E2E-05 NOT_EXECUTED, E2E-06 BLOCKED (other lanes).
9. Nothing committed to the release folder, nothing pushed as a release, tagged, published or deployed; no licence decision.

## Owner gates

- Licence decision and any public publication of the SDK or sites (NOT_AUTHORIZED today).
- Grant to upload this fileset to the private vault (`private_delivery` stays STAGED until then).

# DataPass MosaicStudio 0.10.0: full-release packet of 2026-10-10

0.10.0 is a **local release**: the version in `package.json`, a reproducible SDK archive, the production browser workbench, the standalone concept viewer and the eight public reference client builds, all hashed and install-tested on Windows 11. Nothing was tagged, published, uploaded or deployed. The binaries stay in the owner's local evidence folder; the repository holds the instructions, the scripts that rebuild and hash them, and the receipts.

- **Public distribution: NOT_AUTHORIZED.** The repository has no license (no LICENSE file and no `license` field, in the tree or anywhere in its history). Public GitHub visibility is not a license. The owner has to decide a license before the SDK or a built site is published. See [`licenses/THIRD_PARTY_INVENTORY.md`](licenses/THIRD_PARTY_INVENTORY.md).
- **Fabric runtime: NOT_AUTHORIZED.** No cloud or Fabric action was taken.
- Packet: `galaxy-full-release-2026-10-10/01-mosaicstudio`. Baseline: `6f45dd0` (0.9.0, CI run 37961005082). Receipts, hashes and the resume point: [`handoff/01-mosaicstudio/full-release-2026-10-10/`](../handoff/01-mosaicstudio/full-release-2026-10-10/) (`READY.json`, `OUTCOME.json`, `RESUME.md`, `receipts/FR-01..FR-07.json`).

## What changed since 0.9.0

| Package | Merged | What it adds |
|---|---|---|
| FR-01 Artifact contract parity | PR #46, `f3a02bc` | `docs/contracts/artifact.schema.json`, the TypeScript validator and the Python mirror agree on lineage fields (`producer`, `inputs`, `inputHash`, `dependsOn`, `representation.inputs`) with shared bounds. Separate whole-file, structure and semantic gates. A 111-file synthetic corpus decided identically by all three. Old v1 files stay valid |
| FR-02 Jupyter adapter | PR #47, `0143e58` | Opt-in, loopback-only adapter to a user-installed Jupyter Server (pinned `requirements-jupyter.txt`). Explicit pairing and Run, token in memory only, strict Origin/Host, interrupt with distinct states, untrusted output rendering |
| FR-03 Notebook exchange and durable results | PR #47 | `.ipynb` import/export through pinned nbformat with inert preservation and a loss report. Opt-in result store outside Git: atomic hash-named files, 507 when full with the previous state intact, reopen without recompute |
| FR-04 Consumer interop | PR #48, `dc27122` | Real DataPass React and Contoso exports validated and opened in the concept viewer and the new artifact viewer; `datapass.preview/1` consumer fixture for T3; the load-sensitive embed-fit failure fixed at its cause |
| FR-05 Visualization surface | PR #49, `4a723bb` | Finished coding-lab and architecture walkthrough explanations with source evidence, shared selection and reset; light outputs load no database, kernel, WebGL or T3 |
| FR-06 Recovery | PR #49 | All 50 recovery hashes verified and each item given a disposition (`docs/RECOVERY_2026-10-10.md`); nothing from the snapshots published |
| FR-07 Release packaging | this PR | Version 0.10.0, the regenerated standalone viewer, license inventory, the release qualification spec, executed upgrade/rollback and the Positron Viewer check, build manifest, this document and the hand-off receipts |

## Acceptance mapping

Results: PASS, FAIL, BLOCKED, UNKNOWN; PARTIAL means some steps were observed and the rest were not executed. The original keys `F01`–`F14` and `UX01`–`UX04` are kept unchanged. Each FR delta is mapped into the rows it completes (the packet's `completion_delta_keys`).

| Original row | FR deltas | Result | Evidence | Open |
|---|---|---|---|---|
| F01 Preserve and map | FR-05, FR-06 | PASS | Inventory diff test against `PRODUCT_INVENTORY_0.9.md` (FR-05); per-item recovery disposition, legacy Bricks route kept (FR-06) | Whether the local Fabric concepts map becomes a public client is an owner decision |
| F02 Separate entry points | none | PASS | Unchanged since 0.9; `release-qualification.spec.ts` re-asserts the blank start on the production build | — |
| F03 Real SQL authoring | none | PASS | UX01 re-run on Windows in Chromium and Edge; a SQL cell run inside the Positron Viewer | — |
| F04 Real Python adapter | FR-02 | PASS | FR-02 receipt; E2E-01 against a real `jupyter_server` 2.21.1 / `ipykernel` 7.3.0 | Kernel heap restore is not claimed |
| F05 Notebook and pipeline | FR-02, FR-03 | PASS | FR-02/FR-03 receipts: explicit dependencies, `.ipynb` round trip, import never executes | — |
| F06 One artifact contract | FR-01 | PASS | FR-01 receipt: Schema/TS/Python differential corpus, 11 real Contoso/FOIL exports accepted | Integers above 2^53 and the exact 1 MiB boundary with lone surrogates are not covered |
| F07 Workspace and run references | FR-03 | PASS | FR-03 durable store; the 0.9.0 → 0.10.0 → 0.9.0 workspace path executed (below) | In-page RunJournal history still lives in memory |
| F08 Concept spec compatibility | FR-01, FR-04 | PASS | FR-04: real React (`2e922ea`) and Contoso (`f2d0c75`) concept exports pass `concept-validate --strict` and open in the viewer (was BLOCKED in 0.9) | — |
| F09 D3, VizForge, ConceptMotion | FR-05 | PASS | FR-05 receipt, affected render specs | — |
| F10 Lazy capability packaging | FR-05 | PASS | 19-target emitted-JS budget gate in CI; FR-05 payload table | architecture-reference has about 6.6 KB of budget left |
| F11 Stable client consumption | FR-06, FR-07 | PASS (local) | Pinned-SHA and verified-archive methods (`CONSUMING.md`), `sdk-release.json` with version, commit, hashes and the license statement; the archive was rebuilt identically from a fresh clone | Public consumption BLOCKED by the missing license |
| F12 T3-neutral preview | FR-04 | PASS (producer side) | `preview.json` from every client build, `preview:validate`, FR-04 consumer fixture; browser and Positron use without T3 verified | T3 consuming `preview.json`: UNKNOWN (T3 `3dfcecd` does not read it; owned by 08-t3) |
| F13 Security and failure UX | none | PASS | UX04 re-run on Windows in Chromium and Edge; 0.9 evidence otherwise unchanged | — |
| F14 Release | FR-06, FR-07 | PASS (local) | This document; build manifest, clean install, upgrade/rollback, Windows browser and Positron qualification below | Final-main CI and the post-merge receipt belong to the verify step |
| UX01 Blank workspace to result | — | PASS | `workbench-notebook.spec.ts` UX01, Windows 11, Chromium and Edge | — |
| UX02 Python to multiple representations | — | PASS | Same spec against the live `py/service` runtime | — |
| UX03 Technical client to standalone | — | PARTIAL | 0.9 evidence (`qa/UX03_JOURNEY_0.9.md`); standalone viewer and client builds re-qualified here | The full journey (new light client with a concept and a motion scene, then source links) was not re-executed in this pass |
| UX04 Failure and fallback | — | PASS | Same spec; WebGL fallback in `model-assets.spec.ts` (CI) | — |

| FR delta | Result | Receipt |
|---|---|---|
| FR-01 Repair all Artifact contract drift | PASS | `receipts/FR-01.json`, `qa/FR-01-artifact-contract-parity.md` |
| FR-02 Python authoring without Mosaic VS Code | PASS | `receipts/FR-02.json`, `qa/FR-02-FR-03-jupyter-notebook-store.md` |
| FR-03 Notebook interchange and durable results | PASS | `receipts/FR-03.json` |
| FR-04 Real consumer interoperability | PASS; T3 consumption UNKNOWN | `receipts/FR-04.json`, `qa/FR-04-consumer-interop.md` |
| FR-05 Visualization surface | PASS | `receipts/FR-05.json`, `qa/FR-05-visualization-surface.md` |
| FR-06 Recover old work without publication | PASS; PNG regeneration UNKNOWN (reviewed stills already on main) | `receipts/FR-06.json`, `qa/FR-06-recovery.md` |
| FR-07 Ship the SDK and browser application | PASS for local packaging; public publication NOT_AUTHORIZED | `receipts/FR-07.json`, `qa/FR-07-release-packaging.md` |

## End-to-end journeys for this lane

| Journey | Status | Why |
|---|---|---|
| E2E-01 Conventional authoring survives restart | PASS | Entirely in this repository: `workbench-jupyter.spec.ts` (blank workspace → pair → Python → SQL on its result → chart → `.ipynb` + results → restart browser and services → reopen without rerun, plus invalid token/notebook, interrupt and storage-full paths). Windows 11: Chromium pass; Edge failed once at the interrupt step (kernel still running after 60 s, cause not found) and passed on rerun. CI runs it on ubuntu with `DATAPASS_REQUIRE_JUPYTER=1` |
| E2E-05 Retail Gold to application and explanation | NOT_EXECUTED | Needs the Contoso dbt/DuckLake pipeline and the React field trace (lanes 07 and 02). FR-04 validated real exports from both, which is one step of this journey |
| E2E-06 Actual native agent in T3 | BLOCKED | Needs an authenticated native agent session in T3 (lane 08). T3 `3dfcecd` does not read `preview.json` |
| E2E-07 Lightweight educational site | NOT_EXECUTED | Owned by the ConceptMotion demo lane (09); this repository supplies the SDK subset |
| E2E-08 Clean release install and recovery | NOT_EXECUTED (cross-product) | Needs the packages of all ten lanes. This lane's part was executed: clean install, upgrade from 0.9.0, rollback to 0.9.0 and the native hosts (below) |

## Install, run, upgrade, roll back

Requirements: Node 22 or later with npm, Git, network access to GitHub for `npm run bootstrap` (pinned upstream engines), and for the optional local Python service a venv with `py/service/requirements.txt` (plus `requirements-jupyter.txt` for Jupyter cells).

```sh
git clone https://github.com/julian-passebecq/datapass-mosaicstudio.git && cd datapass-mosaicstudio
git checkout --detach <release commit>         # see READY.json; never a branch name
npm ci --no-audit --no-fund
npm run build                                   # bootstrap + assets + typecheck + production workbench in dist/
npm run preview -- --port 24173                 # http://127.0.0.1:24173/ (blank workbench)
npm run sdk:pack && npm run sdk:verify -- dist-sdk
npm run build:client -- wind-reference          # any of the eight public reference clients -> dist-clients/<id>/
node scripts/release-manifest.mjs --out <folder>   # sha256 of every output
```

The standalone concept viewer is the committed file `dist-standalone/concept-viewer.html`; open it by double-click (it identifies itself as 0.10.0 in its first lines). Optional local runtime: `python -m venv .venv`, install the requirements into it, then `python py/service/app.py` (add `--results-dir <folder outside Git>` for the durable result store) and open the printed link. Optional Jupyter kernel: `python py/service/jupyter_local.py`.

**Upgrade from 0.9.0.** No format version changed. Old artifacts stay valid; the saved browser workspace (`datapass.workspace` v1) is restored unchanged and runs again. **Roll back to 0.9.0.** A workspace with only SQL and note cells is restored by 0.9.0. One holding a 0.10.0-only cell (`jupyter`, `inert`) is refused with a notice and kept byte-for-byte under `datapass.workspace.rejected`; a blank workspace opens and nothing is deleted. Export the workspace before rolling back and import it again after returning to 0.10.0. The result store folder is not read by 0.9.0 and is left alone. All of this was executed (next section). SDK consumers: [`CONSUMING.md`](CONSUMING.md).

## Qualification (this pass)

Windows 11 Pro 10.0.26300, Node 26.9.0, npm 11.19.1, Python 3.14.7 (venv with the pinned requirements). All data synthetic.

- **Clean install from a fresh clone** of the release commit in `%TEMP%`: `npm ci`, `npm run build`, `sdk:pack` + `sdk:verify`, the eight client builds and the release qualification spec against that clone's own server. Its release manifest was compared with the worktree build of the same commit; per-output results are in `qa/FR-07-release-packaging.md`.
- **Upgrade/rollback executed** with `scripts/release-upgrade-check.mjs`: a fresh 0.9.0 checkout (`6f45dd0`, `npm ci` + `npm run build`) and the 0.10.0 build served in turn on the same origin with one browser profile, closed between steps. Six steps passed (0.9.0 author → 0.10.0 upgrade → 0.9.0 rollback with SQL cells → 0.10.0 Jupyter cell → 0.9.0 refusal kept aside byte-identical → 0.10.0 re-import).
- **Windows browsers:** Playwright Chromium and the installed Microsoft Edge (`PW_CHANNEL=msedge`) ran the release qualification, concept-standalone, consumer-interop, workbench-notebook (UX01/02/04) and workbench-jupyter (E2E-01) specs. Counts are in `qa/FR-07-release-packaging.md`.
- **Positron 2026.10.0** (build 297) with a fresh profile and an empty extensions folder: the production workbench opened through *Viewer: Open URL in Viewer*, DuckDB-WASM started and a SQL cell returned its result inside the Viewer. Positron installed its own bundled extensions into the fresh profile; none is a DataPass or Mosaic extension, and `datapass-mosaic-vscode` was neither installed nor read.
- Unit tests, TypeScript, contract drift and Python tests: counts in `qa/FR-07-release-packaging.md`. CI on the PR head is recorded in `receipts/FR-07.json`.

Not done: no tag, release, publication, upload or deployment; no macOS or Linux desktop run (CI runs ubuntu); no touch, pen or multi-monitor check.

# FR-04 consumer interoperability (+ FR-05 embed-fit cause), 2026-10-10

Packet `galaxy-full-release-2026-10-10/01-mosaicstudio`, branch `claude/consumer-interop`, code at `1afee91` (base `6f45dd0`, 0.9.0).
Windows 11 Pro 10.0.26300, Node 26.9.0, Playwright 1.63.0 Chromium (software WebGL, as in CI), Python 3.13 venv under %TEMP% for Contoso.
Receipt: `handoff/01-mosaicstudio/full-release-2026-10-10/receipts/FR-04.json`. Real exports, screenshots and logs are private: `D:/PROJ/_release-evidence/2026-10-10/mosaicstudio/FR-04/` (`SHA256SUMS.txt`), never committed.

## Producer / consumer vector

| Role | Repository and ref | SHA | What ran |
|---|---|---|---|
| Producer | DataPass React 2.1, `gitlab/main` (private) | `2e922ea4fc4d991ba809e1d3d78a23da2fb586be` | `analyzeWorkspace` → `buildTraces` → `buildConceptSpec` → `conceptJson` (`apps/vscode-react/src/model/conceptExport.ts`), headless in a `git archive` copy, on two trees: contoso-data-studio `f2d0c75` and datapass-mosaicstudio `6f45dd0` |
| Producer | Contoso Data Studio, `origin/main` | `f2d0c759b2362b94db0cd73c3a9d901ed4aed9f0` | `concept_bytes(load_model(ROOT))` and `ExportService.export("monthly_sales")` after generate (online-migration, seed 7, 1,500 lines) → DuckLake Bronze → `dbt build` (dbt-duckdb 1.11.0) |
| Consumer | datapass-mosaicstudio (this branch) | `1afee91` | `scripts/concept-validate.mjs --strict`, `validateArtifact` (TS), `py/datapass_artifact.py`, `docs/contracts/artifact.schema.json`, standalone viewer, artifact file viewer |
| Consumer (read only) | t3code-datapass `origin/main` | `3dfcecdfa169b8da1fadd6408ccb2765f73adaaf` | Source read of `apps/server/src/mosaic/MosaicStudio.ts`, `mosaicReceipt.ts`, `MosaicPreviewHost.ts`; not run, not changed |

No obsolete checkout was searched: the exporters are at the refs above (React: `apps/vscode-react/src/model/conceptExport.ts`; Contoso: `apps/api/app/services/fabric_apps/concept.py`, `apps/api/app/services/exports.py`).

## Real exports (private; hashes only)

| Export | sha256 | Strict concept / artifact validation | Real UI import |
|---|---|---|---|
| React on contoso-data-studio (4 layers, 12 nodes, 11 flows, Unresolved side domain) | `77bd4d1e…a8ead7e3` | `--strict` OK | standalone file:// + embed fit at 1000x600, 640x420, 1280x760: PASS |
| React on datapass-mosaicstudio (4 layers, 14 nodes, 4 flows) | `f52b948f…c4688ce7` | `--strict` OK | same: PASS |
| Contoso concept `contoso-sales-forecasting` (6 layers, 13 nodes, 17 flows) | `d653d94f…bddc5db` | `--strict` OK. Byte-identical to Contoso's own `handoff/READY-concept.json` hash | same: PASS |
| Contoso artifact `contoso-monthly-sales` (48 rows, 11 columns, 13 declared inputs, table/chart/json) | `92507...cbb5b` | TS `validateArtifact` + `artifactDefinition` OK; Python mirror OK; **JSON Schema: 1 error** (see below) | artifact file viewer `?artifact=1`: PASS |

Run: `FR04_REAL_DIR=<private copy> FR04_SHOT_DIR=<private screenshots> npx playwright test tests/browser/consumer-interop.spec.ts -g "private qualification"` → 1 passed (2.0 min); 7 screenshots viewed (concept embed and artifact table render).

**Finding for FR-01 (not fixed here):** `docs/contracts/artifact.schema.json` rejects the real Contoso export and the synthetic mirror: `provenance: Additional properties are not allowed ('inputHash', 'inputs', 'producer')`, while the TS validator and the Python mirror accept them. This is the drift FR-01 owns.

**Finding for T3 (not changed here):** at `3dfcecd` T3 does not read `preview.json`; it requires `index.html`, reads `studio-build.json` capabilities, hashes all files and serves with `_headers` CSP. Its contract-document check treats `provenance` as an object, so every valid `datapass.concept-spec` v1 (string provenance) is listed with a false "missing provenance" problem.

## Public evidence in this repository (synthetic)

- `tests/fixtures/interop/react-shape.synthetic.concept.json`, `contoso-shape.synthetic.concept.json`, `contoso-shape.synthetic.artifact.json`: hand-written, labelled SYNTHETIC, invented names and paths; they mirror the export shapes (React: per-package domains, merged items, `inferred` labels, Unresolved side domain with `status: external`, `file:line` evidence; Contoso: fractional heights, side access domain, source paths; artifact: service producer, 13 inputs with sha256 values and an evidence link, reproducible `inputHash`, units, table/chart/json).
- `spec/preview/v1/fixtures/synthetic-client/`: versioned `datapass.preview/1` consumer fixture (`preview:validate --check-files` passes; `.gitattributes` keeps bytes exact). T3 compatibility notes in `spec/preview/v1/fixtures/README.md`.
- `src/ArtifactFileViewer.tsx` + `src/artifact-main.tsx`, entry `?artifact=1`: opens a `datapass.artifact` file in the existing `ArtifactView`. Bounded (2 MiB file, then the 1 MiB compact validator), validated before display, nothing runs, a rejected file keeps the current one, lineage shown as declared. No workbench, DuckDB, Python or three.js request (asserted).
- `tests/consumer-interop.test.mjs` (8 tests) and `tests/browser/consumer-interop.spec.ts` (4 public tests + 1 private test skipped without `FR04_REAL_DIR`): strict validation, no warnings, evidence and unresolved links kept, artifact lineage and rejection cases, preview fixture tamper detection, T3 3dfcecd expectations, embed fit with corner checks after 5 frame sizes and 3 window sizes in isometric / layered / 3D, postMessage source check (a sibling frame is ignored), opaque-origin replies, oversized payloads refused (256 KB bound) with the current spec kept, artifact viewer at 390 px with no horizontal overflow.

## FR-05: load-sensitive embed-fit failure, fixed at its cause

Observed (baseline `6f45dd0` viewer, this PC): `concept-standalone` "embed options" failed 2 of 8 repeats and 1 of 1 in a later file run, always as a 90 s test timeout. The trace shows every query into the framed viewer taking 5-18 s once the 3D view is open (`boundingBox` of one label 18.6 s).
Cause: the 3D stage (`src/framework/concept/react/ConceptStage.tsx`) drew a full frame (shadow map, antialiasing, label placement) on every animation frame, forever, whatever the frame cost. On software WebGL that saturates the viewer's main thread and the GPU process, so the fit assertions time out under load.
Fix: frames on demand. Every frame during a camera transition, one frame after a resize or a selection/layer change, otherwise ambient icon/bead motion at a budgeted rate: interval = max(1/30 s, 4 x measured frame cost, including a late next animation frame), at most 8 s (`ambientInterval` in `navigation.ts`, unit-tested). Reduced motion draws only on change. A rebuilt stage starts unsettled. No retry or timeout was changed.
Measured (same PC, 1000x600, software WebGL, `measure-3d.mjs` in the private drivers folder): Playwright `boundingBox` round trip in the 3D view, baseline p90 868 / 1,738 ms and max 7,761 / 9,890 ms; fixed p90 665 / 495 ms and max 1,432 / 1,478 ms.
Result: `concept-standalone` "embed options" passes with the fixed viewer in both full file runs below.

## Runs (this PC)

- `npm test`: 621 tests, 620 pass, 0 fail, 1 skipped.
- `npx tsc --noEmit`: exit 0.
- `node scripts/concept-validate.mjs --strict` on the 2 synthetic fixtures and the 3 real exports: all OK.
- `npm run preview:validate -- spec/preview/v1/fixtures/synthetic-client/preview.json --check-files`: valid, 4 files, 1 artifact, re-hashed.
- Playwright (`PW_PORT=24173`, preview server above 20000), `consumer-interop.spec.ts` + `concept-standalone.spec.ts`: 9 passed, 1 skipped (private), 1 failed: `concept-standalone` "validation errors ..." timed out in `page.goto(file://)` right after the 3D file:// test. The same test fails the same way with the **baseline** viewer on this PC under the same load (baseline run: 2 failed, that one and "embed options"), passes when run with its predecessor alone (2 passed), and passed in baseline CI. Cause not established (UNKNOWN; suspected GPU-process contention on a machine shared with other builds). Not changed by this package.

## Omissions

- T3 was not run and not changed; preview fixture compatibility is a source reading of `3dfcecd`.
- No native Windows/Positron host beyond Playwright Chromium.
- `docs/contracts/artifact.schema.json` drift is reported for FR-01, not repaired here.

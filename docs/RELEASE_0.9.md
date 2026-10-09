# DataPass MosaicStudio 0.9.0: technical-site SDK and browser authoring workbench

One repository and one SDK, with separate entry points:

- **Presentation surface:** selected client builds, the standalone concept viewer and the `datapass.preview/1` description file. These pages stay lightweight: no database, Python service, WebGL or T3 unless a client asks for one.
- **Authoring surface:** the traditional browser workbench at `/`. It now opens blank, has a Notebook, saves the workspace and connects to a trusted local Python runtime.

T3 is never required. Nothing was deployed, tagged or published.

Packet: `01-mosaicstudio` (handoff of 2026-10-09). Baseline: `8b22d9c` (web check 112424429642, run 37508856011). Receipts: [`handoff/01-mosaicstudio/`](../handoff/01-mosaicstudio/).

## Acceptance mapping

The packet's rows had no canonical IDs, and the repository has no feature or UX CSV (see [`PRODUCT_INVENTORY_0.9.md`](PRODUCT_INVENTORY_0.9.md)). The packet keys `F01`–`F14` and `UX01`–`UX04` are therefore used as proposed IDs. Existing IDs (CHART-N1a/N1b, GALAXY-N2, VIZ-N1/N2) are kept unchanged.

| ID | Result | Evidence | Omissions |
|---|---|---|---|
| F01 Preserve and map | Done | `PRODUCT_INVENTORY_0.9.md`; all 0.8 browser specs still pass (104 tests; see Qualification) | No owner-approved disposition needed: nothing was removed |
| F02 Separate entry points | Done | `/` blank, `?sample=operations` opt-in, `?app=` client preview, `?sites=1` gallery; UX01 asserts no table at start | — |
| F03 Real SQL authoring | Done | Notebook SQL cells and the SQLRooms SQL module on DuckDB-WASM. Typed columns, errors, cancel (abort), charts. Saved queries persist (`datapass.workspace`). UX01 | Query cancellation is SQLRooms/DuckDB-WASM abort, not a server-side kill |
| F04 Real Python adapter | Done, with a scoped adapter | `datapass.runtime/1`: submit, status, cancel and artifact against the loopback `py/service` producer. Token, origin and host guards. UX02, UX04, 24 service tests | The canonical `datapass-mosaic-vscode` runtime (`df801e4`) cannot be called from a browser (no CORS, extension-mediated, generic `/execute`). It was not changed (no peer writes). The adapter uses its token convention |
| F05 Notebook and pipeline surface | Done | Cell ordering, explicit dependencies, execution plan, staleness, Python output tables read by SQL cells. Imports never run anything (unit tests plus UX04) | No `.ipynb` import. The existing draft export is the migrated format |
| F06 One artifact contract | Done | SQL and Python results both use `datapass.artifact` v1. View and chart switches never recompute (UX02 asserts the same run id) | Contract unchanged |
| F07 Persistent workspace and run refs | Done | `datapass.workspace` v1: autosave, export, import, migration, reset, rejection kept aside. Run references re-fetch by id (UX02 reload) | Runtime results live in service memory only. In-page RunJournal history still does not survive reload, as before |
| F08 Concept spec compatibility | Preserved; cross-validation **BLOCKED** | `contracts:check`, `concept-standalone.spec.ts` 6/6 | No DataPass React (`176fcdd`) or Contoso (`5aaba31`, `a3b6a80`) concept-spec exporter or export exists to validate |
| F09 D3, VizForge, ConceptMotion | Done | `VISUALIZATION_STACK.md`; all motion, story, concept and viz specs pass | No shared rendering defect was found that needed a fix |
| F10 Lazy capability packaging | Done | `qa/PAYLOAD_0.9.md`: JS gzip unchanged from 8b22d9c and within budget (motion 155,613 of 184,320; foundation 201,657 of 230,400; wind 320,498 of 378,880; model 334,089 of 419,840); framework code unchanged. CI client-builds plus the performance gate green. UX03 found no DuckDB, three.js or T3 request | The only new output file is `preview.json` |
| F11 Stable client consumption | Done | `npm run sdk:pack` / `sdk:verify`, `CONSUMING.md`, `tests/sdk-release.test.mjs`, CI step | No license file exists. The manifest says so rather than inventing one |
| F12 T3-neutral preview contract | Done (proposal) | `spec/preview/v1/`, `preview.json` from every `build:client`, `preview:validate`, UX03 | No T3 consumer exists yet (`t3code-datapass` `cbce712`) |
| F13 Security and failure UX | Done | Stopped runtime, refused token, remote origin, malformed or hash-mismatched artifact, cancelled or failed runs, stale and previous results, invalid import (UX04 and unit tests). Workbench CSP limited to `'self'` plus loopback http | WebGL failure is the existing model-assets fallback (`model-assets.spec.ts`), unchanged |
| F14 Release | Done; CI green at 20ef865 | Build, SDK archive, standalone viewer, a qualified SQL/Python→result→export journey, docs below | Windows/Positron native gate: local Windows Chromium only |
| UX01 Blank workspace to result | Pass | `tests/browser/workbench-notebook.spec.ts`, Windows 11, Chromium (Playwright 1.63) | — |
| UX02 Python to multiple representations | Pass | Same spec, against the live `py/service` runtime | — |
| UX03 Technical client to standalone | Partial pass | `qa/UX03_JOURNEY_0.9.md` | The content/motion starter has no concept-spec resource and no source evidence links to verify |
| UX04 Failure and fallback | Pass | Same spec. WebGL-disabled behaviour is covered by the existing model-assets spec | — |

## Install, run, upgrade, roll back

```sh
npm ci && npm run bootstrap
npm run dev                                   # workbench at http://127.0.0.1:5173/ (blank)
python -m pip install -r py/service/requirements.txt && npm run service:python   # optional local runtime; open the printed link
npm run build && npm run preview              # production workbench on :4173
npm run build:client -- <id>                  # client output + preview.json in dist-clients/<id>/
npm run sdk:pack && npm run sdk:verify -- dist-sdk   # hashed release archive (clean tree)
```

- **Upgrade from 0.8.** No contract changed. The root now opens blank; use `?sample=operations` or *Load synthetic sample* for the old demo. Saved workspaces start with 0.9, so there is nothing to migrate. Old *Export draft* files can be imported in the Notebook. See [`CONSUMING.md`](CONSUMING.md) for SDK consumers.
- **Roll back.** Check out `8b22d9c`, or use the previous release archive. Browser storage key `datapass.workspace` is ignored by 0.8, and *Reset workspace* clears it.
- **Recovery.** A rejected saved workspace is kept under `datapass.workspace.rejected`. Runtime runs are lost when the service restarts. Re-run the cells.

## Qualification (this pass)

Local, Windows 11, Node 26.9, Python 3.14, Chromium (Playwright 1.63):

- Unit tests: 610 pass, 0 fail, 1 skipped (`npm test`, 611 in total).
- Python: 14 bridge tests and 24 runtime tests.
- `contracts:check`: no drift.
- Production build: OK.
- Browser suite: 103 pass and 1 fail in the full run. The failure, `concept-standalone` embed fit, is unrelated to this change and passed 6/6 when rerun alone, so it is load-sensitive. The notebook journeys pass 3/3.

CI: *Studio web gate* run [37863555025](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/37863555025), attempt 1, job `web` on `ubuntu-latest` (GitHub-hosted, so no runner name is recorded), finished with success at `20ef865`. It covers unit tests, the production build, the client and visual contracts, the Python bridge and runtime tests, the full browser suite including the notebook journeys against the live runtime, isolated client builds with performance budgets, and SDK pack/verify. Evidence artifact: `studio-web-evidence`, id 11586854521, kept 3 days. Later commits on the PR record their own run.

# DataPass MosaicStudio: tech-lead product plan (2026-10-14)

**Status: proposal. Everything not already built is CANDIDATE, not approved.** This plan covers this repository only (`julian-passebecq/datapass-mosaicstudio`). It is not about Mosaic VS Code (`datapass-mosaic-vscode`), which is a separate product.

Files in this folder:

| File | Content |
|---|---|
| `PLAN.md` | Vision, versions, evaluation of the proposals, architecture decisions, risks |
| `features.csv` | 71 features: `id,title,version,status,depends_on,acceptance_criteria,estimate` |
| `ux.csv` | 37 user journeys, same columns |
| `dependencies.mmd` | Mermaid graph of every CANDIDATE and the EXISTING features it needs |
| `anatomy-evaluation.md` | Fit, licence, integration path and risks of `wheresryan22/anatomy` |

Basis: code and docs at `main` `f42c8a9` (0.11.0 plus the CSP fix #73), `qa/FIN-0.11.0.md`, `docs/PRODUCT_INVENTORY_0.9.md`, `docs/WORKBENCH_AUTHORING.md`, `docs/PYTHON_BRIDGE.md`, `docs/VISUALIZATION_STACK.md`, `AGENTS.md`. The Galaxy tech-lead review pack of 2026-10-14 (its `RAPPORT.md`, `features.csv`, `ux.csv`, not committed here) was used as input to reconcile, not as authority; see [Reconciliation](#9-reconciliation-with-the-galaxy-review-pack). Estimates are subjective scoping budgets with low confidence; they exclude access waits, runner saturation and new defects, and their maxima must not be added up into a date.

## 1. Vision

MosaicStudio is the **web front end for computed results**: any approved producer computes (DuckDB-WASM in the page, an allowlisted Python model, a Jupyter kernel the user paired, a script, marimo or a job), the result becomes one validated `datapass.artifact`, and Studio shows it as a table, chart, explanation, architecture or 3D view, compares it, keeps it and exports it with its provenance. The same SDK lets an agent build a small technical website for one client around those artifacts.

The next gain is **coherence of use, delivery and extension, not more engines**. The target loop, proven on two real consumers:

> open a client, give parameters, run on an approved producer, inspect the result as table, chart and explanation, compare A with B, close, reopen exactly the same results, export with provenance.

Every part of that loop already exists somewhere in the code; it is not yet one contract. V2 makes it one. V3 lets others extend it without editing the framework. V4 is parked. Anatomy is R&D.

## 2. Non-negotiables

- **Never a second compute engine, a second notebook or a second agent runtime.** No Pyodide (already declined for PR #45 in `qa/FIN-0.11.0.md`), no in-house kernel, no scheduler, no executor of user text in the runtime.
- **Preserve and reuse:** SQLRooms (RoomStore, SQL editor, layout), DuckDB-WASM, UWData Mosaic, D3 viz kit, VizForge (the single progression clock), ConceptMotion, Three.js, React Flow, Jupyter (stock server and kernel), marimo (as a producer), FastAPI (`py/service`), the Python bridge, the ArtifactStore surface (static artifacts, `write_manifest`, `ArtifactSource`), the ResultStore (`py/service/result_store.py`), and the Concept (`datapass.concept-spec/1`) and Preview (`datapass.preview/1`) contracts.
- Stored formats keep their versions unless an ADR under `docs/API_VERSION_MIGRATION_POLICY.md` says otherwise; rollback checks (`scripts/release-rollback-check.mjs`) stay green.
- Released bytes are immutable: a fix ships as a new version path, never by replacing 0.11.0.
- T3 stays an optional host; DiagramCloud stays an optional exchange through the concept spec; client sites stay usable without Python.
- Synthetic stays labelled synthetic; INFERRED is never shown as VERIFIED; no FOIL-private data, client payloads or credentials in this public repository.

## 3. V1: what exists (0.11.0 and `main`)

34 EXISTING features (F001-F034) and 16 EXISTING journeys (U001-U016), each with its evidence file in the CSVs. In short:

| Area | Built |
|---|---|
| Workbench | Blank-first SQLRooms/DuckDB-WASM workbench, nine modules, notebook with SQL, allowlisted-model, Jupyter, note and inert cells, explicit dependencies and staleness, `.ipynb` import/export, workspace persistence v1 |
| Compute paths | SiteRuntime tasks and `createJsonTask`; runtime runs API `datapass.runtime/1`; Jupyter kernel adapter; Python bridge levels 1-4 (file, live file, FastAPI live, runtime); client-owned workers (param-lab) |
| Results | `datapass.artifact/1` in TS, JSON Schema and Python; ArtifactSource loader; ResultStore (atomic, quota, SHA, relink, SQL source hash); RunJournal with `compareRuns`; opt-in run references; lineage explorer |
| Visual engines | D3 viz kit (default charts), VizForge, ConceptMotion, authored SVG/D3 motion, concept spec renderers, Three.js (scene3d, model3d, viz3d), React Flow (pipeline, architecture, explorer), UWData Mosaic |
| SDK | 19 block types, five families, capability planning, selected-client builds with payload gates, `sdk:pack`/`sdk:verify`, preview contract, standalone concept viewer, licence inventory |
| Delivery | 0.11.0 built from `0bc8c8c` and delivered to the private vault; JOURNEY-01 and JOURNEY-02 PASS |

**V1 closure (CANDIDATE, small, parallel):** F101 a 0.11.1 package that contains the CSP fix (`f42c8a9` is on `main` but not in the 0.11.0 bytes); F102 E2E-05 on one vector of exact SHAs; F103 E2E-06 mapped to existing T3 receipts, replaying only clauses without evidence; F104 the narrow "Declared lineage" table seen in the JOURNEY-01 screenshot; F105 the install guide's `tar` command on Git Bash and Windows `tar.exe`. Budget 11-26 h.

## 4. The proposals, evaluated against the code

| Proposal | What the code already has | Real gap found | Verdict |
|---|---|---|---|
| **ComputeAdapter** | Five paths: SiteRuntime tasks (`src/framework/runtime.ts`, `http-task.ts`), runtime runs (`src/workspace/runtime.ts`, `py/service/runtime.py`), Jupyter (`src/workspace/jupyter.ts`), artifact sources static/http/live file (`artifact-loader.ts`, `ArtifactSource.tsx`), client workers. All end in `datapass.artifact`. | No shared description of what each path can do. **Three state vocabularies**: runtime `queued/running/succeeded/failed/cancelled`, Jupyter `ok/error/interrupted/disconnected/unknown`, RunOutcome `succeeded/failed/cancelled/superseded/timed-out/unobserved`. A marimo or file producer cannot be cancelled, yet nothing says so. | **ADOPT, narrow, V2** (F202, F203): a capability descriptor and wrappers around the existing paths. No executor, queue or process. Unsupported capabilities are shown, not simulated. |
| **StorageAdapter** | `StoragePort` (`getItem/setItem/removeItem`) in `src/workspace/persist.ts`; the same shape for run history (`run-history.ts`); ResultStore with commit point, atomic writes, quota, rejected-copy handling. | The ports are not one facade; **no cross-tab detection** (no `storage` event or revision in `persist.ts`: two tabs are last-writer-wins); client sites cannot save a run's artifact durably (only the workbench can). | **ADOPT as a facade, V2** (F204-F206). Two backends only: browser key-value and the local ResultStore. IndexedDB and RemoteStore are V4, on measured need. |
| **SDK extensibility** | `custom` block with trusted TSX and `customCapabilities`; pure `framework/authoring.ts` and `index.ts` entries; contracts exported to `docs/contracts/`; SDK archive. | Built-in blocks are a central `switch` in `src/framework/registry.tsx`; a new renderer means editing the framework. No export map or API report. No licence, so no public package. | **ADOPT, V3** (F301-F303, F309): one package with several entry points (not seven packages), declared renderer extensions resolved through the client definition, API report in CI. Publication waits for the licence decision (F404). |
| **Diagnostics** | Many validators and checks: `client:check`, `contracts:check`, `concept-validate`, `preview-validate`, `sdk-verify`, import reports, `role="alert"` states, failure-state table. | Messages differ between TS and Python for the same file; no environment check (Node, upstream pins, Python venv, ports, `_headers`, store location); no in-page view for authors. | **ADOPT, V2 then V3** (F209 codes, F210 doctor; F304 dev overlay). |
| **CLI** | About 50 npm scripts; consumers outside a checkout call `node sdk/scripts/...` (JOURNEY-02). | No single entry for SDK consumers; Python side has no validate command. | **ADOPT as a thin dispatcher, V2** (F211): `datapass <command>` maps to the existing scripts with no new logic; `python -m datapass_artifact validate`. |
| **Scenario Engine** | Input fields, tasks, `compareRuns`, run references, foil-wind run-vs-run comparison artifact, `wind-weibull-grid` (a k x c grid in one run), param-lab parameters. README states no general Scenario Engine. | A/B does not survive reopen; no named input sets; no bounded sweep through the existing runtimes. | **REJECT the engine; ADOPT "scenarios are runs"**: V2 A/B that survives reopen (F207), V3 scenario sets submitted as ordinary bounded runs (F306). No scheduler or optimizer. |
| **Client architecture** | `clients/<id>/` with `app.ts`, `client.config.json`, families, capability planning, selected builds, `preview.json`; 19 clients. | No client declares a status in `client.config.json` (the profile schema has no such field); draft or prototype status lives only in some READMEs (fabric-bricks says draft); clients outside this repository are possible (JOURNEY-02) but not tested across SDK versions. | **ADOPT, V2/V3**: status metadata checked by `client:check` (F213); out-of-tree clients with an N-1 to N compatibility test (F305). |
| **Persistence** | Workspace v1 (references, not payloads), sessionStorage token, ResultStore on disk, opt-in run references, exports (workspace, artifact, run record, `.ipynb`). | Cross-tab conflicts; durable site runs; no single export that carries artifacts plus run references plus lineage plus hashes. | **ADOPT, V2** (F205, F206, F208). Tokens are never persisted. |

## 5. V2: one coherent usage contract (13 candidates, 103-204 h)

Done condition: **F212** passes, the loop of section 1 on two consumers (an analytics client on the synthetic Contoso-shape artifact, and `foil-wind` on synthetic captures), with hash receipts.

Top five, in order:

1. **F201 Python runtime companion.** `py/` is not in the SDK archive today, so a consumer who wants to compute does not know what to install. A versioned, hashed companion (runtime service, `datapass_artifact.py`, pinned requirements, manifest with source commit). Static clients stay autonomous.
2. **F202 ComputeAdapter** (with **F203**, one state vocabulary). Wraps the five existing paths; reports what each can do.
3. **F204 StorageAdapter facade** (with **F205** cross-tab conflicts). Over the existing ports; ResultStore unchanged.
4. **F206 Durable site runs.** A client site saves a run's artifact and reference to the ResultStore and reopens it "Not recomputed".
5. **F207 A/B comparison that survives reopen**, then **F208** provenance bundle.

Also V2: F209 diagnostic codes, F210 doctor, F211 CLI dispatcher, F213 client status.

Lanes that can run in parallel: (a) F201 + F209 → F210 → F211; (b) F202 → F203; (c) F204 → F205 and F206 → F207 → F208. F212 closes the version.

## 6. V3: SDK extensibility and agentic authoring (9 candidates, 94-188 h)

Starts after F212. F301 export map and API report; F302 renderer extensions without editing `registry.tsx`, proven on two consumers; F303 additive artifact representation decided by ADR with Python parity; F304 dev diagnostics overlay; F305 out-of-tree clients with an N-1 to N test; F306 scenario sets on existing runs; F307 T3 variant helpers on the preview contract (sources stay in Mosaic); F308 DiagramCloud gateway through its existing concept-spec export, with omissions and ID remapping shown; F309 testing kit (the fakes already in `tests/`).

## 7. V4: parked (5 candidates)

F401 remote or multi-user runtime; F402 RemoteStore and generic sync; F403 IndexedDB backend; F404 public SDK publication (blocked by the licence decision, owner gate); F405 PDF/PPTX/video exports. None blocks a local journey; none starts without a selected consumer and, for F401/F402, a threat model.

## 8. R&D: Anatomy (5 candidates, 26-52 h)

See `anatomy-evaluation.md`. Verdict: **adopt as an isolated R&D lab, SVG first**: good fit for FOIL mechanical figures (rigs, instruments) as illustration; weak fit for architecture (one mechanism explainer linked to a concept node, never topology). MIT licence; pinned through `upstreams.lock.json`; no idle tour, pose from view state; readout from validated artifacts; never its community-publish script. Not a release condition.

## 9. Architecture decisions

| # | Decision | Consequence |
|---|---|---|
| AD-01 | Compute belongs to producers that already exist (DuckDB-WASM, allowlisted runtime, Jupyter, external Python, client workers). | No Pyodide, kernel, scheduler or agent runtime in Studio. |
| AD-02 | `datapass.artifact/1` is the seam between compute and display. | Renderers never recompute; changing a representation never reruns. |
| AD-03 | ComputeAdapter is a descriptor plus wrappers. | Lifecycle, cancellation and permissions stay with SiteRuntime, the runtime and Jupyter; a Jupyter kernel runs with the user's privileges and is not a sandbox. |
| AD-04 | StorageAdapter is a facade; the ResultStore stays the durable store. | Formats `datapass.workspace` v1, `datapass.result-store`/`cell-result` v1 unchanged unless an ADR; new backends only on measured need. |
| AD-05 | Three persistence tiers: preferences/metadata in the browser, immutable content-addressed results, exportable bundles. | Tokens and secrets are never stored; bundles carry a sharing notice. |
| AD-06 | Scenarios are runs. | A/B and sets reuse `compareRuns`, the run queue limit and the ResultStore; no Scenario Engine. |
| AD-07 | Extensions are client-owned and declared. | `registry.tsx` is not edited for a client renderer; capability flags still gate builds; a missing capability shows a fallback. |
| AD-08 | One package, several entry points. | No set of seven npm packages; publication waits for a licence (F404). |
| AD-09 | Diagnostics have stable codes in both languages; the CLI only dispatches. | No logic duplicated between CLI and scripts. |
| AD-10 | T3, DiagramCloud and Anatomy are optional neighbours. | Contracts (preview, concept spec, artifact) are the only coupling; Mosaic VS Code is a separate product. |
| AD-11 | Fixes to a released version ship as a new immutable version. | 0.11.0 bytes are never replaced; 0.11.1 carries the CSP fix. |

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Adapters grow into engines (a queue in ComputeAdapter, a database in StorageAdapter) | Medium | AD-01/03/04; acceptance criteria forbid scheduler, queue and process; review against this table |
| TS and Python contract drift (artifact, bundle, diagnostic codes) | Medium | Shared corpus, codes tested in both languages (F209), `contracts:check` |
| Storage changes break rollback to 0.10/0.11 | Medium | Formats unchanged by default; rollback check in every storage PR |
| Local runtime or kernel misused as a network service | Low-medium | Loopback, token, Host/Origin checks stay; F401 parked behind a threat model |
| Licence undecided blocks external SDK consumers | High | Private vault delivery continues; F404 is an owner gate, nothing else depends on it |
| Cross-product journeys (E2E-05/06) depend on other lanes' SHAs | High | One-vector receipts (F102); never add up evidence from different revisions |
| CI capacity: 28-minute web gate on Actions, Windows journeys on the local runner | Medium | Lanes capped; heavy browser suites not run concurrently |
| Public repository leaks FOIL or client data through figures or fixtures | Low-medium | Synthetic fixtures only; Anatomy publish script banned; confidentiality scan before any package |
| Estimates read as a schedule | High | Ranges, low confidence, no summed maxima |
| Anatomy upstream churn, metaphors mistaken for evidence | Medium | Pin, static SVG output, labels, stop criteria (`anatomy-evaluation.md`) |

## 11. Reconciliation with the Galaxy review pack

| Review-pack row (Mosaic Studio) | This plan | Difference |
|---|---|---|
| Package including the CSP fix (FIN-05/06) | F101, U101 | Same; JOURNEY-01 replayed with `_headers` applied |
| E2E-05 single vector; E2E-06 reconcile | F102, U102; F103 | Same |
| Distribution of the optional runtime | F201, U205 | Same, ranked first in V2 |
| ComputeAdapter without an engine | F202, F203 | Adds the three-vocabulary finding and the state mapping |
| StorageAdapter facades | F204-F206 | Adds the cross-tab gap found in `persist.ts`; IndexedDB/Remote moved to V4 |
| Extension contract and diagnostics (V3) | F209-F211 (V2), F301-F305 (V3) | Codes, doctor and CLI moved to V2 because the V2 loop needs them |
| Anatomy figures (R&D) | R01-R05 | Same verdict; adds concrete rule conflicts and the publish-script risk |
| Remote runtime / generic sync (parked) | F401, F402 | Same |
| Product loop on two consumers | F212, U201 | Same; consumers named (Contoso-shape synthetic, foil-wind) |
| Not in the pack | F104, F105, F207, F208, F213, F306-F309 | Found in the code and FIN-0.11.0 omissions |

Pack claims checked against code and confirmed: marimo is a producer through the watched file, not an integration; disk-full, corruption, atomic-write and restore tests exist (`py/service/test_notebook.py`, `qa/M-ROLLBACK.md`); `py/` is outside the SDK archive (`qa/FIN-0.11.0.md`). The pack's non-Mosaic products are out of scope for this repository.

## 12. Counts

| Version | Features EXISTING | Features CANDIDATE | Journeys EXISTING | Journeys CANDIDATE |
|---|---:|---:|---:|---:|
| V1 | 34 | 5 (closure) | 16 | 4 |
| V2 | 0 | 13 | 0 | 9 |
| V3 | 0 | 9 | 0 | 5 |
| V4 | 0 | 5 | 0 | 1 |
| R&D | 0 | 5 | 0 | 2 |
| **Total** | **34** | **37** | **16** | **21** |

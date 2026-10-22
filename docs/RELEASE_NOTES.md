# Release notes

## 0.13.1 (2026-10-23)

Patch release of 0.13.0: the V1 hardening (#102) and the notebook lineage fix (#103). Built from the merge of this release commit. A patch version because no contract, stored format or wire changes (`docs/API_VERSION_MIGRATION_POLICY.md`): `datapass.engineering/1` is unchanged (schema sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83`), and so are `datapass.artifact/1`, `datapass.concept-spec/1`, `datapass.preview/1`, `datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.run-history` v1, `datapass.bundle` v1 candidate and `datapass.runtime/1`. The Python service stays `datapass-artifact-service` 0.5.0 in the `safe` profile. Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0130--0131). Nothing is tagged, published or deployed.

**Changes**

- **Release archive extraction (#102).** `sdk-verify` and `runtime-verify` check every archive path before writing anything: the root and directories before root stripping, traversal, Windows aliases, device names and alternate streams, duplicate or case-colliding paths, file/directory collisions, empty archives and ambiguous or orphan PAX metadata are refused, without partial writes (`tests/archive-boundary.test.mjs`).
- **Runtime pairing (#102).** When browser storage fails, the runtime link keeps the last validated pairing in page memory; an explicit replacement or disconnect wins within the page, and a memory-only connect removes an older stored pairing whenever removal works (`src/framework/compute/runtime-task.ts`, `tests/runtime-link-storage.test.mjs`).
- **Mobile engineering provenance (#102).** The Source column of the model-reference engineering consumer keeps a readable minimum width on phones, with compact rows and keyboard-accessible local scrolling, without page overflow.
- **Notebook lineage records `k` (#103).** `build_artifact(rows, k=...)` in `py/wind_reference_model.py` writes the Weibull shape `k` that `table()` used into the artifact title, source, declared inputs and `inputHash` (default 2.0; non-finite or non-positive values are refused before writing). The Jupyter and marimo notebooks pass the same `k` to both. Packaging does not rerun the calculation. The committed default artifact of `python-wind-reference` was regenerated at `k=2` (6,188 bytes, sha256 `7ca77cb8…3b10`; only the source sentence changed, the rows are identical).

**Limits**

- If browser storage refuses both the write and the removal, an older stored pairing can come back after a reload; this is tested and documented, not fixed.
- An artifact exported by 0.13.0 from a notebook with `k` other than 2 still says `k=2` in its lineage: re-export it with 0.13.1. Artifacts exported at the default `k=2` are correct in both versions.
- marimo stays qualified locally only (CI reports `NOT_QUALIFIED`). The models stay ILLUSTRATIVE and every fixture is synthetic.

**Delivery.** SDK archive, workbench, standalone viewer and the Python runtime companion (rebuilt from this commit; it ships the fixed `py/wind_reference_model.py`) are delivered privately. Release 0.13.0 stays as delivered.

## 0.13.0 (2026-10-22)

Lane 01 (engineering consumer): a new frozen contract, `datapass.engineering/1`, the runtime boundary hardened with the `safe` profile as the default, and the client run lifecycle that consumes both (#96-#99). Built from the merge of this release commit. A minor version because a contract is added and the default service profile changes (`docs/API_VERSION_MIGRATION_POLICY.md`). The stored formats of 0.12.0 keep their versions (`datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.run-history` v1, `datapass.artifact/1`, `datapass.concept-spec/1`, `datapass.preview/1`, `datapass.bundle` v1 candidate); the `datapass.runtime/1` wire only gains additive fields and headers. One operational change is breaking: the Python service starts in the `safe` profile, so the legacy `/compute/wind-reference`, `/artifacts/*` and `/docs` routes answer 404 unless it is started with `--profile demo`. Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0120--0130). Consumer guide for a 0.8.1 framework snapshot (foil-studio-3d): [`UPGRADE_FOIL_STUDIO_0.13.md`](UPGRADE_FOIL_STUDIO_0.13.md). Nothing is tagged, published or deployed.

**Gates (lane 01)**

- **S01 Contract `datapass.engineering/1`, frozen (#96).** Kinds `artifact-ref`, `run-receipt`, `selection-binding`, `approval-request` (presentation only, no approval state) and `parameter-diff` (unit required, `""` dimensionless). Canonical JSON `datapass-c14n/1` (RFC 8785 JCS) and named digests `{alg, over, value}`. Source `src/framework/engineering/contract.ts` (no imports), Python mirror `py/datapass_engineering.py`, schema `spec/engineering/v1/engineering.schema.json` (sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83`), guide `spec/engineering/v1/README.md`, codes `DP-ENG-001..016`. Corpus `tests/fixtures/engineering/` (11 valid, 48 invalid, 17 c14n vectors, the byte-exact 0.8.1 legacy artifact): TypeScript and Python reach identical decisions, codes, bytes and digests (`npm run test:engineering-corpus`, in CI and in `contracts:check`).
- **S02 Runtime boundary (#97).** Service `datapass-artifact-service` 0.5.0 has two profiles; `safe` is the default (`--profile`, `DATAPASS_SERVICE_PROFILE`). In `safe`, `/artifacts/*`, `/compute/*`, `/docs`, `/redoc` and `/openapi.json` answer 404; `demo` keeps them behind loopback Host and Origin checks. `/health` is minimal (`{status, service, version, profile}`). Traversal run paths answer 422 `DP-RT-PATH`; runtime JSON escapes `<>&`; `nosniff` and `no-store` on every response. The packed companion starts `safe` and `runtime:verify` refuses any other start (44 live probes on the extracted archive).
- **S03 Run lifecycle (#97 server, #99 client).** Additive `datapass.runtime/1` wire: `Idempotency-Key` on `POST /runs` (same key and payload replays the first run, a changed payload answers 409 `DP-RT-IDEMPOTENCY-CONFLICT`), `cancelRequested` on every run record (a running run stays `running` until the worker confirms `cancelled`), authenticated `GET /api/runtime/v1/ready`. The TypeScript client sends a key with every submit, resends at most once and only after a network error, timeout or 5xx, tolerates 3 transient poll failures, then reports **not observed** (never cancelled or failed). Late, retried, cancelled or out-of-order answers never win by arriving last. `receiptFromRunRecord()` builds a validated `run-receipt`.
- **S04 Selection binding (#98).** `src/framework/engineering/binding.ts`: exact signal lookup (an absent signal is `unmapped`), `unmapped` never animates, `inferred` animates only after an explicit opt-in, and `designDigest()` ignores view state (camera, selection, isolate, explode, time cursor, view token). Generic consumer in `clients/model-reference/` sharing the one `model-selection` view field across the part tree, 2D schematic, results table and the existing 3D block.
- **S05 Regression (#99).** The product loop still reopens with 0 runtime POSTs and now also proves that view-only changes send 0 `POST /runs`; one controlled cancel and one controlled failure keep the last valid result visible, labelled **"Previous result — not this run's output"**.
- **S06 Units and imports (#98, #99).** A/B comparison refuses results whose shared columns or metrics have different units and gives the reason; values are never converted. Invalid or non-JSON engineering records are refused and the current record stays unchanged. Presentation blocks `ParameterDiff`, `CoverageBadges`, `ApprovalRequest` (its button only calls the supplied callback) and `IncompatibleComparison` in `src/framework/engineering/EngineeringBlocks.tsx`; all text is rendered as text.
- **S07 marimo producer (#98).** `py/test_marimo_producer.py` checks that the marimo app and the Jupyter notebook call the same reference model functions, and runs the marimo app when marimo is installed. Otherwise it reports `NOT_QUALIFIED`, never a pass.
- **S08 Older consumers (#98).** The new consumer accepts a generic record and a synthetic FOIL-adapter fixture through the same import path; the `python-wind-reference` client build still renders the byte-exact 0.8.1 artifact.

**Limits**

- **Cancel is cooperative only.** A cancel is a request (`cancelRequested: true`); the run is `cancelled` only when the model observes it. A model that never checks keeps running to its end, and a cancel that is never confirmed stays "cancel requested".
- **Coverage is declared by the producer.** `consumed`, `ignored` and `fixed` in a run receipt are what the producer and the declared inputs say; Studio does not verify that a model really read a parameter.
- **marimo is qualified locally only.** CI does not install marimo and reports the execution test `NOT_QUALIFIED`; the local qualification used marimo 0.25.2 in a temporary venv.
- **The 3D round trip goes through the label buttons.** Selection reaches and leaves the 3D model block through its existing part label buttons (`Frame`, `Plate`, ...); the browser round trip is qualified through those buttons, not by picking meshes in the canvas.
- Approvals are never issued, stored or checked by Studio; `approval-request` is presentation only. The models stay ILLUSTRATIVE and every fixture is synthetic.

**Delivery.** The Python runtime companion is rebuilt for this version (service 0.5.0, `safe` start) and delivered privately beside the SDK archive, the workbench and the standalone viewer. It is never published publicly.

## 0.12.0 (2026-10-16)

The V2 block (F201-F213, #80-#92, approved by Julian on 2026-10-16, PR #78) plus the CSP-1 fix that landed on main after 0.11.1 (#77). Built from the merge of this release commit. The stored formats of 0.11.1 keep their versions (`datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.run-history` v1, `datapass.artifact/1`, `datapass.concept-spec/1`, `datapass.preview/1`); new formats sit beside them and nothing 0.12.0 writes makes 0.11.1 refuse a stored document (rollback check executed against 0.11.1 for F204, F205, F206, F207 and F208). One authoring change is breaking: every client profile must declare `status` (F213). Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0111--0120). The short user guide [`GUIDE-0.11.md`](GUIDE-0.11.md) applies with `0.12.0` in the file names. Nothing is tagged, published or deployed.

**Features (V2)**

- **F203 Run-state vocabulary (#81).** One display set (queued, running, succeeded, failed, cancelled, interrupted, superseded, timed out, not observed) mapped from runtime, Jupyter, journal and result-store states in `src/framework/compute/run-state.ts`. "Not observed" never becomes cancelled or failed. Stored values and `data-status` are unchanged; `data-run-state` is added beside them. Mapping table: `docs/recipes/runs.md`.
- **F204 StorageAdapter facade (#80).** Three tiers over the existing ports in `src/framework/storage/`: preferences (localStorage or memory, byte-identical values), results (read-only, hash-verified ResultStore client), bundles (interface). No new backend.
- **F209 Diagnostic codes (#82).** Every `datapass.artifact` v1 refusal carries a stable `DP-ART-nnn` code, identical in TypeScript and Python; prefixes `DP-ENV`, `DP-CLI`, `DP-STO`, `DP-BUN` follow. Messages unchanged. Contract `docs/contracts/diagnostic-codes.json`, guide `docs/DIAGNOSTIC_CODES.md`.
- **F201 Python runtime companion (#83).** `npm run runtime:pack` / `runtime:verify`: a versioned, hashed archive of `py/service` (tests excluded), `py/datapass_artifact.py`, the ILLUSTRATIVE wind model and the pinned requirements, manifest `datapass.runtime-companion` v1, installable outside a checkout (`docs/RUNTIME_COMPANION.md`). The service reads `DATAPASS_ARTIFACT_DIR`.
- **F202 ComputeAdapter (#84).** One capability descriptor over the five existing compute paths; unsupported capabilities are reported with their reason, never simulated. `RuntimeClient` moves to `src/framework/compute/runtime-client.ts` (the old path re-exports it).
- **F213 Client status (#85).** `clients/<id>/client.config.json` declares `status` (`reference`, `prototype`, `draft`, `frozen`); a missing or unknown status is refused (`DP-CLI-001`, `DP-CLI-002`). Catalog label only.
- **F205 Cross-tab conflicts (#86).** A sidecar key `datapass.workspace.revision` beside the unchanged workspace document; a conflicting write from another tab opens Keep mine / Take theirs / Export both, and nothing is written while it is open (`DP-STO-001..003`).
- **F210 Doctor (#87).** `npm run doctor`: read-only environment report (`datapass.doctor` v1, `DP-ENV` codes), one fix per warning or failure.
- **F206 Durable site runs (#88).** A client that binds `durableRuns` saves a runtime-produced run to the ResultStore through `POST /api/notebook/v1/store/results` and reopens it "Not recomputed" after a browser and service restart. Opt-in, off by default; browser-only tasks are not durable.
- **F211 `datapass` command (#89).** A thin `bin` over the existing npm scripts; `python -m datapass_artifact validate <file>`.
- **F207 A/B comparison that survives reopen (#90).** Saved pairs of references (no payloads), read back by hash; an incompatible, missing or corrupt side is reported, never replaced.
- **F208 Provenance export bundle (#91).** A `datapass.bundle` v1 file (status `candidate`) re-imported identically in TypeScript and Python (`DP-BUN` codes, `docs/recipes/bundle.md`).
- **F212 Product loop (#92).** Qualified on two consumers, the new prototype client `contoso-shape-analytics` and `foil-wind`: run, save twice, A/B, export bundle, restart, reopen the same hashes with 0 runtime runs (`npm run test:product-loop`, receipts `qa/V2-LOOP/receipts.json`). All data synthetic.

**Fix after 0.11.1**

- **#77 CSP-1: no `script-src 'eval'` reports.** zod 4 (8 copies bundled by `@sqlrooms/*`) probed `new Function("")` on first parse; the probe was caught but raised CSP violation reports. `src/main.tsx` sets zod's shared global config `jitless` before any module loads; the policy is not loosened. `tests/browser/csp-clean.spec.ts` asserts 0 violations. JOURNEY-01 now also passes under the shipped `_headers`.

**New formats and vocabularies**

- `datapass.bundle` v1, status `candidate` (`spec/bundle/v1/bundle.schema.json`): may still change before it is declared stable.
- `datapass.ab-pair` v1: browser key `datapass.ab-pair.<appId>`, references only.
- `datapass.workspace.revision`: sidecar `{rev, tab, sha256}`; the workspace document itself is unchanged.
- `datapass.runtime-companion` v1 (companion manifest), `datapass.doctor` v1 (doctor JSON).
- Run-state display vocabulary (F203) and diagnostic codes `DP-ART`, `DP-ENV`, `DP-CLI`, `DP-STO`, `DP-BUN` (F209).

**Owner defaults applied** (BLOCKED_OWNER decisions, `handoff/01-mosaicstudio/v2-night-2026-10-16/WAVES.md` §4): no durable browser-task results (a new cell-result origin needs an ADR); a client's runtime CSP names the exact port (no `127.0.0.1:*`); the format names `datapass.bundle` v1 and `datapass.ab-pair` v1; F213 refuses a missing client status.

**Delivery.** The Python runtime companion (`scripts/runtime-pack.mjs`, `docs/RUNTIME_COMPANION.md`) is delivered privately with this version, beside the SDK archive, the workbench and the standalone viewer. It is never published publicly. T3 is not a dependency: E2E-06 stays BLOCKED as history.

## 0.11.1 (2026-10-14)

A patch release so that a static host serving the packaged workbench can reach the visitor's own loopback runtime. Built from the merge of this release commit; it contains everything on main after 0.11.0 (#67-#73). No stored format version changed and no SDK API changed. Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0110--0111). The short user guide [`GUIDE-0.11.md`](GUIDE-0.11.md) applies with `0.11.1` in the file names. Nothing is tagged, published or deployed.

- **#73 Workbench `_headers` CSP allows the loopback runtime.** The shipped `public/_headers` had `connect-src 'self' blob:` while `vite preview` allowed loopback http/ws, so a static host applying `_headers` (Netlify, Cloudflare Pages) blocked the consented Python runtime and the paired Jupyter Server. Both now come from `scripts/workbench-headers.mjs`: `connect-src` adds `http://127.0.0.1:*`, `http://localhost:*`, `ws://127.0.0.1:*`, `ws://localhost:*`; no remote origin is allowed. The runtime stays gated by explicit consent, the per-start token, the Host check and the Origin allowlist. New check `npm run test:static-headers`. `GUIDE-0.11.md`: `tar --force-local` for drive-letter paths in Git Bash.
- **#68 #69 #72 Reference clients.** New `clients/galaxy-finition` (status board and dependency graph) and `clients/foil-wind` (runs, measurements, SQL and run comparison on a synthetic `foil.export`; negative deltas drawn with a direction encoding). Client folders only; the framework and the workbench are unchanged by them.
- **#67 #70 #71 Records.** 0.11.0 release receipt and vault delivery record; galaxy-finition data snapshot. No code change.

## 0.11.0 (2026-10-13)

A new version because the app and runtime changed after the 0.10.0 SDK (#55-#65). No stored format version changed: `datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.artifact/1`, `datapass.concept-spec/1` and `datapass.preview/1` are as in 0.10.0. Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0100--0110); short user guide: [`GUIDE-0.11.md`](GUIDE-0.11.md). Nothing is tagged, published or deployed.

- **#53 SQL source hashes in the result store.** Saving records each SQL cell's authored-source hash in the store manifest; reopening refuses a manifest whose hash does not match the stored SQL (nothing is opened). Older manifests still open.
- **#54 Rollback check.** `scripts/release-rollback-check.mjs` executes 0.10.0 → newer → 0.10.0 → newer over one result store; results stay byte-identical (`qa/M-ROLLBACK.md`).
- **#55 3D embed fit.** The concept 3D view now reports "settled" only after drawing a frame at its current size, so an embedded view no longer measures a stale layout after a resize.
- **#56 Saved run references (opt-in).** `AppDefinition.runHistory[resource]` keeps run references (`datapass.run-history` v1, `datapass.run-ref` v1) across reload: references only, never result rows, payloads or secrets. Restored references are labelled "not rerun"; a run in flight at reload shows "Outcome not observed (page reloaded)". Default off; only `foundation-reference` opts in (`docs/recipes/runs.md`). Workbench notebook run references that were queued or running at reload show "not observed since reload".
- **#57 Interrupt before the code is sent.** Interrupt pressed while a Jupyter cell is still preparing now cancels it without sending the code to the kernel. The local result store serialises saves and job records, so concurrent runs no longer lose a job record.
- **#58 Refused run history is never overwritten.** A refused saved snapshot is kept aside under `<key>.rejected`; if that copy cannot be made or confirmed, saving pauses for the session instead of overwriting it.
- **#59 #60 #61 #62 Test reliability.** Browser specs hold the page clock around short synthetic timers and wait for the saved workspace instead of fixed sleeps. Tests only, no app change.
- **#63 T3 interop docs.** T3 checks `datapass.preview/1` (`preview.json`) since its #4; the fixture test asserts it stays verified.
- **#64 Cancel after the run finished.** Cancel pressed while a finished Python result is still loading now reports "already finished" instead of waiting for the runtime.
- **#65 Notebook kept across modules; model results saved.** Switching to another module and back keeps notebook results, running cells and the paired kernel. Saving to the result store now also keeps allowlisted Python model results, which reopen "Not recomputed" without the runtime.

## 0.10.0

See [`RELEASE_0.10.md`](RELEASE_0.10.md).

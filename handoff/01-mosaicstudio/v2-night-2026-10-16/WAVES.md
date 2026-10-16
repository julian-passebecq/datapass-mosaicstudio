# V2 night wave plan: F201-F213 (2026-10-16)

Produced by a `Plan` subagent (Opus, medium) from `docs/roadmap/tech-lead-2026-10-14/` at `origin/main` aed1fff; written here by the lead session. Approval: Julian, 2026-10-16 ~01:25 ("launch mosaic v2 for tonight"), PR #78.

**Stop conditions.** A feature stops after red twice on the same fix (reported; independent features continue). The night stops if `main`'s CI goes red and cannot be fixed in one PR, or if a change would break a stored format or the rollback check. Never force-push, never touch `main` directly, no release/tag/Marketplace.

**F203 before F202 (decided).** F203 lands first as a pure vocabulary and mapping module (`src/framework/compute/run-state.ts`) mapping runtime `RunStatus`, Jupyter `ExecuteStatus`, the journal's `RunOutcome` and the store's `JOB_FINAL` onto the display set, with no adapter in it. F202 then imports it. The `F203 -> F202` edge in features.csv is treated as `F202 -> F203` for this run.

## 1. Waves

- **Branch names:** `v2/f2xx-<slug>`, never `feat/**` (`ci.yml` also runs on push to `feat/**`, doubling CI).
- **Caps:** at most 4 PRs in CI at once, at most 3 local `npm ci`/`tsc` at once.
- **Start:** a feature starts when its gate PRs are squash-merged, from a fresh `origin/main`.

| Wave | Features | Start gate | Why / collisions |
|---|---|---|---|
| W0 | setup (no PR) | at once | Build the 0.11.1 rollback baseline once (§3) |
| W1 | F203, F204, F209 | at once | Foundations; no file overlap. F203: `src/panels/Notebook.tsx`, `src/framework/foundation/RunWorkbench.tsx`. F204: `src/store.ts`, new `src/framework/storage/`. F209: `artifact.ts`, `py/datapass_artifact.py`, corpus generator. |
| W2 | F202 | F203 | Shares `Notebook.tsx` with F203; consumes run-state |
| W2 | F205 | F204 | Shares `src/store.ts`; uses the preferences tier |
| W2 | F201 | at once | Only F201 touches `py/service/app.py` and `ci.yml` in this wave |
| W3 | F206 | F202 + F204 | Must not touch `src/framework/json-schema.ts` or `docs/contracts/` (F213 owns them) |
| W3 | F210 | F209 + F201 | Shares `package.json`, `ci.yml` with F201 |
| W3 | F213 | any time (low priority) | Owns `json-schema.ts`, `docs/contracts/client-profile.schema.json`, `scripts/client-*.mjs`, `ClientRouter.tsx`, `client-plugin.ts`, `clients/*/client.config.json` |
| W4 | F207 | F206 | Sole owner of `RunWorkbench.tsx` in W4 |
| W4 | F208 | F206 + F213 + F209 | May not edit `RunWorkbench.tsx`: mounts export from new `BundleExport.tsx` via `RunScope.tsx`; touches `docs/contracts/` |
| W4 | F211 | F210 | `package.json` `bin`, `package-lock.json` root `bin`, `py/datapass_artifact.py` |
| W5 | F212 | F201, F206-F208, F211, F213 | New client, `ci.yml` step, `package.json` script. Closes V2. |

Critical path: F203 → F202 → F206 → F207 → F208 → F212. Shared index files (`src/framework/{storage,compute,foundation,diagnostics}/index.ts`): each feature appends its export line at the end; on conflict, merge `origin/main` and keep every line.

## 2. Feature briefs

**Every feature:** tests as `tests/<name>.test.mjs` (`npm test` picks them up), Python tests as `py/test_*.py` or `py/service/test_*.py`. Stored formats unchanged: `datapass.workspace` v1, `datapass.result-store` v1, `datapass.cell-result` v1, `datapass.run-history` v1. Synthetic and labelled. No version bump, tag or delivery. Existing tests unchanged unless the brief says otherwise.

### F203 Run-state vocabulary (W1)
- Goal (U203): one display set: queued, running, succeeded, failed, cancelled, interrupted, superseded, timed out, not observed.
- Files: new `src/framework/compute/run-state.ts`, new `src/framework/compute/index.ts`; `src/framework/foundation/RunWorkbench.tsx` (`outcomeText`, run-list status span); `src/panels/Notebook.tsx` (runtime and Jupyter cell labels); `docs/recipes/runs.md` (mapping table).
- Approach: define input unions locally as string literals; `src/framework` must never import `src/workspace` (not in the SDK archive, `tests/sdk-release.test.mjs:43`). Jupyter ok→succeeded, error→failed, interrupted→interrupted, disconnected/unknown→not observed; RunOutcome timed-out→timed out, unobserved→not observed; store jobs disconnected/unknown→not observed. Add `data-run-state` attributes next to existing ones; keep every existing `data-status` value (`done`, `missing`, `imported`, `interrupted`, `connected` are asserted in `tests/browser/workbench-jupyter.spec.ts`, `artifact-contract.spec.ts`). Keep the exact string "Outcome not observed (page reloaded)" (`foundation.spec.ts:95`) as the reason under the label.
- Tests: new `tests/run-state.test.mjs` covering every literal of `STATUSES` (workspace/runtime.ts), `OUTCOMES` (run-history.ts), `JOB_FINAL`, and that "not observed" never maps to cancelled or failed. `npm test`, `npm run typecheck`.
- Traps: don't rename stored `status`/`outcome` values; don't add states to `persist.ts` `RunRef`.

### F204 StorageAdapter facade (W1)
- Goal: three tiers over the existing ports; no new backend; ResultStore stays authoritative.
- Files: new `src/framework/storage/{index.ts,ports.ts,kv.ts,result-store-client.ts,tiers.ts}`; `src/store.ts` (workspace load/save through the preferences tier); `src/workspace/results.ts` (re-export `RESULT_FORMAT`, `ARTIFACT_MIME`, `sha256Hex` from the framework module).
- Approach: `KeyValuePort` = same shape as `StoragePort`/`RunHistoryStore`. Tier 1 browser preferences/metadata. Tier 2 framework client for `/api/notebook/v1/store/*` reading artifact results only (cellKind python, origin `datapass.runtime/1`), verifying each hash; no import of `src/workspace/{jupyter,notebook}.ts` (minimal validator on top of `validateArtifact`). Tier 3 bundle interface implemented by F208. Not added: IndexedDB, remote, sync.
- Tests: new `tests/storage-adapter.test.mjs` (facade save writes byte-identical localStorage values to today's `saveWorkspace`; tiers report their backends). `tests/run-history.test.mjs:175` still passes (`src/store.ts` and `persist.ts` must not contain the text "run-history"). `npm test`, `npm run typecheck`, `npm run test:workbench`, rollback check.

### F209 Diagnostic codes TS + Python (W1)
- Goal: every artifact validator error carries a stable `DP-ART-nnn` code, identical in both languages, message text kept.
- Files: new `src/framework/diagnostics/{index.ts,artifact.ts,env.ts,client.ts,bundle.ts,storage.ts}` (last four start as empty arrays so later features own one file each); `src/framework/foundation/artifact.ts` (`code` on `ArtifactValidationError`/`ArtifactDecision`); `py/datapass_artifact.py` (`ArtifactError.code`, `main()` JSON gains `code`); `scripts/make-artifact-corpus.mjs` (emits `code` per invalid fixture), regenerated `tests/fixtures/artifact-corpus/manifest.json`; `scripts/export-contracts.mjs` (new `docs/contracts/diagnostic-codes.json`); new `docs/DIAGNOSTIC_CODES.md`.
- Approach: assign the code at each `fail(gate, path, …)`/`_fail` call site, keyed by rule not message. Python loads `docs/contracts/diagnostic-codes.json` and asserts its table matches. Reserve prefixes DP-ENV (F210), DP-CLI (F213), DP-STO (F205-F207), DP-BUN (F208).
- Tests: extend `tests/artifact-corpus.test.mjs` and `py/test_artifact_corpus.py` (same file → same code). `npm run test:artifact-corpus`, `npm run contracts:check`, `npm run test:python`.
- Traps: regenerate the manifest with the generator, never by hand; messages stay identical.

### F202 ComputeAdapter (W2)
- Goal (U202): capability descriptor over the five existing paths; unsupported capabilities reported with a reason, never simulated.
- Files: new `src/framework/compute/{adapter.ts,site-task.ts,runtime-run.ts,http-source.ts,live-file.ts}`; move `src/workspace/runtime.ts` body to new `src/framework/compute/runtime-client.ts`, leaving `export * from '../framework/compute/runtime-client.ts'`; new `src/workspace/compute-jupyter.ts`; `src/panels/Notebook.tsx` and `src/framework/foundation/ArtifactSource.tsx` (no Cancel for live file/http sources, reason shown).
- Approach: descriptor `{submit, progress, cancel, interrupt, result, history, durableResult, inputs}`, each `{supported:true} | {supported:false, reason}`. Wrappers only call `SiteRuntime.runTask/cancelTask`, `RuntimeClient`, `JupyterClient.interrupt`, `loadHttpArtifact`, `onArtifactChanged`. Runtime reports no progress fraction ("state only"). http Abort stops reading but the server may continue: cancel unsupported with that reason. Lifecycle states from F203. Not added: queue, scheduler, process, retry.
- Tests: new `tests/compute-adapter.test.mjs` (fakes in the style of `tests/http-task.test.mjs`). `npm test`, `npm run typecheck`, `npm run build`, Playwright `workbench-notebook.spec.ts` + `workbench-jupyter.spec.ts`; `npm run sdk:pack -- --allow-dirty && npm run sdk:verify -- dist-sdk`.

### F205 Cross-tab conflicts (W2)
- Goal (U204): two tabs never silently overwrite each other's workspace.
- Files: `src/store.ts`, `src/App.tsx` (banner), new `src/panels/WorkspaceConflict.tsx`, `src/framework/diagnostics/storage.ts` rows, `persist.ts` (constants only).
- Approach: revision in a sidecar key `datapass.workspace.revision` = `{rev, tab, sha256}`, never in the document (`validateWorkspace` is strict; a `revision` field would make 0.11.x reject the document). A `storage` event or sidecar mismatch before save opens the banner: Keep mine, Take theirs (validated through `validateWorkspace`), Export both. Nothing written while the conflict is open.
- Tests: new `tests/browser/workspace-conflict.spec.ts` (two pages in one context, runs under `test:browser`), unit test for the sidecar logic, `npm run build`, rollback check.

### F201 Python runtime companion (W2)
- Goal (U205): versioned, hashed archive of `py/service` and `py/datapass_artifact.py`; installs and starts outside a checkout; never published.
- Files: new `scripts/runtime-pack.mjs`, `scripts/runtime-verify.mjs` (modelled on `sdk-pack.mjs`/`sdk-verify.mjs`, reuse `archiveFiles`, `sha256`); new `docs/RUNTIME_COMPANION.md` (PowerShell and Git Bash); `package.json` (`runtime:pack`, `runtime:verify`); `.gitignore` (`dist-runtime/`); `py/service/app.py` (`ARTIFACT_DIR` from env `DATAPASS_ARTIFACT_DIR`, else checkout path; missing dir → 404); `ci.yml` step after "Python artifact contract and runtime runs API".
- Approach: archive `py/service/*.py` (no tests), `requirements*.txt`, `py/datapass_artifact.py`, `py/wind_reference_model.py`. Manifest `datapass.runtime-companion` v1: source commit, `sdkVersion`, file hashes, pinned requirement lines. Refuse `clients/`, `qa/`, `.env*`, keys. `runtime-verify` extracts to OS temp, starts the service on a port > 20000 with `DATAPASS_RUNTIME_TOKEN`, checks `/api/runtime/v1/health`.
- Tests: new `tests/runtime-companion.test.mjs`; `py/service/test_service.py` (env artifact dir). `npm test`, `npm run test:python-runtime`, `npm run runtime:pack && npm run runtime:verify`, `npm run test:client-builds`.
- Traps: CI runs `npm test` before pip installs FastAPI, so the live start belongs in `runtime:verify` (CI step after pip). Keep `SDK_FORBIDDEN ^py/` in `sdk-pack.mjs`. No upload or vault delivery.

### F206 Durable site runs (W3)
- Goal: a client site saves a run's artifact and reference to the ResultStore (opt-in, off by default) and reopens it "Not recomputed" after browser and service restart.
- Files: `py/service/result_store.py` new route `POST /api/notebook/v1/store/results` (results-only save, leaves `workspace`/notebook untouched, entries keep today's shape); `py/service/test_notebook.py`; new `src/framework/compute/runtime-task.ts` (SiteRuntime task handler driving `RuntimeClient` through F202; Abort sends explicit runtime cancel); new `src/framework/storage/site-runs.ts`; `src/framework/types.ts`, `src/framework/runtime.ts` (optional `durableRuns` on `AppDefinition`, wrapped and frozen like `runHistory`, not in the manifest so `json-schema.ts` untouched); `RunWorkbench.tsx` (Save, Reopen, Relink, Run again); `scripts/release-rollback-check.mjs` (optional step seeding a site entry; old release opens and saves without losing it).
- Approach: each run is an existing `datapass.cell-result` v1 document: `cellKind:"python"`, `origin:"datapass.runtime/1"`, `outputs = artifactOutputs(artifact, run)`; `cellId = site-<appId>-<taskId>`; `sourceSha256` = sha256 of canonical `["site", appId, appVersion, taskId, model, modelVersion, inputHash]`. Pairing from `#runtime=…&token=…`; token in sessionStorage only (AD-05). Missing/corrupt result → Relink or Run again; no fallback; service down says so.
- Tests: new `tests/site-runs.test.mjs` (fake fetch); Python route tests (atomic, quota, token refusal). `npm run test:python-runtime`, `npm test`, `npm run build`, `npm run test:browser`, extended rollback check.
- Traps: no new cell-result origin (ADR). Only runtime-produced runs are durable; browser SiteRuntime tasks report `durableResult` unsupported with a reason. Client CSP lists the exact runtime origin in `csp.connect` (no `*`). Service CORS defaults are 4173/5173; set `DATAPASS_SERVICE_ORIGINS`.

### F213 Client status metadata (W3)
- Goal (U208): `status ∈ {reference, prototype, draft, frozen}` declared by every client, refused when missing, badge on `?sites`.
- Files: `src/framework/json-schema.ts` (`clientProfileSchema` `status`), `npm run contracts` → `docs/contracts/client-profile.schema.json`; `scripts/client-context.mjs` (`readClientProfile` keys), `scripts/client-csp.mjs`, `scripts/check-clients.mjs` (refuse missing status with a DP-CLI code and fix text); `scripts/scaffold-client.mjs` (writes `status:"prototype"`); `scripts/client-plugin.ts` (`clientStatus` map); `src/ClientRouter.tsx` (badge); all `clients/*/client.config.json`, with new profiles for `wind-`, `operations-`, `architecture-`, `experience-reference` (family from `docs/PRODUCT_INVENTORY_0.9.md`).
- Status: the 8 rule-17 clients `reference`; `fabric-bricks` `draft`; everything else `prototype`.
- Tests: `npm run client:check`, `npm run contracts:check`, `npm test`, `npm run test:client-builds` (payload checks unchanged).
- Traps: rule-17 list in `client-plugin.ts` unchanged; status never affects capability plans.

### F210 doctor (W3)
- Goal (U206): actionable environment report, JSON and human.
- Files: new `scripts/doctor.mjs` (pure checks, injectable probes); `src/framework/diagnostics/env.ts` (DP-ENV rows); `package.json` (`doctor`); `ci.yml` step `npm run doctor -- --json --ci`.
- Checks: Node ≥ `engines` and npm; `.upstream` pins match `upstreams.lock.json`; Python, venv and installed versions match `py/service/requirements*.txt`; ports 21481, 21491, 24190, 24799, 24811, 24812 bindable; `dist/_headers` equals `WORKBENCH_HEADERS` when `dist/` exists; ResultStore dir (`--results-dir` or `DATAPASS_RESULTS_DIR`) outside Git. Output `{format:"datapass.doctor",version:1,checks:[{id,code,status,detail,fix}]}`; every failure names one fix; exit 1 on any fail (`--ci` may downgrade environment-only checks that CI cannot satisfy to warn, documented).
- Tests: new `tests/doctor.test.mjs` with fake probes; `npm run doctor`, `npm run doctor -- --json`.

### F207 A/B that survives reopen (W4)
- Goal (U209): compare two compatible saved runs; reopens without recompute; incompatible pair refused with the reason.
- Files: new `src/framework/storage/ab-pairs.ts` (browser key format `datapass.ab-pair` v1 `{appId, a:{resultSha256, runId, model, modelVersion}, b:{…}, savedAt}`, references only, strict validator, negative tests); `RunWorkbench.tsx` (Comparison tab); `src/framework/foundation/journal.ts` only for a pure helper.
- Approach: rebuild both sides from the store (hash-verified), run through unchanged `compareRuns` rules. Rebuilt records are marked restored with no invented timing; if `validateRunRecord` would need fabricated fields, add `compareArtifacts(a, b)` sharing the metric-delta code. Incompatible model version shows the reason.
- Tests: new `tests/ab-pairs.test.mjs` (different `modelVersion` fixture refused). `npm test`, rollback check. Trap: AD-06, no scenario engine or sweep.

### F208 Provenance bundle (W4)
- Goal (U207): one `datapass.bundle` v1 (marked candidate) with artifacts, run references, inputs, declared lineage and a `SHA256SUMS` text; re-imports with identical hashes in TS and Python.
- Files: new `src/framework/foundation/bundle.ts`, new `src/framework/foundation/BundleExport.tsx` (mounted from `RunScope.tsx`); new `py/datapass_bundle.py` (with `main`); new `spec/bundle/v1/bundle.schema.json` exported via `export-contracts.mjs`; new `tests/fixtures/bundle/{valid,invalid}/`; `src/framework/diagnostics/bundle.ts`; workbench export entry in `src/ArtifactFileViewer.tsx`.
- Approach: embed every file as an exact string and hash those UTF-8 bytes; never re-serialize JSON to hash. Refuse any byte equal to the in-memory runtime token; reject token-shaped keys. Sharing notice with checkbox before export.
- Tests: new `tests/bundle.test.mjs`, `py/test_datapass_bundle.py`, corpus parity test. `npm run contracts:check`, `npm run test:python`, `npm test`.

### F211 datapass CLI (W4)
- Goal: thin dispatcher, no new logic.
- Files: new `scripts/datapass.mjs`; `package.json` `"bin":{"datapass":"scripts/datapass.mjs"}` and the same in `package-lock.json` `packages[""]`; `py/datapass_artifact.py` (`main` accepts leading `validate`, keeps bare-file form); `docs/CONSUMING.md`.
- Map: `new`→scaffold-client, `check`→check-clients, `context`→client-context, `dev`→client-dev, `build`→build-client, `preview-validate`, `concept-validate`, `pack`→sdk-pack, `verify`→sdk-verify, `doctor`.
- Approach: spawn `process.execPath` with the same flags as the npm script; cwd = package root from `import.meta.dirname` (works as `node sdk/scripts/datapass.mjs`, JOURNEY-02); pass args, propagate exit code. `python -m datapass_artifact validate <file>`.
- Tests: new `tests/cli-dispatch.test.mjs` (each mapping equals the `package.json` script); `npm ci` still succeeds; `npm run sdk:pack -- --allow-dirty && npm run sdk:verify -- dist-sdk`.

### F212 Product loop on two consumers (W5, last)
- Goal (U201): open, parameters, run on an approved producer, table/chart/explanation, A/B, close, reopen with the same hashes, export with provenance: PASS with hash receipts on both consumers.
- Consumer 1, new client `contoso-shape-analytics` (family analytics, status `prototype`, not rule 17, selected build only). Base artifact: byte copy of `tests/fixtures/interop/contoso-shape.synthetic.artifact.json` (id `orchard-monthly-yield`, 12 rows) at `clients/contoso-shape-analytics/data/`, a test asserts byte equality. Producer: new `clients/contoso-shape-analytics/py/serve.py` calling `py/service/app.py` `create_app(models={**RUNTIME_MODELS, "contoso-shape-scenario": …})` (same allowlisted runtime, not a new engine). Inputs `priceChangePct`, `costChangePct`; output an ILLUSTRATIVE, SYNTHETIC table plus metrics (total revenue, total margin, margin rate) so `compareRuns` gives deltas; lineage input = base sha.
- Consumer 2, `foil-wind`: new `clients/foil-wind/py/serve.py` adding model `foil-wind-compare` (inputs `runA`, `runB` slot numbers 1-8), reusing the comparison function of `clients/foil-wind/py/build_data.py` over the committed placeholder artifacts. Static path unchanged for visitors without Python.
- Journeys: new `tests/product-loop/playwright.config.ts` and `loop.spec.ts` (outside `tests/browser`). `vite preview --strictPort --outDir dist-clients/<id>` on 21491 (contoso) and 21481 (foil-wind); the spec spawns `python clients/<id>/py/serve.py --port 24811|24812 --results-dir <os.tmpdir()>` with `DATAPASS_RUNTIME_TOKEN` and `DATAPASS_SERVICE_ORIGINS=http://127.0.0.1:2149x`, following `workbench-notebook.spec.ts`; clients declare `csp.connect:["http://127.0.0.1:2481x"]`. Restart: close the context, kill and restart the service, reopen, assert identical sha values and "Not recomputed". Also: A/B deltas; bundle re-imports in TS and via `python py/datapass_bundle.py validate`; representation change sends 0 runtime requests. Receipts in new `qa/V2-LOOP/receipts.json` (hashes only, synthetic).
- `package.json` `"test:product-loop"`; `ci.yml` step after "Isolated clients…": build both clients, then `npm run test:product-loop`.
- Traps: no FOIL export (`FOIL_EXPORT_DIR` unset); not in the default workbench build; no tokens or temp paths in receipts.

## 3. Verification

W0 (once): `git worktree add <OUT>/base-0.11.1 3575e6b`, then `npm ci && npm run bootstrap && npm run build` there (`<OUT>` outside the repo, under %TEMP%).

Fast subset per PR (Git Bash; each feature has its own ports):

```
npm ci && npm run bootstrap && npm run typecheck && npm test && npm run contracts:check && npm run client:check
npm run test:python && npm run test:python-runtime
npm run build
PW_PORT=<p> DATAPASS_TEST_RUNTIME_PORT=<r> DATAPASS_SERVICE_ORIGINS=http://127.0.0.1:<p> npx playwright test <specs touched>
```

| Feature | Extra |
|---|---|
| F209 | `npm run test:artifact-corpus` |
| F201, F202, F211 | `npm run sdk:pack -- --allow-dirty && npm run sdk:verify -- dist-sdk` |
| F201 | `npm run runtime:pack && npm run runtime:verify` |
| F201, F212, F213 | `npm run test:client-builds` |
| F210 | `npm run doctor -- --json` |
| F212 | `npm run test:product-loop` |

Rollback check (F204-F208), one run at a time:
`node scripts/release-rollback-check.mjs --old-dist <OUT>/base-0.11.1/dist --old-service <OUT>/base-0.11.1 --new-dist dist --new-service . --python python --port 24190 --rport 24799 --out <tmp outside repo>`

CI: workflow "Studio web gate", job `web` (28-min timeout). Merge only on a green finished run, squash, delete branch. Known flake: `workbench-notebook.spec.ts:158` UX02b (failed once on docs-only PR #78); one rerun allowed for a failure in code the PR does not touch.

## 4. Owner decisions (BLOCKED_OWNER, defaults applied tonight)

- Durable browser-task results need an ADR for a new `datapass.cell-result` origin. Default: not built; only runtime-produced runs are durable.
- Client CSP for the runtime: exact port only (no `127.0.0.1:*`).
- Companion delivery to the private vault is a release act: not done tonight.
- Format names: `datapass.bundle` v1 (candidate) and browser key `datapass.ab-pair` v1.
- F213 refuses a missing status, so out-of-tree consumers must add one line (fix text + CONSUMING.md note).

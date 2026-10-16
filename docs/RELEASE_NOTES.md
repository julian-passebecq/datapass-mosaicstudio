# Release notes

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

# Consuming DataPass MosaicStudio

This is a **source-consumed** framework (public GitHub repository, no license granted). Nothing is published to npm, no tag is created and nothing is deployed by the commands below. There are three supported ways to use it; pick one per consumer and pin it exactly.

**License.** No license file or package license field exists, in the tree or in its Git history. The repository is publicly visible on GitHub, but visibility is not a license: all rights are reserved by the owner and public SDK publication is **NOT_AUTHORIZED** until the owner decides a license. Third-party components keep their own licenses: prose notices in `THIRD_PARTY_NOTICES.md`, the generated per-package inventory in [`licenses/THIRD_PARTY_INVENTORY.md`](licenses/THIRD_PARTY_INVENTORY.md). Do not redistribute an archive or a built site outside the owner's approval.

## 1. Pinned Git source at an exact SHA (current method, unchanged)

Use the repository itself at one full commit SHA, never a branch name.

```sh
git clone <repository-url> datapass-mosaicstudio
cd datapass-mosaicstudio
git checkout --detach <40-hex-sha>        # the exact SHA you qualified
git rev-parse HEAD                          # must print that SHA
npm ci --no-audit --no-fund                 # frozen lockfile
npm run bootstrap                           # upstream engines at the commits in upstreams.lock.json
```

Record the SHA wherever the consumer records its dependencies. A consumer repository can also hold it as a Git submodule pinned to the same SHA.

## 2. Release archive from `dist-sdk/` (verified)

A release folder is produced from a commit by the owner and handed over as a folder:

```sh
npm run sdk:pack            # node scripts/sdk-pack.mjs; refuses a dirty tree (--allow-dirty records sourceTreeClean:false)
```

`dist-sdk/` then holds:

| File | Content |
|---|---|
| `datapass-mosaicstudio-sdk-<version>.tar.gz` | `git archive` of **HEAD**, SDK paths only: `src/framework`, `src/core`, the selected-client entry and its imports, `spec/`, `scripts/` (with the `client:new` templates), `docs/` (without recorded media), `package.json`, `package-lock.json`, `upstreams.lock.json`, `tsconfig.json`, `vite.client.config.ts`, `index.html`, `AGENTS.md`, `README.md`, `THIRD_PARTY_NOTICES.md`. Never `node_modules`, `.upstream`, `clients/`, builds or secrets |
| `concept-viewer.html` | The committed standalone concept viewer (see 3) |
| `sdk-release.json` | `datapass.sdk-release/1`: `sdkVersion`, `sourceCommit`, `sourceTreeClean`, `commitDate`, license statement, archive name/bytes/sha256, every file inside the archive (`path`, `bytes`, `sha256`, sorted), the standalone files, and the contract files (`datapass.concept-spec/1`, `datapass.artifact/1`, `datapass.preview/1`, `datapass.engineering/1`) with their hashes |

Content always comes from the commit, so packing the same commit twice gives the same manifest.

**Before using a release, verify it** (Node 22, no install needed):

```sh
node scripts/sdk-verify.mjs <release-folder>     # or: npm run sdk:verify -- <release-folder>
```

It re-hashes the archive, every file inside it, the standalone files and the contract entries and exits 1 on any difference. Then check the identity by hand:

1. `sdkVersion` is the version you expect, and `sourceCommit` is the SHA you were told (compare all 40 characters).
2. `sourceTreeClean` is `true`. A `false` release was packed with `--allow-dirty`: the archive still holds the commit, but it is not a qualified release.
3. `archive.sha256` matches the hash you received through a separate channel (for example the hand-over message).

Then unpack and install:

```sh
mkdir sdk && tar -xzf datapass-mosaicstudio-sdk-<version>.tar.gz -C sdk --strip-components=1
cd sdk && npm ci --no-audit --no-fund && npm run bootstrap
npm run client:new -- my-client --family content
```

The archive has no `.git` folder: builds then record `sourceCommit: null` in their `preview.json`. Keep the `sdk-release.json` next to the consumer as the provenance record.

### The `datapass` command (0.12.0, F211)

`package.json` declares `bin: {"datapass": "scripts/datapass.mjs"}`. It is a thin dispatcher with no logic of its own: each command runs the same script with the same Node flags as its npm script, from the package root, passes the remaining arguments through and returns the script's exit code. The npm scripts keep working unchanged.

| `datapass …` | Same as |
|---|---|
| `new <id> [--family …]` | `npm run client:new -- …` |
| `check [<id>]` | `npm run client:check -- …` |
| `context <id>` | `npm run client:context -- …` |
| `dev <id>` | `npm run client:dev -- …` |
| `build <id>` | `npm run build:client -- …` |
| `preview-validate <preview.json>` | `npm run preview:validate -- …` |
| `concept-validate <spec>` | `npm run concept:validate -- …` |
| `pack` | `npm run sdk:pack -- …` (local folder only, nothing published) |
| `verify <dir>` | `npm run sdk:verify -- …` |
| `doctor` | `npm run doctor -- …` |

From an unpacked release it runs without linking: `node sdk/scripts/datapass.mjs context my-client`. Paths given as arguments are resolved from the package root, as with `npm run`. Artifact validation stays in Python, from `py/` of the source repository (not in the SDK archive): `python -m datapass_artifact validate <file>`; the bare form `python py/datapass_artifact.py <file>` still works.

## 3. Standalone concept viewer (single file)

`dist-standalone/concept-viewer.html` (also copied into every release folder) is one self-contained HTML file: open it by double-click or serve it from any static host. It needs no build and no network unless `?src=` asks for a URL. Its first lines carry the source commit and build date; its `sha256` is in `sdk-release.json`. Embedding and options: `spec/concept/v1/README.md`.

## Contracts

| Contract | File | Readers must |
|---|---|---|
| `datapass.concept-spec/1` | `spec/concept/v1/concept-spec.schema.json` | accept any `1.y.z`; see the folder README |
| `datapass.artifact/1` | `src/framework/foundation/artifact.ts` (`validateArtifact`) | reject unknown fields; the JSON Schema `docs/contracts/artifact.schema.json` is the exact structure gate (lineage fields included); semantic rules (references, duplicate ids, self-reference, row typing) and the 1 MiB envelope are separate validator gates. `py/datapass_artifact.py` mirrors all three; `tests/fixtures/artifact-corpus` is decided identically by all three (`npm run test:artifact-corpus`) |
| `datapass.preview/1` | `spec/preview/v1/preview.schema.json` | reject unknown fields; validate with `scripts/preview-validate.mjs --check-files` |
| `datapass.engineering/1` | `spec/engineering/v1/engineering.schema.json` (frozen sidecar; `src/framework/engineering/contract.ts`, `py/datapass_engineering.py`) | reject unknown kinds, versions and keys; digests name `bytes` or `datapass-c14n/1` (RFC 8785 JCS); vendor at a pinned commit and verify with `tests/fixtures/engineering` (`npm run test:engineering-corpus`); see the folder README |

### Provenance vocabulary for cross-product consumers

Studio contracts have no `verified` / `inferred` terms. A consumer that uses that vocabulary maps Studio values as follows and keeps the original value next to its own:

| Studio value | Meaning in Studio | Consumer term |
|---|---|---|
| artifact `provenance.kind: "synthetic"` | generated or illustrative reference data | neither: keep it labelled synthetic; never `verified` |
| artifact `provenance.kind: "provided"` | data supplied by a user or client, passed through unchecked | `inferred` (Studio checked structure and hashes only, not content) |
| artifact `provenance.kind: "computed"` | output of a run (`runId`, `inputHash`, `producer` declared by the producer) | `inferred` |
| concept `provenance: "synthetic"` | explanatory diagram without sources | neither: keep it labelled synthetic |
| concept `provenance: "documented"` | every node cites a source or evidence ref | `inferred` (the source is cited, not verified by Studio) |

No Studio value maps to `verified`: schema validation, content hashes and cited evidence prove integrity and attribution, not correctness.

## Upgrade

1. Read `docs/API_VERSION_MIGRATION_POLICY.md` and the release notes or commit log between your current SHA and the new one.
2. Move to the new SHA (method 1) or to the new verified release folder (method 2). Keep the previous one.
3. `npm ci --no-audit --no-fund && npm run bootstrap`.
4. `npm run contracts:check` (generated contracts have not drifted).
5. `npm run client:check -- <your-client>` for each client.
6. `npm run build:client -- <your-client>`, then `node scripts/preview-validate.mjs dist-clients/<your-client>/preview.json --check-files`, then the client's real browser checks.
7. Record the new SHA (and archive sha256) only when all of the above pass.

### 0.9.0 → 0.10.0

No format version changed. `datapass.artifact/1` gained optional lineage fields (`provenance.producer`, `inputs`, `inputHash`, `dependsOn`, `representation.inputs`); every file valid in 0.9.0 stays valid. The saved browser workspace stays `datapass.workspace` v1 and is restored unchanged by 0.10.0. The upgrade and both rollback cases below were executed with `scripts/release-upgrade-check.mjs` (record in `qa/FR-07-release-packaging.md`).

### 0.10.0 → 0.11.0

No format version changed (checked in source against `ec8d1f3`): the browser workspace stays `datapass.workspace` v1, the result store stays `datapass.result-store` with `datapass.cell-result` v1 entries, and `datapass.artifact/1`, `datapass.concept-spec/1` and `datapass.preview/1` are unchanged. Three additive changes:

- **Result-store manifest gains SQL source hashes** (M-SQLHASH, #53): `workspace.cells[].sourceSha256` for SQL cells, checked on reopen. A manifest written by 0.10.0 has none and opens unchanged; the first 0.11.0 save adds them.
- **Python model results can be saved to the store** (#65): a `datapass.cell-result` v1 with `cellKind: "python"` and `origin: "datapass.runtime/1"`, its artifact in one `application/vnd.datapass.artifact+json` output. The 0.10.0 service already accepted this kind.
- **Opt-in run history key** (F07, #56/#58): `datapass.run-history.<appId>.<resource>` (`datapass.run-history` v1) exists only for a client that sets `AppDefinition.runHistory`; refused snapshots are kept under `<key>.rejected`. Clients that do not opt in write nothing new.

The 0.10.0 → newer → 0.10.0 → newer cycle over one result store was executed for SQL results with `scripts/release-rollback-check.mjs` (record in `qa/M-ROLLBACK.md`, run at `e7db854`, the M-SQLHASH runtime that 0.11.0 ships). It was not re-run for #57-#65: those change cancellation, locking and the notebook UI, not the stored SQL format.

### 0.11.0 → 0.11.1

No format version changed and no SDK API changed: same `datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.artifact/1`, `datapass.concept-spec/1` and `datapass.preview/1` as 0.11.0. The only workbench change is the shipped `_headers` file (#73): its CSP `connect-src` now allows loopback http/ws, as `vite preview` already did. If you serve the workbench from a static host that applies `_headers`, replace the deployed folder with the 0.11.1 `dist/`; if you copied `_headers` into your own host configuration, update it from `scripts/workbench-headers.mjs`. Clients are rebuilt as usual (`npm ci`, `npm run bootstrap`, `build:client`); their own CSP (`scripts/client-csp.mjs`) is unchanged.

### 0.11.1 → 0.12.0

Stored formats keep their versions: `datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.run-history` v1, `datapass.artifact/1`, `datapass.concept-spec/1` and `datapass.preview/1` are read and written as in 0.11.1. New, beside them: the workspace revision sidecar `datapass.workspace.revision` (F205), the browser key `datapass.ab-pair.<appId>` (F207, opt-in clients), the export file `datapass.bundle` v1 status `candidate` (F208), results-only site run entries `site-<appId>-<taskId>` in the ResultStore (F206, opt-in clients) and the diagnostic codes (F209). SDK API additions only: `src/framework/{compute,storage,diagnostics}`, optional `AppDefinition.durableRuns`; `src/workspace/runtime.ts` re-exports the moved `RuntimeClient`. Follow the steps above, then:

1. **Client status (F213, required, see below).** Add `"status"` to each of your `client.config.json` files before `client:check`; without it every build is refused.
2. **Workbench.** Replace the deployed folder with the 0.12.0 `dist/`. Its `_headers` is the 0.11.1 policy; the zod `jitless` fix (#77) only removes CSP reports.
3. **Python runtime companion (optional).** It replaces running `py/service/app.py` from a checkout. Take `datapass-runtime-companion-0.12.0.tar.gz` and `runtime-companion.json` from the private 0.12.0 delivery, check the archive sha256 against the manifest, then install and start it as in [`RUNTIME_COMPANION.md`](RUNTIME_COMPANION.md) (own venv, `DATAPASS_RUNTIME_TOKEN`, `DATAPASS_SERVICE_ORIGINS`, optional `DATAPASS_ARTIFACT_DIR`). A static client still needs no Python.
4. `npm run doctor` reports the environment (Node, upstream pins, Python venv, ports, `_headers`) with one fix per finding.

### 0.12.0 → 0.13.0

Stored formats keep their versions: everything 0.12.0 reads and writes (`datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.run-history` v1, `datapass.artifact/1`, `datapass.concept-spec/1`, `datapass.preview/1`, `datapass.bundle` v1 candidate, the F205 sidecar and F207 keys) is unchanged. New beside them: the frozen sidecar contract `datapass.engineering/1` (#96). SDK API additions only: `src/framework/engineering/` (`contract.ts`, `binding.ts`, `receipt.ts`, `EngineeringBlocks.tsx`), `unitMismatch()` in the A/B helpers, optional `active()` passed through `wrapTask`. Follow the steps above, then:

1. **Python service profile (breaking for legacy callers).** The service (`py/service/app.py`, and the companion) now starts in the `safe` profile. In `safe`, `POST /compute/wind-reference`, `GET /artifacts/{id}`, `/docs`, `/redoc` and `/openapi.json` answer **404**. A caller of those legacy routes either passes **`--profile demo`** (or `DATAPASS_SERVICE_PROFILE=demo`; loopback only, never for the packaged companion) or migrates to **`/api/runtime/v1`**: `POST /api/runtime/v1/runs {"model": "wind-reference", "inputs": {...}}` with the `X-Datapass-Token` header, then `GET /runs/{runId}/artifact` (same rows, a `datapass.artifact` v1). Precomputed artifacts belong in the static client. `/health` no longer lists the model; use the authenticated `GET /api/runtime/v1/health`. Details: [`RUNTIME_COMPANION.md`](RUNTIME_COMPANION.md#profiles-and-legacy-route-migration). `npm run service:python` and `scripts/smoke-python-service.mjs` already pass `--profile demo`.
2. **Runtime wire (additive).** `Idempotency-Key` on `POST /api/runtime/v1/runs` (8-128 `A-Za-z0-9._:-`; same key and payload replays the first run, a changed payload answers 409), `cancelRequested` on every run record, authenticated `GET /api/runtime/v1/ready` (`{live, ready, checks[]}`). A client that ignores them keeps working; a 0.12.0 client against a 0.13.0 service works unchanged on the runs API. A 0.13.0 client reads a missing `cancelRequested` as `false`.
3. **Companion.** Replace a 0.12.0 companion with `datapass-runtime-companion-0.13.0.tar.gz` from the private 0.13.0 delivery (service 0.5.0, manifest `service.start` names `--profile safe`), install as in [`RUNTIME_COMPANION.md`](RUNTIME_COMPANION.md), then check `GET /api/runtime/v1/ready` with the token.
4. **`datapass.engineering/1` in another repository.** Vendor it instead of taking the whole SDK: copy `src/framework/engineering/contract.ts`, `spec/engineering/v1/engineering.schema.json` (sha256 `6ba8ee85…5a83`) and `tests/fixtures/engineering/` at one pinned commit, record the commit and file hashes, and run the corpus (decision, code, `where`, bytes and digest must match). Python consumers copy `py/datapass_engineering.py`. Never edit the copy. Steps: [`spec/engineering/v1/README.md`](../spec/engineering/v1/README.md#vendoring); for a 0.8.1 framework snapshot see [`UPGRADE_FOIL_STUDIO_0.13.md`](UPGRADE_FOIL_STUDIO_0.13.md).
5. Clients that show previous results now see the label "Previous result — not this run's output" after a failed or cancelled run; A/B comparisons with mismatched units are refused with the reason instead of being drawn.

### Client status is required from 0.12.0 (F213)

`datapass.client-profile` stays version 1 but now requires `status` (`reference`, `prototype`, `draft` or `frozen`). `client:check`, `client:context` and every build refuse a client without it (`DP-CLI-001`, unknown value `DP-CLI-002`), and a client folder without `client.config.json` is refused the same way. Each out-of-tree client adds one line before upgrading, for example `"status": "prototype"`; a client without a profile adds `{"format":"datapass.client-profile","version":1,"family":"content","status":"prototype"}` with its own family. `reference` is reserved for the AGENTS.md rule 17 public references. Status is a catalog label only: capabilities, CSP and build inclusion are unchanged. A profile with `status` is refused by 0.11.1 and older tooling (unknown key), so on rollback remove the line.

## Rollback

From 0.13.0 to 0.12.0 (not executed as a script; from the source of both versions, nothing stored changed):

- **Stored data.** No stored format changed, so the browser workspace, result store, run history, A/B pairs and bundles written by 0.13.0 are read by 0.12.0 as before.
- **Service and companion.** Stop the 0.13.0 service and start the 0.12.0 one (or companion `0.12.0`); it has no profiles, so the legacy routes come back without `--profile` and the `--profile` flag must be removed from any start command (0.12.0 does not know it). It ignores `Idempotency-Key` (a resend may start a second run) and has no `/ready` (404) and no `cancelRequested` (a 0.13.0 client reads `false`). Prefer rolling back client and service together.
- **Engineering records.** 0.12.0 has no `datapass.engineering/1` reader. Files you exported stay valid for 0.13.0 and for any vendored copy of the contract; a consumer that vendored the contract keeps its pinned copy and is unaffected by the Studio rollback.
- **Clients.** A client that imports `src/framework/engineering/*` or `unitMismatch` does not build on 0.12.0; remove that code or stay on 0.13.0.

From 0.12.0 to 0.11.1 (rollback check `scripts/release-rollback-check.mjs` executed with the 0.11.1 build `3575e6b` as the old release for F204, F205, F206, F207 and F208):

- **Client status (F213).** 0.11.1 tooling refuses a profile with `status` (unknown key): remove the line from each `client.config.json` before `client:check` or a build. This is the only refusal on rollback.
- **Browser workspace.** Same `datapass.workspace` v1 document; 0.11.1 restores it. The F205 sidecar `datapass.workspace.revision` is not read by 0.11.1 and stays in place; the next 0.12.0 load takes the stored document as its baseline, so no conflict banner opens for edits made under 0.11.1. Keep-aside behaviour is the 0.11.1 one: a document 0.11.1 refuses is moved, unchanged, to `datapass.workspace.rejected` and a refused run history to `<key>.rejected`, never overwritten. Nothing 0.12.0 writes is refused by 0.11.1, so nothing is moved aside by the rollback itself.
- **Result store.** 0.11.1 opens the 0.12.0 manifest, reopens SQL and Jupyter results by hash, and its own save keeps every result file, notebook file and saved site run entry (step 3 of the rollback check); back on 0.12.0, the site run reopens by its hash, not recomputed.
- **Saved A/B pairs (F207).** 0.11.1 does not read `datapass.ab-pair.*` keys and leaves them in place; returning to 0.12.0 restores them.
- **Bundles (F208).** 0.11.1 has no bundle reader; exported `datapass.bundle` files stay valid for 0.12.0 and `py/datapass_bundle.py`.
- **Runtime companion.** Stop it and start `py/service/app.py` from the 0.11.1 checkout or release instead; 0.11.1 has no `DATAPASS_ARTIFACT_DIR` (artifacts come from the checkout folder) and no results-only route, so a 0.12.0 client cannot save new site runs to it. Its venv folder can be removed by hand.

From 0.11.1 to 0.11.0: nothing stored changes. The 0.11.0 workbench `_headers` blocks the loopback runtime and Jupyter on a static host that applies it (SQL, notes and saved results opened in the browser still work); serve it without `_headers` or with the 0.11.1 policy if you need the runtime.

From 0.11.0 to 0.10.0:

- **Result store.** 0.10.0 opens a 0.11.0 manifest (the extra SQL hash field is ignored), reopens SQL and Jupyter results by hash without recomputing them, and its own save drops the SQL hashes; the next 0.11.0 save adds them back (executed, `qa/M-ROLLBACK.md`). Result files are immutable and neither side deletes them; each explicit save replaces only the previous notebook snapshot.
- **Saved Python model results** (#65) are not shown by 0.10.0: from the source of `ec8d1f3`, its workbench marks the cell as reopened without displaying the artifact, and its next save leaves that cell's result out of the notebook snapshot. The result file stays in the store folder. Not executed; save again from 0.11.0 after returning to it, or rerun the model cell.
- **Browser workspace.** Unchanged format; 0.10.0 restores a workspace saved by 0.11.0.
- **Run history** (opt-in clients only). 0.10.0 does not read `datapass.run-history.*` keys and leaves them in place; returning to 0.11.0 restores them.

From 0.10.0 to 0.9.0: a workspace that holds only SQL and note cells is restored by 0.9.0. A workspace that holds a 0.10.0-only cell kind (`jupyter` or `inert`) is refused by 0.9.0 with a notice; its bytes are kept, unchanged, under the browser storage key `datapass.workspace.rejected` and a blank workspace opens. Nothing is deleted. Before rolling back, use **Export workspace** (or copy that key) and, after returning to 0.10.0, bring it back with **Import workspace**. The optional 0.10.0 result store (`py/service/app.py --results-dir <folder>`) is a folder outside Git that 0.9.0 does not read; it is left as it is.

Go back to the previous pinned SHA (`git checkout --detach <previous-sha>`) or the previous verified release folder, run `npm ci` and `npm run bootstrap` again, and rebuild the client. Client folders are owned by the consumer and are never overwritten by an upgrade, so a rollback only changes the framework. Saved user states follow the format rules in the migration policy: a state saved by a newer client version may be refused by the older one.

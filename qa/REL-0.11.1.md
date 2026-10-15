# REL 0.11.1 — release receipt (DataPass MosaicStudio)

Patch release of 2026-10-14, lane `01-mosaicstudio`, to package the workbench `_headers` CSP fix (#73, omission 2 of [`FIN-0.11.0.md`](FIN-0.11.0.md)). Built from the exact commit **`3575e6b048a6cf4ff19ce7746d2dacef648e28bf`** (squash of #75, "release: DataPass MosaicStudio 0.11.1"), which contains #73 (`f42c8a9`). In the build worktree `git rev-parse HEAD` gave that commit, `git status --porcelain` was empty before and after the build, and `sdk:pack` recorded `sourceTreeClean: true`. CI on that commit: [Studio web gate run 38644459332](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/38644459332) (push, success); the PR head (same tree `8b7e713`) passed [run 38643006070](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/38643006070).

Scope: only what changed since 0.11.0 was re-tested. The 0.11.0 qualification (JOURNEY-01, JOURNEY-02, FIN-01..06) is reused at its SHA and was not re-run. Nothing was tagged, publicly published or deployed; no licence decision. All data synthetic.

## What changed since 0.11.0 (`0bc8c8c..3575e6b`)

- `src/`, `py/`, `spec/`, `docs/contracts/`: **no change**, so the contract pins of 0.11.0 hold unchanged (table in `FIN-0.11.0.md#pins`).
- Workbench `dist/`: per-file hashes from both release manifests differ in **one file only, `_headers`** (112 files each). `vite.config.ts` and `scripts/prepare-assets.mjs` now take the policy from `scripts/workbench-headers.mjs`.
- Standalone viewer: rebuilt for the version; the diff is the two header-comment lines (version, source commit, build date).
- SDK archive: 347 files (339 in 0.11.0). Added: `scripts/workbench-headers.mjs`, `scripts/workbench-headers.d.mts`, `scripts/smoke-static-headers.mjs`, and `docs/roadmap/tech-lead-2026-10-14/*` (5 docs from #74, already public in this repository). Nothing removed.
- Reference clients `foil-wind`, `galaxy-finition` (#68, #69, #72) live under `clients/`, which is not part of the SDK archive or the workbench build.

## Distribution

Local release folder (owner machine, not committed): `<releases>/datapass-mosaicstudio/0.11.1-3575e6b/`. `sha256sum -c SHA256SUMS`: 5 of 5 OK.

| File | Bytes | sha256 |
|---|---:|---|
| `datapass-mosaicstudio-sdk-0.11.1.tar.gz` | 703,932 | `b7384939c8bab9c26580ceac4d141ddbdc98764ca797c53676456661b7f32a67` |
| `datapass-mosaicstudio-workbench-0.11.1.zip` | 20,618,296 | `652677cedb5ea383773a2221ce0b361f102c9edb7e12ae0527cc5ada8bc6ecf0` |
| `concept-viewer.html` | 974,386 | `62b451fd3e98a5303b88cca407be1eeff6f05c1c78eb166188df6bff0ac7670c` |
| `sdk-release.json` | 59,066 | `03e0ced2602774c501161ab7f5de60e77b61fbb7da956dd82708f6c51b7c3480` |
| `release-manifest.json` | 20,011 | `e8c60c3320b82f019e8853dc01ab4b143009e06d492607ea8413d9221a808b36` |
| `SHA256SUMS` | 472 | `3548a06e606aca427343974aa38b81c8228b4390e1b7c7cc179fc54888b7cc54` |

- `sdk-release.json`: `sdkVersion 0.11.1`, `sourceCommit 3575e6b…`, `sourceTreeClean true`. `sdk:verify` on the release folder: 347 files, 1 standalone file, 3 contracts.
- Release manifest trees: workbench `244b335c83b7f4cf…` (112 files, 90,690,878 bytes), concept-viewer `d10826499a40de5a…`, SDK `135690f4f0c141c5…`.
- Workbench zip: same deterministic recipe as 0.11.0 (sorted paths, 1980-01-01, mode 0644, deflate 9); built twice, identical sha256.

## Tests (affected only)

| Check | Target | Result |
|---|---|---|
| `test:static-headers` (`scripts/smoke-static-headers.mjs`) | the **unzipped release zip**, served with its own `_headers` on 127.0.0.1:24331, runtime `py/service` at `3575e6b` on 24831 | **PASS**: served CSP equals the shipped `_headers`; runtime bar reached "connected" through the consent; loopback `ws://` not blocked by CSP; a non-loopback fetch blocked by `connect-src` |
| Same check, negative control | the unzipped **0.11.0** zip | **FAIL as expected**: served CSP `connect-src 'self' blob:`; runtime never connects (30 s timeout) — the defect 0.11.1 fixes |
| `tests/workbench-headers.test.mjs`, `tests/sdk-release.test.mjs`, `tests/release-0.10.test.mjs` | build worktree at `3575e6b` with `dist/`, `public/_headers` and `dist-sdk/` present | 17 / 17 pass, 0 skipped |
| `npm run contracts:check` | `3575e6b` | PASS (contracts unchanged, both concept examples valid, artifact corpus 115 files) |
| `sdk:verify` | local release folder and the authenticated re-download | PASS both (347 files, 1 standalone, 3 contracts, commit `3575e6b048a6`) |
| `license-inventory --check` | release branch | PASS (792 npm packages) |
| CI Studio web gate (full suite incl. browser tests, client builds, SDK archive check) | PR head and `3575e6b` push | PASS |
| JOURNEY-01 under `_headers` (2026-10-15, [below](#journey-01-under-_headers)) | the **unzipped 0.11.1 release zip** served with its own `_headers` | **Functional PASS, CSP-clean FAIL**: all 15 steps pass (runtime consent, paired Jupyter kernel, save, reopen with 0 `POST /runs` and 0 Jupyter calls), served headers equal `_headers` on every document, `connect-src` still blocks a non-loopback fetch; but 16 `script-src 'eval'` violation reports (zod 4's caught `new Function` probe, 8 bundled copies x 2 page loads) |
| Same journey | `dist/` built from the fix (zod jitless in `src/main.tsx`), served with its own `_headers` | **PASS**, 0 CSP violations |

Not re-run (reused from `FIN-0.11.0.md` at `0bc8c8c`, valid because `src/`, `py/` and every workbench file except `_headers` are byte-identical): JOURNEY-01 installed-workbench journey, JOURNEY-02 new client from the SDK, FIN-01..04. JOURNEY-01 itself was then re-run **with `_headers` applied** on 2026-10-15 (next section): the inference above is now VERIFIED for function, and it found one CSP finding, fixed on `main` after 0.11.1.

## JOURNEY-01 under `_headers`

Run 2026-10-15 by `qa/REL-0.11.1/journey01-headers.spec.ts` (config `journey01-headers.config.ts`), the FIN-0.11.0 JOURNEY-01 spec recovered unchanged in its 15 steps plus header and CSP checks. The workbench folder is served by `qa/REL-0.11.1/serve-with-headers.mjs`, which applies that folder's own `_headers` the way Netlify / Cloudflare Pages do, on 127.0.0.1:24341. Python runtime on 28841 and Jupyter Server 2.21.1 on 28842 from `py/` on `main` (byte-identical to `3575e6b`), fresh venv with the pinned `py/service/requirements*.txt` and `duckdb==1.4.3`, `DATAPASS_REQUIRE_JUPYTER=1`. Playwright 1.63.0, Chromium 153.0.8010.12. Release folder `sha256sum -c SHA256SUMS` 5 of 5 OK before unzipping. All data synthetic; runtime tokens are redacted in the logs.

Added to each run: every workbench document response must carry exactly the `/*` headers of the shipped `_headers` (3 documents: two workbench loads and `?artifact=1`, 0 mismatches); every `securitypolicyviolation` event and every CSP console report is recorded; a fetch to `http://192.0.2.1:9` must be blocked by `connect-src` (it was, in both runs), proving the policy is enforced and not bypassed.

| | 0.11.1 release zip | Fixed `dist/` |
|---|---|---|
| Steps 1-15 (consent, CSV, Jupyter pairing, SQL, representations, export, approved Python, Jupyter table, dependent SQL, save, close, reopen, cross-app import/export, file:// concept viewer) | pass | pass |
| Save | "Saved 4 results and the notebook", each file's sha256 equals its name | same |
| Reopen from store | 4 cells, same result sha, "Not recomputed", 0 `POST /runs`, 0 Jupyter calls, store hashes unchanged | same |
| Served headers vs `_headers` | equal (3 of 3) | equal (3 of 3) |
| CSP violations | **16**, all `script-src eval` from `assets/App-*.js` | **0** |
| Page errors / external requests / Jupyter token in service logs | 0 / 0 / no | 0 / 0 / no |
| `py/datapass_artifact.py --set` on the 3 exports | ok | ok |
| Cross-app re-export sha256 | `6d896cd3…` (identical to FIN-0.11.0) | `6d896cd3…` |

**Finding (CSP-1).** The 16 reports come from zod 4, bundled eight times by `@sqlrooms/*` (the app's own zod is 3.24.2). On its first object parse each copy runs `try { new Function("") } catch {}` to decide whether to JIT its parsers. The shipped CSP has no `'unsafe-eval'`, so the probe is blocked and zod falls back to its non-JIT path; nothing breaks, but the browser emits one violation per copy and page load, which a host with CSP reporting would collect as noise and which hides real violations. Not fixed by loosening the policy: `src/main.tsx` now sets the zod global config `jitless: true` (shared by every copy through `globalThis.__zod_globalConfig`) before any module loads, so the probe never runs. `tests/browser/csp-clean.spec.ts` (CI) opens `?workspace=blank` and `?artifact=1` under the preview CSP, which equals `_headers`, and asserts 0 violations; against the 0.11.1 zip served with its `_headers` it fails with the same eight `eval` reports per load (negative control), against the fixed build it passes.

The fix is on `main` after 0.11.1; the 0.11.1 bytes are not changed (immutable). It ships with the next package version.

Evidence: [`REL-0.11.1/journey01-package/`](REL-0.11.1/journey01-package/) and [`REL-0.11.1/journey01-fixed/`](REL-0.11.1/journey01-fixed/) (journey log with every recorded violation, exports with their hashes, step-12 screenshot).

## Private delivery

Destination: the existing private GitLab vault (pre-granted for a new immutable path, owner rules V5.7 of 2026-10-13). Generic package `datapass-mosaicstudio-sdk`, new version path **`0.11.1-3575e6b`**; `0.10.0-e7db854` (1 file) and `0.11.0-0bc8c8c` (6 files) are untouched. Before upload the version path answered 404 for every file. Vault URLs are deliberately not recorded in this public repository.

- Confidentiality scan before upload (465 files: SDK and workbench extracted plus the loose files): no secret, token, key, Windows user path, owner e-mail, vault name or client data. Benign hits only (upstream DuckDB build paths and licence e-mail; `docs/RECOVERY_2026-10-10.md` folder names already public since 0.10.0).
- Uploaded 2026-10-14T22:24Z. The registry's `file_sha256` for all six files equals the table above.
- Authenticated re-download into a fresh folder: `sha256sum -c SHA256SUMS` 5 of 5 OK, `SHA256SUMS` itself `3548a06e…`, `sdk:verify` PASS.
- Anonymous requests: package files HTTP **401**, project API HTTP 404.
- No tag, public publication, Marketplace or deployment.

## Omissions and known issues

1. ~~Full JOURNEY-01 with `_headers` applied not re-run.~~ Done 2026-10-15 ([JOURNEY-01 under `_headers`](#journey-01-under-_headers)): functional PASS on the 0.11.1 zip including a paired Jupyter kernel; finding CSP-1 (zod `eval` probe reports) is fixed on `main`, not in the 0.11.1 bytes.
2. The standalone viewer header names `f42c8a9` as its source commit (built on the release branch before the squash); its content is otherwise identical to the viewer built at `5090bd0`.
3. Carried from 0.11.0 and unchanged: lineage table layout on `?artifact=1` (omission 5), npm 11 esbuild postinstall warning, no Edge/Positron or cross-OS run, E2E-05 PARTIAL, E2E-06 BLOCKED.
4. Licence and any public publication remain an owner gate.

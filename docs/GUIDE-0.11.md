# DataPass MosaicStudio 0.11.0: short user guide

For **0.13.1** the steps are the same as for 0.13.0 below: read `0.13.1` wherever a file name or `sdkVersion` says `0.11.0`. Upgrade from and rollback to 0.13.0: [`CONSUMING.md`](CONSUMING.md#0130--0131); what changed: [`RELEASE_NOTES.md`](RELEASE_NOTES.md#0131-2026-10-23).

For **0.13.0** the steps are the same: read `0.13.0` wherever a file name or `sdkVersion` below says `0.11.0`. The Python service now starts in the `safe` profile: the legacy `/compute`, `/artifacts` and `/docs` routes need `--profile demo` (loopback only) or a move to `/api/runtime/v1`. Upgrade from and rollback to 0.12.0: [`CONSUMING.md`](CONSUMING.md#0120--0130); what changed: [`RELEASE_NOTES.md`](RELEASE_NOTES.md#0130-2026-10-22).

For **0.12.0** the install, verify and run steps are the same: read `0.12.0` wherever a file name or `sdkVersion` below says `0.11.0`. Before upgrading, add `"status"` to each `client.config.json` (F213), and if you use the Python runtime outside a checkout, install the private runtime companion with [`RUNTIME_COMPANION.md`](RUNTIME_COMPANION.md). Upgrade from and rollback to 0.11.1: [`CONSUMING.md`](CONSUMING.md#0111--0120); what changed: [`RELEASE_NOTES.md`](RELEASE_NOTES.md#0120-2026-10-16).

For **0.11.1** the steps are the same: read `0.11.1` wherever a file name or `sdkVersion` below says `0.11.0`. What changed is in [`RELEASE_NOTES.md`](RELEASE_NOTES.md#0111-2026-10-14).

Four things are handed over for a release, each identified by hashes: the **SDK release folder** (archive, `sdk-release.json`, standalone viewer), the **built workbench** folder, the **Python runtime** (`py/` of the release commit) and optionally built reference clients. Nothing here is published, tagged or deployed for you, and no license is granted (see [`CONSUMING.md`](CONSUMING.md)). All data in the examples is synthetic.

Requirements: Node 22 or later with npm, Git and network access to GitHub for `npm run bootstrap` (pinned upstream engines), and a Python 3 venv only for the runtime. Use ports above 20000 for local servers if other tools already use 4173/5173/8765.

## 1. Install the SDK archive outside a checkout

Put the release folder anywhere that is not inside a Git working copy, for example `C:\work\mosaic-0.11.0\`.

Verification is plain Node (no install). Unpack the archive, then run its verifier against the release folder:

```sh
mkdir sdk && tar --force-local -xzf <release-folder>/datapass-mosaicstudio-sdk-0.11.0.tar.gz -C sdk --strip-components=1
node sdk/scripts/sdk-verify.mjs <release-folder>
```

`--force-local` makes GNU tar (Git Bash, Linux, macOS with gtar) treat a drive-letter path such as `D:/work/...` as a local file instead of a `host:path` remote archive. Windows' own `C:\Windows\System32	ar.exe` (bsdtar) does not know that option: in PowerShell or cmd run the same command without `--force-local`.

It re-hashes the archive, every file inside it, the standalone viewer and the contract files, and exits 1 on any difference. Then check by hand in `sdk-release.json`: `sdkVersion` is `0.11.0`, `sourceCommit` is the full 40-character SHA you were given, `sourceTreeClean` is `true`, and `archive.sha256` equals the hash received through a separate channel.

```sh
cd sdk
npm ci --no-audit --no-fund
npm run bootstrap
```

The archive has no `.git`: built clients record `sourceCommit: null` in `preview.json`. Keep `sdk-release.json` next to your project as its provenance record.

## 2. Create a client

```sh
npm run client:families                       # pick a family (content, knowledge, analytics, spatial, replay)
npm run client:new -- my-client --family content --title "My client"
npm run client:context -- my-client            # the capability-specific guide for this client
npm run client:check -- my-client
```

`client:new` never overwrites an existing folder. Your sources and data live in `clients/my-client/`.

## 3. Build and preview

```sh
npm run client:dev -- my-client --port 25173  # live editing
npm run build:client -- my-client             # -> dist-clients/my-client/ (prints "No deployment was performed")
node scripts/preview-validate.mjs dist-clients/my-client/preview.json --check-files
npx vite preview --outDir dist-clients/my-client --host 127.0.0.1 --port 24174
```

Open `http://127.0.0.1:24174/` and check the pages in a real browser (responsive widths and reduced motion included).

## 4. Deploy as static files, without T3

`dist-clients/my-client/` is a self-contained static site with relative asset paths (`base: './'`). Copy the folder as-is to any static host or subfolder; no server code, Node process or T3 is needed. T3 is an optional authoring host only. The build defaults to preview mode (`noindex`, disallow robots); public mode needs an explicit canonical URL and approved assets (`docs/recipes/public-site.md`). A public URL is not access control: publish only approved data.

## 5. Workbench and Python runtime

The workbench (blank workspace → data → SQL/Python → result → chart → save → reopen) is a separate static build, not part of the SDK archive.

- **Built workbench folder:** serve it with any static server on loopback, for example `npx vite preview --outDir <workbench-folder> --host 127.0.0.1 --port 24173`. From a checkout of the release commit, `npm run build` produces it in `dist/`.
- **Python runtime** (`py/` of the release commit, also not in the SDK archive):

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r py/service/requirements.txt -r py/service/requirements-jupyter.txt
export DATAPASS_SERVICE_ORIGINS=http://127.0.0.1:24173      # PowerShell: $env:DATAPASS_SERVICE_ORIGINS='http://127.0.0.1:24173'
.venv/Scripts/python py/service/app.py --port 28765 --workbench-origin http://127.0.0.1:24173 --results-dir <folder outside Git>
.venv/Scripts/python py/service/jupyter_local.py --port 28888 --workbench-origin http://127.0.0.1:24173   # optional Jupyter cells
```

Open the link that `app.py` prints (the token is in the URL fragment). Both services bind 127.0.0.1 only and must not be exposed on a network. Models run only from the allowlist; nothing executes user text. **Save results to store** writes immutable results to the `--results-dir` folder; **Open from store** brings them back marked "Not recomputed", with no run submitted. In 0.11.0 this includes Python model results, and the notebook keeps its results and kernel when you switch to another module and back.

## 6. Upgrade from 0.10.0 and roll back

No format version changed. Steps:

1. Keep the 0.10.0 release folder, workbench and runtime. Use **Export workspace** in the workbench and copy the `--results-dir` folder.
2. Verify the 0.11.0 folder (section 1), reinstall (`npm ci`, `npm run bootstrap`), then `npm run contracts:check`, `npm run client:check -- <client>` and `npm run build:client -- <client>` for each client.
3. Point the 0.11.0 runtime at the same `--results-dir`: saved results reopen without recomputation, and the next save adds SQL source hashes to the manifest.

**Rolling back to 0.10.0:** reinstall the 0.10.0 folder and rebuild your clients; client folders are never overwritten. 0.10.0 reopens SQL and Jupyter results from the same store and its save drops the SQL hashes (restored by the next 0.11.0 save). It does not display Python model results saved by 0.11.0 and leaves them out of its next save; the result files remain in the store. Details and evidence: [`CONSUMING.md`](CONSUMING.md#0100--0110), `qa/M-ROLLBACK.md`.

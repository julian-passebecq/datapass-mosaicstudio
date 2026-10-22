# Python runtime companion

The runtime companion is the Python side of DataPass MosaicStudio packed on its own: the loopback service
(`py/service/*.py`, tests excluded), the artifact library (`py/datapass_artifact.py`), the ILLUSTRATIVE wind
reference model (`py/wind_reference_model.py`), the pinned requirement files and this guide. It installs and starts
outside a checkout, so a machine that only consumes static clients does not need the repository.

It is **optional**. A static client built with `npm run client:build` needs no Python and still opens without it
(`npm run test:client-builds` proves this). The companion only adds the token-protected loopback runs API
(`datapass.runtime/1`); it starts in the `safe` profile (see [Profiles and legacy-route migration](#profiles-and-legacy-route-migration)).

It is **private**: never published publicly (no PyPI, npm, public release, tag or Marketplace). The manifest records
`publication.public: false`. Delivering an archive to a private vault is a separate, explicit release act.

The models it serves are ILLUSTRATIVE (generic power curve, textbook Weibull wind). Not FOIL data, not a site assessment.

## What `runtime:pack` writes

```
npm run runtime:pack                      # from a clean checkout; --allow-dirty records sourceTreeClean:false
```

`dist-runtime/` (gitignored) then holds:

| File | Content |
|---|---|
| `datapass-runtime-companion-<version>.tar.gz` | `git archive` of HEAD, companion paths only, one top folder `datapass-runtime-companion-<version>/` |
| `runtime-companion.json` | format `datapass.runtime-companion` v1: `sdkVersion`, `sourceCommit`, `sourceTreeClean`, `commitDate`, `service` (entry, name, version, model version, health path), `archive` (name, bytes, sha256), `files` (path, bytes, sha256 of every file), `requirements` (each file's sha256 and its exact `name==version` lines), `env`, `publication`, `license` |

The archive content comes from the HEAD commit, never from uncommitted files, so one commit gives the same bytes.
Packing refuses any path outside the allowlist and any test, notebook, example, `clients/`, `qa/`, `.env*`, key or
credential file, and any requirement line that is not an exact pin.

## Check a companion

```
npm run runtime:verify                    # = node scripts/runtime-verify.mjs dist-runtime
node scripts/runtime-verify.mjs dist-runtime --no-start            # hashes only, no Python needed
node scripts/runtime-verify.mjs dist-runtime --python .venv/Scripts/python --port 24360
```

Static part: re-hashes the archive and every file against the manifest, checks the recorded pins against the
archived requirement files and that the manifest's start command is `py/service/app.py --profile safe`. Live part
(default): extracts the archive to a new OS temp folder, runs that start command there on `127.0.0.1:24360` (any port
above 20000) with a random token and an absent `DATAPASS_ARTIFACT_DIR`, and probes the actual endpoints with raw HTTP
requests: 401 without a token, with a wrong token and with the token in the query string; 403 for a foreign `Origin`
on `POST /runs`; 400 for a wrong `Host`; 411 without `Content-Length` and 413 above 2 KB; 422 for traversal run ids
(`../` and `%2e%2e%2f`); 404 for an unknown model; 404 for every legacy route and `/docs`, `/redoc`, `/openapi.json`;
the `/ready` shape with no token or path in it; an `Idempotency-Key` replay and its 409; `cancelRequested` on a slow
grid run (resolution 80) before the worker confirms `cancelled`; markup echoed JSON-escaped with a JSON content type and
`nosniff`; one ILLUSTRATIVE run. It then starts the same files with `--profile demo` on the next port and checks that
the legacy routes still answer behind the Host and Origin guards. Every probe prints `PASS` or `FAIL`; the token is
never printed. Both processes are stopped and the folder removed. Exit 0 = every probe passed.

## Install and start outside a checkout

A Python 3 that installs the pinned `py/service/requirements.txt` (CI uses the runner's Python). Use a folder you own; the commands create a virtual environment inside it, nothing global.
Replace `0.13.1` with the version in the archive name, and check the hash first.

### PowerShell

```powershell
$v = "0.13.1"
$dir = "$env:LOCALAPPDATA\DataPass\runtime-companion"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item "dist-runtime\datapass-runtime-companion-$v.tar.gz", "dist-runtime\runtime-companion.json" $dir
Set-Location $dir
# Hash check: must equal archive.sha256 in runtime-companion.json
(Get-FileHash "datapass-runtime-companion-$v.tar.gz" -Algorithm SHA256).Hash.ToLower()
(Get-Content runtime-companion.json -Raw | ConvertFrom-Json).archive.sha256
tar -xzf "datapass-runtime-companion-$v.tar.gz"
Set-Location "datapass-runtime-companion-$v"
python -m venv .venv
.venv\Scripts\python -m pip install -r py/service/requirements.txt
$env:DATAPASS_RUNTIME_TOKEN = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$env:DATAPASS_ARTIFACT_DIR = "$dir\artifacts"          # optional: precomputed artifacts you approved
$env:DATAPASS_SERVICE_ORIGINS = "http://127.0.0.1:5173" # the origin of the workbench or client you open
.venv\Scripts\python py/service/app.py --profile safe --port 24360
```

### Git Bash

```bash
v=0.13.1
dir="$LOCALAPPDATA/DataPass/runtime-companion"     # or "$HOME/.datapass/runtime-companion" elsewhere
mkdir -p "$dir"
cp "dist-runtime/datapass-runtime-companion-$v.tar.gz" dist-runtime/runtime-companion.json "$dir/"
cd "$dir"
# Hash check: the two lines must match
sha256sum "datapass-runtime-companion-$v.tar.gz" | cut -d' ' -f1
node -p "require('./runtime-companion.json').archive.sha256"
tar -xzf "datapass-runtime-companion-$v.tar.gz"
cd "datapass-runtime-companion-$v"
python -m venv .venv
.venv/Scripts/python -m pip install -r py/service/requirements.txt   # .venv/bin/python on Linux/macOS
export DATAPASS_RUNTIME_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
export DATAPASS_ARTIFACT_DIR="$dir/artifacts"          # optional
export DATAPASS_SERVICE_ORIGINS="http://127.0.0.1:5173"
.venv/Scripts/python py/service/app.py --profile safe --port 24360
```

The service prints a connect line (`#runtime=…&token=…`) on stderr. Open it in the workbench, or give the runtime URL
and token to a client that declares the runtime. It binds `127.0.0.1` only; do not expose it on a network.

### Environment

| Variable | Meaning |
|---|---|
| `DATAPASS_RUNTIME_TOKEN` | 16-128 URL-safe characters, sent as `X-Datapass-Token` to `/api/runtime/v1`; random when unset |
| `DATAPASS_SERVICE_PROFILE` | `safe` (default) or `demo`; `--profile` wins. Anything else refuses to start |
| `DATAPASS_ARTIFACT_DIR` | demo profile only: folder of precomputed `datapass.artifact` files for `GET /artifacts/{id}`; unset = the checkout folder `clients/python-wind-reference/public/artifacts`, which a companion does not have; a missing folder answers 404 |
| `DATAPASS_SERVICE_PORT` | default port when `--port` is not given (8765) |
| `DATAPASS_SERVICE_ORIGINS` | comma-separated origins allowed by CORS and the runtime guard |

User inputs sent to the runtime may still be sensitive; results stay in memory unless you pass `--results-dir`.

## Profiles and legacy-route migration

Service 0.5.0 (`datapass-artifact-service`) has two profiles, chosen by `--profile`, else `DATAPASS_SERVICE_PROFILE`,
else `safe`:

| Route | `safe` (default, packaged start) | `demo` |
|---|---|---|
| `GET /health` | minimal liveness `{status, service, version, profile}`, no token, no secrets | same |
| `/api/runtime/v1/*` (incl. `GET /ready`) | `X-Datapass-Token` header required | same |
| `/api/notebook/v1/*` (when `nbformat` is installed) | token required | same |
| `GET /artifacts/{id}` | **404** | served, no token; loopback `Host`; a request with an `Origin` header must come from an allowed origin (403 otherwise) |
| `POST /compute/wind-reference` | **404** | same as above |
| `/docs`, `/openapi.json` | **404** (also `/redoc`) | served |

Migration for callers of the legacy level 3 routes:

- **Use the runs API instead.** `POST /api/runtime/v1/runs {"model": "wind-reference", "inputs": {k, c, hubHeight}}` with
  the token computes the same rows as `POST /compute/wind-reference` (`py/service/test_runtime.py` checks this) and returns a
  `datapass.artifact` v1 through `GET /runs/{runId}/artifact`.
- **Precomputed artifacts** belong in the static client (`public/artifacts/*.json`), not behind an unauthenticated route.
- **Local demos and smoke tests** that still need the legacy routes start the service with `--profile demo`:
  `npm run service:python` and `scripts/smoke-python-service.mjs` do. Never use `demo` for the packaged companion.
- `/health` no longer lists the model version or `illustrative`; `GET /api/runtime/v1/health` (token) still does.

Additive `datapass.runtime/1` wire (frozen in `spec/engineering/v1/README.md`; clients that ignore it keep working):

- `GET /api/runtime/v1/ready` → `{"live": true, "ready": bool, "checks": [{"id", "ok", "detail"}]}`: `workers`,
  `run-capacity` (false while all run slots are taken), `models`, `profile`, `result-store` (configured and writable, or
  not configured) and `notebook-routes` (optional: unavailable with the reason when `nbformat` is missing; never makes
  `ready` false). No token, path or input value appears in it.
- `Idempotency-Key` header on `POST /runs` (8-128 characters of `A-Za-z0-9._:-`, else 422 `DP-RT-IDEMPOTENCY-KEY`):
  the same key with the same payload (`{model, inputs}`, compared by its `datapass-c14n/1` digest) answers the first run
  record again with 200 and starts nothing; the same key with another payload answers 409
  `DP-RT-IDEMPOTENCY-CONFLICT`. The service keeps the last 256 keys in memory; a key whose run left the 50-run
  history starts a new run.
- `cancelRequested` on every run record. Cancelling a running run sets it to `true` and keeps `status: "running"` until
  the model observes the cancel; only then is the run `cancelled`. A queued run is cancelled at once.
- Runtime error bodies write `<`, `>` and `&` as `<`, `>`, `&`, so echoed input never forms markup;
  every response is `application/json` with `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- Run paths with `..` segments or encoded `.`, `/` or `\` answer 422 `DP-RT-PATH` (after the token check).

## Upgrade and remove

Stop the service, check the new archive's hash, extract it next to the old folder, create a new `.venv`, start it.
Removing the companion is deleting its folder; nothing else was installed.

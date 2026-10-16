# Python runtime companion

The runtime companion is the Python side of DataPass MosaicStudio packed on its own: the loopback service
(`py/service/*.py`, tests excluded), the artifact library (`py/datapass_artifact.py`), the ILLUSTRATIVE wind
reference model (`py/wind_reference_model.py`), the pinned requirement files and this guide. It installs and starts
outside a checkout, so a machine that only consumes static clients does not need the repository.

It is **optional**. A static client built with `npm run client:build` needs no Python and still opens without it
(`npm run test:client-builds` proves this). The companion only adds the loopback runs API (`datapass.runtime/1`) and
the precomputed-artifact endpoint.

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

Static part: re-hashes the archive and every file against the manifest and checks the recorded pins against the
archived requirement files. Live part (default): extracts the archive to a new OS temp folder, starts
`py/service/app.py` there on `127.0.0.1:24360` (any port above 20000) with a random token and an absent
`DATAPASS_ARTIFACT_DIR`, checks `/api/runtime/v1/health`, the token guard (401 without it), the 404 for the missing
artifact folder and one ILLUSTRATIVE run, then stops the process and removes the folder. Exit 0 = verified.

## Install and start outside a checkout

A Python 3 that installs the pinned `py/service/requirements.txt` (CI uses the runner's Python). Use a folder you own; the commands create a virtual environment inside it, nothing global.
Replace `0.12.0` with the version in the archive name, and check the hash first.

### PowerShell

```powershell
$v = "0.12.0"
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
.venv\Scripts\python py/service/app.py --port 24360
```

### Git Bash

```bash
v=0.12.0
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
.venv/Scripts/python py/service/app.py --port 24360
```

The service prints a connect line (`#runtime=…&token=…`) on stderr. Open it in the workbench, or give the runtime URL
and token to a client that declares the runtime. It binds `127.0.0.1` only; do not expose it on a network.

### Environment

| Variable | Meaning |
|---|---|
| `DATAPASS_RUNTIME_TOKEN` | 16-128 URL-safe characters, sent as `X-Datapass-Token` to `/api/runtime/v1`; random when unset |
| `DATAPASS_ARTIFACT_DIR` | folder of precomputed `datapass.artifact` files for `GET /artifacts/{id}`; unset = the checkout folder `clients/python-wind-reference/public/artifacts`, which a companion does not have; a missing folder answers 404 |
| `DATAPASS_SERVICE_PORT` | default port when `--port` is not given (8765) |
| `DATAPASS_SERVICE_ORIGINS` | comma-separated origins allowed by CORS and the runtime guard |

User inputs sent to the runtime may still be sensitive; results stay in memory unless you pass `--results-dir`.

## Upgrade and remove

Stop the service, check the new archive's hash, extract it next to the old folder, create a new `.venv`, start it.
Removing the companion is deleting its folder; nothing else was installed.

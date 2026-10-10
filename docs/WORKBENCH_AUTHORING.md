# Browser authoring workbench (0.9)

The root route is the traditional browser workbench: SQLRooms + DuckDB-WASM in the page, plus an optional trusted local Python runtime. It is separate from client websites (`?app=<id>`) and the reference gallery (`?sites=1`). T3 is not needed for any of it.

## Entry points

| Address | What opens | Data loaded |
|---|---|---|
| `/` | The workbench with your saved workspace (Notebook on first visit) | Nothing, unless you chose the sample earlier |
| `/?workspace=blank` | The workbench without the sample for this visit | Nothing |
| `/?sample=operations` | The workbench with the deterministic synthetic sample (360 rows) | `operations`, labelled synthetic |
| `/?module=<id>` | One module: `notebook`, `explore`, `linked`, `sql`, `pipeline`, `stories`, `explain`, `board`, `architecture` | as above |
| `/?embed=1&module=stories\|explain\|architecture` | Narrative embeds, no database | none |
| `/?app=<id>` | One client website (client preview) | the client's approved data |
| `/?sites=1` | The reference gallery | reference fixtures |
| `dist-standalone/concept-viewer.html` | The standalone concept viewer, opened as a file | the `.concept.json` you give it |

The sample is never forced. In a blank workspace, *Data explorer* and *Linked views* offer **Load synthetic sample** explicitly.

## Notebook

A notebook is a list of cells: **SQL**, **Python** and **Note**.

- **SQL cells** run real DuckDB-WASM queries in the page. The result shows typed columns, rows and an optional bar/line/scatter chart. Each result becomes one `datapass.artifact` v1 document (`src/workspace/sql-artifact.ts`), so table, chart and JSON views use the existing renderers. Switching view or chart never runs the query again. Results above 10,000 rows stay as a preview and are not wrapped as an artifact; aggregate or add `LIMIT`. *Export CSV* and *Export artifact JSON* are explicit.
- **Python cells** name an **allowlisted model** on the local runtime plus numeric inputs within its declared bounds. They never carry code. *Run* submits, polls and fetches the artifact. *Cancel* asks the runtime to cancel, even when pressed before the runtime has accepted the run. An optional **output table** loads the artifact rows into DuckDB so SQL cells can query them.
- **Python (Jupyter) cells** hold editable Python source and run it on a Jupyter kernel you paired (see *Trusted local Python* below). An optional **published variable** (a list of dicts, a dict of lists or a DataFrame) becomes a bounded DuckDB table (10,000 rows, 64 columns) that SQL cells query. *Interrupt* uses the kernel interrupt API.
- **Inert cells** come from imported notebooks (raw cells, other kernel languages, attachments, oversize source). They are shown read-only, never run, and are exported back unchanged.
- **Dependencies are explicit.** A cell lists the cells it depends on. *Run* executes the transitive dependencies first, in a deterministic order (`executionPlan`). A failed dependency stops the plan and marks the rest *Not run*. Cycles, unknown dependencies and duplicate output tables are refused before anything changes.
- **Staleness.** A result is marked *Stale* when its cell changed after the run, or when a dependency produced a newer result. Late answers from a superseded run are ignored.
- **Run history.** Python cells keep run *references*: run id, model version, input hash, artifact hash and times. *Load result* re-fetches an earlier run by id and says so; it does not recompute. The runtime holds results in memory only, so after it restarts, earlier runs report that they are gone.

## Persistence (`datapass.workspace` v1)

`src/workspace/persist.ts` autosaves to browser `localStorage`, debounced. The document is validated as a whole before it is saved or applied.

- **Saved:** saved SQL queries and the selected tab, notebook cells, model inputs, module, sample choice, local file *names*, run references, the runtime *origin*, pipeline and board.
- **Never saved:** file contents, query rows, artifact payloads, the runtime token (it lives only in `sessionStorage` for this tab) and secrets.
- **Reload:** cells come back *Not run in this session*. Local files must be reopened, and a notice names them.
- **Newer or corrupt document:** it is not loaded. It is moved to `datapass.workspace.rejected` and a blank workspace opens.
- **Export / Import workspace:** a JSON file that contains your SQL text and inputs, so review it before sharing. Import validates the whole file and, on any error, changes nothing. It also migrates the older *Export draft* file (`datapass.studio2.draft` v1). An import never runs a cell.
- **Reset workspace** asks for confirmation, then clears the saved document.

## Local Python runtime (`datapass.runtime/1`)

```sh
python -m pip install -r py/service/requirements.txt   # once (fastapi, pydantic, uvicorn)
npm run service:python                                # prints: DataPass runtime ready. Open the workbench with: http://127.0.0.1:5173/?workspace=blank#runtime=…&token=…
npm run dev                                           # then open the printed link
```

- **Explicit consent.** The printed link carries the origin and a per-launch token in the URL fragment. The workbench removes it from the address bar, then asks *Connect to the local runtime at …?* You can also type the origin and token by hand.
- **Exact trust.** Only `http://127.0.0.1|localhost:<port>` is accepted. The token travels in the `X-Datapass-Token` header, never in a URL, and requests send no cookies. The runtime checks the token, the `Host` header and the `Origin` header. Bodies are limited to 2 KB, responses are bounded and each artifact is checked against the SHA-256 the runtime recorded.
- **No generic executor.** The runtime runs registered models only (`wind-reference`, `wind-weibull-grid`). Their values are ILLUSTRATIVE, not FOIL or client data.
- **Do not expose it.** The service binds loopback only. It is a prototype, not authentication for a network service.
- **Relation to the VS Code runtime.** The canonical `datapass-mosaic-vscode` runtime uses the same token convention (`X-Datapass-Token`, exact loopback `Host`), but it is driven by the extension through `postMessage`, sends no CORS headers and exposes a general `/api/local/execute`. A browser page therefore does not attach to it directly. Doing so would require a change in that repository, which was not made here.

## Trusted local Python on your Jupyter Server (optional, FR-02)

A Jupyter kernel runs Python with **your user privileges**. Loopback and a temporary folder are not a sandbox. Nothing in the workbench installs or launches a server or a kernel; importing, previewing or opening a link never runs a cell.

```sh
python -m venv .venv && .venv/Scripts/python -m pip install -r py/service/requirements.txt -r py/service/requirements-jupyter.txt
.venv/Scripts/python py/service/jupyter_local.py --port 28888 --workbench-origin http://127.0.0.1:5173
# prints: paste into the workbench -> URL http://127.0.0.1:28888  token …
```

- **Pinned versions** (`py/service/requirements-jupyter.txt`): `jupyter_server==2.21.1`, `ipykernel==7.3.0`, `nbformat==5.11.1`. No new executor: the stock server and kernel own execution, scheduling and interruption.
- **What the launcher sets**: `127.0.0.1` only, `allow_remote_access=False` (non-loopback `Host` headers are refused), `allow_origin` = the exact workbench origin, token auth through `JUPYTER_TOKEN` (not the command line), terminals off, no browser. `jupyter_strict_origin.py` keeps the Origin check on for token-authenticated requests and the kernel websocket, which stock Jupyter Server skips. Jupyter's own runtime file (`jpserver-<pid>.json`, owner-only, holds the token while the server runs) goes to a temporary folder removed on a normal exit.
- **Pairing is explicit**: paste the server URL and token into *Jupyter kernel*. Only `http://127.0.0.1|localhost:<port>` is accepted; anything else is refused before a request. The workbench starts one kernel and shuts it down on *Disconnect kernel* or when the tab closes (best effort).
- **The token stays in memory**: REST calls send it in the `Authorization` header. The kernel websocket cannot carry headers in a browser, so the token is in the websocket URL query that Jupyter documents and scrubs from its logs. It is never written to the workspace, `sessionStorage`, the result store, `.ipynb` or workspace exports.
- **Observed states are distinct**: *done*, *failed* (the cell raised), *interrupted* (you pressed Interrupt), *disconnected* (the connection closed mid-run, outcome not observed) and *unknown* (the kernel died or restarted). On anything but *done*, the last valid output stays visible, labelled stale.
- **Dependencies**: SQL and Python cells use the same explicit dependency and staleness model. A SQL cell that depends on a Python cell runs it first; editing the Python source marks dependants stale.
- **Kernel memory is not saved.** After a restart, variables are gone. Saved results (below) reopen without a kernel.

## Notebook files and saved results (optional, FR-03)

Both need the local service (`py/service/app.py`) with `requirements-jupyter.txt` installed.

- **.ipynb import/export** goes through the pinned `nbformat` (read, validate against the schema, write). Mapping: markdown ↔ note; code (kernel language Python) ↔ Python (Jupyter); code with `%%sql` or `metadata.datapass.kind = "sql"` ↔ SQL; `metadata.datapass.kind = "runtime-model"` ↔ allowlisted model run; everything else ↔ inert. DataPass fields (cell id, title, dependencies, published variable, result hash) travel in `metadata.datapass`.
- **Import never runs anything.** A corrupt or schema-invalid notebook is refused as a whole and the current notebook stays unchanged. Dropped metadata, dependencies and outputs are listed in an *Import report*.
- **Outputs are untrusted data**: text and validated PNG/JPEG/GIF are shown; HTML and SVG are shown as source text; JavaScript and widget MIME types are refused; other MIME types are listed as *not displayed (kept in exports)*. A notebook signature is never trusted.
- **Result store**: start the service with `--results-dir <folder outside any Git work tree>` (refused inside one) and optionally `--results-max-bytes` (default 256 MB). Layout: `manifest.json` (commit point), `results/<sha256>.json` (immutable cell results: outputs, the bounded table, execution count, source hash), `notebooks/<sha256>.ipynb` (the saved notebook). Writes go through a temporary file and `os.replace`, manifest last.
- **Save results to store** saves every current result and the notebook. A full store or a failing disk refuses the save and leaves the previous saved state byte-identical. A payload containing the service token is refused.
- **Open from store** (after restarting the browser and the service) reopens the saved notebook and its results, checks each file against its SHA-256, loads published tables back into DuckDB and labels them *Not recomputed*. A run that was still running when the service stopped is reported *unknown*; an interrupted run stays *interrupted*. A missing or corrupt result offers *Relink* to another saved result of that cell or an explicit *Run again*, never a silent fallback.
- **Retention is yours**: the *Result store* panel lists saved results; nothing is deleted automatically. Deleting is a two-step explicit action. Only the superseded notebook snapshot is replaced by a newer save.

## Failure states

| Situation | What you see |
|---|---|
| Runtime stopped or unreachable | The runtime bar turns *unavailable* with the reason. The cell shows *unreachable*. The last result stays, labelled *Previous result … not live*. |
| Wrong or expired token | *The runtime refused the token … reconnect with the new link*. |
| Remote origin in a link | Refused before any request is made. |
| Invalid inputs | Checked against the model bounds before submission. The runtime's 422 errors are shown. |
| Malformed artifact or hash mismatch | Refused with the validation message. Nothing partial is rendered. |
| Cancelled or failed run | *cancelled on the runtime* or *failed on the runtime: …*. Dependents are *Not run*. |
| Invalid workspace import | *Workspace import refused, nothing changed: …* |
| Storage unavailable | A notice says the workspace will not survive a reload. |

## Security headers

`npm run preview` serves the workbench with a CSP whose `connect-src` allows `'self'`, `blob:`, loopback http (`http://127.0.0.1:*`, `http://localhost:*`) and loopback websockets (`ws://127.0.0.1:*`, `ws://localhost:*`, for a paired Jupyter kernel), so it can reach a runtime you consent to. Selected client builds keep `connect-src 'self'`.

## Tests

- `node --experimental-strip-types --test tests/workbench-authoring.test.mjs`: notebook plan, cycles and staleness; SQL artifact typing; workspace round-trip, migration and rejection; runtime origin, token, hash and error handling.
- `npm run test:python-runtime`: the runs API, including auth, origin, cancellation and retention.
- `npx playwright test tests/browser/workbench-notebook.spec.ts` (after `npm run build`; needs Python with `py/service/requirements.txt`). It starts the real runtime and runs UX01 (blank workspace → SQL → chart → export → reload), UX02 (consent → Python run → representations → new run → history → dependent SQL → cancel → reload) and UX04 (stopped runtime, refused token, remote origin, invalid import).
- `node --experimental-strip-types --test tests/workbench-jupyter.test.mjs`: Jupyter adapter against a fake server (pairing checks, execute, published table, interrupt, failure, disconnect), untrusted output rendering, inert cells, stored-result and import validation.
- `python -m unittest discover -s py/service -p "test_notebook.py"` (needs `requirements-jupyter.txt`): nbformat mapping, loss report, corrupt/invalid rejection, round trip; result store atomicity, storage full, retention, unknown jobs, no token; guarded routes.
- `DATAPASS_JUPYTER_PYTHON=<venv python> npx playwright test tests/browser/workbench-jupyter.spec.ts` (after `npm run build`): E2E-01 with a real Jupyter Server and result store (pair → Python → SQL → chart → .ipynb + results → restart service and browser → reopen with identical hashes, no kernel), interrupt keeps the last valid output, storage full, refused pairing/origin/Host, corrupt and untrusted notebooks, and a light client with no Python service. `PW_PORT` picks the preview port.

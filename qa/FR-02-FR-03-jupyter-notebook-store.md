# FR-02 + FR-03 Jupyter kernel adapter, .ipynb exchange and durable result store

Packet galaxy-full-release-2026-10-10 / 01-mosaicstudio. Baseline main `6f45dd0`, rebased on `f3a02bc`. Branch `claude/jupyter-notebook-store`.

## FR-02: opt-in adapter to a user-installed Jupyter Server

- The existing guarded producer (`py/service/app.py`, `datapass.runtime/1`, 2 KB body limit, RuntimeGuard, TrustedHost, CORS) is unchanged in behaviour. A test checks that the 2 KB runtime limit still applies and that the notebook routes are absent without `--results-dir`.
- Versions are pinned in `py/service/requirements-jupyter.txt`: `jupyter_server==2.21.1`, `ipykernel==7.3.0`, `nbformat==5.11.1`. CI installs them and sets `DATAPASS_REQUIRE_JUPYTER=1`, so a missing dependency fails the run instead of skipping it.
- `py/service/jupyter_local.py` is an optional launcher the user runs. It binds 127.0.0.1 only on an explicit port with `allow_remote_access=False` and terminals disabled. It allows exactly one loopback page origin and generates a token unless `DATAPASS_JUPYTER_TOKEN` is set. The token goes to the child through `JUPYTER_TOKEN`, never on a command line. The runtime dir is a temp folder removed on exit.
- `jupyter_strict_origin.StrictOriginIdentityProvider` keeps Jupyter's Origin check for token-authenticated requests, including the kernel websocket. With the default provider, that check is skipped.
- Observed against the real server:

  | Request | Result |
  |---|---|
  | valid token | 200 |
  | wrong token | 403 |
  | foreign Origin | 404 |
  | foreign Host | 403 |
  | websocket from a foreign Origin | refused |
  | websocket from the page origin | 101 |

- Pairing is explicit: the user pastes the URL and token. The URL must be loopback http with a port and no path, query or credentials. The token is held in memory only. It is never saved to the workspace, localStorage, the store, exports or the address bar. REST calls carry it in the `Authorization` header. The browser websocket API cannot send headers, so the websocket URL carries it in memory.
- A refused token shows as `denied`, not `unavailable`. Jupyter answers a refused token with 403 and no CORS headers, so the browser only sees a blocked request. The client therefore probes the unauthenticated `/api` first. If `/api` answers and the authenticated call is then blocked, the client reports that the token was refused.
- Python runs only when the user presses Run on a cell; importing a notebook runs nothing.
  - A published variable (list of dicts, dict of lists or DataFrame) becomes a bounded table: at most 10,000 rows and 64 columns, with unique column names. It is loaded into DuckDB-WASM, where SQL cells query it.
  - SQL↔Python dependencies use the existing `dependsOn`, staleness and execution-plan model.
- Interrupt uses `POST /api/kernels/{id}/interrupt`. Outcomes are distinct: ok, failed, interrupted (KeyboardInterrupt), disconnected (socket closed, outcome not observed) and unknown (kernel died or restarted). After an interrupt or a failure, the last valid output stays, marked stale.
- Outputs are rendered as untrusted:
  - HTML and SVG are shown as text.
  - JavaScript and widget MIME types are refused.
  - Images are shown only as validated base64 png, jpeg or gif.
  - ANSI codes are stripped from tracebacks.
  - The page CSP adds only `ws://127.0.0.1:*` and `ws://localhost:*` to `connect-src`.

## FR-03: .ipynb import/export and durable result store

- `py/service/notebook_io.py` uses pinned nbformat for both directions. Input is limited to 4 MB, `reads(as_version=4)` and `validate`.
  - Explicit cell mapping on import:
    - markdown → note;
    - `%%sql` or `metadata.datapass.kind=sql` → SQL;
    - Python code → Jupyter cell;
    - `runtime-model` → Python model cell;
    - anything else (raw cells, other languages) → inert, keeping its original JSON (64 KB maximum).
  - The loss report lists inert cells, dropped metadata, dropped dependencies, unsupported outputs and truncation.
  - Export writes valid nbformat 4.5. Inert cells go back out verbatim; a missing cell id is added.
- A corrupt or invalid notebook is refused with "Notebook import refused, nothing changed". The browser test checks that the existing cell is left untouched.
- The result store (`py/service/result_store.py`) is enabled only with `python py/service/app.py --results-dir <dir> [--results-max-bytes N]`. It refuses a directory inside a Git work tree.
  - **Layout:** `manifest.json`, `results/<sha256>.json` and `notebooks/<sha256>.ipynb`. Files are immutable and named by their content hash. Writes go to a temp file, then fsync and `os.replace`. New files are written first and the manifest is committed last.
  - **Manifest contents:** workspace inputs, cell source hashes and run references.
  - **Quota:** checked before any write. A full disk (ENOSPC, simulated in the tests) and a store over quota both answer 507. The previous manifest and files stay byte-identical.
  - **Retention:** nothing is pruned silently. Results are removed only by an explicit user delete, which needs a confirmation.
  - **Secrets:** a payload containing the runtime token is refused.
  - **Routes:** guarded by the runtime token (`X-Datapass-Token`), Origin and Host. Their body limit is 16 MB, separate from the 2 KB runtime limit.
- **Restart behaviour:**
  - Saved results reopen without recomputation, with the message "kernel variables are not restored". Kernel heap is not restored.
  - A job still marked running by a previous process shows as `unknown`. Interrupted jobs show as interrupted.
  - A missing result offers relink or "Run again". A tampered result (hash mismatch) is refused with 409.

## Evidence

- **Python service tests:** `python -m unittest discover -s py/service -p "test_*.py"` passed 38 tests, OK. This includes 14 tests in `test_notebook.py`.
- **Node unit tests:** `node --test tests/*.test.mjs` before the rebase: 619 tests, 618 pass, 0 fail, 1 skipped. After the rebase, `tests/workbench-*.test.mjs` ran 23 tests, all passing. `tests/workbench-jupyter.test.mjs` uses a fake server and websocket.
- **Typecheck and build:** `npx tsc --noEmit` reported 0 errors. `vite build` succeeded.
- **Browser:** `tests/browser/workbench-jupyter.spec.ts` ran against a real Jupyter Server 2.21.1 and a real ipykernel 7.3.0 on loopback 28888, with a generated token, and the real service with a temp store outside Git, all data SYNTHETIC. Local result on Windows 11 with Chromium, port 24273: 4 passed.
  1. **E2E-01, the full journey:**
     1. Blank workspace; pair the kernel.
     2. Run a Python cell and publish its variable as a table.
     3. Run a SQL cell that depends on it, then chart the result.
     4. Interrupt a long cell: the previous output stays, marked stale.
     5. Export .ipynb and save to the store. No token appears in any store file, localStorage or sessionStorage.
     6. Restart the service and the browser, with Jupyter stopped. Open from the store: same result hashes, run SQL on the reopened table.
     7. Delete one result: it shows as missing, with "Run again".
     8. Restart with a 1,024-byte quota: "Result store full", and the manifest and files stay byte-identical.
  2. **Pairing refusals:** remote URL, wrong token (`denied`), foreign Origin and Host on Jupyter, websocket Origin, and 403/401/400 on the notebook routes.
  3. **Notebook files:** a corrupt or invalid .ipynb changes nothing. A synthetic notebook's script output is shown as text or refused. The raw cell stays inert, appears in the loss report and survives the round trip.
  4. **Light client:** the blank workbench and `motion-reference` start with no Python service and no kernel, and make no request off the page origin.
  5. **Logs:** after the suite, the Jupyter token is absent from both service logs.
- **CI (ubuntu-latest), run 38018684351 on `fd4ec3f`:**
  - `npm test`: 623 pass, 0 fail, 2 skipped.
  - `test:python`: 20 tests, OK.
  - `test:python-runtime`: 38 tests, OK.
  - Full Playwright suite: 109 passed, including the 4 `workbench-jupyter` tests against a real Jupyter Server.
- **First CI run (38017950061), 5 failures.** On Linux, SIGTERM orphaned `jupyter_server`. The launcher now stops its server on SIGTERM, and the spec signals the process group. The second failure was the FR-01 "Previous result" label, now restored for runtime artifacts.
- I inspected the screenshots from the passing run (authoring and reopened). Both match the asserted states.

## Omissions and limits

- **Interrupt flake:** in one of three local runs, under 100 % CPU from parallel sessions, the interrupt step timed out at 30 s and no interrupt request was recorded in the trace. The root cause was not established. The next run passed with a 60 s budget. Earlier REST probes on Windows interrupted within about 1 s.
- **Local timings:** the first two local runs hit timeouts while the machine was saturated. One page load took about 220 s, and DuckDB took more than 60 s to start. The spec budgets were raised to 600 s, 300 s and 120 s.
- **Existing suites:** the browser specs that hard-code port 4173 (including `workbench-notebook.spec.ts`, which covers the edited Notebook panel) were not run locally. CI runs the whole suite.
- **Not checked:** responsive and mobile layout of the new controls was not inspected in a screenshot. On desktop, the label "Publish variable as SQL table (optional)" sits tight against its input.
- **Not claimed:** kernel heap restore, multi-user or remote Jupyter, JupyterLab extensions, widgets and rich JavaScript outputs.
- **Token boundary:** loopback and a token are not a sandbox. Cells run with the user's privileges on the user's own server, and the UI says so.

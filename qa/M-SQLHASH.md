# M-SQLHASH: SQL cell source hash in the result-store manifest (2026-10-11)

Baseline main `ca26e9d`. Parent rows: 01-mosaicstudio/FR-03, journey E2E-01.

## What changed
- `py/service/result_store.py`: on every save, `workspace.cells[]` records `sourceSha256` for each SQL cell, computed by the service from the authored SQL in the saved notebook payload: `sha256(UTF-8 of JSON.stringify(["sql", sql]))`, the same definition as the browser's `cellSourceKey()` + `sourceSha256()`. Other cell kinds are unchanged.
- Re-opening (`GET /store/notebook`) checks every recorded SQL hash against the stored notebook. A mismatch, an invalid hash or malformed workspace cells return 409 and nothing is opened; the manifest is left untouched.
- Backwards compatible: manifests written before this change carry no SQL hashes and open as before. Saved-workspace semantics are unchanged: result entries keep the source hash of the run that produced them, so a result saved after its SQL was edited is still saved and still shows as stale on reopen.
- The hash stays in the manifest after the user deletes that cell's saved result.
- No new interpreter or dependency.

## Correction to the E2E-01 receipt of 2026-10-11 (`receipts/E2E-01.json`)
That receipt said the SQL cell's source hash was not in the store manifest. That was wrong: the saved SQL result's entry did carry it. The hashes file was written after the journey had deleted that result (retention step), so the entry was gone. With this change the authored-source hash also survives that deletion in `workspace.cells`.

## Evidence (Windows 11 10.0.26300, Node 26.9, Python 3.14.7 venv, Playwright 1.63 Chromium)
- `tests/fixtures/sql-source-hash/vectors.json`: 9 synthetic SQL strings (empty, CRLF/tab, quotes/backslashes, Unicode, control characters, U+2028/2029, trailing spaces).
- `tests/sql-source-hash.test.mjs`: the browser definition reproduces all 9 vectors; title/dependencies do not change the hash, one character does (2/2).
- `py/service/test_notebook.py` `SqlSourceHashTests` (5): Python reproduces the vectors; SQL-only save records the hashes, restart (new app over the same folder) reopens identical SQL whose hashes match; deleting the result keeps the hash; old manifest without hashes opens; mismatched / malformed / non-string hash returns 409 with the manifest byte-identical; stale result saved under its run source. Service suite: 43 tests OK.
- `tests/browser/workbench-jupyter.spec.ts` E2E-01 now asserts the SQL cell's manifest hash equals the hash of the SQL typed in the browser and equals its result entry's source hash, before and after restart/delete. 4/4 pass, attempt 1.

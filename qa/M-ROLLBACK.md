# M-ROLLBACK: old → new → old → new with notebooks and stored results (2026-10-11)

Parent rows: 01-mosaicstudio/FR-07, journey E2E-08 (this lane's part only). Source: main `e7db854` (M-SQLHASH merged).

## Distributions used
| Side | Workbench | Runtime | SDK archive |
|---|---|---|---|
| old: 0.10.0 release | qualified `workbench-dist` from the FR-07 evidence, tree sha256 `f840b4ca…` (112 files, re-verified) | `py/` of release commit `ec8d1f3` (git archive) | `datapass-mosaicstudio-sdk-0.10.0.tar.gz` sha256 `b90dfab7…` (re-verified) |
| new: main `e7db854` | clean `npm run build`, tree sha256 `f840b4ca…`: byte-identical to 0.10.0 (M-SQLHASH changed only the runtime) | `py/` at `e7db854` | clean `npm run sdk:pack` + `sdk:verify`: sha256 `486266f3…` (335 files; still labelled 0.10.0, no new version or tag) |

The binaries stay in the local evidence folder; only hashes are recorded here.

## Executed check (`scripts/release-rollback-check.mjs`)
One origin (`127.0.0.1:24190`), one runtime port (`24799`), one temp browser profile and one temp store folder outside Git, shared by both sides; the browser is closed between steps. Data: two SQL cells over inline `VALUES` literals, labelled SYNTHETIC.

| Step | Side | Observed |
|---|---|---|
| 1 | old | Two SQL cells run; `.ipynb` exported (`af6d51b5…`); 2 results and the notebook saved. Results `87b1049b…`, `a674ac40…`. The manifest has no SQL source hashes. |
| 2 | new | **Upgrade.** Open from store: both cells reopen with the same result hashes, "Not recomputed". Save: the manifest records each SQL cell's source hash, equal to sha256 of `JSON.stringify(["sql", sql])` of the typed SQL; both result files byte-identical. |
| 3 | old | **Rollback.** 0.10.0 opens the newer manifest (the extra field is ignored), reopens both results by hash without recomputation and saves; both result files byte-identical, the current notebook present and matching its hash. Its save drops the SQL hashes (`manifestHasSqlHashes: false`). |
| 4 | new | **Recovery.** Opens after the older save (pre-hash format), same results; its save restores the hashes. A tampered SQL hash in the manifest is refused ("Opening from the result store failed, nothing changed: … nothing was opened"), with the manifest byte-identical (`911dc148…`). Restoring the copied manifest reopens the same results. |

Run three times locally (one dry run on the unmerged branch, two at `e7db854`), all PASS. Record: [`qa/M-ROLLBACK/rollback-check.json`](M-ROLLBACK/rollback-check.json) (store file hashes after every step; token and temp path redacted), screenshots `qa/M-ROLLBACK/1-…` to `4-….png`.

## Older release: rejects rather than corrupts
- Result store: M-SQLHASH adds no state that 0.10.0 cannot read, so there is nothing for it to reject; step 3 shows it neither corrupts nor drops results. The newer runtime rejects a manifest whose recorded SQL hash does not match (step 4).
- Browser workspace: unchanged by M-SQLHASH. The 0.9.0 refusal of a 0.10.0-only cell kind (kept byte-identical under `datapass.workspace.rejected`, recovered with Import workspace) was executed by FR-07 and is reused unchanged (`qa/FR-07-release-packaging.md`, steps 5–6).

## Environment and omissions
Windows 11 Pro 10.0.26300, Node 26.9.0, Python 3.14.7 venv (fastapi, nbformat 5.11.1), Playwright 1.63.0 bundled Chromium. Not run: Edge or Positron for this check, a real user browser profile (by design), Jupyter cells (the store path is the same for SQL and Python results). Each save replaces the previous notebook snapshot, as documented in `py/service/result_store.py`; results are never pruned.

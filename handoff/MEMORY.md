# Durable lessons (datapass-mosaicstudio)

- 2026-10-16 · `src/workspace/persist.ts` (and other contract files) are pinned by `handoff/01-mosaicstudio/full-release-2026-10-10/READY.json`; `tests/release-0.10.test.mjs` fails if they change. Put new constants elsewhere, or list the file in `CHANGED_SINCE_0_10` with a reason.
- 2026-10-16 · Local `gh` is 2.52 (no `gh pr update-branch`): use `gh api -X PUT repos/julian-passebecq/datapass-mosaicstudio/pulls/<n>/update-branch`.
- 2026-10-16 · On Windows the CRLF working copy makes blob-hash tests look red before commit; they hash committed blobs (`git show`), so check after committing.
- 2026-10-16 · CI flakes (rerun once if the PR does not touch them): `workbench-notebook.spec.ts:158` UX02b, `concept-standalone.spec.ts:107` embed fit.
- 2026-10-16 · Main pushes cancel each other's "Studio web gate" runs (concurrency group); PR runs are the merge evidence.
- 2026-10-16 · Release qualification: `scripts/release-upgrade-check.mjs` step 5 hard-codes the 0.9.0 → 0.10.0 Jupyter-cell refusal, so it fails against 0.11.1 → 0.12.0+; use an unknown-cell-kind variant (see `qa/REL-0.12.0.md` Q3). `test:product-loop` hard-codes ports (loop spec, config, client CSP): rewrite them in a copy when ports are assigned.
- 2026-10-16 · Release viewer header: `dist-standalone/concept-viewer.html` is built on the release branch, so its header names the pre-squash commit (0.11.1 and 0.12.0); expected, recorded as an omission.

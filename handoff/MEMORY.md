# Durable lessons (datapass-mosaicstudio)

- 2026-10-16 · `src/workspace/persist.ts` (and other contract files) are pinned by `handoff/01-mosaicstudio/full-release-2026-10-10/READY.json`; `tests/release-0.10.test.mjs` fails if they change. Put new constants elsewhere, or list the file in `CHANGED_SINCE_0_10` with a reason.
- 2026-10-16 · Local `gh` is 2.52 (no `gh pr update-branch`): use `gh api -X PUT repos/julian-passebecq/datapass-mosaicstudio/pulls/<n>/update-branch`.
- 2026-10-16 · On Windows the CRLF working copy makes blob-hash tests look red before commit; they hash committed blobs (`git show`), so check after committing.
- 2026-10-16 · CI flakes (rerun once if the PR does not touch them): `workbench-notebook.spec.ts:158` UX02b, `concept-standalone.spec.ts:107` embed fit.
- 2026-10-16 · Main pushes cancel each other's "Studio web gate" runs (concurrency group); PR runs are the merge evidence.

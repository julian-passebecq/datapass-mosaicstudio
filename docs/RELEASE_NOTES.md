# Release notes

## 0.11.0 (2026-10-13)

A new version because the app and runtime changed after the 0.10.0 SDK (#55-#65). No stored format version changed: `datapass.workspace` v1, `datapass.result-store` / `datapass.cell-result` v1, `datapass.artifact/1`, `datapass.concept-spec/1` and `datapass.preview/1` are as in 0.10.0. Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0100--0110); short user guide: [`GUIDE-0.11.md`](GUIDE-0.11.md). Nothing is tagged, published or deployed.

- **#53 SQL source hashes in the result store.** Saving records each SQL cell's authored-source hash in the store manifest; reopening refuses a manifest whose hash does not match the stored SQL (nothing is opened). Older manifests still open.
- **#54 Rollback check.** `scripts/release-rollback-check.mjs` executes 0.10.0 → newer → 0.10.0 → newer over one result store; results stay byte-identical (`qa/M-ROLLBACK.md`).
- **#55 3D embed fit.** The concept 3D view now reports "settled" only after drawing a frame at its current size, so an embedded view no longer measures a stale layout after a resize.
- **#56 Saved run references (opt-in).** `AppDefinition.runHistory[resource]` keeps run references (`datapass.run-history` v1, `datapass.run-ref` v1) across reload: references only, never result rows, payloads or secrets. Restored references are labelled "not rerun"; a run in flight at reload shows "Outcome not observed (page reloaded)". Default off; only `foundation-reference` opts in (`docs/recipes/runs.md`). Workbench notebook run references that were queued or running at reload show "not observed since reload".
- **#57 Interrupt before the code is sent.** Interrupt pressed while a Jupyter cell is still preparing now cancels it without sending the code to the kernel. The local result store serialises saves and job records, so concurrent runs no longer lose a job record.
- **#58 Refused run history is never overwritten.** A refused saved snapshot is kept aside under `<key>.rejected`; if that copy cannot be made or confirmed, saving pauses for the session instead of overwriting it.
- **#59 #60 #61 #62 Test reliability.** Browser specs hold the page clock around short synthetic timers and wait for the saved workspace instead of fixed sleeps. Tests only, no app change.
- **#63 T3 interop docs.** T3 checks `datapass.preview/1` (`preview.json`) since its #4; the fixture test asserts it stays verified.
- **#64 Cancel after the run finished.** Cancel pressed while a finished Python result is still loading now reports "already finished" instead of waiting for the runtime.
- **#65 Notebook kept across modules; model results saved.** Switching to another module and back keeps notebook results, running cells and the paired kernel. Saving to the result store now also keeps allowlisted Python model results, which reopen "Not recomputed" without the runtime.

## 0.10.0

See [`RELEASE_0.10.md`](RELEASE_0.10.md).

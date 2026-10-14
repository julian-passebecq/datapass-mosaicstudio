# Release notes

## 0.11.1 (2026-10-14)

A patch release so that a static host serving the packaged workbench can reach the visitor's own loopback runtime. Built from the merge of this release commit; it contains everything on main after 0.11.0 (#67-#73). No stored format version changed and no SDK API changed. Upgrade and rollback: [`CONSUMING.md`](CONSUMING.md#0110--0111). The short user guide [`GUIDE-0.11.md`](GUIDE-0.11.md) applies with `0.11.1` in the file names. Nothing is tagged, published or deployed.

- **#73 Workbench `_headers` CSP allows the loopback runtime.** The shipped `public/_headers` had `connect-src 'self' blob:` while `vite preview` allowed loopback http/ws, so a static host applying `_headers` (Netlify, Cloudflare Pages) blocked the consented Python runtime and the paired Jupyter Server. Both now come from `scripts/workbench-headers.mjs`: `connect-src` adds `http://127.0.0.1:*`, `http://localhost:*`, `ws://127.0.0.1:*`, `ws://localhost:*`; no remote origin is allowed. The runtime stays gated by explicit consent, the per-start token, the Host check and the Origin allowlist. New check `npm run test:static-headers`. `GUIDE-0.11.md`: `tar --force-local` for drive-letter paths in Git Bash.
- **#68 #69 #72 Reference clients.** New `clients/galaxy-finition` (status board and dependency graph) and `clients/foil-wind` (runs, measurements, SQL and run comparison on a synthetic `foil.export`; negative deltas drawn with a direction encoding). Client folders only; the framework and the workbench are unchanged by them.
- **#67 #70 #71 Records.** 0.11.0 release receipt and vault delivery record; galaxy-finition data snapshot. No code change.

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

# FR-06 Recover old work without public publication

Packet galaxy-full-release-2026-10-10 / 01-mosaicstudio. Branch `claude/explanations-recovery`. Public record: [`docs/RECOVERY_2026-10-10.md`](../docs/RECOVERY_2026-10-10.md).

## What was checked (observed)

- `D:\PROJ\_recovery\2026-10-10-overnight\MANIFEST.md` was read. Only `mosaic-fabric-bricks/` and `mosaic-viz-n1/` were in scope. The recovery folder was only read; the tars were extracted into `%TEMP%\fr06-recovery`.
- `ARTIFACTS.sha256`: fabric-bricks 3/3 OK (bundle, files.tar, tracked.patch); viz-n1 4/4 OK (bundle, eol-only-raw.tar, files.tar, empty tracked.patch).
- Extracted bytes: fabric-bricks `files.sha256` 23/23 OK; viz-n1 `files.sha256` 2/2 OK; viz-n1 `eol-only-raw.sha256` 18/18 OK. In total, 50 hash checks passed and none failed.
- Both snapshot base commits (`9203dc7`, `3fd3628`) and snapshot commits (`e2deb36`, `b8e410e`) exist locally. Both bases are ancestors of `origin/main` `f3a02bc`.

## Findings

- **viz-n1, 18 files**: the "line-ending only" report is confirmed and is stronger than reported. The raw worktree bytes are identical to the committed blobs at `3fd3628`, so this is equivalent-on-main. 11 files are still byte-identical to main; 7 were later changed on main.
- **viz-n1, 2 PNGs**: deterministic output of `npm run test:viz-gallery` (synthetic `fabric-gallery-reference` dashboard). Main already carries reviewed stills in `docs/media/viz-gallery/` and can regenerate the captures, so the snapshot bytes were not published and no new screenshot was added.
- **fabric-bricks, 23 files**: an unpublished "Fabric concepts" mode (11 documented Microsoft Fabric concepts, made the default, client renamed "Fabric Explorer") on top of `9203dc7`. Main later moved the same client forward (`7b296d2`, `e91dde8`) and marked it draft. Result: 7 captures superseded, 16 files unique-kept-local. Nothing was adopted as-is.
- **Re-implemented interactions** (not copied, no invented bricks): one selected identity across projections, an atomic reset, and an inspector source reference. They went into the architecture walkthrough, the coding lab and the motion block (FR-05).
- **Legacy route**: `?app=fabric-bricks` is unchanged. A browser check in the main suite (`explanations.spec.ts`, selected-client build) confirms that the gallery opens, the status is synthetic and no 3D loads before it is chosen. The existing `tests/fabric-bricks.test.mjs` passes in `npm test`.

## Privacy decision

No credentials, tokens, client payloads or FOIL data were found in either snapshot. Nothing from the snapshots was committed: only paths, hashes, refs and dispositions. `git diff origin/main --stat` was screened before every push. The `recovery/2026-10-10/*` refs stay local.

## Open product question (for the caller, not blocking)

Should the documented "Fabric concepts" map (public Microsoft documentation, paraphrased) ever become a public client? If yes, it needs a fresh branch from main and a product decision on its name and place. Until then it stays local.

Private evidence (hashes in `D:\PROJ\_release-evidence\2026-10-10\mosaicstudio\FR-06\SHA256SUMS`): verification log, comparison tables against main and against base, the semantic diff of fabric-bricks against `9203dc7`, and a copy of the recovery manifest.

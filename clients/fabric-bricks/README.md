# Fabric Bricks 2D/3D

First real-client pressure test for MosaicStudio, implemented as a client-owned thin slice.

## Source status

**PROVISIONAL / SYNTHETIC.** No source-approved Fabric Bricks specification, model or 3D asset was available at implementation start. See `SOURCE_STATUS.md`. The fixture tests interaction behavior only and is not evidence that the Fabric Bricks client is complete.

## What this slice exercises

- stable semantic IDs across 2D and 3D;
- selection and detail view;
- 2D → 3D → 2D without changing semantic identity;
- selection-driven camera focus;
- presentation-only explode in 3D;
- lazy loading of the 3D client module;
- selection-bound context/evidence;
- explicit return to overview;
- responsive layout and reduced-motion-safe styling.

The 3D implementation reuses MosaicStudio's existing shared `SceneViewport`; it does not create a second renderer, watcher, server or scheduler.

## Positron smoke

```sh
npm run client:dev -- fabric-bricks --port 5178
```

Open `http://127.0.0.1:5178/?app=fabric-bricks`.

## Autoplay build film (synthetic/provisional)

`timeline.ts` is a deterministic 25 s, 30 fps film: every frame (camera, part poses, captions, parts panel) is a pure function of `t`. Lakehouse builds by ~5 s, ghosted/exploded at ~7 s, collection at ~10 s, OneLake at ~15 s. `KitFilm.tsx` renders it on demand in a lazily loaded, client-owned canvas (the shared SceneViewport tweens on wall-clock time and cannot address an exact frame). Reduced motion never animates: times snap to each chapter's settled end state.

- Open: "Watch the build film" (gallery) or "Play build" (kit page), or `?app=fabric-bricks&film=1&t=7&paused=1&chrome=0`.
- Export: `node clients/fabric-bricks/tools/record.mjs --url http://127.0.0.1:5178 --size 1004x548` (MP4 with ffmpeg on PATH or `FFMPEG=...`; else WebM via the Playwright ffmpeg; PNG frames always kept, git-ignored). Output in `qa/film/`.

## Twelve kits, piece types and part thumbnails (synthetic/provisional)

- `kits.ts` holds twelve concept kits named after Fabric items (Power BI report, OneLake, Lakehouse, Warehouse, Eventhouse, SQL database, Medallion architecture, Pipeline, Notebook, Real-Time Intelligence, Data Warehouse, Microsoft Fabric). Models are abstract studies, not logos; piece counts and prices are illustrative. Lakehouse keeps its original 58 piece ids and grows to 126 pieces.
- Piece types in `brickContent.ts`: rounded brick/plate/tile, round brick and 1 × 1 round plate, slope, grille tile, cone, arch, window, curved brick, bar, plant and flower. Each distinct piece shape is one cached geometry with its studs merged in; every piece keeps its own material so it can ghost or highlight alone. `rot` turns a moulded piece on an inner holder, so the shared renderer keeps owning the item transform.
- Parts lists show small rendered thumbnails (`partThumbs.ts`): one shared offscreen WebGL canvas, PNG data URLs cached per piece look. The page loads it lazily (`PartThumb.tsx`, swatch fallback without WebGL); the film renders it synchronously so captured frames always include it.
- Framework limits respected without framework changes: a select field holds at most 100 options, so `fabric-piece` is a whole ordinal of the piece inside its kit (0 = none); a scene holds at most 64 entities and 128 parts, so kit scene entities are part types while picking still resolves the individual piece id.

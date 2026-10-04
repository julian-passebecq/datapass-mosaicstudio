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

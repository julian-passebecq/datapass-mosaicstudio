# Authored motion: an optional capability

Use motion when objects moving through a process explain something better than another static diagram. The client supplies semantics; the framework supplies deterministic snapshots and presentation. It is not a simulation, execution trace or game engine.

```sh
npm run client:new -- process-demo --family content --motion
npm run client:context -- process-demo
npm run client:check -- process-demo
npm run build:client -- process-demo
```

This is still the content family. Any existing client can add the motion block explicitly; there is no sixth compulsory app family. The actual capability plan includes motion only, not Three.js, SQLRooms or a notebook renderer.

## Edit only these client declarations

`motion.ts` is an inert MotionSpec. Stations have positions and extents; tokens start at a station. Links have explicit source/destination IDs and optional intermediate route points. Steps have captions, focus, dwell/transition durations and four bounded command types:

- `transfer`: move a token along a declared link. The compiler checks it is at that link's origin.
- `move`: change an object's authored position.
- `state`: set a narrative status, not an assertion of actual service health.
- `visibility`: show or hide an object.

The compiler builds immutable target snapshots before playback. Seeking picks one of those snapshots instead of replaying actions or executing code. Duplicate property writes, unknown references and ambiguous moving transfer endpoints fail validation.

Use `motionFields(spec, prefix)` and `motionBlock(id, resource, prefix)` from `src/framework/motion/index.ts`. A source resource is registered as `resources.motions`. The fields are view-only: step, selection, projection, panel and source. They do not trigger model tasks unless a client explicitly declares such a dependency.

## 2D and isometric are the same scene

Both projections are SVG. The optional isometric projection changes geometry, not identity. It neither imports Three.js nor creates a WebGL context. Keyed D3 objects preserve selection and DOM identity. Use the original Three.js capability only for a genuinely useful viewpoint or mechanism.

The original VizForge StoryPlayer owns progression. D3 owns only finite visual transitions between adjacent steps. Reverse/seek, a rapid skip and projection changes settle to a deterministic target. Selection can update an inspector without interrupting an ongoing transfer. Hidden/offscreen content, unmount, reduced motion and restored inputs pause/settle appropriately. There is no background ambient-motion loop.

## Source references and public content

A source artifact is approved client-owned text with a safe relative path, language and explicit provenance. Exact line references connect a step or entity to the source tab. No file system, live Git access, code execution, external fetch, notebook output rendering or permissions system is added.

All bundled text is public to that site's visitors, even if it is not the active tab. Do not place secrets or private source in a public build. Source references are evidence pointers, not proof the code ran.

The SVG export uses the exact target snapshot, not a half-rendered animation frame. The standalone HTML report is script-free and excludes source text by default. Including referenced excerpts requires a deliberate checkbox. Labels and narrative are still exported and need review before sharing. No PDF, PPTX or video encoding is supplied by this capability.

## Reuse the pieces separately

`src/framework/workspace` exports a compositional WorkspaceShell: optional rail, collapsible outline, controlled keyboard-accessible tabs, main content, optional inspector and status. It has no data store or editor. `src/framework/evidence/react.ts` exposes SourceReader for already validated artifacts. `src/framework/motion/react.ts` exposes the controlled SVG viewport and shared scope for custom client composition.

## Bounds and interpretation

40 entities, 64 links, 64 authored steps, 80 commands per step, 512 KB JSON. Source excerpts: 24 files, 64 KB each, 256 KB total, 2000 lines/file. These are small technical-website contracts. Timings/statuses are authored narrative choices, not measurements or validated physics.

The reference client has two independent consumers: a data-processing journey and on-demand module loading. They share no business implementation. Future clients can use these primitives for architecture, energy explanations or educational sequences; game-specific rules remain in their own project.

# Authored motion: an optional capability

Use motion when objects moving through a process explain something better than another static diagram. The client supplies semantics; the framework supplies deterministic snapshots and presentation. It is not a simulation, execution trace or game engine.

```sh
npm run client:new -- process-demo --family content --motion
npm run client:context -- process-demo
npm run client:check -- process-demo
npm run build:client -- process-demo
```

This is still the content family. Any existing client can add the motion block explicitly; there is no sixth compulsory app family. The capability plan includes motion only, not Three.js, SQLRooms or a notebook renderer.

## Client-owned declarations

`motion.ts` is an inert MotionSpec. Stations have positions and extents; tokens start at a station. Links have explicit source/destination IDs and optional intermediate route points. Steps have captions, focus, dwell/transition durations and four bounded commands: `transfer`, `move`, `state` and `visibility`. A state is a narrative status, not an assertion of actual service health.

The compiler builds immutable targets before playback. Seeking picks a snapshot instead of replaying actions or executing code. Duplicate property writes, unknown references, transfers from a wrong origin and ambiguous moving transfer endpoints fail validation.

Use `motionFields(spec, prefix)` and `motionBlock(id, resource, prefix)` from `src/framework/motion/index.ts`. Register `resources.motions`. Step, selection, projection, panel and source fields are view-only; ordinary navigation does not trigger a model task.

## Optional v2 choreography

V1 remains supported and the generated motion starter intentionally remains a simple v1 resource. Use `version: 2` only when the client needs command-level timing or semantic annotations. Upgrade an existing declaration explicitly with `migrateMotion(input, 2)`; the helper validates and clones rather than mutating input or guessing content. There is no silent downgrade.

A v2 command may specify `timing: {startMs: 0, endMs: 600, easing: 'linear'}`. A second command can start later in the same step. Both bounds must be integers within the step's transition duration. A zero-width window is an exact cut; missing timing retains full-step cubic easing. Position and visibility interpolate independently; discrete state changes at the window end. These are presentation timings, not measurements.

A v2 step may contain `annotations: [{id: 'review-note', entity: 'review', text: 'Read the evidence before drawing a conclusion.', offset: [0, -100], evidence: []}]`. The entity must exist. Offsets are bounded screen-space hints, not a second coordinate system or automatic graph layout. Boxes are positioned against the target snapshot once; leader lines follow the semantic object. The same text is available in the caption, transcript and exported report. Referenced source ranges also enter the context inspector.

Use `clients/motion-reference/choreography.ts` as a complete synthetic example. Do not add a timer per lane, spring loop, callback in JSON or a generic overlay engine to reproduce this feature.

## Same identity, two SVG projections

Both diagram and isometric projections are SVG. Projection changes preserve world state and keyed DOM identities. They neither import Three.js nor create a WebGL context. The original VizForge StoryPlayer owns progression; D3 owns one finite visual transition. A v2 timing window samples this transition, not another clock.

Reverse/seek, rapid skips and projection changes settle to a deterministic target. Selection can update the inspector without interrupting a transfer. Offscreen content, unmount, reduced motion and restored inputs pause/settle. Hidden geometry leaves the keyboard sequence; an object disappearing while focused returns focus to the scene. There is no ambient-motion loop.

## Sources and public content

Source artifacts are approved client-owned text with safe relative paths and explicit provenance. Exact line references connect a step, entity or annotation to the source tab. No file system, live Git access, code execution, external fetch, notebook rendering or permissions engine is added.

All bundled text is public to site visitors even when its tab is inactive. Export opt-in does not make bundled content private. Do not ship secrets or unapproved proprietary snippets. References document provenance; they do not prove execution.

SVG exports use the target snapshot, not a half-rendered frame. Standalone HTML reports are script-free and exclude source text by default; referenced excerpts require a deliberate checkbox. Labels, annotations and narrative remain included and need review. This capability does not add PDF/PPTX/video encoding.

## Composition and bounds

`framework/workspace` provides the compositional WorkspaceShell. `framework/evidence/react.ts` exposes SourceReader; `framework/motion/react.ts` exposes the controlled viewport and shared scope for custom UI. Pure authoring imports must not pull in renderers.

Bounds: 40 entities, 64 links, 64 steps, 80 commands per step, six v2 annotations per step, 160 characters per annotation, offsets within +/-280, and 512 KB JSON. Sources retain 24 files, 64 KB each, 256 KB total and 2000 lines/file. Runtime checks are mandatory in addition to structural schemas. Distribute `motion-v2.schema.json` together with the unchanged `motion.schema.json` it references.

The reference client has two v1 pages plus the v2 choreography lab. All material is synthetic/authored. See `docs/API_VERSION_MIGRATION_POLICY.md` for version boundaries and `docs/CLIENT_PERFORMANCE_GATES.md` for measured payload gates. Neither document certifies real client assets, production hosting or domain calculations.

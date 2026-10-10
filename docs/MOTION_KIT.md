# Motion and evidence kit v0.5

This is a bounded optional capability for explaining processes with moving semantic objects. It extends the source SDK; it does not introduce a sixth app family, a game engine, a visual authoring IDE, a physics solver or another autoplay loop.

## Small authoring path

```sh
npm run client:new -- process-demo --family content --motion
npm run client:context -- process-demo
npm run client:check -- process-demo
npm run build:client -- process-demo
```

The new folder owns `motion.ts` and `app.ts`. No client assets are copied from the reference app. Existing clients can add the `motion` block explicitly without changing their preferred family. A motion-only build has the motion capability, not Three.js or the SQL workbench.

Read `docs/recipes/motion.md` first. Pure exports are in `src/framework/motion/index.ts`; explicit React/D3 exports are in `src/framework/motion/react.ts`. The minimal default authoring/UI entries remain unchanged.

## Closed scene grammar

A MotionSpec has source-owned entities, links, steps and optional source excerpts. A station owns a world position and cuboid extent. A token starts at a station. A link connects exact station IDs and may contain a short intermediate route. Each step owns a caption, focus, active-link IDs, dwell time, transition duration and commands.

Only four command types are accepted:

| Command | Meaning |
| --- | --- |
| `transfer` | Move a token from a checked origin along an explicit link. |
| `move` | Set an entity's authored world position. |
| `state` | Change a narrative status: idle, active, complete, warning or muted. |
| `visibility` | Show or hide an object while keeping its canonical identity. |

There are no callback strings, expression evaluation, external URLs, arbitrary SVG or generated code in the document. State labels and timings are narrative choices, not observed infrastructure health or execution measurements.

## Compile, then present

The compiler creates immutable cumulative target snapshots up front. Transfers verify that a token is actually at the link origin; competing writes and moving transfer endpoints are rejected. A seek or reverse chooses an exact snapshot. It does not replay side effects or depend on previously visited frames.

The original pinned VizForge StoryPlayer owns progression, with authored dwell intervals through its existing scheduler interface. D3 owns a finite transition between adjacent forward steps. No second ambient or high-frequency clock is added. Source/page navigation, reduced motion, hidden/offscreen content, unmount and restored state have explicit stop/settle behavior.

A selected object may change during a transfer without cancelling the transfer. A seek, reverse, rapid step skip or projection change settles to an exact target rather than replaying intermediate claims. Pausing progression lets an already-started finite transition finish; it does not rewind the picture or introduce an independently scrubbable media clock.

## One identity, two SVG projections

Flat 2D and isometric are orthographic views of the same world coordinates. Neither needs WebGL. Keyed object elements keep their DOM and semantic identity across projections. The inspector and source references remain attached to those IDs.

Canonical geometry also drives SVG/HTML exports. The renderer's local layout is not a CAD model. Clients with dense graphs must still review label density and provide sensible station placement; the framework does not invent domain topology.

**Reset (FR-05, 2026-10-10).** The transport has a Reset button. It pauses the player and applies one atomic view-only cue with the declared defaults of the block's own five fields (step, selection, projection, panel, source). It never touches model inputs, tasks or other blocks' fields.

## Reusable workspace and evidence primitives

`src/framework/workspace` exports WorkspaceShell with optional rail, collapsible object sidebar, controlled tabs, main content, inspector and status. Keyboard tab traversal supports left/right/home/end. On narrow screens the view rail becomes horizontal and source/context use the full content width. The shell contains no editor, file system, query engine or project lifecycle state.

`src/framework/evidence/index.ts` supplies the pure public source-excerpt contract and validators. `src/framework/evidence/react.ts` exports SourceReader. A client can reuse these separately from the motion block through a trusted custom component.

Sources are literal approved text with safe relative paths, an explicit language and provenance. Line references are exact one-based inclusive ranges. SourceReader highlights the active entity/step ranges, supports selecting an excerpt and explicitly downloading its text. It never executes Python/SQL, fetches Git, opens arbitrary machine paths, renders active notebook outputs or claims a source file has been run.

All bundled text is public to the site's visitors, even in an inactive tab. Source names and line ranges are evidence pointers, not access control or execution proof. Do not place secrets or private project files in a public build.

## Export semantics

SVG captures the canonical target snapshot, not an arbitrary intermediate animation frame. HTML is a standalone script-free review with the selected diagram and authored step transcript. Code excerpts are omitted by default; a deliberate checkbox includes the referenced lines. Labels, captions and relationships are still exported and must be approved for sharing.

A user's saved input file stores step, selection, projection, panel and source IDs; it does not copy the source bodies or compiled geometry. Restore uses the existing reviewed exact-app/version contract and does not start playback.

No PDF/PPTX/video exporter, web printing service or notebook exporter is introduced in this pass.

## Existing products stay separate

The interrupted old pass remains on its recovery branch as preserved opaque fragments. This pass does not assert those bytes were decoded or that the whole lost source was recovered. It reconstructs only justified reusable behavior as readable, tested source.

AtlasNote is not migrated. Cloud Diagram is not embedded or converted by this pass. The useful common idea is a source-backed, inspectable explanation with a small shell, rather than importing either application's full product surface.

No general Scenario Engine is implemented here. A future client-specific scenario can drive approved snapshots through a tested adapter; game rules, physical models and measured telemetry remain their own semantic boundaries. Motion is not a substitute for Replay, Scenario or Task.

## Limits and release interpretation

40 entities, 64 links, 64 steps, 80 commands per step, 512 KB scene JSON. Source files: 24, 64 KB each, 256 KB aggregate, 2000 lines each. This is a technical-website contract, not a large graph or code-workspace scale claim.

The full qualification record is `docs/MOTION_V0_5_QUALIFICATION.md`. It separates actual completed browser/build evidence from local checks, records visual issues found after the first green run and preserves the previous source SDK's regression suite. The project remains an alpha source SDK pending real client acceptance and broader browser/device/API-stability work.

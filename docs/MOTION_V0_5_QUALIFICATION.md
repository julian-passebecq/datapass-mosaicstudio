# Motion / evidence v0.5: qualification record

## Source identity and preservation

Repository: `julian-passebecq/datapass-mosaicstudio`.
Branch: `feat/studio2-motion-evidence`.
Draft PR #6 targets the preserved `feat/studio2-families-replay` branch. No merge, deployment, donor-repository modification or npm publication occurred.

Starting point: qualified v0.4 `b1546c04413b71a574c84870960c9842f3c19c3d`, tree `6e7edb4bc889cecd6b2f9ea8079aa2b649d20b1b`.

Final qualified implementation: **`255ae06ba41d9cd54573f30ace8995ef94631241`**, exact tree **`a38488e3c2ef2f833c9a13cbced8bd1e92aad703`**.

Readable working commits were saved before the completed implementation. The first implementation `980c687bc26e74dd8d0685bc29ba882888c14aab` passed workflow `37043724367` with 280 unit/boundary/controller tests, 53 browser scenarios and twelve isolated client targets. The generated schemas and root package-version metadata were recorded separately at `9bcb797feb04e2d852da73d3b7f567110f3a5edb`; dependency versions, integrity values and upstream commit pins did not change.

After visual review, mobile layout and animation-proof changes were saved at `28f492e292fe4411308019cfb999c2d18ce31bcd`. The final label-placement correction is in the qualified implementation above. The final documentation commit adds qualification and authoring instructions only; its SHA is reported in the PR and delivery metadata rather than inferred in advance here.

The interrupted historical pass is still preserved independently on `recovery/studio2-interrupted-20261002` at `877ca7b7c53903dc026b7402170cc2cc31996659`. Its binary fragments were not decoded or merged, and this pass does not claim the entire interrupted implementation was recovered. The new code is saved as ordinary readable source, not dangling blobs.

## Completed final gate

[Workflow 37046067565](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/37046067565), job `110967693173`, completed successfully on `255ae06ba41d9cd54573f30ace8995ef94631241`.

| Check | Observed result |
| --- | --- |
| Frozen `npm ci`, without peer-dependency bypasses | Passed |
| Committed generated-contract drift checks | Passed; no one-time regeneration in the final run |
| Unit, boundary and original-player controller tests | **282 passed**, 0 failed, 0 cancelled, 0 skipped |
| Strict `tsc --noEmit` and integrated production build | Passed |
| Six client source definitions | Passed |
| Pinned original VizForge / ConceptMotion contracts | Passed |
| Production HTTP browser suite | **56 passed**, 0 unexpected, 0 flaky, 0 skipped |
| Independent selected-client build/browser targets | **12 passed** |
| Framework source digest before/after fresh client generation and builds | Unchanged |

The six reference clients are operations, wind, architecture, experience, energy replay and motion. Six additional clients were freshly scaffolded: custom content, knowledge, spatial, analytics, replay and content with the motion capability. The motion-only targets have exactly the `motion` capability, no Three.js renderer, no WebGL canvas, no workbench database assets and no implicit SQLRooms/DuckDB initialization.

The browser tests retain all 43 previous v0.4 scenarios. New coverage includes object identity between projections, actual intermediate D3 positions, final target coordinates, selected-object continuity during a transfer, reverse/seek/rapid navigation, tabs and panel controls, exact source-line highlighting, real file downloads, script-free report rendering, reviewed saved-state restore, autoplay cancellation, reduced-motion behavior and mobile layout.

Browser: **Google Chrome 154.0.8037.57**, hosted Linux; existing 3D regressions use software WebGL2. The motion capability itself is SVG, not a WebGL application. This does not certify physical-device GPU performance, Safari/Firefox compatibility, accessibility conformance or a universal frame rate. Integrated-build warnings about upstream annotations and shared chunk sizes remain documented, not claimed fixed.

Local execution supplied pure model/evidence/scaffold checks and syntax checks. A complete local dependency installation/build/browser run was unavailable in the assistant environment. The ordinary completed hosted workflow, not a local approximation or configured test file, establishes the full result.

## What was implemented

A small optional authored-motion grammar: stations, tokens, explicit links and four command types (`move`, `transfer`, `state`, `visibility`). The compiler builds immutable cumulative target snapshots, checks exact transfer origins and rejects ambiguous writes and moving transfer endpoints. Seeking and reverse navigation select canonical state rather than replaying side effects.

The original pinned VizForge StoryPlayer remains the progression controller. Its injected scheduler uses authored dwell times. D3 performs only finite adjacent-step transitions; it is not another autoplay, physics, game or media clock. A motion index cannot be silently driven by a competing narrative/replay owner. Pausing progression does not rewind a finite transition already in flight; that transition settles to its target. Hidden/offscreen components, restored state and reduced-motion behavior have explicit stop/settle paths.

The 2D and isometric views use the same world positions, links and stable object IDs. Isometric SVG adds no Three.js dependency or WebGL context. The keyed live DOM and exported SVG use the same geometry; target exports do not capture an incomplete animation frame.

A compositional WorkspaceShell adds an optional rail, collapsible object sidebar, controlled keyboard-accessible tabs, main view, optional inspector and status. It has no editor, filesystem or data store. SourceReader shows approved inert text excerpts with validated relative paths, exact one-based line references and explicit text download. Both primitives can be imported separately by a client.

Two different client-owned examples use the generic block: a batch moving through a data pipeline, and an on-demand module-loading metaphor. The new `--family content --motion` scaffold creates a separate original example. There are still five families; motion is the eighth optional capability and seventeenth block type, not another compulsory application family.

## Corrections after the first successful gate

Inspection of real browser captures showed a full-height vertical rail consuming width on a phone and awkward wrapping in the object sidebar. The mobile shell now uses a short horizontal view rail, compact object choices, and full-width source/context views. Tests measure these areas at a 390-pixel viewport rather than checking only overall page overflow.

An isometric token label also overlapped another component label. Shared deterministic geometry now tests conservative label boxes against nearby objects and labels, chooses a nearby placement and adds a small leader when displaced. This is a bounded small-scene heuristic, not a general diagram layout solver. Unit tests cover all settled steps of both examples in both projections; the browser test checks the actual rendered text boxes for the previously failing scene. Dense arbitrary client diagrams still require visual review.

A further browser proof observes the same SVG token through a real D3 transition, records intermediate world coordinates, and verifies the exact destination. It does not approve an animation based only on a status flag or a generated screenshot.

Final actual captures were inspected: the isometric overview/transfer, module labels, source context, refined mobile view and standalone HTML report. They are browser captures of the implemented application, not generated image mockups.

## Artifact and exact source check

[Final workflow artifact](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/37046067565/artifacts/11245430033)

- Name: `studio-web-evidence`; artifact ID: `11245430033`.
- ZIP bytes: **31,186,833**.
- SHA256: `89244e594993e58996773a632f57cbc4f6a5d5fd4d26fbd2aff30ea40b2cb79f`.
- Created `2026-10-02T18:08:09Z`; GitHub retention expires `2026-10-05T18:08:05Z`.
- Includes tracked source, integrated workbench, twelve independent site builds, browser diagnostics/report/screenshots and `qa/client-builds/results.json`.

The downloaded ZIP checksum matches the connector digest. All **229 tracked files** in qualified implementation tree `a38488e3c2ef2f833c9a13cbced8bd1e92aad703` match the workflow source archive by Git blob hash, with zero mismatches. The separate final source delivery adds the final documentation only and is generated from its exact saved Git tree. Font files and dependency caches are not included in the delivery ZIPs. Committed source and qualification records remain available after transient workflow artifacts expire.

## Observed independent output sizes

These are sums of separately gzip-compressed emitted JavaScript files, not initial page-transfer sizes, runtime memory, load-time or frame-rate measurements. Total bytes include the selected site's other output files.

| Selected client | JavaScript gzip bytes | Total output bytes | Files |
| --- | ---: | ---: | ---: |
| operations-reference | 163902 | 541317 | 9 |
| wind-reference | 299434 | 1069509 | 13 |
| architecture-reference | 177471 | 605912 | 11 |
| experience-reference | 411891 | 1467094 | 24 |
| energy-replay-reference | 301108 | 1080026 | 15 |
| motion-reference | 139224 | 486853 | 10 |
| acceptance-fresh | 96612 | 327708 | 8 |
| acceptance-knowledge | 164967 | 568542 | 12 |
| acceptance-spatial | 295902 | 1083368 | 14 |
| acceptance-analytics | 163118 | 538607 | 9 |
| acceptance-replay | 169740 | 562171 | 13 |
| acceptance-motion | 137426 | 480866 | 9 |

The independent builds check intended client identity, reject unrelated reference payloads, and inspect actual rendered modules for accidental heavy dependencies. This is not a sandbox against arbitrary trusted source imports. The root development repository still installs its pinned dependency set; separate minimal npm packages are not claimed.

## Privacy, semantics and release boundaries

All text embedded in a static site is public to its visitors, including inactive tabs. Source references, filters and export omissions are not authorization controls. The HTML report excludes referenced code by default; an explicit choice includes it. Labels, narrative and visible relationships are always part of the report and require approval before sharing. SourceReader does not fetch Git or certify that a source file was executed.

Status colors, captions and dwell times are authored explanations, not observed service health, scientific output or processing duration. The examples are not production Foil'o data, a validated wind mechanism, a runtime benchmark or a claimed client delivery.

This remains **v0.5 alpha source SDK**. Not implemented in this pass: a general Scenario Engine, game rules, a Three.js adapter for MotionSpec, a model/GLTF loader, notebook execution or import, a Git repository browser, live telemetry, DuckLake, Pyodide, PDF/PPTX or video export, or migration of Cloud Diagram/AtlasNote. Existing 3D, replay, data and architecture consumers remain intact.

Next release work should be driven by an approved client brief, stable API/version/migration commitments and broader device/browser/accessibility/performance checks. Domain calculations and final client visual design remain in their own source folders. A generic missing capability should be a narrowly tested shared extension, not a reason to duplicate the framework.

## Next AI author

```sh
npm ci
npm run bootstrap
npm run client:new -- explanation-demo --family content --motion
npm run client:context -- explanation-demo
npm run dev
# Open the printed address with ?app=explanation-demo
npm run client:check -- explanation-demo
npm run build:client -- explanation-demo
```

Read the focused generated guide, `docs/recipes/motion.md` and `docs/MOTION_KIT.md`. Edit the new client's `motion.ts` and `app.ts`; do not alter renderer internals for ordinary content. Output is `dist-clients/explanation-demo/`; no deployment occurs.

# Families / replay v0.4: qualification record

## Saved source and scope

Repository: `julian-passebecq/datapass-mosaicstudio`. Branch: `feat/studio2-families-replay`. Draft PR #5 targets the preserved v0.3 `feat/studio2-experience-navigation` branch. No merge, deployment, final client site or package publication occurred.

Starting point: `8c769f3805946ca692a11720cb22d56d702bbd13`.

First implementation: `c6aef49eb09dcf1f1b448ec17f1015493abac7fe`, exact source tree `e9227c434ef784a4ce6a6796b302e5fee71e7334`. The first full workflow `36959684268` passed 216 unit/boundary/controller tests, 41 production browser scenarios and all ten independent client builds/browser checks. Its generated-schema/root-version record is `c9b55065591532bda43bf28819e9b73e6c85e0c0`.

The camera-correction implementation `90835880b3c62c11aa008e30d474383434e254d7` (tree `cd3b42d1e88f1fce2d8baeb3eac56378dcfbf48f`) passed workflow `36960693118`: 223 unit/controller tests, 42 production browser scenarios and all ten independent client targets.

Final qualified implementation: `0900c8a93d47456e663cc44a61b4b575647a69a5`, tree `1d2c04764436f389955b23ce0fdcda98825130b3`.

Final source `0900c8a93d47456e663cc44a61b4b575647a69a5` passed [workflow 36961220238](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36961220238), job `110695118287`.

- Frozen `npm ci`: passed without peer-dependency bypasses.
- Source-generated authoring contract drift checks: passed; no one-time regeneration was needed in this final run.
- Unit/boundary/controller suite: **223 passed, 0 failed, 0 cancelled, 0 skipped**.
- Strict TypeScript and integrated production build: passed.
- All five client source contracts and original VizForge/ConceptMotion visual contracts: passed.
- Real production HTTP browser suite: **43 expected, 0 unexpected, 0 flaky, 0 skipped**.
- Independent client build/browser acceptance: **10 passed** (five reference clients and five newly generated clients).
- Framework source digest before and after fresh client generation/build: identical.

The final workflow is the authority for this result, not a local preview or earlier gate. The artifact's browser JSON and selected-client JSON were inspected after download.

## Actual new functionality

Five real starter families (content, knowledge, analytics, spatial, replay), a capability plan derived from used blocks/resources, client-local family metadata and a focused AI reading route. A family is a starting composition, not a constraint on layout or future requirements. The default small authoring and UI entries do not import rendering libraries.

Selected builds use one capability planner and inspect rendered module inclusion. Three.js without the spatial capability and accidental SQLRooms/DuckDB workbench imports fail the build. Explicit custom-component capability declarations prevent the all-engine fallback; older undeclared components remain compatible with a warning. The output includes `studio-build.json`. This is build evidence, not an authorization boundary or sandbox for arbitrary source code. The development repository still installs its pinned dependencies; separately published minimal npm packages are not claimed.

The new replay block uses supplied elapsed-second timestamps, units/domains, null samples, entity positions and authored events. The plan, readouts, chart cursor and optional scene share a sample index. Original VizForge StoryPlayer supplies the discrete clock through its existing scheduler interface; original Figure renders the trace. Timestamp/null gaps split chart series rather than inventing observations. The chart reveals history up to the selected sample, not a prediction. It is bounded to 200 samples, 24 entities, eight channels and 1 MiB, not a high-frequency live platform.

The energy reference starts in 2D and loads Three.js only when a visitor chooses 3D. Generic oscillating plates use deterministic invented signals. Neither the shapes nor the wind, power, load or displacement values are a verified Foil'o mechanism/model/measurement. Real project geometry, data, assumptions and calculations remain client-owned.

## Visual review and correction beyond the first green gate

Actual captures from the first successful run were inspected. A camera move could be interrupted by the next pose-only sample update: the renderer had marked the target camera as selected before its transition actually finished. The second implementation keeps a finite camera transition across repeated pose updates, using the existing renderer loop and no additional timer. Direct manipulation still cancels automatic camera movement until a new target is explicitly requested.

Seven focused unit tests check camera completion, repeated requests, replacement targets, reduced motion, manual cancellation, reset and input immutability. A new browser scenario checks the actual settled camera coordinates while signal samples arrive. It captures both a selected installation and the whole group with a later history sample.

The replay now opens its optional 3D representation with an entire-site frame. A separate framing control switches to the selected installation. This local camera-framing preference, like free orbit, is not part of the exported input snapshot; sample, selected entity, signal, speed and 2D/3D choice remain snapshot-backed.

A further accessibility inspection found a scoped CSS rule hiding the original chart data table even after opening its disclosure. That rule was removed; an added browser check opens the real table and checks the 44 supplied plotted observations for a 49-time fixture with five missing values. No missing value is filled to satisfy the count.

## Evidence and delivery boundaries

[Source, builds and browser evidence](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36961220238/artifacts/11208435179)

- Artifact: `studio-web-evidence`, ID `11208435179`.
- ZIP bytes: `30,764,918`.
- SHA256: `9e074b9f783e123a84c7c8e9f0c2daef3166d35c6bdf6c6d0544877db82d91c2`.
- Created: `2026-10-02T03:51:42Z`. Expires: `2026-10-05T03:51:40Z`.
- Includes source, integrated workbench, ten isolated client outputs, diagnostics, screenshots and `qa/client-builds/results.json`.

The downloaded archive checksum matches the connector-reported digest. All 134 tracked files in the final implementation were compared byte-for-byte against the workflow source archive; no mismatches. The final source delivery adds documentation only. Source and compiled deliverables exclude dependency caches and font files; GitHub artifact expiry does not delete committed source.

Actual screenshots were inspected, not generated as image mockups. Browser qualification uses hosted Linux Chrome with software WebGL2, not physical-GPU performance, Safari/Firefox certification, accessibility certification or a frame-rate promise. Local HTTP browser navigation was blocked by environment policy; it was not bypassed. Local integrated build timing limits were superseded by successful ordinary hosted builds, not recorded as local success.

No dependency versions, integrity entries or donor commit pins changed in this pass. The one-time root version metadata and generated schemas were recorded after the first full gate; the final run uses the frozen committed lock and checks schema drift.

## Measured independent outputs

These are sums of individually gzip-compressed emitted JavaScript files, not first-load transfer, runtime memory or page speed. All sources and selected outputs are local/static unless a client explicitly binds an approved service.

| Client | JS gzip bytes | Total output bytes | Files |
| --- | ---: | ---: | ---: |
| operations-reference | 158006 | 520268 | 8 |
| wind-reference | 293650 | 1048269 | 11 |
| architecture-reference | 172805 | 590719 | 10 |
| experience-reference | 405034 | 1445911 | 23 |
| energy-replay-reference | 295478 | 1059004 | 15 |
| acceptance-fresh | 92352 | 312553 | 7 |
| acceptance-knowledge | 158835 | 547341 | 11 |
| acceptance-spatial | 289496 | 1062159 | 13 |
| acceptance-analytics | 156998 | 517419 | 8 |
| acceptance-replay | 163340 | 540920 | 13 |

Five references and five newly scaffolded clients pass independent production builds/browser checks. New client creation and builds leave the framework `src/` digest unchanged. Checks reject unrelated client titles, unexpected external requests, console exceptions, workbench WASM and undeclared 3D. The minimal custom starter, analytics, knowledge and 2D replay targets contain no Three.js renderer.

## Release interpretation

This is a qualified v0.4 alpha source SDK, not general v1. The new organization reduces the amount an AI author must inspect, without assuming all future client needs. Ordinary content is client-owned; justified generic extensions need an isolated branch, real consumer and regression evidence.

Before a real Foil'o release: approved model/assets and public data; independently tested scientific computations; a decision on replay versus live inputs; agreed deployment/privacy requirements; broader browser/device/accessibility qualification. No GLTF/CAD loader, live telemetry backend, physical weather model, video encoder, notebook/IDE, Hop runtime, remote Parquet, X-ray or DuckLake was added.

# Engine consolidation: qualification and experiment boundary

This is the stable acceptance map, not a self-attestation that any checkout passed.
Match the current commit to the exact-source receipt in draft PR #10 and BOTH
workflows: `Studio web gate` and `Engine authoring qualification`. A later commit
never inherits an earlier result. Keep `LATEST_WRITTEN_SHA` and
`LAST_QUALIFIED_SHA` separate in the delivery receipt.

Repository: `julian-passebecq/datapass-mosaicstudio`.
Branch: `feat/studio2-engine-consolidation`.
Base: `a6c42abaf111cd317d06501211f70bcc116875f8`.
Recovered work: `dfb592109efdf94d2f46c4105a5cbc839258d4e4`.
The recovery backup remains untouched. See `ENGINE_RECOVERY.md` for verified
lineage, the invalid synthetic story interval and environment/session distinctions.

## Authoring path

```sh
npm ci
npm run client:families
npm run client:new -- my-lab --family analytics --custom
npm run client:context -- my-lab
npm run client:dev -- my-lab --port 5178 --json
npm run client:check -- my-lab
npm run build:client -- my-lab
npm run client:capture -- my-lab --page custom-lab --out qa/captures/my-lab-first
```

Stop development with Ctrl+C (or the host's signal to its owned process). The host
uses the printed URL and versioned status records, not an assumed PID or another
dev server. Positron remains an external future host; this pass adds no extension.
See `ENGINE_AUTHORING.md` for lifecycle, saved-state capture and diagnostics.

## Capability tiers after a matching full PASS receipt

| Tier | Engine surface | What the evidence establishes / boundary |
| --- | --- | --- |
| A | Content, analytics, knowledge/graph, Motion, bounded spatial/ModelAssets, replay, context and evidence | Existing reference/client gates remain mandatory. Optional engines are still selected by actual capabilities. No domain client or production publication is implied. |
| A | Selected authoring, focused context and additive scaffolds | Eight generated family/addon compositions, typechecking, original visual contracts, dev/HMR/capability restart/invalid-source recovery and owned-process shutdown. |
| B | Client-owned SVG/D3/Canvas, controlled graph and hybrid representations | Common semantic view fields, inspector, measured container lifecycle and existing story/replay accessors. The client owns geometry, renderer-specific effects and any unusual adapter. |
| B | Native scroll-driven authored stops and target-state capture | Existing progression owners, explicit direct controls/reduced motion, reviewed state round-trip, asset readiness and hashes. These are not video production or continuous simulation. |
| C | Dense/instanced 3D, large animated/textured GLTF, CAD, GIS, massive/high-frequency telemetry | Deferred specialized adapters/producers. Retain semantic IDs, view state and provenance; supply separate limits, lifecycle and performance evidence before adoption. |

Families are starters, not silos. `--custom` is additive across five families and
motion/foundation/model addons. `customCapabilities: []` means no optional engine
for that component. D3 is optional geometry/layout/interpolation, not a universal
renderer or a second narrative clock. Ordinary React UI, VizForge charts, React
Flow graphs and Three scenes retain their existing roles.

## Shared-state ownership

`useSelection` binds the existing validated view/select field. A custom SVG,
Canvas, controlled graph or native part view can consume the same semantic ID;
hiding its representation need not erase it. Unknown IDs still fail validation.
The inspector does not manufacture evidence and representation changes do not
rerun tasks. Regression coverage checks both task count and result-object identity.

`useStory` consumes the page's original StoryPlayer. `useReplayTime` consumes the
existing sampled replay controller. Story cues are atomic view changes; manual
exploration yields the relevant player. Scroll selects authored stops without
wheel interception or another autoplay timer. Narrative time, supplied sample
time, finite renderer interpolation and domain execution remain distinct.

These are adapters over existing page scopes, not independent global state stores.
A consumer must share a page with the corresponding story/replay block. Custom
TSX is trusted local code, not an imported-document sandbox. See
`recipes/custom-visuals.md` for cleanup, readiness and field-universe boundaries.

## Mandatory qualification surfaces

The authoritative commands and order are in `.github/workflows/ci.yml` and
`.github/workflows/engine-qualification.yml`. Both must test the receipt's exact
SHA. `--source-only`, a passing build, or a configured workflow is not final PASS.

The web gate covers frozen installation, pinned upstreams, generated-contract
consistency, core/boundary/controllers, strict typing, integrated production
build, original visual contracts, real HTTP browser scenarios, the complete
16-target isolated client matrix and all existing per-client payload budgets.

The engine gate creates eight synthetic compositions without modifying framework
source, validates their original engine specs before the browser, and checks:
selected dev/HMR and recovery; SVG/Canvas selection and keyboard alternatives;
320px layout and observer cleanup; shared model/story/scroll selection without
implicit task reruns; graph/replay sample ownership and missing values; selected
build isolation; repeat target-state captures; GLB/replay saved-state round trips;
refusal of bad state, output overwrites, visible errors and broken assets.

Inspect screenshots in addition to assertions. Preserve source, fixture inventory,
selected builds, reports, browser/Node versions, run/job/artifact IDs and hashes.
A failed scope does not execute all its later checks; record that explicitly.
Generated fixture sources deliberately make capture's dirty-tree flag true;
their exact inventory/hash must accompany the clean checked-out source SHA.

## Evidence and limits

Payload means the sum of separately gzipped emitted JavaScript chunks, including
lazy chunks. The existing 16 budgets and the additional synthetic-composition
envelopes are different gates. Neither is initial transfer, FPS, Core Web Vitals,
runtime memory nor performance on a target device. Request observations check
unrequested heavy modules and network isolation; they are not a universal benchmark.

Capture uses explicit saved state, fixed viewport, reduced motion, font/image and
renderer readiness, actual UI state export, and screenshot/state/build hashes.
The lazy model boundary declares capture-busy before its module mounts. Capture
requires a ready, settled canvas for selected model views and records the observed
renderer state; the model acceptance also checks that its canvas is in the frame.
A viewport capture does not imply every offscreen block is visible. It is not
full-page video or cross-browser/OS/GPU pixel identity. Custom asynchronous work
must signal busy/ready/error and own cancellation. Imported data/inputs must be
reviewed before sharing; capture never grants publication authority.

ModelAssets remain static self-contained GLB 2.0: 16 MiB, 128 nodes, 64 semantic
parts, 250,000 rendered vertices/triangles and 256 primitives, with the existing
decoded-accessor budget. No textures, animation, skins, external resources or
universal CAD import. Replay remains 200 samples, 24 entities, eight channels,
1 MiB and at least 0.1 seconds between timestamps. Null is not zero. These limits
were not increased to obtain a green test. See `recipes/models.md` and
`recipes/replay.md` for precise profile/extension constraints.

Accessibility evidence covers the executed keyboard, focus, text alternatives,
320px and reduced-motion cases. Manual screen-reader acceptance, target-device
GPU/performance and comprehensive WCAG/security certification remain NOT_EXECUTED
unless a separate receipt explicitly supplies them. Desktop Chromium/Chrome CI
is not Safari, Firefox or a physical mobile-device qualification.

## Next boundary

After both exact-source gates and visual review pass, begin the five real Positron
experiments: Wind/Foil'o 2D/3D, Fabric Bricks, technical explanation/D3 lab,
interactive portfolio, and Agent Factory. Work primarily in client-owned files;
real data/assets, provenance and domain decisions belong to those experiments.
Return to framework changes only for a reproduced generic gap. No final clients,
merge, deployment, package publication or Mongo writes are part of this checkpoint.

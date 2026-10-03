# Motion Pro increment (v0.8 work line)

This is an additive work line on the qualified ModelAssets v0.7 baseline, not a declaration that the five real clients are finished. Qualification is recorded separately with a tested commit and workflow evidence. No dependency or upstream pin changes are required.

## One playback owner

The original pinned VizForge StoryPlayer continues to own discrete progression. D3 owns one finite transition for a step. A command's optional timing window samples that transition; it creates no timers, callbacks, loops or secondary player. An explicit action starts playback. Reduced motion disables automatic progression and settles the target snapshot. Seeking, reverse navigation and restored state select canonical snapshots, not a replay of side effects.

## Motion v2

`version: 2` allows optional `{startMs, endMs, easing}` on a command. Values are integer milliseconds in the containing step's `transitionMs`, with start <= end. Easing is `linear` or `cubic-in-out`. A zero-width window is an exact cut. Missing timing uses the historical full-step cubic curve. Position and visibility interpolate; discrete status changes at the window end. Windows describe presentation, never measured execution time.

Optional per-step annotations bind to an existing semantic entity ID. They contain plain text, a bounded screen offset and validated evidence ranges. At most six annotations and 160 characters per annotation are accepted. Boxes are laid out against the target snapshot once; leaders follow the current object position. Live SVG and export share the same geometry. The transcript and caption preserve all annotation text for people who cannot use motion or spatial views.

There is deliberately no general SemanticOverlay runtime, arbitrary HTML, custom script, spring engine, CAD model change or new clock.

## Compatibility and migration

Existing motion v1 resources remain accepted and their schema remains unchanged. V1 rejects v2-only fields instead of ignoring them. Use `migrateMotion(input, 2)` from the pure motion entry for an explicit, validated, non-mutating upgrade. Migration adds no guessed timings or annotations and preserves settled poses and the default visual curve. Unknown versions and downgrades fail. A client manifest/app version is distinct from the motion resource version; saved input restoration still follows the existing app-version compatibility rule.

The generated v2 schema refers to value schemas in `motion.schema.json`; distribute both files together. The runtime is additionally responsible for cross-field timing bounds, unique IDs, exact source line ranges and semantic references. A JSON Schema validation alone is not a complete resource validation.

## Acceptance composition

The existing motion-reference client retains its two v1 pages and adds a v2 Choreography lab. Two separate lanes, staggered transfer windows, exact status cuts, independent fades and source-linked annotations exercise the existing renderer. The material is synthetic and does not claim Foil'o physics, Galaxy inventory completeness or measured performance.

## Verification obligations

Run frozen dependencies, contract drift checks, core tests, strict TypeScript, integrated production build, original engine contract tests, real HTTP browser tests and the isolated-client matrix. Inspect both projections, source context, static report and narrow-screen transcript screenshots. Counts and pass/fail must come from the actual run, not this document.

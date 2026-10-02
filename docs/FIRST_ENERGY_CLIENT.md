# First real energy client: implementation boundary

The purpose is to build a useful Foil'o client application with reusable Studio blocks, not to label a synthetic demonstrator as a real engineering result.

## Starting point

Start with `--family replay` for recorded engineering signals, or `--family analytics` for a scenario calculator. Add optional spatial content only when it explains the mechanism or installation. Family metadata is guidance; the actual blocks control the bundle.

Do not copy invented power/wind/load arrays or conventional turbine geometry into the actual client. The `energy-replay-reference` oscillating plate rigs are deliberately generic interface fixtures. The older `wind-reference` is a separate illustrative SDK consumer, not a representation of Foil'o's technology.

## Domain-owned material required for delivery

- Approved identity/content and permission to publish it.
- The actual mechanism/assembly: component identities, local coordinate system, expected movement, and rights to supplied assets.
- Signal definitions, units, timestamps and sample quality/missing-value convention.
- The distinction between recorded values, synthetic demonstration and calculated outputs.
- Any real model's documented assumptions, reference cases and numerical correctness tests.
- Publication/privacy requirements, target hardware/browsers and whether any computation leaves the browser.

This is a delivery checklist, not a reason to block framework development or invent missing details.

## Implement without reading irrelevant internals

1. Generate the client and its focused `client:context` guide.
2. Add approved content and test data under that client folder.
3. Bind a `ReplaySpec` or typed analytical dataset before adding any geometry.
4. Test sample/index/selection/unit/missing-data behavior in 2D.
5. When needed, add a bounded `SceneSpec` and exact entity/part signal mappings. A richer asset loader is a separate optional framework change.
6. Keep source-owned model calculations independent of camera/story/replay view state.
7. Run the client contract check, strict selected build and actual browser acceptance, including no-WebGL/reduced-motion/manual paths.
8. Review generated public output before deployment. No reference label grants permission to publish private data.

## Extensions only when a real requirement proves their value

A physics model, multi-hour high-frequency stream, large dataset, GLTF loader, backend calculation or live event transport is not supplied by choosing a family. Add the smallest independently tested adapter when the client requires it; do not turn every site into an IDE, data lake manager or universal telemetry platform.

The framework's shared camera transition now survives incoming pose updates. This is a presentation guarantee, not a physical solver or real-time scheduling guarantee. The current discrete player preserves supplied interval differences but is not a wall-clock-drift-compensated media engine.

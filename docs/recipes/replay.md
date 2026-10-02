# Engineering replay family

Use `--family replay`. The starter is deliberately 2D-only and requires no 3D library knowledge.

`ReplaySpec` owns elapsed-second timestamps, entity IDs, channels/units, nullable samples and authored events. `replayFields` and `replayBlock` wire the controls. One existing VizForge StoryPlayer supplies sample state; its injected scheduler uses the supplied timestamp differences and selected playback speed. There is no second high-frequency or physics clock.

Plan, current measurements, chart cursor, events and optional scene consume the same sample index. Seek, reset, restored state, unmount, hidden document and offscreen replay pause playback. Reduced motion disables automatic playback but not manual inspection.

Maximum: 200 samples, 24 entities, 8 channels, 1 MiB. Consecutive timestamps are at least 0.1 seconds apart. This is bounded sampled replay, not a live streaming platform or a 60-fps telemetry engine. Irregular timing is preserved. Nulls are not filled or converted to zero. Chart gaps form separate segments.

3D is optional: supply `scene`, `overviewCamera` and explicit `motion` mappings. A translation/rotation binds a part to its own entity's numeric channel with bounded scale and offset. Visual interpolation does not create new measured values or establish a physical model. Missing motion samples revert to the authored base pose and are reported unavailable.

Reference: `energy-replay-reference` uses abstract plates and invented signals, not a validated Foil'o mechanism. Real assets/data/calculations remain client-owned.

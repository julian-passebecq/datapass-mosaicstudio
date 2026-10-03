# Motion capability guardrails

Preserve the original pinned VizForge StoryPlayer as the single progression owner. D3 has one finite transition per adjacent step. V2 command windows are pure samples of that transition, never timers or callbacks.

Keep v1 accepted input and easing semantics unchanged. V2-only fields must fail on v1. Validate identity, source ranges and timing relationships beyond JSON Schema. Unknown versions, unsafe fields, ambiguous writes and invalid origins fail closed. Migration is explicit and non-mutating.

Annotations bind semantic IDs, not DOM selectors or display labels. Share live/export geometry. Provide full plain-text meaning in caption/transcript and source opt-in in static reports. Bundled text is already public; export settings are not authorization.

Do not import D3/React/Three from the pure authoring entry. Do not create a universal SemanticOverlay, physics engine, CAD importer or alternative player for a client-specific desire. ModelAssets remains a separate qualified capability.

For changes run legacy and v2 core tests, controller tests, strict build, all browser scenarios, isolated clients and payload budgets; inspect actual screenshots. Qualification must identify the tested SHA and artifact, not reuse historical counts.

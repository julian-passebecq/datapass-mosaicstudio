# Experience qualification notes

## First complete hosted run

Source `d16827528659266092422ad71ddb39c249ac8979`, workflow `36942222289`.

- Frozen dependency install and additive contract checks passed.
- Unit, strict integrated TypeScript/build and original visual-contract checks passed.
- All 32 production HTTP browser scenarios passed with no skipped/flaky tests.
- The selected-client phase failed on its first target, before any target could be counted as passed.

Cause: `scripts/build-client.mjs` generated a client-only TypeScript project that omitted the repository's existing `src/dom-compat.d.ts`. The new public ConceptMotion adapter made that omission visible through the original SVG engine's `moveBefore` type. No donor code or compatibility shim was changed; the selected-client project now includes the existing declaration.

## Visual review corrections

The first actual browser images were reviewed. Oversized indicator cards came from stretching a metric beside a full chart; the reference composition now separates analytical output and keeps metrics at natural height. The original ConceptMotion default viewport also left excessive vertical space. The wrapper now calls the original `recommendedSceneViewport(..., 'compact')` instead of inventing a different renderer, and adds an explicit dark semantic theme. Generated VizForge charts use the existing theme grammar in dark sites. Authored stories remain source-owned.

A new browser test waits for genuine semantic animation completion, verifies the sorted stable item positions, checks compact viewport bounds and captures the settled result. Another verifies original chart palette variables and compact indicator height. Mid-transition screenshots are not accepted as final rendered evidence.

## Local limitations

Local strict TypeScript, unit tests and integrated builds ran using the exact pinned sources/dependencies. HTTP browser navigation in the assistant environment was blocked by policy; no bypass was attempted. Real browser execution and its diagnostics are owned by the bounded hosted GitHub Actions workflow, as in the previous qualified pass. The workflow is not called successful until both integrated browser and independent target checks complete.

## Final hosted result

Source `12eee93d82fb01bbb018f9fabc3e89f541ff38ea` passed the complete workflow `36943432246`: 168 unit/boundary tests, strict TypeScript/build, original visual contracts, 34 browser scenarios, and all seven isolated client build/browser targets. New-client creation left the framework source digest unchanged. See `docs/EXPERIENCE_V0_3_QUALIFICATION.md` for exact identities, measured outputs and evidence limitations. The first failed isolated-type gate is retained above, not rewritten as success.

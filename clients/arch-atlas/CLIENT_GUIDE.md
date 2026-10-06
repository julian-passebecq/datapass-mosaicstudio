# Start here

Family: spatial. Rendering code is the framework module `src/framework/concept/`; this client owns the spec files and the experience.

- Add or edit an architecture in `specs/*.concept.json` (format: `docs/CONCEPT_SPEC.md`) and register it in `specs/index.ts`; `parseConceptSpec` must pass.
- After a spec or layout change run `node --experimental-strip-types clients/arch-atlas/tools/export-svg.mjs` and commit `qa/diagrams/*.svg` (the unit test compares hashes).
- A new node kind is a framework change (`src/framework/concept/`: `CONCEPT_KINDS`, `kinds.ts`, flat, isometric and 3D glyphs); report it rather than adding it here.
- Navigation and film stay pure (no clocks); time comes from the caller.

Read `README.md` and `SOURCE_STATUS.md` before changing content. Do not modify `src/framework` from this client.

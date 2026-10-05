# Start here

Family: spatial. All atlas code is client-owned under `clients/arch-atlas/`.

- Add or edit an architecture in `specs/*.ts` and register it in `specs/index.ts`; `validateSpec` must pass.
- After a spec or layout change run `node --experimental-strip-types clients/arch-atlas/tools/export-svg.mjs` and commit `qa/diagrams/*.svg` (the unit test compares hashes).
- A new node kind needs: `NODE_KINDS` + `KIND_LABELS` (spec.ts), a glyph (glyphs.ts), an icon builder (icons.ts) and a color (palette.ts).
- Keep `navigation.ts` pure (no clocks); time comes from the caller.

Read `README.md` and `SOURCE_STATUS.md` before changing content. Do not modify `src/framework` from this client.

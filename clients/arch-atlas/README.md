# Architecture Atlas (prototype)

One architecture spec, three representations with the same ids:

1. **3D atlas** — vertical layers float at their own height (storage/lake at the bottom → engines → serving → apps → people at the top). Each node is drawn as the thing it is, not as a generic block: the lake is real water with a shoreline under everything (items above it stand on piles), a warehouse is a shelved building, a pipeline is pipes with a valve, a notebook is an open book with code lines, a stream is a flowing ribbon, a report is a screen with a live bar chart, an API is a gateway arch, a queue is a conveyor, identity is a key and a gate, CI is meshing gears, a static host is a rack, people are figures. Data flows are pipes with moving beads; control flows are dashed tethers. Pipes route vertically between layers and use a riser plane behind the icons for multi-layer jumps.
2. **Layered 2D SVG** — rows are layers (users on top, storage at the bottom), columns are domains/workspaces; orthogonal routes with ports spread along the cards and one lane per edge in each row gap; same glyph metaphors as the 3D icons.
3. **Isometric 2D SVG** — rendered by the framework **Motion v2** exporter (`motionSvg(compileMotion(spec), 0, 'isometric')`), plus client-owned layer planes.

Both SVGs are exported from the app (header buttons) and saved in `qa/diagrams/` by `tools/export-svg.mjs`; the unit test fails if the committed files differ from what the spec produces.

## Specs

- `specs/fabricPlatform.ts` — a Fabric-like unified data platform (shared lake, lakehouse/warehouse/event store, pipeline/notebook/stream, semantic model, endpoint, identity, reports, alerts). **Synthetic**, generic names, no logos.
- `specs/datapassStack.ts` — our own DataPass MosaicStudio stack (Python producers → artifact files → FastAPI service / file watch → Studio clients → client build, GitHub Actions gate, static bundle). **Documented**: every node cites repository files; branch-only paths say which PR branch.

The spec format (`spec.ts`) is renderer-free: `layers` (bottom → top, with a role), `groups` (left → right), `nodes` (`kind`, `layer`, `group`, `purpose`, `sources`), `edges` (`data` | `control`). `validateSpec` fails closed (unknown kinds/fields, dangling edges, duplicate ids, a lake not on the bottom layer, documented nodes without sources, > 3 nodes per layer/domain cell).

## Navigation

Scroll or ↑/↓ (PageUp/PageDown) moves between layers, Shift+scroll or ←/→ moves across domains, Home returns to the overview, a click on a node or its label focuses it and opens its properties (kind, purpose, inputs/outputs with flow labels, source refs). Camera moves are eased samples of (from, to, elapsed) — `navigation.ts` never reads a clock; reduced motion jumps. View state (`atlas-spec`, `atlas-view`, `atlas-selection`, `atlas-layer`, `atlas-group`) lives in the shared runtime and is validated atomically.

## Film

`?app=arch-atlas&film=1&paused=1&chrome=0&t=<s>[&spec=datapass-stack]` opens the 28 s film at an exact frame. `filmFrame(spec, t)` is pure: rise from the lake through every layer, pan across the domains, focus the semantic model, pull back, cross-fade to the layered diagram.

```sh
npm run client:dev -- arch-atlas --port 5193
FFMPEG=/path/to/ffmpeg node clients/arch-atlas/tools/record.mjs --url http://127.0.0.1:5193
```

Writes `qa/film/arch-atlas-film.mp4` (git-ignored when > 5 MB), stills and `film-report.json`.

## Tests

- `node --experimental-strip-types --test tests/arch-atlas.test.mjs` — spec validation, deterministic SVG hashes vs committed files, shared ids across 2D/3D, Motion v2 validation of the isometric scene, pure navigation/film, runtime view-state rules.
- `npx playwright test -c clients/arch-atlas/qa/playwright.config.ts` (client served on 5193) — keyboard layers/domains, label click → properties, 2D click selection, SVG download, film seek.

## What the framework Motion v2 isometric lacked (kept client-side, no framework edits)

- No layer/ground concept: the atlas injects its layer planes (and the lake as the bottom plane) into the exported SVG and widens the viewBox.
- Stations are boxes only, capped at 8 units per side and ±30 units of position, so there is no per-kind glyph and no lake spanning the whole width.
- No groups/domains and no edge-kind styling (control vs data); link labels are not drawn in the SVG.
- Label placement is automatic and can stack labels of vertically aligned nodes.

A generic "layer planes + glyph per station" option in Motion would remove the string post-processing in `svg.ts`.

No AI features. Prototype only: not a qualified client.

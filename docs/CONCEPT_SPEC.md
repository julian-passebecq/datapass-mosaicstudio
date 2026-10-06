# Concept spec v1

A **concept spec** is a small JSON file that describes a system as layers × domains × nodes × flows. One file gives three renderings, all drawn by framework modules in `src/framework/concept/`:

| Rendering | Module | Output |
|---|---|---|
| Isometric 2D | `isometricSvg(spec)` | Motion v2 SVG (`motionSvg(compileMotion(toMotion(spec)))`), layer planes, kind glyphs, street routing |
| Layer cake 2D | `layerCakeSvg(spec)` | flat SVG: rows = layers, columns = domains, side domains as dashed bands on the right |
| 3D scene + film | `react/ConceptStage`, `react/ConceptFilm` (lazy, Three.js) | interactive layers/domains/nodes; a deterministic 28 s film, `filmFrame(spec, t)` on a virtual clock |

Ids are shared by every rendering (`data-node`, `data-layer`, `data-flow`), so a selection made in one is valid in the others.

**Published contract:** `spec/concept/v1/` (schema with a stable `$id`, two examples, and the rules for versions, exporters, evidence and unknown fields). Files carry `"specVersion": "1.0.0"`; 1.x changes stay backward compatible. Validate with `node scripts/concept-validate.mjs <file>`.

## Minimal example

```json
{
  "$schema": "https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/concept/v1/concept-spec.schema.json",
  "format": "datapass.concept-spec",
  "version": 1,
  "specVersion": "1.0.0",
  "id": "mini",
  "title": "Mini app",
  "provenance": "synthetic",
  "note": "Synthetic illustration.",
  "layers": [
    {"id": "data", "label": "Data", "height": 0, "role": "storage"},
    {"id": "apps", "label": "Apps", "height": 1, "role": "experience"}
  ],
  "domains": [{"id": "main", "label": "Main"}],
  "nodes": [
    {"id": "db", "kind": "sql-db", "layer": "data", "domain": "main", "label": "Orders DB"},
    {"id": "ui", "kind": "app", "layer": "apps", "domain": "main", "label": "Orders UI"}
  ],
  "flows": [{"id": "rows", "from": "db", "to": "ui", "kind": "data", "label": "Rows"}]
}
```

## Fields

- **Top level**: `format` (`datapass.concept-spec`), `version` (1), `specVersion` (`1.y.z`, written by every exporter), `id`, `title`, optional `subtitle`, `provenance` (`synthetic` | `documented`), `note`, optional `annotations`.
- **layers** (bottom → top, ≤ 8): `id`, `label`, `height` (strictly increasing, gap ≥ 0.6, ≤ 40), optional `role` (`storage`, `data`, `compute`, `serving`, `experience`, `delivery`, `users`), `description`.
- **domains** (left → right, ≤ 8): `id`, `label`, `description`, `placement` (`main` default, or `side` for cross-cutting concerns such as identity; side domains come last).
- **nodes** (≤ 40, ≤ 3 per layer × domain cell): `id`, `kind`, `layer`, `domain`, `label` (≤ 40 chars), optional `status` (`active`, `planned`, `deprecated`, `external`), `description`, `sources` (`[{path, note?}]`), `evidence` (`[{kind, ref, label?}]`, ≤ 12).
- **flows** (≤ 64): `id`, `from`, `to`, `kind` (`data` solid, `control` dashed, `auth` dotted purple), `label`, `direction` (`forward` default, or `both`), `evidence` (`[{kind, ref, label?}]`, ≤ 12).
- **annotations** (≤ 6): `id`, optional `target` (a node id), `text` (≤ 160). Shown as numbered footnotes (layer cake), callouts (isometric) and notes in the node panel.
- **kinds** (31): `app web-app browser api endpoint function sql-db database lake lakehouse warehouse eventhouse notebook pipeline stream queue producer library semantic-model report dashboard alert identity repo artifact ci-runner static-host user users device external`. Each has a label, colour, flat glyph, isometric glyph and 3D icon (`kinds.ts`).

## Validation

`parseConceptJson(text)` (size ≤ 256 KB, JSON errors) → `parseConceptSpec(value)` (zod; unknown fields are ignored and reported as warnings by `checkConceptSpec` / `readConceptJson`) → semantic checks: unique ids across layers/domains/nodes/flows, references resolve, heights increasing, at most one `lake` and only on the bottom layer, cell capacity, side domains last, a `documented` spec cites at least one source or evidence ref per node. Errors are a `ConceptSpecError` whose message lists every issue as `path: message`, for example:

```
Concept spec is invalid:
- nodes[0].kind: unknown node kind "spaceship"; expected one of: app, web-app, …
- flows[2].to: unknown node "ghost"
```

The JSON Schema is published at `spec/concept/v1/concept-spec.schema.json` (draft 2020-12, `$id` = its raw GitHub URL, also copied to `docs/contracts/`), generated from zod by `npm run contracts` and checked by `contracts:check` and a unit test; add `"$schema"` to a file for editor completion. The JSON Schema covers structure only; the semantic checks run in `parseConceptSpec`.

## Labels never clip

Static layouts measure text with `fitText` (deterministic width estimates, generous on purpose): titles, domain and layer labels shrink then wrap, card labels wrap to 2 lines, the header and footer grow to fit. The concept-viewer Playwright smoke checks every `<text>` box with the browser's real `getBBox()` against the canvas, its card and the layer gutter, and every 3D label for overflow, on all three examples.

## Clients

- **concept-viewer** (`?app=concept-viewer`): opens any spec by example tab, **Open file**, drag-and-drop of a `.json` file, or `?spec=examples/<file>.json` (relative paths only); `?view=isometric|layered|3d` switches rendering. An invalid file shows its issues and keeps the current spec. SVG download for both 2D renderings. Film: `&film=1&paused=1&chrome=0&t=<s>`; `window.__conceptFilm.seek(t)` renders an exact frame.
- **Standalone viewer** (`dist-standalone/concept-viewer.html`, no build or server needed): double-click to open, then drop or pick a file, paste JSON, or pass `?src=https://…` (the server must send `Access-Control-Allow-Origin`, since a file:// page has origin `null`; `http://` only for localhost). Regenerate with `npm run build:concept-standalone`.
- **arch-atlas** reads `specs/*.concept.json` with the same modules.
- Examples (`clients/concept-viewer/public/examples/`): `forecast-app` (a Fabric-style forecasting app, synthetic), `cloud-data-platform` (synthetic), `datapass-stack` (documented, identical to the atlas file).

Film recording: `FFMPEG=<ffmpeg> node scripts/record-concept-film.mjs --url <served client> --app concept-viewer --spec examples/forecast-app.concept.json`.

# Concept spec v1 (published contract)

A concept file (`*.concept.json`) describes an app or a cloud project as **layers × domains × nodes × flows**. DataPass MosaicStudio renders one file three ways (isometric 2D, layer cake 2D, 3D scene). This folder is the stable contract other tools target.

| File | Purpose |
|---|---|
| `concept-spec.schema.json` | JSON Schema 2020-12, generated from the zod source (`src/framework/concept/schema.ts`) by `npm run contracts`. `$id`: `https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/concept/v1/concept-spec.schema.json` |
| `example.minimal.concept.json` | Smallest useful file, with `evidence` on nodes and flows |
| `example.forecast-app.concept.json` | A full synthetic app (side band, all flow kinds, annotations) |

## Versions

- The contract follows **semver**. The schema carries `"version"`; every file carries `"specVersion": "1.0.0"` (plus the fixed `"format": "datapass.concept-spec"` and `"version": 1`).
- A **1.x change must stay backward compatible**: it may only add optional fields, raise limits or add accepted values. Every valid 1.0 file stays valid. A breaking change is a new major version in a new folder (`spec/concept/v2/`), and this folder does not change.
- Readers accept any `1.y.z`. A file newer than the reader (for example `1.3.0` read by a `1.0.0` reader) loads, with a warning; the fields the reader does not know are ignored. A missing `specVersion` is read as `1.0.0`, with a warning. Any other major version is rejected.

## Required fields

- Top level: `format`, `version`, `id`, `title`, `provenance` (`synthetic` or `documented`), `note`, `layers` (1 to 8), `domains` (1 to 8), `nodes` (1 to 40), `flows` (0 to 64). Optional: `specVersion` (always written by exporters), `subtitle`, `annotations`, `$schema`.
- Layer: `id`, `label`, `height` (bottom to top, strictly increasing by at least 0.6). Domain: `id`, `label`. Node: `id`, `kind` (one of 31 kinds), `layer`, `domain`, `label` (at most 40 characters). Flow: `id`, `from`, `to`, `kind` (`data`, `control`, `auth`), `label`.
- Ids are lowercase (`a-z`, `0-9`, `-`, at most 48 characters) and unique across the whole file.
- The schema checks the structure. The cross-reference rules are in the schema `description` and enforced by the validator: references must resolve, at most 3 nodes per layer × domain cell, at most one `lake` and only on the bottom layer, side domains last, and a `documented` file gives every node a `sources` or `evidence` entry.

## What an exporter must emit (for example DataPass React)

1. `"$schema"` set to the `$id` above, `"format": "datapass.concept-spec"`, `"version": 1`, `"specVersion": "1.0.0"`.
2. Every required field, ids as above, labels within their limits (shorten long names and put the full name in `description`).
3. `"provenance": "documented"` when every node comes from real files, with evidence refs; otherwise `"synthetic"` and a `note` that says so.
4. Evidence on nodes and flows (optional, at most 12 each):

   ```json
   "evidence": [{"kind": "source", "ref": "src/api/orders.ts", "label": "Route handler"}]
   ```

   `kind` is a lowercase word. Known kinds: `source` (a repository path, optionally `path#L10-L20`), `doc`, `url`, `commit`, `test`, `issue`, `config`, `log`, `other`. Other lowercase kinds are accepted and shown as written. `ref` (at most 500 characters) is required, `label` (at most 120) is optional. Evidence is inert text: viewers show it and never fetch it (only `https://` refs become links).
5. No secrets, credentials or client payloads: a concept file is meant to be shared.
6. Check the output with `node scripts/concept-validate.mjs --strict <file>` (exit 0 = valid with no warnings).

## Unknown fields

Unknown fields are **ignored, with a warning** (path + message), at every level. This keeps newer 1.x files readable by older readers and still shows typos such as `"lable"`. The schema allows them too (`additionalProperties: true`). Errors, by contrast, block loading: the viewer keeps the previous file and lists each error as `path: message`.

## Embedding

A host page (for example Contoso) can show a spec in the standalone viewer by framing `concept-viewer.html` and talking to it with `postMessage`:

```js
const frame = document.querySelector('iframe#concept');           // src=".../concept-viewer.html?view=isometric"
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || e.data?.type !== 'datapass.concept-spec/ready') return;
  // First "ready": the viewer is listening. Later ones carry e.data.result for each spec you sent:
  // {ok: true, id, warnings: [{path, message}]} or {ok: false, issues: [{path, message}]}
});
frame.contentWindow.postMessage({type: 'datapass.concept-spec/load', spec,
  options: {view: 'layered', fit: true, chrome: 'embed', theme: 'auto'}}, '*'); // after the first "ready"
```

- `options` (since `studio-v0.8.1`, all optional; a load without them behaves as before). Each option keeps its last sent value, so later loads may omit them; invalid values are ignored.

  | option | values | effect |
  |---|---|---|
  | `view` | `isometric`, `layered`, `3d` | Rendering to show (same as `?view=`). The reader can still switch. |
  | `fit` | `true`, `false` (default) | Show the whole diagram in every view, on load and on every frame resize until the reader pans or zooms. Without it the isometric view starts at a readable zoom from the left edge (made for a full window). |
  | `chrome` | `full` (default), `embed` | `embed` hides the example gallery, Open file, URL and Paste, and ignores dropped files. The view switcher, the SVG exports, the film and the details panel stay; below 1100 px of frame width the details panel collapses behind a **Details** button (selecting a node opens it). |
  | `theme` | `light` (default), `dark`, `auto` | Viewer chrome colours; `auto` follows the frame's `prefers-color-scheme`. Diagrams keep their light paper card. |
- `spec` is the concept object, or its JSON text. It goes through the same path as **Open file**: 256 KB bound, validation, errors listed as `path: message` in the viewer while the previous spec stays, warnings for unknown fields. Nothing in it is evaluated.
- The viewer reads only messages from its direct parent whose `type` is exactly `datapass.concept-spec/load`; anything else is ignored without a reply. It answers `{type: 'datapass.concept-spec/ready', specVersion}` once it listens, and again after every load (with `result` only for specs the parent sent; files a visitor opens in the frame are not described to the parent).
- Messages go to the parent with target origin `*` and hold only the result above. Keep the parent's own CSP `frame-src` open to the viewer's location.

## Validate and view

- CLI: `node scripts/concept-validate.mjs <file> [more files] [--strict] [--json]` (exit 0 valid, 1 invalid, 2 bad usage).
- Library: `checkConceptSpec(value)` returns `{ok, spec | issues, warnings}`; `readConceptJson(text)` throws a `ConceptSpecError` listing every issue.
- Viewer without a build: open `dist-standalone/concept-viewer.html` (double-click), then drop a file, pick one, paste JSON or pass `?src=https://…`.

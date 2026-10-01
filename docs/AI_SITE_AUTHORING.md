# Build a client website with the Studio source SDK

## Objective and contract

Studio owns reusable rendering, typed state, small-data bindings, guarded tasks and build boundaries. **The client owns domain logic, content, data, assets, pages and evidence.** Do not edit `src/framework` just to build another site.

This is the **v0.2 source SDK**, not a published npm package, not Streamlit source compatibility and not a notebook runtime. Workbench features remain in the repository, but a client build has a different entry point and does not initialize SQLRooms or DuckDB unless a future explicit integration adds them.

Read `docs/contracts/components.json`, `src/framework/types.ts` and one reference `clients/*/app.ts` first. Runtime validation is authoritative for semantic references; the generated JSON Schemas assist authoring but cannot prove dependency correctness or domain validity.

## Fast start

```sh
npm ci
npm run client:new -- client-name --title "Client project"
npm run dev
# Open the printed address with ?app=client-name
npm run client:check -- client-name
npm run build:client -- client-name
```

Output: `dist-clients/client-name/`. No deployment happens. The regular `npm run build` is the integrated review/workbench build and includes only the three public reference clients. It does **not** automatically include every new client folder.

`npm run client:new -- client-name --title "Client project" --custom` also creates a client-owned TSX component and binds it through the `custom` block. Scaffolding refuses an existing folder and never overwrites another client or framework file.

## Client folder

```text
clients/client-name/
  app.ts              # defineApp({manifest, bindings, resources, components})
  model.ts            # trusted, testable domain calculations
  scene.ts            # optional inert primitive assembly and cameras
  story.ts            # optional original VizForge StorySpec plus view cues
  ClientNote.tsx      # optional client-owned React component
  public/             # ONLY this client's static public assets
  README.md
  AGENTS.md
```

`app.ts` is trusted repository source. Build checks evaluate it locally with esbuild, including TSX imports. Never load an untrusted downloaded client module. Imported *saved state* is a different, bounded inert JSON format and cannot register source code.

The directory name must equal `manifest.id`. IDs use the validator's declared syntax; avoid prototype-sensitive names. App/version identity is checked on restore.

## Minimal app

```ts
import {defineApp} from '../../src/framework/index.ts';

export default defineApp({
  manifest: {
    format: 'datapass.web-app', schemaVersion: 1,
    id: 'example', version: '0.1.0',
    title: 'Example', description: 'A client website.',
    label: 'Synthetic prototype',
    theme: {accent: '#286b7d', density: 'compact'},
    fields: [], datasets: [], tasks: [],
    pages: [{
      id: 'overview', title: 'Overview', description: 'Project summary.',
      sections: [{id: 'summary', columns: 2, blocks: [
        {id: 'intro', type: 'text', title: 'Project', text: 'Client-owned text.'},
        {id: 'kpi', type: 'metric', title: 'Example value', value: {literal: 42}}
      ]}]
    }]
  },
  bindings: {}
});
```

No callbacks are embedded in the manifest. `value` is a literal, a declared state field, or an exact dataset row/column reference. It is never an expression string.

## State and data

Fields are `number`, `select` or `toggle`. `role: 'input'` means model/filter input; `role: 'view'` means camera, playback or other presentation state. Use an `input` block with `control: 'slider'` for a numeric slider, or omit it for the native number field. Bounds, options and step alignment are validated before state changes.

A dataset declares `columns`, `rowKey`, `source`, `provenance`, `layer`, `inputs` and `dependsOn`. Inline rows are cloned and frozen; derived bindings receive **only their declared inputs and upstream datasets**. Cache keys track those dependencies, not every UI event. `Bronze`, `Silver` and `Gold` are useful metadata labels here; they do not imply DuckLake, Delta, materialized ETL or persistence.

```ts
bindings: {
  inline: {raw: [{id: 'a', value: 4}]},
  derive: {
    scaled: ({values, datasets}) => datasets.raw.map(row => ({
      id: row.id,
      value: Number(row.value) * Number(values.gain)
    }))
  }
}
```

Each output is validated against its typed column contract and unique row key. `null` must be explicitly allowed and is displayed as unavailable, not zero. The small-data contract is capped at 10,000 rows and 40 columns. SQLRooms/UWData Mosaic still own the existing larger-data query/editor/cross-filter workbench; this small client binding layer is not a new SQL engine or replacement query coordinator.

## Async computation

Register a trusted `bindings.tasks[id]` and a declared `source: 'task'` output dataset. A `task` block provides explicit run/cancel controls. Inputs changing during or after a run invalidate the result; late and superseded responses cannot overwrite a newer task. Upstream task reruns invalidate dependent tasks too.

Cancellation is cooperative for the actual worker/service. The UI stops accepting a cancelled result; it cannot forcibly interrupt arbitrary CPU-bound JavaScript that blocks the browser thread. Expensive work belongs in a worker or a service.

The optional `createJsonTask({endpoint: 'api/calculate'})` helper POSTs only the task's declared input snapshot to a fixed same-origin route, refuses redirects, caps request/response bytes and expects a typed row array. A client may bind an actual approved Python service this way. **No such backend is provided or deployed in this pass.** The server still owns authentication, authorization, validation, timeouts, concurrency and allowlisted calculations. Disclose which inputs leave the browser; never serialize credentials into the app manifest or saved state.

## Visuals and stories

The `chart` block translates a small typed dataset into the **existing VizForge Figure/D3 renderer**. It is not a new chart engine. The simple bar adapter supports up to 30 nonnegative categories; line/scatter require numeric X. Nulls or ambiguous duplicate X values produce an explicit message rather than a misleading line. For advanced analytical visuals, use the original StorySpec or a trusted custom component.

`story-controls` and `story-figure` with the same resource share **one original VizForge StoryPlayer** per page. A story resource adds only:

```ts
{indexField: 'storyStep', spec: originalVizForgeStory, cues: {
  'scene-id': {camera: 'detail', explode: 0.8, selection: 'generator'}
}}
```

Cues can modify only declared `view` fields, never financial or scientific inputs. The index field must be an integer view field covering the story's scene count. Autoplay pauses when hidden, when inputs are restored/reset, on unmount, and under reduced motion. A scene change applies its canonical cue; manually changing a camera afterward does not rewrite the scene's authored meaning.

`scene3d` is a real Three.js/WebGL2 component with orbit/pan/zoom, camera presets, hierarchy, selectable entities, explode vectors, phase-driven rotation, PNG capture and a non-WebGL accessible fallback. It renders validated primitives, not arbitrary JavaScript or downloaded models. Client-owned geometry/cues are in `wind-reference`; renderer code remains generic. This pass does not supply GLTF import, CAD precision, physics, video encoding or scroll-based cinematic choreography.

## Custom component escape hatch

```tsx
// clients/example/ClientNote.tsx
import {useSiteState} from '../../src/framework/hooks';
export function ClientNote() {
  const state = useSiteState();
  return <p>State revision: {state.revision}</p>;
}
```

Bind it in source as `components: {clientNote: ClientNote}` and place `{id: 'note', type: 'custom', resource: 'clientNote'}`. JSON names the binding; it does not contain the function. The renderer passes `{runtime}` and supplies the normal runtime React context. Custom UI remains subject to privacy, lifecycle, accessibility and testing requirements. A custom block conservatively keeps optional built-in renderer chunks available because nested source components cannot be inferred reliably from JSON alone.

## Build/publication boundaries

The client builder validates a single client, typechecks its source and framework, and emits a separate client-only application. It does not copy the workbench public directory. Only the selected client's public directory is copied; symbolic client/public directories are rejected. Unused built-in 3D/story/architecture chunks are pruned for known block-only apps.

This prevents *implicit registry/public-directory inclusion* of other clients. It is not a sandbox or a guarantee against a developer explicitly importing private files into source. Review assets, source imports, schemas and labels before publishing. A static bundle and all data embedded in it are readable by its visitors.

Saved input JSON is intentionally not a whole-project archive: it excludes imported files, computed task results, source callbacks and credentials. It may still contain sensitive user-supplied values. Restore requires a review dialog and exact app/version match.

## Acceptance checklist for each real client

1. Domain assumptions and units are documented and tested; synthetic values are labelled.
2. `client:check`, relevant unit tests, full TypeScript and selected build pass.
3. Real browser tests cover the client's inputs, page navigation, empty/error states and mobile layout.
4. Visuals have readable paused/reduced-motion states and keyboard alternatives.
5. No unrelated client payload, unnecessary WASM or unauthorized remote request is present.
6. Sharing/export behavior is explicit and privacy-reviewed.

Reference clients prove composition only. They are not final Foil'o, wind LCOE or portfolio websites.

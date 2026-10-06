# Experience kit v0.3: one system, several views

This additive source SDK pass is for AI-authored client websites, not an IDE or a new hosted platform. It adds two built-in blocks (`explorer`, `explanation`) and a shared controlled `SceneViewport`. The original SQLRooms workbench, VizForge stories, wind assembly, pipeline and architecture views remain separate regression targets.

## Three useful compositions

- A spatial overview: a small assembly or map of components, camera focus, domain filter, facets, and context inspector.
- A 2D system map: the same items and selection rendered through React Flow, with breadcrumbs and an explicit route into a project.
- A knowledge site: a minimal outline, local search and readable documents. No terminal, editor, repository clone, kernel or live cloud discovery is required.

These are alternate presentations of the same client-owned `ExplorerSpec`, not three copies of the content. The synthetic `experience-reference` client exercises them together. It is not a finished portfolio and makes no claim about a person's employment, credentials or actual production systems.

## Create a client

```sh
npm ci
npm run client:new -- my-knowledge --template knowledge --title "Project knowledge"
npm run client:new -- my-spatial --template spatial --title "Product explorer"
npm run dev
# Open ?app=my-knowledge or ?app=my-spatial
npm run client:check -- my-spatial
npm run build:client -- my-spatial
```

Both templates create their own `content.ts` and `app.ts`; the spatial template also creates `scene.ts`. Neither copies another client's payload. Existing folders are never overwritten. `basic` is still the default; `--custom` creates a source-owned React extension for that basic template. Developers can add trusted custom components to any client deliberately rather than stuffing executable strings into JSON.

## Source-owned content and stable identity

`ExplorerSpec` has explicit groups, facets, items, documents and journey stops. An item has a stable ID, a parent or null, a group, text, tags, facts, a 2D position and optional scene/camera and destination mappings. A document belongs to one item and one facet. The model is independent of React Flow serialization, Three objects and DOM nodes.

For a portfolio, facets might be capabilities, companies and projects. For a product, they might be operation, performance and maintenance. For a project review, they might be design, implementation and evidence. These labels are client content, not framework-specific business concepts.

Only public/approved content may enter a static build. Selecting a domain or changing L1/L2/L3 hides no secrets: those are presentation modes, not access control.

## Put the block in an app

```ts
import {explorerFields, explorerBlock} from '../../src/framework/index.ts';
import {content} from './content.ts';

// Inside the existing defineApp manifest:
fields: explorerFields(content, 'context', 'library'),
// Inside a page section:
blocks: [explorerBlock('project-explorer', 'content', 'context', false)],
// On the AppDefinition, outside the manifest:
resources: {explorers: {content}}
```

A spatial resource additionally references `resources.scenes[content.scene]`; camera and entity IDs are validated against that scene. The last helper argument enables the optional scroll-tour UI. The template provides a complete runnable composition; the excerpt above only shows the integration points.

## Coherent navigation state

The six view fields are focus, facet, view, level, group and document. Use `navigateExplorer` plus `explorerStatePatch` for multi-field transitions. For example, selecting a document sets its item, facet, evidence level and Library view together. A group change that hides the selected item returns to overview. Opening an incompatible saved state is rejected before any values or tasks change.

Selection focuses the object. It does not open a new page. An item's optional `open: {page, label}` creates a separate action in the inspector, routed through `useNavigatePage`. The page ID must exist. A return to the system page retains context for the current runtime session. This distinction supports both calm exploration and deliberate project drilldown.

Local search uses bounded plain-text tokens over authored content; it does not evaluate user regexes, fetch repositories, run embeddings or contact a search backend. Ctrl/Cmd K focuses the visible explorer search; Escape closes local search/link presentation.

## Facets and 3D

An item can map its default camera and selected facets to different authored camera presets:

```ts
scene: {
  entity: 'generator',
  camera: 'generator-front',
  facetCameras: {maintenance: 'generator-side'}
}
```

This makes a different facet change both the context panel and the viewing angle without duplicating the object. The shared viewport is the same actual Three.js implementation used by `scene3d`: no second geometry engine or story timer is added. It renders only when needed, interpolates discrete camera/pose targets, disposes resources on unmount, and retains a useful document/map path if WebGL2 is unavailable.

The current geometry contract still uses bounded primitives. It does not provide GLTF/CAD import, physically meaningful wind/rotor simulation, GPU-scale geospatial rendering or a video encoder. A client's richer model or telemetry source requires its own approved assets, domain logic and an independently tested adapter.

## Native scroll, not scroll hijacking

The optional tour is opt-in. Native page scrolling selects finite authored stops and the renderer animates toward each selected camera. This is not a continuous cinematic timeline scrubber. Wheel events are not cancelled to trap the page inside a canvas.

Direct exploration pauses the tour. Restore/reset, hidden documents and changed domain stops stop following. Small screens and reduced-motion users retain previous/next and direct selection without a sticky scroll tour. The current threshold is 1100 px wide and 720 px high. Touch-oriented spatial explorer views preserve vertical page scrolling; direct camera orbit is not required to access any document.

The existing shared VizForge StoryPlayer remains the appropriate controller for analytical scene stories. Do not run a second autoplay controller over the same view fields. An explorer's six state fields are allocated separately by its prefix and must be changed atomically.

## Visual themes

The optional site light/dark mode also adapts generated chart inputs to the original VizForge theme contract and passes an explicit SemanticTheme to ConceptMotion. Authored StorySpecs keep their own palettes; the adapter does not mutate client source or globally recolor arbitrary SVG. Metrics retain a natural height instead of stretching into empty panels beside a tall chart.

## Share and restore

The view-link helper contains only selected routing and view IDs. It strips unrelated URL query fields and the fragment. It contains no document bodies, result rows or model-input values. The destination site must already contain the relevant approved content. Invalid links do not partially apply, and a link is consumed once per block/runtime so revisiting the page does not reset manual exploration.

Session JSON still includes all declared input/view values and uses the existing review dialog. New explorer invariants are validated jointly. URLs are not an authorization mechanism and local session state is not cloud persistence.

## Semantic explanation block

`explanation` is a thin adapter to the pinned ConceptMotion `LoopSceneSpec`, `compileLoopFrame` and `ConceptScene`, not a port of the old learning-app shell. Clients author stable item IDs, code lines and bounded scalar frames. A declared integer view field selects the frame. Compact geometry comes from the original `recommendedSceneViewport` helper; it is not an arbitrary crop of the SVG. The supplied example explains stable row identity through a sort; code is displayed, never executed.

Previous/next, reduced-motion rendering, an accessible text transcript and saved frame state are available. The adapter currently accepts the loop/ordered-item subset, not every historical ConceptMotion family. Extend supported semantic families with their original validators and concrete client acceptance tests rather than recreating the engine.

## Budgets and build ownership

Explorer limits: 64 items, 80 documents, 8 hierarchy levels, 20 stops, 512 KiB JSON. Explanation limits: 40 items, 100 frames, 256 KiB. Existing 3D limits remain 128 parts, 64 entities, 12 cameras. These are deliberate small-website contracts, not big-data capacities.

Known block-only sites prune optional capabilities. A knowledge-only client must not ship the 3D renderer or DuckDB/WASM. A custom component is opaque source, so optional capability elimination is conservative. Seven isolated build/browser targets include four reference clients and newly created basic/custom, knowledge and spatial clients. The acceptance script hashes `src` before/after and rejects framework edits made by scaffolding/building.

No new dependency or upstream pin was added in this pass. SQLRooms remains the data/editor/layout foundation of the workbench; UWData Mosaic owns its coordinated analytics. The small website runtime is not an alternative query planner.

## Versioning and remaining release work

The source SDK package is `0.3.0-alpha.1`. Manifest schemaVersion remains 1 because optional theme mode and new opt-in block kinds are additive; v0.2 clients remain regression targets. This does not imply that an older runtime can consume a new block. Client app versions still control saved-state compatibility; there is no silent migration of incompatible client snapshots.

Before a general v1, qualify real client briefs and approved assets/data, stable package/API exports and migration policy, broader browser/device/accessibility/performance checks, and only the missing adapters proved by those clients. Framework changes prompted by a new client should be isolated, documented and tested against existing clients; arbitrary client-specific work should stay in its own source folder.

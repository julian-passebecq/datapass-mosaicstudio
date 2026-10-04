# Custom visual components without a second engine

Start with `npm run client:new -- my-lab --family analytics --custom` (any family
accepts `--custom`). A non-basic starter keeps its original definition in `base.ts`
and composes the new page in `app.ts`. `ClientNote.tsx` is client-owned source: edit
or replace it. It demonstrates SVG, Canvas, resize, keyboard selection, retained
hidden identity and the existing ContextInspector. It is not a domain renderer.

## Minimal shared contracts

Import ordinary hooks from `src/framework/ui`. Import `useElementSize` and
`useSelection` from `src/framework/visual`. Selection is an existing `view/select`
manifest field containing semantic IDs, not display labels, array positions or
renderer-local node IDs. Multiple views bind the SAME field. Filters may hide an
object while the inspector retains it. Field validation is still authoritative.

`useSelection(fieldId, onManualSelection?)` returns `{selected, select}`. A select
applies a validated view-only cue. The optional callback should pause an existing
story/replay/scroll guide during direct exploration. It never starts a task.

`useElementSize()` returns `{ref,width,height,ready}`. Attach `ref` to the owned
container. ResizeObserver disconnects on replacement/unmount; a hidden zero-size
container is not ready. Canvas backing resolution should be bounded; the example
caps devicePixelRatio at 2. SVG/D3 coordinates and hit regions remain client-owned.

## D3, Canvas and graph ownership

React owns the container and controls. A D3 effect may own a named inner `<g>` or
canvas drawing only. Recompute from immutable data + view state; never use D3 to
mutate the outer application DOM. Cancel a finite D3 transition with `interrupt()`
and remove your own listeners/observers on cleanup. No idle animation frame loop.
Use the existing reduced-motion hook; manual views must retain their meaning.

A React Flow view uses controlled `nodes`/`edges` with semantic IDs and projects
`selected` from the shared field. `onNodeClick` calls `select(node.id)`. Do not add
another authoritative selection store. Local drag positions are presentation
state, not business results. General graph layout, streaming and large-density
performance remain optional client-specific work, not implied by this helper.

A mount-time `fitView` does not keep nodes framed after a container resize. Choose
that presentation policy explicitly: the synthetic replay/graph consumer uses
`useElementSize`, the existing React Flow instance's finite `fitView({duration:0})`,
and a busy/ready capture marker until the requested fit settles. It refits on size
changes, not selection or sample changes, and ignores late completion on unmount.
This is client-owned viewport policy, not another graph engine or global clock.
Test node bounds and actual node selection after resize; page overflow alone can
pass while every node is clipped outside the graph's own canvas.

ModelAssets/Scene3D retain their bounded own field domains. A common selection
field works when the views share that semantic universe. For a wider ecosystem,
an explicit source-owned projection can show an unavailable/no-highlight state;
do not coerce an unknown ID into a model part or silently clear global identity.

## Existing experience and replay consumers

`src/framework/stories/react` exports `useStory(resourceId)`: existing `player`,
`state`, `scene`, `story` and `resource`. A story-controls or story-figure block for
that resource must be present on the same page. Declare `stories` for a custom
consumer. `player.pause()` stops that player; `player.seek(index)` applies its
existing view-only cue. There is no custom timeout or second clock.

`src/framework/replay/react` exports `useReplayTime(resourceId)`: existing
controller/spec plus canonical `frame`, `timeSeconds`, selection, channel, speed,
view, playing and `sample(entity,channel?)`. A replay block for that resource must
share the page scope. Declare `replay`. Samples preserve supplied nulls; this API
is not continuous simulation time, wall-clock time or interpolation.

`src/framework/scroll` exports `useScrollSteps(trackRef,stageRef,stops,visit,
restoreEpoch,available)`. It reuses the original native-scroll journey: explicit
start, pause, disable, finite IDs, no wheel interception and no autoplay. Set
available false for reduced motion. Use visit to pause/seek the existing player,
not to create another player. Direct selection calls both guide.pause() and
player.pause(). Restore, hidden document and Escape pause following. No forced
scroll or mandatory sticky layout is introduced by the hook.

## Capture and failure

Asynchronous custom visuals expose `data-capture-state="busy"`, then `ready`, or
`error`; cleanup cancels outstanding work. A capture must not succeed while an
asset is pending or an error is disguised as an empty canvas. Synchronous native
SVG/Canvas can use container readiness as in the example. Fonts/images and target
state are checked by `client:capture`; no arbitrary sleep is a readiness contract.

Imported JSON is still inert. Custom TSX is trusted executable source, not an
untrusted plugin sandbox. Declare only required built-in `customCapabilities`;
`[]` intentionally keeps the example independent of optional renderer engines.

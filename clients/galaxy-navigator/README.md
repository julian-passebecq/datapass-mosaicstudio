# Galaxy Navigator (reference client)

The registry-backed Galaxy navigator named in `docs/FIVE_CLIENT_ACCEPTANCE_HANDOFF.md` ("Galaxy 2D/3D navigator"):
one dated registry snapshot, six projections, one selected node kept across all of them. No SQL, no runs, no AI.

## Views (field `gn-view`, all on the same snapshot and the same selection `gn-focus`)

| View | What it shows | Code |
| --- | --- | --- |
| **3D Galaxy** | Each project group is a plane at its own height; repositories sit on the **commons** lake below (shared repos and contracts, like a OneLake). Apps are natural kind glyphs (VS Code extension, web app, CLI, desktop app, docs, repo). Contracts are bundled pipes coloured by status (beads flow on live ones). Drag or arrow keys orbit, +/- zoom, Home resets, a click or a label button focuses and the camera flies there. Reduced motion: jumps, no beads, tour off. | `Galaxy3D.tsx` (lazy chunk, the only three.js import) |
| **Isometric** | The same layered world as a static, exportable SVG for docs: exactly the framework Motion v2 export (`motionSvg(compileMotion(toMotion(world)),0,'isometric')`) with layer planes (commons with water texture), domains, attached labels and the same glyphs. Export SVG/PNG. | `iso.ts`, `IsoView.tsx` (lazy) |
| **Graph** | The N1 cluster graph (export SVG/PNG). | `GalaxyNavigator.tsx` |
| **List** | Apps and repos by number of links. | `GalaxyNavigator.tsx` |
| **Matrix** | Contracts x apps/repos, `P` provides / `C` consumes / `P·C` both, coloured by status; sortable by contract, status, owner, number of consumers, or "rows of the focused node first". | `Tables.tsx` |
| **Board** | Contracts grouped Live / On a branch / Planned / Retired / Proposed / No consumer; cards of the focused node are marked. | `Tables.tsx` |

`world.ts` is the pure model shared by the 3D view, the isometric SVG, the matrix columns and the tour:
planes (`PLANES` order and heights), kinds (`KIND_RULES`, first match on the registry kind and stack text),
status colours (`STATUS_COLOR`), metrics (`WORLD`), pipe routes (drop at the plane front edge, one lane per pipe
on the commons, rise to the consumer; back-row stations leave through the alley), camera poses and the tour.
All of it is configuration, not hard-coded in renderers.

**Glyphs** (`glyphs.ts`) are registered in the framework glyph registry (`registerMotionGlyphs`). The isometric
exporter projects them; `Galaxy3D` builds solids from the same parts with a closed-box kit, so both views show
the same objects. No LEGO-style scene parts are used (`limits.sceneParts` is not needed).

## Camera tour

A 24 s deterministic tour (`tourKeys`, `tourFrame`: a frame depends only on t). Live: the Tour button. Exact
frames: `?tour=1&paused=1&t=<s>` (`&film=1` fills the viewport). Recording, after a build:

```
FFMPEG=/path/to/ffmpeg node clients/galaxy-navigator/tools/record.mjs   # writes qa/tour/galaxy-tour.mp4 + stills
```

## Data boundary

`registry.generated.ts` is produced by `tools/registry.mjs` from `galaxy.json` and keeps only IDs, names, stacks,
repo slugs, statuses and relations. Local paths, notes, "where" pointers, entry points and free-text descriptions
are dropped; the tool and `tests/galaxy-navigator.test.mjs` fail on drive paths or user folders (the isometric export
is checked too). No credentials, no FOIL-private data, no client payloads. Positions are computed, not geography.

```
node clients/galaxy-navigator/tools/registry.mjs            # default ~/.claude/effort-board/galaxy.json, or $GALAXY_JSON
node clients/galaxy-navigator/tools/registry.mjs --check
```

## Checks

```
npm run client:check -- galaxy-navigator
npm run build:client -- galaxy-navigator
node --experimental-strip-types --test tests/galaxy-navigator.test.mjs
node --experimental-strip-types clients/galaxy-navigator/qa/smoke.mjs --no-build
```

The smoke covers every view on the built client: the first load (Graph) requests no three.js / 3D / isometric
chunk and its JS stays within 160 KiB gzip; choosing 3D adds three.js lazily (budget 190 KiB gzip); selection kept
across views; matrix sorting and cells; board lanes; isometric click and export; 3D label click, focus-fly,
keyboard orbit and tour determinism; reduced motion; no label clipped (graph, isometric, 3D: a 3D label that would
be cut or would overlap is hidden, never clipped); no horizontal overflow at 390 px in any view; no page errors or
external requests. Captures (one per view, 3D in light and dark) go to `qa/captures/`.

## Not delivered

No live registry feed, no deep links into the other apps. Not in the shared client budget matrix; add it there
only with a measured CI baseline.

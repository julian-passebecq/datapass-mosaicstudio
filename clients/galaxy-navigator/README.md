# Galaxy Navigator (reference client)

The first registry-backed Galaxy slice named in `docs/FIVE_CLIENT_ACCEPTANCE_HANDOFF.md` ("Galaxy 2D/3D navigator"):
a small canonical registry subset, list and graph projections, one selected node with its evidence, and the
selection kept across projections. 2D only. Content family, no SQL, no runs, no 3D.

## What the spec says (sources read)

- `docs/FIVE_CLIENT_ACCEPTANCE_HANDOFF.md`: thin slice = registry subset, list/graph projections, one selected
  product, selection retained across projections; needs a *dated canonical registry export with IDs, relations and statuses*.
- `docs/ARCHITECTURE.md`, `AGENTS.md` rule 35: Galaxy means the user's ecosystem; real Galaxy data must come from its canonical registry.
- `docs/CLIENT_READINESS_V0_7.md`: prefer 2D/DAG over imported 3D when it communicates the data more clearly.
- The canonical registry is the App Galaxy map `galaxy.json` kept by Claude Control (apps, contracts, connections, each with a status).

## Model

| Registry | Navigator |
| --- | --- |
| `apps[]` | app nodes (circle), coloured by group |
| contract owners or consumers that are not apps (`datapass-vscode-common`, ...) | repository nodes (square) |
| `contracts[]` owner -> each consumer | directed edge, one per (from, to, contract) |
| `connections[]` | merged into the same edges (adds the transport kind) |
| `status` (live, branch, planned, proposed, no-consumer, retired) | edge dash pattern + filter |

Several contracts between the same two nodes are drawn as one thicker edge; the inspector lists each one.
Self-contracts (an app consuming its own format) are not drawn, they are listed on the app.
Groups (`registry.ts` `GROUPS`) and status labels/dashes are configuration, not hard-coded in the renderer.

## Data boundary

`registry.generated.ts` is produced by `tools/registry.mjs` from `galaxy.json` and keeps only IDs, names, stacks,
repo slugs, statuses and relations. Local paths, notes, "where" pointers, entry points and free-text descriptions
are dropped; the tool and `tests/galaxy-navigator.test.mjs` fail on drive paths or user folders. No credentials,
no FOIL-private data, no client payloads. Positions are a computed cluster layout, not authored geography.

Refresh the snapshot (then review the diff before committing):

```
node clients/galaxy-navigator/tools/registry.mjs            # default ~/.claude/effort-board/galaxy.json, or $GALAXY_JSON
node clients/galaxy-navigator/tools/registry.mjs --check
```

## Features

- Search: literal, case-insensitive over node ids/names/stacks/repos and contract ids/names. Enter focuses the first hit.
- Focus: click, Enter or Space on a node (or a search hit, list row, inspector link). The view frames the node and its
  neighbours on the viz motion clock (instant under reduced motion or `?capture=1`); other nodes dim.
- Projections: Graph and List share one selection field (`gn-focus`); switching keeps it.
- Filter: all statuses, live only, or branch/planned/proposed.
- Static export: the current 2D view as standalone SVG (colours resolved) or PNG (2x). A local download only.

All three fields are view state; nothing recomputes the registry or runs a task. No AI features.

## Checks

```
npm run client:check -- galaxy-navigator
npm run build:client -- galaxy-navigator
node --experimental-strip-types clients/galaxy-navigator/qa/smoke.mjs --no-build
node --experimental-strip-types --test tests/galaxy-navigator.test.mjs
```

The smoke enforces a 160 KiB budget on the sum of individually gzipped emitted JS (same metric as
`scripts/check-client-performance.mjs`), no three.js, no WASM/GLB, no external requests, no page errors,
no horizontal overflow at 390 px, and writes one capture to `qa/galaxy-navigator/galaxy-navigator.png`.

## Not delivered

No live registry feed, no 3D scene, no automatic graph-layout engine, no deep links into the other apps.
This client is not in the shared 18-target budget matrix; add it there only with a measured CI baseline.

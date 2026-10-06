# Studio 2 architecture

## Decision

DataPass MosaicStudio is the web/data-application layer. Datapass Mosaic Workbench remains a VS Code authoring/learning product. In these documents, **Galaxy means the user's ecosystem**, not a newly invented control-plane application.

SQLRooms is a foundation composed through its documented store slices and panel registry. It is not a notebook server. The DataPass layer supplies domain modules, provenance, guardrails, host boundaries, client-oriented composition and reuse of existing explanatory renderers.

```text
DataPass web modules
  Explore / Linked / SQL / Pipeline / Stories / Concepts / Board
                   |
        SQLRooms RoomStore + LayoutComposer
          |              |             |
      DuckDB-WASM   UWData Mosaic   SQL editor
          |              |
      local files    shared selection + queries

Independent narrative embeds
  VizForge StoryPlayer / ConceptMotion semantic scene
  -> ordinary React views, without database initialization
```

## Ownership

| Owner | Owns | Does not own |
|---|---|---|
| SQLRooms database slice | connector lifecycle, table catalog, query transport | DataPass business semantics |
| SQLRooms Mosaic slice | the actual UWData coordinator and selections | another home-grown query engine |
| SQLRooms layout/editor | pane composition, SQL tabs, editor and result controls | a VS Code replacement |
| DataPass slice | selected module/table, provenance, pipeline document, board draft | cloud scheduling, a kernel or credentials |
| Query hook | request lifetime, timeout signal, stale-response rejection | guarantees that every cancellation interrupts physical work immediately |
| Pipeline parser | bounded display graph, source locations, structural diagnostics | faithful simulation or Azure deployment generation |
| VizForge | analytical story semantics and D3 transitions | algorithm trace execution |
| ConceptMotion | semantic explanation scenes and authored algorithm traces | arbitrary code execution or general business charts |

Data modules share one SQLRooms database connection. Charts and table share the same Mosaic selection object; clicking marks is not implemented by duplicating the dataset into an unrelated chart state.

## Composition and safety

The public module registry is `src/core/host.ts`; source components are lazily loaded. Main application state belongs to the single room instance. Source-level module extraction is deliberately ahead of package publication: this is not yet a drop-in npm SDK.

UI selection and drawing remain in the browser. Any future authoritative Python model must use a separate, explicit task port with versioned inputs, cancellation and stale-result handling. Imported source strings may be shown but cannot register a task.

The native pipeline document carries source classification. ADF/Fabric import retains `dependsOn`, nested container links and JSON source paths. Container semantics, activity availability and dynamic expressions remain source-owned; a visually acyclic graph is not evidence of an executable or valid Azure pipeline.

The initial data explorer materializes local CSV/JSON/Parquet into memory. Parquet metadata comes from DuckDB functions on the registered file. It is intentionally narrower than Data X-ray's mature metadata engine and native adapters.

## Portability

Narrative `embed=1` routes bypass the database host. Larger data apps can use the same build on an HTTP static host. This is not file:// packaging: module loading, workers and WASM require an appropriate origin and headers.

Next.js needs a client-only dynamic boundary for the browser store. Electron needs an isolated preload API. VS Code needs `asWebviewUri`, host-mediated file access, CSP/nonces and a message protocol; packaging a website in a VSIX is not sufficient. No native adapter is implemented in this pass.

## Build trade-offs

A generated Fluent icon bridge re-exports only required names through official public per-icon entrypoints. It never substitutes icon stubs. The complete installed SQL parser is prebundled as a same-origin ESM asset to avoid Rollup reparsing its large generated CommonJS graph. All dialects and the public Parser/util exports are preserved.

This remains a substantial analytical application. The WASM payload and shared SQLRooms application chunks are not comparable to a tiny marketing website. Pure narrative embeds intentionally avoid initializing the database; future size work should follow measured real-client needs.

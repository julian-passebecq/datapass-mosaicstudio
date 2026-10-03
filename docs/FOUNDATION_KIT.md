# Foundation kit: results, observed runs, context and navigation

The v0.6 foundation extends the source SDK. It does not replace React/D3/Three/SQLRooms, add a second task scheduler or convert Studio into an IDE.

## Result and run semantics

`Artifact` owns one bounded typed payload (table or text), provenance and a set of representations. Table/chart/metric/text/JSON views reuse existing blocks. Payloads are immutable. `ViewProfile` chooses presentation, not authorization; unused views still share the same result bytes. Limits are 1 MiB/payload, existing 10,000-row/40-column data limits, and twelve representations.

`RunSpec` describes an observation profile for an existing task: declared model/version, provider label, provenance and expected representations. `RunJournal` observes actual SiteRuntime events. No extra executor, remote integration or durable store is created. Exact task inputs are captured, not all view fields. Runtime-local dataset revisions are not source hashes or cloud lineage. Scheduling/cancel/stale-result rules remain owned by SiteRuntime.

Run observers are synchronous and read-only. Mutating the runtime inside a run notification is rejected and counted as an observer error; an observer failure cannot turn a valid task into a failure. Defer intentional actions until after notification. Do not assume that an observer can stop an arbitrary CPU-bound task: cancellation remains cooperative.

App-level journals persist across page switches, but not reload/close. History is bounded and opt-in. A detached running record becomes unobserved, because its terminal outcome was not seen. A successful task whose output exceeds the journal budget remains successful with omitted output; it does not become a fabricated empty artifact. Saved UI input files remain separate from deliberate run/artifact exports.

## Generic context inspection

`ContextModel` supplies bounded scalar facts, exact SourceArtifact line references, related IDs and a provenance note. `ContextInspector` is a view of this model, not an agent, metadata authority or second selection store. Artifact/run adapters are provided; a client can supply graph/project/domain context. Source actions are trusted callbacks, never imported executable strings.

## Shared semantic navigation

`NavigationSpec` declares stable entities, typed relations with provenance text, facets, projections and depth levels. `navigationFields` stores these choices in existing view fields. Projection changes preserve selection. A facet may hide the selected object without deleting its identity. Detail depth requires a selected entity.

Register `bindings.validateViewState` with `readNavigation` to enforce combined state on defaults, patches and reviewed restoration. The trusted callback is source-only, not imported JSON. `navigationPatch` makes coherent changes atomic. `navigationQuery` and its parser transport only bounded context IDs; credentials, input data and source bodies do not belong in links.

This is not a new graph-layout or 3D engine. The foundation reference uses authored SVG positions to prove projection changes, not a canonical Galaxy inventory. Real Galaxy data must come from its registry; external tools have explicit external ownership. The first projection is not evidence of a dependency. Actual camera choreography and richer Galaxy layouts remain separate consumers.

## Optional static knowledge

`KnowledgeProvider` is a read/search/context boundary; the delivered implementation is `StaticKnowledgeProvider` over approved SourceArtifact text. Search is literal lexical matching with exact line references, NOT vector search. Summaries are authored input, never invented automatically. Abort signals are supported at the bounded provider boundary.

Context modes are full, summary, exact excerpts and excluded. The prepared JSON payload has an exact UTF-8 byte size with omission metadata. Content is not silently truncated to fit. Summary text is explicitly a summary and is not mislabeled as a verbatim source range. SourceReader displays approved excerpts without executing them.

No ingestion, embeddings, LLM calls, Git access, Open Notebook service, or secret handling is included. Context exclusion does not restrict access to files already included in a public client bundle. A future service provider must independently implement authentication, privacy and server-side limits.

## Clients, not a universal super-app

The common framework must support Galaxy, Foil'o engineering, a compact portfolio, D3 Lab and a separate product-teardown client. The compact portfolio need not use this workspace, a journal, SQLRooms or 3D. Foil'o requires approved geometry/data/calculations; a synthetic scaling example is not a real engineering model.

Neither the complete general Scenario Engine nor the full GLTF/part/section pipeline is claimed by these foundations. A run is an execution observation; a replay is supplied samples; a story is authored narrative; motion is presentation interpolation. Keep these distinct.

## Verification and changes

Use `client:context`, `client:check`, `build:client` and actual production browser tests. Existing source SDK clients remain regression targets. Record completed test outcomes and inspect actual screenshots before marking this pass qualified. No merge, deployment, source-code execution from imported documents or toolchain rewrite is authorized by this kit.

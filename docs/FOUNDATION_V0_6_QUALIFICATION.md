# Foundation / publication v0.6: qualification record

## Saved source and preservation

Repository: `julian-passebecq/datapass-mosaicstudio`.
Branch: `feat/studio2-foundation-runs-context`; draft PR #7 targets `feat/studio2-motion-evidence`.
Base: qualified v0.5 `2d5ad4f6b5c1fbab72d50d49888b90ee71ff9e24`, tree `9114310c2dd5e5cf496fb1c7595c48a4fee25c25`.

Final qualified implementation: **`c2cf38df05980daa9f99062438fa747b8f26caf1`**.
Exact implementation tree: **`1fcf63f02bee76065bcf3f1255fd2c3fdbfccbbe`**.

The final handoff commit adds documentation only. No merge, deployment, npm publication, Rust rewrite, donor-repository edit or dependency upgrade occurred.

Readable milestone source commits were saved during development. The first complete foundation implementation `8e71f1be415d452c4083d36b59cb11410d77a41d` passed workflow `37096160500`: 342 unit/boundary/controller tests, 64 production browser scenarios and all fourteen independent clients. Commit `87a79ef5c9ff86232ab7822f564c1772d6f5dcb8` recorded the generated schemas and package-root version metadata after that full gate. No dependency versions, integrity values or donor pins changed.

A second implementation added static publication metadata and fixed the context-export serialization so the actual downloaded file has the declared budgeted byte count. The final gate below includes these changes and enforces the committed frozen lock and schema drift checks.

## Completed final qualification

[Workflow 37096963210](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/37096963210), job `111128743994`, completed successfully on the final implementation.

| Check | Observed result |
| --- | --- |
| Frozen npm installation without peer bypasses | Passed |
| Committed generated-schema drift check | Passed |
| Unit, boundary, model and original-player tests | **348 passed**, 0 failed/cancelled/skipped |
| Strict TypeScript and integrated production build | Passed |
| Seven reference client definitions and pinned visual-engine contracts | Passed |
| Real production HTTP browser scenarios | **65 passed**, 0 unexpected/flaky/skipped |
| Independent selected-client build/browser targets | **14 passed** |
| Framework source digest before/after fresh generation/build | Unchanged |

The seven reference clients are operations, wind, architecture, experience, energy replay, motion and foundation. Seven more were freshly generated: custom content, knowledge, spatial, analytics, replay, motion and analytics with the foundation extension. The small clients contain no undeclared Three.js, unrelated client content or implicit SQLRooms/DuckDB workbench initialization. Foundation targets use only charts and runs.

Browser: **Google Chrome 154.0.8037.57**, hosted Linux. Existing 3D regressions use software WebGL2. This is not Safari/Firefox certification, physical-device GPU benchmarking, accessibility certification or a frame-rate promise. The completed hosted workflow is the authority for full integration. Upstream annotation/shared-chunk warnings remain; they were not presented as fixed.

## Actual delivered behavior

### Immutable results, existing renderers

Artifact owns one bounded table or text payload, provenance and table/chart/metric/text/JSON representations. The existing block/rendering contracts are reused; no second chart engine was built. Representation changes do not execute a task. ViewProfile selects representations without changing the payload and is explicitly not an access-control/redaction feature.

### Observed runs, not another executor

SiteRuntime still owns task scheduling, dependency invalidation, cancellation and timeout. The optional journal observes immutable lifecycle notifications. Synchronous observer mutations are rejected and errors counted without corrupting a valid task. Captured parameters are exact task inputs, not every camera/selection field.

RunRecord distinguishes success, failure, cancellation, supersession, timeout and unobserved completion. Retention/eviction is explicit. A successful task can have an output omitted by budget without being mislabeled as a failed computation. Previous successful results are never silently attached to a failed/new run. Model/provider labels are client declarations; local upstream revisions are cache versions, not content hashes or external execution receipts.

The opt-in app-level history and pinned run selection survive page changes, but **not reload/close**. Defaults are twenty records and 4 MiB. Exports include captured parameters and result rows and require deliberate review; saved UI input files remain separate. Compatible comparison checks declared app/task/model/provider versions and exact metric selectors/schema/units. Null observations are not zero and no unit conversion is invented.

### Semantic context and navigation

ContextInspector is shared across bounded facts, evidence references and related semantic identities. NavigationSpec stores selection/facet/projection/depth in existing view fields, with trusted source-only joint validation for defaults, patches and restored values. Projection changes preserve identity; a facet can hide the selected entity without erasing it. View URLs carry IDs only.

The navigation reference is a five-node synthetic fixture with authored SVG positions. It is not the real Galaxy registry, a new automatic graph-layout engine or completed 3D semantic-zoom choreography. External ownership is explicit. Production Galaxy data must still be mapped from its canonical registry.

### Approved static knowledge

StaticKnowledgeProvider supports literal lexical search, exact line excerpts, supplied summaries and full/summary/excerpt/excluded context. The prepared payload is measured as actual compact UTF-8 JSON, including citation/omission metadata. Whole entries are omitted when they exceed the budget; a cited excerpt is not silently cut. The browser regression checks the actual downloaded bytes against the declared count.

This does not add ingestion, vector search, embeddings, Open Notebook, Git browsing or automatic AI calls. An authored summary is not represented as a verbatim citation. Excluding a source from a context bundle does not secure source files already bundled in a public site.

### Static publication metadata

An optional source-owned publication.json configures build-time title/description/social metadata, language, canonical address and approved local image. Default output is preview/noindex. Public mode requires explicit HTTPS canonical metadata; credentials, query/fragment and unsafe image paths are refused. Optional image assets must exist within the selected client's public folder and fit the budget; symlinks are rejected.

The independent target suite checks the actual initial HTML, canonical metadata, robots.txt and studio-publication.json. The acceptance-fresh public example uses a TEST domain, not a deployed client site. Robots metadata is not privacy/authentication. This is not domain ownership verification, translation, page prerendering or deployment.

## Visual and functional review

Actual captures were inspected for result charts, captured-run comparison, semantic navigation, source context and mobile result layout. They are browser screenshots of the implementation, not generated mockups. The reference result calculates an illustrative scaling rule with relative units, not Foil'o measurements or physics. The compact portfolio is not forced to inherit the workbench UI.

Browser coverage exercises multiple views of one result without rerunning, old-run retention/pinning, page-switch continuity, failed/cancelled result isolation, explicit run versus UI-state exports, coherent navigation links/restoration, exact source highlights, initially excluded context, summary handling, actual export byte size and mobile overflow. All previous v0.5 tests remain in the suite.

## Final evidence and source equality

[Workflow artifact](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/37096963210/artifacts/11264454190)

- Artifact name: studio-web-evidence; ID `11264454190`.
- ZIP size: **32,548,222 bytes**.
- SHA256: `8274cf3a4c766d0c2d7857e7bc1fd170b877eba061e9b3b4e7dc7a2085e285a8`.
- Created: `2026-10-03T04:42:13Z`; retention expires `2026-10-06T04:42:11Z`.
- Includes source, integrated workbench, fourteen independent client builds, diagnostics, screenshots and client-build results.

The downloaded ZIP checksum matched the connector digest during qualification. **All 276 tracked implementation files** matched the source archive by Git blob identity, with zero mismatches. The final handoff commit adds documentation only. Committed source remains after workflow artifacts expire.

## Measured independent outputs

These are sums of separately gzip-compressed emitted JavaScript files, not first-load transfer, memory, load speed or frame rate. Total size includes the other selected output files.

| Selected client | JavaScript gzip bytes | Total output bytes | Files |
| --- | ---: | ---: | ---: |
| operations-reference | 163434 | 540535 | 10 |
| wind-reference | 299130 | 1068528 | 13 |
| architecture-reference | 178254 | 611010 | 12 |
| experience-reference | 410524 | 1466256 | 25 |
| energy-replay-reference | 300945 | 1079347 | 17 |
| motion-reference | 142713 | 493468 | 12 |
| foundation-reference | 178495 | 596123 | 15 |
| acceptance-fresh | 97773 | 332945 | 9 |
| acceptance-knowledge | 164243 | 567512 | 13 |
| acceptance-spatial | 294952 | 1082324 | 15 |
| acceptance-analytics | 162428 | 537672 | 10 |
| acceptance-replay | 168781 | 561083 | 15 |
| acceptance-motion | 140540 | 485895 | 12 |
| acceptance-foundation | 170505 | 568718 | 13 |

## Remaining scope and release interpretation

This is a qualified **v0.6 alpha source SDK**, not a general v1 or five finished websites. The next client work should use the existing APIs and report concrete missing generic behavior rather than fork core engines.

Still not delivered: a full GLTF/GLB ModelAsset/PartBinding pipeline, richer section/annotation modes, general Scenario Engine, SemanticOverlay renderer, persistent cloud history, verified environment reproduction, notebook execution, DuckLake persistence, remote X-ray or PDF/PPTX/video exports. The model-asset gap remains particularly relevant to the separate Foil'o product teardown. Canonical Galaxy content and final spatial design remain client work. Compact portfolio delivery does not need to wait for all specialist 3D/data features.

Read docs/CLIENT_READINESS_V0_6.md for the five-client map. No percentage estimate substitutes for their actual acceptance. Scientific models/data/assets and deployment approvals remain client-owned.

## Next author

```sh
npm ci
npm run bootstrap
npm run client:new -- experiment --family analytics --foundation
npm run client:context -- experiment
npm run dev
# Open the printed address with ?app=experiment
npm run client:check -- experiment
npm run build:client -- experiment
```

For a compact public portfolio choose content and docs/recipes/public-site.md instead. The foundation workbench is optional, not a new mandatory app family.

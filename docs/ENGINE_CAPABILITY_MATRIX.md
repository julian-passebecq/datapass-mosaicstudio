# Engine consolidation: evidence-led capability matrix

Baseline: a6c42abaf111cd317d06501211f70bcc116875f8. This audit precedes implementation.
The current request is engine consolidation, not delivery of the five real clients.
Historical qualification remains attached to that exact SHA until this increment is tested.

| Area | Baseline assessment | Decision / smallest useful action |
| --- | --- | --- |
| Source authoring | READY | Keep defineApp, inert manifests, source-only bindings and the five families. |
| Local prototype startup | GENERIC GAP | Add selected-client Vite command, loopback URL, process lifecycle and versioned JSON status. No daemon or IDE protocol. |
| Focused context | PARTIAL | Add actual file list, public lightweight API entries and dev/capture/test route. |
| Hybrid scaffolds | PARTIAL | Source composition works; --custom is artificially restricted to basic. Allow additive custom components in existing family scaffolds. |
| Semantic selection | READY / ERGONOMIC GAP | SiteRuntime already owns view fields across projections. Add a small validated binding hook, not another selection store. |
| Inspector / evidence | READY | Reuse ContextInspector, SourceReader and exact source ranges. No new domain-aware inspector. |
| Artifact / representations | READY | Preserve immutable outputs, independent view state and explicit task execution. Add cross-view regression coverage. |
| Experience / motion | READY / ERGONOMIC GAP | Original StoryPlayer and view-only cues already cross renderer boundaries. Expose its existing controller to custom components; never add a scheduler. |
| Sampled replay | READY / ERGONOMIC GAP | Expose current sample/time from the existing ReplayScope. Preserve nulls and the bounded timestamp-driven scheduler. |
| Scroll story | PARTIAL | Native opt-in journey works but lives under explorer. Reuse it through a lightweight generic entry, preserving old imports. |
| Custom SVG / Canvas / D3 | PARTIAL | Existing trusted custom block is adequate. Add ResizeObserver lifecycle + shared selection ergonomics and a client-owned example. |
| Graph / React Flow | READY | Bind controlled nodes/edges to existing semantic fields and Story/replay state. No graph autoplay or layout engine. |
| Spatial / ModelAssets | READY, BOUNDED | Preserve shared viewport, lazy approved GLB, stable PartBinding, picking, disposal and accessible outline. Fix stale spatial recipe. |
| Capture | GENERIC GAP | Selected production build + reviewed saved state + fixed viewport + reduced motion + readiness + screenshot/metadata/hash. No video clock. |
| Layout / responsive | READY, BOUNDED | Reuse WorkspaceShell/pages/sections. Test new custom path at 320px and keyboard; no docking/CMS system. |
| Error / lifecycle | READY / TEST | Keep validation before state mutation and task cancellation. Exercise custom resize/unmount and dev invalid-source recovery. |
| Publication / trust | READY | Preserve noindex, approved metadata, source export opt-in and no deploy. Dev is trusted-local tooling, not an access-control boundary. |
| Payload | READY / OBSERVE | Keep all 16 exact emitted-JS gzip budgets. Observe selected initial requests separately, never call gzip budget Web Vitals or FPS. |
| Accessibility | PARTIAL | Existing keyboard/manual/reduced-motion defaults and browser tests; add new-path coverage. No screen-reader/device/WCAG certification claimed. |
| High-density 3D / large animated GLTF / GIS | ADVANCED / DEFER | Optional specialized renderer/asset adapter behind semantic view state. Do not raise existing limits. |
| High-frequency / massive telemetry | ADVANCED / DEFER | Separate producer + chunking/decimation adapter; do not turn the 200-sample replay into a streaming platform. |
| Domain sources and final five clients | CLIENT-SPECIFIC | Future Wind, Fabric, D3 Lab, Portfolio and Agent Factory experiments supply their own data/assets/rules. |

## Hypotheses resolved

A scaffolding: partial; B custom host: ergonomic gap; C semantic 2D: existing custom
path plus common bindings, not a new diagram engine; D scroll: reusable existing
mechanism; E replay: existing controller, expose consumer API; F graph integration:
controlled React Flow props, documentation/example not another adapter runtime;
G overview/detail: existing navigation + lazy optional views; H capture: missing
end-to-end command; I host output: missing; J custom lifecycle: small shared hook;
K layout: existing WorkspaceShell sufficient for this pass.

## Future five-prototype readiness question

Wind exercises same IDs in plan/part/inspector and view-only changes; Fabric tests
existing overview/detail/camera/modes; D3 Lab tests trusted custom geometry and
original player; Portfolio tests light source-only content and generic scroll;
Agent Factory tests controlled graph plus observed/supplied replay state. Synthetic
reference checks prove these contracts, not real geometry, execution or clients.

Final readiness and tests belong in ENGINE_QUALIFICATION.md. This matrix is an audit
and work-selection record, not a statement that planned changes already passed.

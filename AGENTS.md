# DataPass MosaicStudio agent rules

Start small: read `docs/recipes/START.md`, choose `client:families`, then run `client:context -- <id>`. Read only the generated capability-specific route unless a requirement exposes a gap. Families are guidance, not restrictions. Do not open Three.js or the donor trees just to author a normal client.

1. This repository is a web-first framework/application, not a VS Code clone or notebook IDE.
2. Preserve the upstream visual engines. `.upstream/` is ignored, immutable and commit-pinned. Do not edit those directories or copy their application shells into the framework.
3. Existing visual stories use VizForge; semantic explanations use ConceptMotion. D3/React Flow/Three are rendering libraries, not a reason to create duplicate story clocks.
4. SQLRooms and UWData Mosaic own the current data-workbench concerns. The small website runtime is not a new SQL engine or a replacement Mosaic query coordinator.
5. Keep source SDK types/validators/runtime under `src/framework/`; client data, model logic, pages and visual resources belong under `clients/<id>/`.
6. Client generation must not overwrite existing folders. Selected-client builds must not include other client source/public data or workbench WASM by default.
7. Imported documents stay inert. No eval, Function constructor, shell, Python or executable SQL snippets in imported UI manifests. Trusted source bindings are a separate boundary.
8. Validate field values and complete saved-state snapshots before changing state. A bad import must leave the current application unchanged.
9. Model inputs and view state are distinct. Camera, selection and playback updates must not rerun unrelated model calculations or server tasks.
10. Tasks are explicit, bounded and cancellable. Ignore stale/superseded results. A progress animation is not proof of computation.
11. No dataset bytes, task results, source functions or secrets in saved UI state. User input values may still be sensitive; disclose this before export.
12. Reference data and geometry must be labelled synthetic. No invented client evidence, model accuracy, scientific validation, runtime execution or production status.
13. Responsive layout and reduced-motion/manual controls are release requirements. Inspect actual rendered screenshots; do not approve only source-level tests or generated mockups.
14. Run unit tests, TypeScript, source/client contracts, production build and actual browser checks. Configured CI is not completed CI. Report actual counts and failures.
15. Public website builds are not access control. Client data, documentation and public assets must be approved before publication.
16. No automatic merge, deployment, package publication or branch replacement without explicit authorization. Work on an isolated branch and preserve prior checkpoints.
17. Public reference clients are `wind-reference`, `operations-reference`, `architecture-reference`, `experience-reference`, `energy-replay-reference`, `motion-reference`, `foundation-reference`, and `model-reference`. The default production workbench must not include arbitrary new clients.
18. Read `docs/recipes/START.md` and the client-focused generated guide first. Use the longer AI/experience guides only for the capabilities actually needed.
19. An explorer has one selected identity across Spatial, Map and Library. Context facets, camera targets and an explicit open-project action must remain separate concepts; do not duplicate content or selection state per renderer.
20. Native scroll tours are optional. Do not intercept wheel input or remove accessible direct controls. Pause tour following for direct interaction, restored state, hidden pages and reduced motion.
21. Explorer state must be jointly validated and updated atomically through the helpers. Individual valid field values can still form an invalid combined context.
22. A real client may justify a generic framework extension. Isolate it, document it and prove it with a concrete consumer plus regressions. Keep arbitrary client-specific features in client-owned TSX rather than mutating the shared framework for every page.

23. The engineering replay consumes supplied samples. Reuse the existing player scheduler; never invent observations, silently fill missing data, add an unrelated autoplay timer or treat illustrative geometry as a validated Foil'o model.
24. Custom components should declare minimum `customCapabilities`; undeclared legacy components retain all renderers. This is a build contract, not a security sandbox.
25. Selected-client build evidence must confirm optional 3D is absent where unneeded and only requested after a visitor chooses it when the default is 2D. Keep family metadata out of business/model logic.

26. Authored motion is an optional SVG/D3 capability. Isometric projection must not force Three.js or a data-workbench dependency. Keep source-owned narrative and semantic IDs separate from renderer state.
27. Reuse the original VizForge player for progression. D3 transitions are finite visual interpolation, not another autoplay or simulation clock. Seek/reverse/restore select deterministic targets; never reexecute domain actions.
28. SourceArtifact text and exact evidence references are public, inert excerpts. Do not treat an authored state or code reference as proof of execution, authorization or client correctness.
29. WorkspaceShell, SourceReader and MotionViewport are separately reusable source components. Do not force the whole workbench or motion application shell onto every client.


30. Artifact views reuse existing renderers; changing a representation or inspector must not run domain calculations. ViewProfile is presentation filtering, not an access-control or redaction boundary.
31. RunJournal observes SiteRuntime; it must never become a second scheduler. Synchronous task-run observers are read-only and failures must not corrupt task results. History is bounded and in-memory unless a client explicitly supplies approved storage.
32. Capture exact declared inputs and distinguish observed outcomes from declared model/provider metadata. Local dependency revisions are not content hashes or verified cloud lineage. An unobserved terminal outcome is not a cancellation or success.
33. Run/artifact exports include potentially sensitive result data. They are separate from saved UI values and require deliberate sharing review. Never silently retain old results under a failed/new run.
34. Static knowledge is literal search over approved excerpts, not automatic RAG. Authored summaries and exact excerpts must remain distinct. Check the actual serialized context byte size, not a differently formatted preview.
35. Semantic navigation uses existing view fields with source-only joint validation. Projection/facet changes preserve identity; hidden selection is not erased. Real Galaxy data must come from its canonical registry.
36. Publication metadata defaults to preview/noindex. Public mode requires an explicit canonical URL and approved source-owned assets. Robots directives are not authentication, and metadata generation is not deployment or full SSR.
37. The compact portfolio does not require spatial navigation, a journal, SQLRooms or 3D. Foil'o geometry/physics cannot be inferred from a conventional turbine reference. The five clients are pressure tests, not five products completed by a framework pass.

38. Imported model geometry uses the bounded static GLB profile only. Verify exact bytes and semantic node ownership before the pinned GLTFLoader decodes them. Do not weaken the profile to make an arbitrary asset load.
39. A model part ID is a semantic contract tied to the approved hashed file, not a node name guess. Every rendered mesh has one non-overlapping semantic owner. Asset integrity is not license, scientific or engineering validation.
40. Model selection, camera, exploded amount, wireframe/isolate/cutaway and annotations are view state. They must not rerun domain calculations. Reuse the shared Three viewport and original StoryPlayer rather than creating a model-specific render/playback loop.
41. `model3d` is optional. Do not add it, Three.js or GLTFLoader to a compact portfolio or ordinary analytical client without an actual spatial requirement. Unsupported textures, codecs, animations or CAD behavior require a separate measured extension.

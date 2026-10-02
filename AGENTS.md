# DataPass MosaicStudio agent rules

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
17. Public reference clients are `wind-reference`, `operations-reference`, `architecture-reference`, and `experience-reference`. The default production workbench must not include arbitrary new clients.
18. Read `docs/AI_SITE_AUTHORING.md`, `docs/contracts/components.json`, `docs/AI_CLIENT_BRIEF.md` and `docs/EXPERIENCE_KIT.md` before building a new client.
19. An explorer has one selected identity across Spatial, Map and Library. Context facets, camera targets and an explicit open-project action must remain separate concepts; do not duplicate content or selection state per renderer.
20. Native scroll tours are optional. Do not intercept wheel input or remove accessible direct controls. Pause tour following for direct interaction, restored state, hidden pages and reduced motion.
21. Explorer state must be jointly validated and updated atomically through the helpers. Individual valid field values can still form an invalid combined context.
22. A real client may justify a generic framework extension. Isolate it, document it and prove it with a concrete consumer plus regressions. Keep arbitrary client-specific features in client-owned TSX rather than mutating the shared framework for every page.

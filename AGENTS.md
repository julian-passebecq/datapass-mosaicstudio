# MosaicStudio continuation rules

Read README and docs/ARCHITECTURE.md before changing code.

1. Keep this work on a feature branch. Never force-push, automatically merge, or replace the existing Studio, Mosaic, Factory, Hop, X-ray or VS Code repositories.
2. SQLRooms owns database/editor/layout coordination. UWData Mosaic owns cross-filter query coordination. Do not recreate those engines under DataPass names.
3. Reuse the pinned VizForge and ConceptMotion renderers. Their semantic contracts differ; do not merge them into a second generic chart engine.
4. Keep imported JSON inert and bounded. The pipeline canvas displays definitions, not execution status. Do not silently translate imported activity source into executable code.
5. Distinguish real browser SQL, synthetic data, static imported definitions, simulated systems and measured results. Never label fixture data as client evidence.
6. No private source bundles, client documents, tokens, machine paths or reference geometry enter this public repository. A public donor is not permission to import its historical/private overlays into the build.
7. Use browser-only host capabilities honestly. DuckLake, native Python, filesystem access, Electron and VSIX need explicit adapters and separate qualification.
8. Preserve cancellation/stale-result guards, quoted identifiers, import size limits, source immutability and CSV formula neutralization.
9. Run npm test, the strict typecheck, production build and real browser suite. Preserve failing evidence. Do not hide console errors or claim a workflow passed before checking the run.
10. Keep CI bounded and avoid duplicate or scheduled expensive jobs. No deployment, extra infrastructure or hosted compute without user authorization.
11. The Git-based donor cache records a source pin; the marker alone is not a security audit of subsequent local edits. Review pin changes deliberately.
12. Core runtime source modules are not published npm packages yet. Promote shared libraries only after a second real consumer proves the boundary.

## Source website SDK

13. Read docs/AI_SITE_AUTHORING.md and docs/FRAMEWORK_KIT.md for client websites. Client content/calculations/assets live under clients/<id>; do not change src/framework to create an ordinary client.
14. The workbench build allowlists three public reference clients. Use build:client for a selected site. Never auto-add private client folders to the review registry or copy the workbench public directory into client builds.
15. Dataset layers are metadata, not a lakehouse. Small client bindings are not another SQL/Mosaic engine. Imported state is inert; only repository-owned source can register custom components/tasks.
16. Keep one original VizForge story controller for coordinated views. Three renderer interpolation is not a second story timer. Pause on restore/reset/hidden/unmount/reduced motion.
17. Validate task output rows; invalidate downstream task results and reject late/superseded responses. No reference result is client or scientific evidence.
18. Run contracts:check, client:check, original visual-contract checks, both browser gates and selected-client build isolation before describing this as qualified. Do not substitute generated JSON Schemas for runtime semantic validation.

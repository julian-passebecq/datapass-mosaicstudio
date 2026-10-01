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

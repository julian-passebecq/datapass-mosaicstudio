# Model asset pass: saved working handoff

Base: a01d312058d39fe5147ae017e4b0916ff96865bf; implementation c2cf38df05980daa9f99062438fa747b8f26caf1. Branch: feat/studio2-model-assets. Previous branches remain unchanged. No merge or deployment.

Scope: a bounded optional GLB model capability, semantic part bindings, assembled/exploded/wireframe/isolate/visual-cutaway modes, authored camera targets, part annotations and existing ContextInspector/SourceReader. Reuse the shared Three.js viewport and original story controls; do not create another render loop, scheduler or game engine.

First supported asset profile: self-contained static GLB 2.0 geometry with untextured PBR materials, explicit same-origin source, byte/geometry budgets and SHA-256 identity. Reject external resources, extensions/decoders, animation/skin/morph data and ambiguous bindings rather than silently loading unsupported content. This is not a universal glTF/CAD importer or a scientific model. Richer profiles require separate tested adapters.

Acceptance: a synthetic non-conventional oscillating-plate assembly, explicit opt-in 3D, useful outline/source fallback, stable semantic identity, no calculation on camera/mode changes, abort/retry/cleanup behavior, existing regression clients and capability isolation. A compact portfolio must remain free of unnecessary 3D/SQL code.

The mounted v0.6 workflow archive was verified by SHA-256 and reconstructed exactly as Git tree 1fcf63f02bee76065bcf3f1255fd2c3fdbfccbbe. Local network/dependency installation is unavailable; pure tests run locally and the full ordinary repository workflow must establish TypeScript/build/browser acceptance. Do not label a pending gate successful.

Save readable source checkpoints and retain final qualification evidence. Proposed features in prior conversations are not implementation proof. The generic Foil'o fixture is not actual Foil'o geometry, measurements or a conventional turbine assumption.

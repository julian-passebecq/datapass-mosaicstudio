# Spatial family (optional)

Use `--family spatial` only when a spatial representation helps. A client owns `content.ts` and `scene.ts`; the framework owns camera, picking, demand rendering, resource cleanup and fallback behavior.

Stay at `SceneSpec`, camera and entity IDs initially. You do not need to read Three.js or replace the renderer. This SceneSpec profile uses bounded primitives (128 parts, 64 entities, 12 cameras), not imported CAD/GLTF. Do not describe it as an engineering model.

A client whose assembly genuinely needs more parts can raise its own limit in trusted source: `defineApp({..., limits: {sceneParts: 256}})` in `clients/<id>/app.ts`. The default stays 128; the hard ceiling is 512 (`SCENE_PART_CEILING`) because every part is a separate mesh and draw call and the hierarchy check grows with parts x depth. Prefer grouping or a `model3d` GLB before going near the ceiling. The published `scene3d.schema.json` describes the default profile; the runtime validator is authoritative for opted-in clients.

An explorer's facet can choose a camera; a separate action opens a project. The optional native scroll tour visits authored stops, pauses for direct interaction and keeps manual/reduced-motion alternatives. It is not a continuously scrubbed film.

For an advanced custom scene, import `SceneViewport` explicitly from its module rather than the legacy broad React barrel. Declare `spatial` in that component's `customCapabilities`. Optional additive `offsets` are bounded position/rotation deltas, not executable expressions.

Approved static models use the existing optional ModelAssets adapter below; they do not require another renderer. New asset profiles need separate validation rather than a mandatory loader for all families.

## Approved static model assets

The primitive Scene3D profile above is distinct from the later optional ModelAssets
profile. Approved bounded static GLB is supported through `models`; see
docs/recipes/models.md. Do not route arbitrary GLTF or larger animated CAD through
the primitive scene schema, and do not change the qualified asset limits.

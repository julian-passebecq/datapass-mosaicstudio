# Static model reference

Original synthetic plate assembly demonstrates approved GLB loading, semantic group/mesh ownership, view modes, camera presets, annotations and source context. It is not the actual Foil'o mechanism, a conventional turbine, measured performance or a physics model.

The fixture is generated deterministically by `scripts/templates/model.mjs`. `model:inspect` reports its byte identity and nodes. This reference adds the existing StoryPlayer controls; the fresh `--family spatial --model` template stays smaller and does not require a story.

The outline is the default. 3D loads explicitly. The shared viewport, ContextInspector and SourceReader are reused rather than duplicated.

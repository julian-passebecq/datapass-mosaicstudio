# DataPass MosaicStudio

**v0.4 alpha source SDK for AI-built technical websites.** Start with the smallest useful application family and let actual blocks determine the optional capabilities. Client content, domain logic and assets stay under `clients/<id>/`; reusable contracts and rendering stay under `src/framework/`.

Current branch: `feat/studio2-families-replay`, draft PR #5. This extends v0.3 without replacing the workbench or changing the pinned visual-engine repositories. No merge, deployment or npm package publication is implied.

## Read the minimum needed

Read `docs/recipes/START.md`, choose a family, and generate a client-specific context. Do not open all the 3D or SQL libraries to author an ordinary site.

```sh
npm ci
npm run bootstrap
npm run client:families
npm run client:new -- my-project --family analytics --title "Client project"
npm run client:context -- my-project
npm run dev
# Open the printed address with ?app=my-project
npm run client:check -- my-project
npm run build:client -- my-project
```

`client:context` writes `.generated/client-context/my-project/GUIDE.md` and `plan.json`. The guide lists only the used block contracts, required capabilities and relevant recipes. It is not a constraint on future requirements.

| Family | Starting composition | Default optional engines |
| --- | --- | --- |
| content | Pages, text, indicators, optional custom React | None |
| knowledge | Outline, search, documents and context | Explorer / 2D map |
| analytics | Validated filter, chart and table | VizForge / D3 |
| spatial | Authored system with optional 3D representation | Explorer / shared Three.js viewport |
| replay | Supplied time samples, plan, measurements and events | VizForge player/chart; no 3D by default |

Mix families by adding blocks. The preferred family in `client.config.json` never overrides the actual build plan or locks the appearance. An advanced client can combine all five.

## Optional really means optional

A selected build derives capabilities from used blocks/resources and emits `studio-build.json`. It checks the actual module graph for undeclared Three.js and accidental SQLRooms/DuckDB workbench imports. A pure data, document or 2D replay client must not carry the 3D renderer.

Client-owned custom React components can declare `customCapabilities`. An explicit empty list creates a lightweight extension. Older undeclared custom bindings conservatively retain every renderer and produce a warning rather than silently breaking.

The repository still installs its pinned development dependency set. This is source/context and production-bundle isolation, not yet separately published minimal npm packages or a sandbox for arbitrary trusted source.

## Engineering replay

The new `replay` block coordinates a 2D installation plan, selected signal, current measurements, chart cursor, annotated events and optional 3D through one supplied sample index. It reuses the original VizForge StoryPlayer and its injectable scheduler. No duplicate chart timer or physics engine was created.

Playback honors irregular elapsed timestamps and speed, supports manual seeking, and pauses for restore, hidden/offscreen views and unmount. Reduced motion preserves manual inspection. Null measurements remain unavailable; timestamp gaps and null intervals split the chart instead of inventing data. Limits are deliberately bounded: 200 samples, 24 entities, 8 channels and 1 MiB of replay JSON.

The energy reference uses three abstract oscillating-plate assemblies and invented signals. It is not a validated Foil'o mechanism, a conventional-turbine assumption, live telemetry or a final client site. The shared Three.js viewport accepts validated additive pose offsets; visual interpolation never creates scientific measurements.

## Preserved workbench and reference clients

The root still opens the separate SQLRooms/DuckDB analytical workbench. Client websites have their own host, public directory and selected build; the workbench database is not initialized implicitly.

Use `?sites=1` for the reference gallery, or:

- `?app=energy-replay-reference`: the new 2D-first engineering recording and optional 3D.
- `?app=operations-reference`: data filtering, metrics, D3 and rows.
- `?app=architecture-reference`: artifact-backed architecture/schema review and presentation.
- `?app=experience-reference`: shared context across spatial, map and documents.
- `?app=wind-reference`: the original illustrative assembly/story and task example.

The built-in catalog now has sixteen block types, including the existing explorer and semantic explanation. New client folders are not automatically included in the public workbench build. Their selected outputs go to `dist-clients/<id>/` without deployment.

## Qualification

Implementation `0900c8a93d47456e663cc44a61b4b575647a69a5` passed workflow `36961220238`: **223 unit/boundary tests, strict TypeScript/build, original visual contracts, 43 production browser scenarios and ten independent client build/browser targets**. The five freshly generated clients left framework source unchanged. The final documentation-only follow-up does not change that implementation. See `docs/FAMILIES_V0_4_QUALIFICATION.md` for exact evidence, measurements and limits; `docs/FIRST_ENERGY_CLIENT.md` defines the approved inputs needed for the first real energy client.

## Boundaries

Read `docs/FAMILIES_REPLAY.md` for detailed behavior and `docs/recipes/replay.md` for the small authoring contract. Use `docs/AI_SITE_AUTHORING.md` for advanced state, task and privacy boundaries. Historical v0.2/v0.3 records remain in `docs/`.

Real applications still need approved data/assets, tested domain assumptions and a deployment/security decision. Static filters are not access control. No live telemetry backend, weather/physics model, GLTF/CAD import, video encoder, new notebook/IDE, Hop runtime, X-ray or DuckLake was introduced. The next client can justify a narrow, independently tested extension without turning every site into the same application.

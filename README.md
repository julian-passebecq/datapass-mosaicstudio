# DataPass MosaicStudio

**v0.6 alpha source SDK for AI-built technical websites.** Client content, approved data, domain calculations and page composition live under `clients/<id>/`; reusable state, contracts and rendering live under `src/framework/`.

Working branch: `feat/studio2-foundation-runs-context`, draft PR #7. This extends qualified v0.5. No merge, deployment, package publication, dependency upgrade or donor-repository modification is implied.

## Start with the smallest useful client

```sh
npm ci
npm run bootstrap
npm run client:families
npm run client:new -- my-project --family content --title "Client project"
npm run client:context -- my-project
npm run dev
# Open the printed address with ?app=my-project
npm run client:check -- my-project
npm run build:client -- my-project
```

Read `docs/recipes/START.md`, then the generated `.generated/client-context/<id>/GUIDE.md`. Five families remain: content, knowledge, analytics, spatial and replay. Families are compositions, not appearance restrictions. Actual blocks/resources determine optional capabilities.

A compact portfolio can stay content-only. It does not need a database, task journal, 3D or knowledge service. The repository still installs its pinned development dependency set; capability planning isolates delivered code and author context, not separate npm installation packages.

## New: calculate once, inspect several representations

```sh
npm run client:new -- experiment --family analytics --foundation
npm run client:context -- experiment
npm run build:client -- experiment
```

An immutable Artifact owns a bounded typed table or text payload, provenance and table/chart/metric/text/JSON representations. Existing renderers display the result; changing representation does not repeat the calculation. A ViewProfile selects representations, not permissions or data redaction.

The opt-in `runs` block observes existing SiteRuntime tasks. RunSpec supplies declared model/provider metadata. RunJournal captures actual parameters and outcomes, cancellation/supersession/timeout, bounded retention and version-compatible comparison. It does not add another scheduler. History survives page navigation within an app, but **not reload/closing**. Run/artifact exports contain result data and are separate from saved UI inputs.

Model/provider identities are client declarations. Upstream revisions are local cache versions, not content hashes or verified cloud receipts. A successful task whose output cannot be retained is not mislabeled as a failed calculation or a fabricated empty result.

Read `docs/recipes/runs.md` and `docs/FOUNDATION_KIT.md`.

## New: shared context and approved static sources

ContextInspector displays a bounded semantic context: selected entity, facts, source references, related IDs and provenance. NavigationSpec keeps selection/facet/projection/depth in existing view fields, with atomic validation and ID-only view links. This is not a new graph layout engine or the completed Galaxy product.

StaticKnowledgeProvider reads approved source excerpts, searches literal text, returns exact line references and prepares full/summary/excerpt/excluded context with an exact UTF-8 byte budget. Summaries are authored; no LLM, vector search, ingestion or network service is added. Context omission is not access control over files bundled in a static site.

## Public-site metadata, without a rewrite

Selected builds support optional `publication.json`: title, description, language, explicit HTTPS canonical address and an approved local social image. Metadata is emitted in HTML before JavaScript. Default builds are preview/noindex; public mode is explicit. Robots rules are not authentication or privacy.

Read `docs/recipes/public-site.md`. There is no domain verification, deployment, translation or full page prerendering in this feature. The compact portfolio remains a separate lightweight design task, not a copy of the technical workbench.

## Existing experiences remain available

The root route is still the separate SQLRooms/DuckDB workbench. `?sites=1` lists synthetic reference applications. The integrated review build includes only these seven approved references:

| Route | Purpose |
| --- | --- |
| `?app=foundation-reference` | Captured results/runs, shared semantic navigation and local source context |
| `?app=motion-reference` | Authored 2D/isometric D3 scenes and read-only evidence |
| `?app=energy-replay-reference` | Supplied-sample replay with optional 3D |
| `?app=experience-reference` | Shared context across spatial, map and document views |
| `?app=operations-reference` | Typed rows, filters, metrics, charts and CSV |
| `?app=architecture-reference` | Artifact-backed architecture/schema review |
| `?app=wind-reference` | Original illustrative assembly, shared story and explicit tasks |

Reference values, geometry and relationships are illustrative acceptance fixtures, not real Foil'o engineering or a canonical Galaxy registry. New client folders are not silently added to the public workbench list. Selected outputs are in `dist-clients/<id>/`; no deployment occurs.

There are now **18 block types**, nine optional capabilities and still five families. Existing VizForge, ConceptMotion, Three.js, React Flow and SQLRooms/Mosaic retain their roles.

## Qualification and release boundaries

See `docs/FOUNDATION_V0_6_QUALIFICATION.md` for exact qualified implementation, completed workflow, actual counts, artifacts and limits. A documentation-only head is distinguished from the tested implementation. Review `docs/CLIENT_READINESS_V0_6.md` for the five future clients.

This remains an alpha source SDK. It does not implement a general Scenario Engine, full SemanticOverlay renderer, GLTF/GLB ModelAsset pipeline, persistent cloud history, notebook execution, DuckLake or PDF/PPTX/video exports. Real client data/assets, scientific tests, final design, deployment security and broader browser/device acceptance remain necessary.

No Rust rewrite or speculative toolchain upgrade was used to deliver these features.

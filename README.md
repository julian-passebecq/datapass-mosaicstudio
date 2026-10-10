# DataPass MosaicStudio

**v0.10 alpha source SDK for AI-built technical websites, with a browser authoring workbench.** Client content, approved data, domain calculations and page composition live under `clients/<id>/`; reusable state, contracts and rendering live under `src/framework/`. One repository, separate entry points: a lightweight presentation surface (selected client builds, the standalone concept viewer) and a traditional browser workbench at the root. T3 is an optional consumer, never a prerequisite.

**0.10.0** (local release, no tag or publication) completes the full-release packet of 2026-10-10: Artifact contract parity (Schema/TypeScript/Python), an opt-in Jupyter kernel adapter, `.ipynb` exchange and a durable result store, real React/Contoso consumer interop, the finished coding/architecture explanations, the recovery record and a hashed, install-tested package set. Install, upgrade from 0.9.0, rollback, license status and acceptance mapping: [`docs/RELEASE_0.10.md`](docs/RELEASE_0.10.md). No license is granted (see [`docs/licenses/THIRD_PARTY_INVENTORY.md`](docs/licenses/THIRD_PARTY_INVENTORY.md)); public SDK publication is not authorized.

0.9 extends 0.8 (rc3 plus the night packages, PR #34; RC history in `docs/RELEASE_0.8_RC.md`). Release notes, acceptance mapping and evidence: [`docs/RELEASE_0.9.md`](docs/RELEASE_0.9.md). No deployment, package publication or donor-repository modification is implied.

## What's new in 0.9

- **Blank-first workbench with a notebook** ([`docs/WORKBENCH_AUTHORING.md`](docs/WORKBENCH_AUTHORING.md)): `/` opens your saved workspace with no forced dataset; `?sample=operations` opts into the synthetic sample. SQL cells run real DuckDB-WASM queries; Python cells run allowlisted models on a trusted local runtime; dependencies are explicit; every result is one `datapass.artifact` v1 with table/chart/metric/JSON views that never recompute.
- **Persistent workspace** (`datapass.workspace` v1 in browser storage): queries, cells, inputs, layout, file *names* and run *references* survive reload; file contents, result rows and tokens never do. Export/import (with migration of the old draft export), reset, and explicit rejection of newer/corrupt documents.
- **Local runtime runs API** (`datapass.runtime/1`, `py/service/`): token-protected (`X-Datapass-Token`), loopback-only, origin-checked submit/status/cancel/artifact for allowlisted models. Not a generic Python executor; do not expose it.
- **Stable consumption**: `npm run sdk:pack` / `sdk:verify` produce and check a hashed release archive with version, commit and license statement ([`docs/CONSUMING.md`](docs/CONSUMING.md)); pinned git-source consumers keep working.
- **T3-neutral preview contract** (`datapass.preview/1`, [`spec/preview/v1/`](spec/preview/v1/)): every `build:client` writes `preview.json` with output hashes, artifacts and capabilities; `npm run preview:validate -- <file> --check-files`.

## What's in 0.8

- **Concept spec v1**: one JSON file describes an app or cloud architecture (layers, domains, nodes, flows) and renders as an isometric SVG, a flat layer cake and a lazy 3D scene. See [`docs/CONCEPT_SPEC.md`](docs/CONCEPT_SPEC.md). The stable contract (`specVersion` 1.0.0, JSON Schema, evidence refs, rules for exporters) is published in [`spec/concept/v1/`](spec/concept/v1/); `node scripts/concept-validate.mjs <file>` checks a file.
- **Standalone concept viewer**: [`dist-standalone/concept-viewer.html`](dist-standalone/concept-viewer.html), one self-contained HTML file. Double-click it, then drop, pick or paste a `.concept.json`, or pass `?src=https://…`.
- **Viz kit**: the D3 kit in [`src/framework/viz/`](src/framework/viz/) is now the default Chart renderer, with one crossfilter shared by 2D and 3D views (`renderer: 'vizforge'` stays the per-block opt-out).
- **Python bridge**: Python code produces typed Artifacts that the site renders, plus an optional FastAPI artifact service. See [`docs/PYTHON_BRIDGE.md`](docs/PYTHON_BRIDGE.md).
- **galaxy-navigator** ([`clients/galaxy-navigator/`](clients/galaxy-navigator/)): one registry snapshot shown as a 3D galaxy, an exportable isometric SVG, a graph, a list, a contract matrix and a board, with one shared selection.
- **concept-viewer** ([`clients/concept-viewer/`](clients/concept-viewer/)): reference viewer for concept spec files (open, drop or `?spec=`), with pan/zoom on the isometric view, SVG export and a film.
- **Fabric Bricks** ([`clients/fabric-bricks/`](clients/fabric-bricks/)) is a **draft**: a provisional, synthetic reference client kept without further investment; architecture concept visuals continue in concept spec and Architecture Atlas.

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

## New: approved static product models, still optional

```sh
npm run client:new -- product-demo --family spatial --model
npm run model:inspect -- clients/product-demo/public/models/product-demo/assembly.glb
npm run client:context -- product-demo
npm run build:client -- product-demo
```

The `model3d` capability accepts a deliberately narrow self-contained **static GLB 2.0** profile. The approved bytes are identified by exact length and SHA-256 before the pinned Three.js `GLTFLoader` is allowed to decode them. Client-owned semantic part IDs bind to nodes in that exact hashed file, so selection, annotations, ContextInspector, source evidence, authored cameras and exploded offsets share one identity.

The first profile supports static triangle geometry, opaque untextured PBR materials and TRS transforms. It refuses external files/data URIs, textures, codecs/extensions, skins, morphs and animation tracks. Modes are assembled, exploded, wireframe, isolate and an uncapped visual cutaway. These are presentation states, not CAD measurements, physics or scientific simulation. The outline/source view works before loading WebGL and remains the fallback when 3D is unavailable.

Read `docs/recipes/models.md` and `docs/MODEL_ASSET_V0_7_QUALIFICATION.md`. A compact portfolio does not need this capability.

## Existing experiences remain available

The root route is still the separate SQLRooms/DuckDB workbench (blank by default since 0.9; `?sample=operations` loads the synthetic sample). `?sites=1` lists synthetic reference applications. The integrated review build includes only these eight approved references:

| Route | Purpose |
| --- | --- |
| `?app=foundation-reference` | Captured results/runs, shared semantic navigation and local source context |
| `?app=model-reference` | Verified static GLB, semantic part binding, product modes and evidence |
| `?app=motion-reference` | Authored 2D/isometric D3 scenes and read-only evidence |
| `?app=energy-replay-reference` | Supplied-sample replay with optional 3D |
| `?app=experience-reference` | Shared context across spatial, map and document views |
| `?app=operations-reference` | Typed rows, filters, metrics, charts and CSV |
| `?app=architecture-reference` | Artifact-backed architecture/schema review |
| `?app=wind-reference` | Original illustrative assembly, shared story and explicit tasks |

Reference values, geometry and relationships are illustrative acceptance fixtures, not real Foil'o engineering or a canonical Galaxy registry. New client folders are not silently added to the public workbench list. Selected outputs are in `dist-clients/<id>/`; no deployment occurs.

There are now **19 block types**, ten optional capabilities and still five families. Existing VizForge, ConceptMotion, Three.js, React Flow and SQLRooms/Mosaic retain their roles.

## Qualification and release boundaries

See `docs/MODEL_ASSET_V0_7_QUALIFICATION.md` for the latest qualified model-asset implementation and `docs/FOUNDATION_V0_6_QUALIFICATION.md` for the underlying foundation. Review `docs/CLIENT_READINESS_V0_7.md` for the five future clients.

This remains an alpha source SDK. It does not implement a general Scenario Engine, full SemanticOverlay renderer, universal glTF/CAD pipeline, persistent cloud history, arbitrary notebook code execution (0.9 runs allowlisted local models only), DuckLake or PDF/PPTX/video exports. The delivered model profile is intentionally static, local, bounded and opt-in. Real client data/assets, scientific tests, final design, deployment security and broader browser/device acceptance remain necessary.

No Rust rewrite or speculative toolchain upgrade was used to deliver these features.

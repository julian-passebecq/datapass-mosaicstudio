# DataPass MosaicStudio

**v0.3 alpha source SDK for AI-built technical websites and data applications.** Client content, calculations, scenes and optional React components live under `clients/<id>/`. Reusable state, contracts, blocks and rendering live under `src/framework/`.

The current implementation is on `feat/studio2-experience-navigation`, draft PR #4. It extends the qualified v0.2 kit without replacing its workbench or modifying the donor repositories. No deployment, package publication or general v1 release is claimed.

Read the [AI authoring guide](docs/AI_SITE_AUTHORING.md), [experience kit](docs/EXPERIENCE_KIT.md), [component catalog](docs/contracts/components.json) and [verified v0.3 qualification](docs/EXPERIENCE_V0_3_QUALIFICATION.md).

## Start

Use Node 22.16 or later. Initial dependency installation and commit-pinned upstream bootstrap require network access.

```sh
git clone --branch feat/studio2-experience-navigation https://github.com/julian-passebecq/datapass-mosaicstudio.git mosaicstudio-v03
cd mosaicstudio-v03
npm ci
npm run dev
```

Open the address printed by Vite. The root opens the existing SQLRooms workbench. Add `?sites=1` for the client gallery or use a reference route below.

## Two entry points, one repository

The **workbench** retains local CSV/JSON/Parquet exploration, DuckDB-WASM SQL, UWData Mosaic linked analytics, the existing pipeline/architecture views, original VizForge stories, original ConceptMotion explanations and a project board.

**Client websites** enter through a separate host. They do not initialize the workbench RoomStore or DuckDB by default. A selected client has its own asset directory and compiled output; the builder does not silently include unrelated clients or the workbench WASM.

## Four synthetic reference clients

| Route | What it demonstrates |
| --- | --- |
| `?app=wind-reference` | Interactive procedural turbine assembly, shared VizForge story, small-data scenario calculations and explicit tasks |
| `?app=operations-reference` | Filters, metrics, original D3 charts, typed rows, sorting, pagination and CSV |
| `?app=architecture-reference` | Artifact-backed system review, schema comparison, presentation and script-free report export |
| `?app=experience-reference` | One selected context across a 3D system, a 2D map and searchable documents; facets, native scroll tour and semantic explanation |

These are framework acceptance clients, not finished wind, Foil'o or personal portfolio websites. Geometry and example evidence are labelled synthetic. They do not assert real employer achievements, certifications, physics or live production status.

## Create an independent client

```sh
npm run client:new -- client-name --title "Client project"
# Or start from a focused composition:
npm run client:new -- client-docs --template knowledge --title "Project knowledge"
npm run client:new -- client-atlas --template spatial --title "Product explorer"

npm run client:check -- client-name
npm run build:client -- client-name
```

The output is `dist-clients/client-name/`. No hosting or deployment action occurs. The regular workbench production build includes the four approved reference clients only, not arbitrary new client folders.

The default `basic` template also accepts `--custom` to create a client-owned React component. Scaffolding never overwrites an existing directory. A client can add custom source UI when a built-in block is insufficient; a reusable framework extension should be isolated and proved against existing consumers.

## Reusable building blocks

The current catalog has fifteen types: text, metric, input, table, chart, task, catalog, code, scene3d, story-controls, story-figure, architecture, explorer, explanation and custom.

App/page/section manifests are inert. Inputs and view state are validated separately from trusted source callbacks. Derived small-data bindings declare their dependencies and cache accordingly. Explicit tasks support cancellation, timeouts, stale-result handling and revision-safe results. Saved inputs require review and exact client/version compatibility.

VizForge owns analytical chart/story rendering. ConceptMotion owns the supported semantic explanation frames. One demand-rendered Three.js viewport serves both the assembly block and spatial exploration. React Flow supplies the relationship canvas; architecture imports reuse the existing artifact parser and viewer.

Explorer facets can change an authored camera angle and the right-hand context panel without duplicating the underlying object. Selection focuses an item; a separate action opens its project page. The optional native scroll tour selects finite authored stops, preserves manual alternatives and does not trap wheel input. This is not continuous cinematic timeline scrubbing.

## Qualification

The final tested implementation is `12eee93d82fb01bbb018f9fabc3e89f541ff38ea`. Workflow `36943432246` passed **168 unit/boundary tests, strict TypeScript/build, original visual contracts, 34 production browser scenarios and seven isolated client build/browser checks**. The generated custom, knowledge and spatial clients did not modify framework source. See [the qualification record](docs/EXPERIENCE_V0_3_QUALIFICATION.md) for exact identities, measurements, artifacts and limitations.

```sh
npm test
npm run contracts:check
npm run build
npm run client:check
npm run test:visual-contracts
# The browser gate also needs a real supported Chromium installation and fixtures.
npm run test:fixtures
npm run test:browser
npm run test:client-builds
```

Fixture generation uses Python with DuckDB 1.4.3. Browser evidence is from hosted Linux Chrome using software WebGL2; it is not universal device/GPU/Safari/Firefox qualification. Existing integrated-workbench upstream annotation/chunk-size warnings are not represented as fixed.

## Boundaries before publication

A static build exposes its embedded content. Domain filters, evidence levels and view links are not access control. The optional same-origin JSON task transport does not provide an authenticated backend. Imported code excerpts are displayed as text, never executed.

Not included: GLTF/CAD model import, a weather/rotor physics engine, video encoding, remote Parquet, File X-ray, DuckLake/Delta, a notebook or IDE, a Hop runtime, a deployment control plane, or silent snapshot migrations. Add only capabilities justified by actual client briefs, with approved assets/data and concrete regression tests.

Historical qualification and design records remain in `docs/FRAMEWORK_KIT.md`, `docs/FRAMEWORK_V0_2_QUALIFICATION.md`, `qa/FRAMEWORK_FINAL_GATE.md` and `docs/ARCHITECTURE_REVIEW.md`. Research boundaries for this pass are in `docs/EXPERIENCE_RESEARCH.md`.

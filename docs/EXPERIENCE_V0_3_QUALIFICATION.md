# Experience kit v0.3 - verified source SDK

## Identity and preservation

- Repository: `julian-passebecq/datapass-mosaicstudio`.
- Branch: `feat/studio2-experience-navigation`.
- Draft PR #4 targets `feat/studio2-framework-kit`; no merge or deployment occurred.
- Starting point: qualified v0.2 `061a895ae91f1349f06b3c4ba669637498c170b0`.
- Final tested implementation: `12eee93d82fb01bbb018f9fabc3e89f541ff38ea`.
- Successful hosted workflow: [36943432246](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36943432246), job `110639980362`.
- Post-gate generated-contract commit: `8c1afbd7e8fa9ecf1b0819bdfbcf531c3a69c428`. This records source-generated schemas and synchronized root package version metadata; no dependency versions, integrity records or implementation changed.
- This qualification record and the accompanying authoring documentation are documentation-only follow-ups to the tested implementation. Previous repositories and branches remain unchanged.

## Completed gates

| Gate | Observed result |
| --- | --- |
| Frozen `npm ci`, no peer-dependency bypass | Passed |
| Generated authoring contracts checked against their source | Passed |
| Unit and boundary suite | 168 passed; 0 failed; 0 skipped |
| Strict TypeScript and integrated Vite production build | Passed |
| Four client source/data definitions | Passed |
| Original pinned VizForge and ConceptMotion contracts | Passed |
| Real production HTTP browser scenarios | 34 passed; 0 unexpected; 0 skipped; 0 flaky |
| Independent selected-client build and browser checks | All seven passed |
| Creating/building three fresh clients changed `src/` | No; before/after source digest identical |

Browser: Google Chrome 154.0.8037.57 on hosted Linux using software WebGL2. The result demonstrates actual Three.js rendering, not physical-device GPU performance, Safari/Firefox support or a universal frame-rate promise. Local HTTP browser navigation in the assistant environment was blocked by policy and was not bypassed; browser qualification used the ordinary hosted workflow.

The 34 browser scenarios include all 22 previously qualified v0.2 workbench/framework flows, ten explorer flows and two additional visual checks. New coverage includes shared object/facet identity across 3D, map and documents; exact camera selection; direct project opening; domain filtering; local search; safe view links; atomic restore; native scroll tour and its pause behavior; reduced-motion/manual traversal; mobile layout; no-WebGL fallback; original ConceptMotion frames; compact settled geometry; and the original chart renderer's dark theme.

The seven selected targets are four committed reference clients and three freshly generated clients. Tests build and serve each actual output, verify the intended client identity, reject unrelated client titles, check no DuckDB/WASM asset copying or initialization, reject unexpected external HTTP requests and console errors, and compare a digest of framework source before and after all scaffolding/builds. A new knowledge-only target additionally verifies no 3D renderer chunk or canvas and opens a document. A new spatial target exercises its own scene and switches to its library.

## Actual output measurements

These are sums of individually gzipped emitted JavaScript files, not first-load network transfer, page speed or browser memory measurements. Total output bytes include all emitted site files.

| Selected target | JS gzip bytes | Total bytes | Files | Result |
| --- | ---: | ---: | ---: | --- |
| operations-reference | 155992 | 512402 | 7 | Passed |
| wind-reference | 291025 | 1038628 | 10 | Passed |
| architecture-reference | 170795 | 582845 | 9 | Passed |
| experience-reference | 402363 | 1436224 | 22 | Passed |
| acceptance-fresh | 399758 | 1430846 | 22 | Passed |
| acceptance-knowledge | 156809 | 539473 | 10 | Passed |
| acceptance-spatial | 286851 | 1052527 | 12 | Passed |

Client builds remain source SDK artifacts, not automatic publication. A custom TSX block conservatively retains optional renderer chunks because arbitrary trusted source composition cannot be inferred reliably from declarative JSON. Build isolation prevents implicit inclusion of other clients; it does not prevent a developer from deliberately importing private content into client source.

## Corrections made during qualification

The first hosted run, `36942222289` on `d16827528659266092422ad71ddb39c249ac8979`, passed the integrated checks and all 32 then-existing browser scenarios. Its first isolated client typecheck failed because that generated TypeScript project did not include the repository's existing `src/dom-compat.d.ts` declaration for the original ConceptMotion SVG API. The inclusion was repaired; no donor source, peer checks or TypeScript strictness were bypassed.

Inspection of actual browser captures also exposed oversized metric cards beside a chart, an oversized default semantic canvas, duplicated explanation headings and poor dark/light contrast between site chrome and analytical blocks. The final implementation uses natural-height metric cards, a separate reference analytics page, the original `recommendedSceneViewport(..., 'compact')`, and explicit original-engine theme adapters. New tests wait for semantic animations to settle and check final stable item order/non-overlap rather than approving an in-transition screenshot.

## Evidence

[Workflow artifact: studio-web-evidence](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36943432246/artifacts/11201082115)

- Artifact id: `11201082115`.
- ZIP bytes: `27762273`.
- SHA256: `eb379d1ba7fcfb00886d1af1588a4093c7ad1cb7c1e30bb49fd3fd06735645b9`.
- GitHub retention expires 2026-10-05T00:01:11Z. Committed source, contracts and this qualification record persist after artifact expiry.
- Contains tracked source, integrated workbench, seven independent site outputs, browser diagnostics/report/screenshots, build logs and `qa/client-builds/results.json`.

The final spatial overview, focused view, minimal knowledge template, compact semantic explanation, dark D3 view and mobile document view were inspected from the real browser captures. They are not generated image mockups. Source uploaded via the repository API was compared with the local tested implementation and the workflow's source archive.

## Product status and limits

Qualified **v0.3 alpha source SDK**. Fifteen block types, source-generated schemas, client-only scaffolds and isolated builds are available. One authored content graph can now drive spatial discovery, a 2D map and a minimal document library with a synchronized context panel. The same demand-rendered Three.js viewport powers the original assembly block and the new explorer. Original VizForge and ConceptMotion continue to own their visual semantics and rendering.

The portfolio-style reference contains generic synthetic domains and documents. It is not a final personal portfolio and asserts no real employer results, certifications, infrastructure state or approved client data. This pass did not read the exact linked private ChatGPT conversation in full; accessible prior context and repository source informed the design, as recorded in `docs/EXPERIENCE_RESEARCH.md`.

The native scroll tour selects finite authored stops and animates toward camera presets. It is not continuous cinematic scroll scrubbing, automatic geometric facet discovery or a replacement story engine. No GLTF/CAD import, video encoding, physical turbine/weather model, authenticated backend, new SQL client data layer, notebook/IDE, Hop runtime, remote Parquet, X-ray or DuckLake/Delta was added.

General v1 still requires a real approved client brief/data/asset bundle, stable public API/version policy and migration expectations, broader browser/device/accessibility/performance qualification, and any narrowly scoped capability required by that client. No percentage-complete or fixed count of remaining passes is asserted.

## Next client author workflow

Read `docs/AI_SITE_AUTHORING.md`, `docs/EXPERIENCE_KIT.md` and `docs/contracts/components.json`.

```sh
npm ci
npm run client:new -- client-docs --template knowledge --title "Client knowledge"
npm run client:new -- client-atlas --template spatial --title "Client system"
npm run dev
# Open ?app=client-docs or ?app=client-atlas
npm run client:check -- client-docs
npm run build:client -- client-docs
```

Output: `dist-clients/client-docs/`. Edit client-owned content, scenes and domain bindings; preserve generic framework code. A justified reusable framework extension belongs on a separate feature branch with a concrete consumer and regression evidence, not inside a final client-site hack.

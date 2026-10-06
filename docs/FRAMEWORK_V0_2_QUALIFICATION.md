# Framework kit v0.2 - qualification record

## Identity

- Repository: `julian-passebecq/datapass-mosaicstudio`.
- Branch: `feat/studio2-framework-kit`; draft PR #3 targets the architecture-review branch.
- Tested source commit: `631b05b581a8d5dea7e644d2817d2cbe5fe3aa0e`.
- Successful workflow: [36931995901](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36931995901), job `110603324667`.
- Post-gate lock/schema commit: `52c8bf047d8317bdbf0cc18580ff5a84fc1c6fb9`. This records the exact npm-generated lock and contract schemas used by the successful run. No application implementation changed in that commit.
- This document is a documentation-only follow-up. No merge or deployment occurred.

## Verified results

| Gate | Result |
| --- | --- |
| Genuine dependency resolution followed by npm ci | Passed, no peer-dependency bypass |
| Unit and boundary tests | 121 passed, 0 failed, 0 skipped |
| Strict TypeScript and integrated production build | Passed |
| Three client source/data contracts | Passed |
| Original VizForge StorySpec/visual contracts | Passed |
| Production HTTP browser scenarios | 21 passed, 0 skipped, 0 unexpected, 0 flaky |
| Isolated client build + actual browser checks | All four passed |
| New custom-TSX scaffold changed framework source | No; source digest unchanged |

Browser: Google Chrome 154.0.8037.57 on hosted Linux, with the requested software graphics backend. This proves real WebGL2/Three execution in that environment, not physical-GPU performance, Safari/Firefox compatibility or a universal frame-rate guarantee.

The 21 browser scenarios retain the previous 12 workbench/architecture tests and add nine framework tests. They cover data-bound metrics/charts/tables, pagination and CSV; input validation; reviewed/invalid saved-state imports; real 3D, component selection, explode and PNG; the original shared VizForge story; manual camera/selection restoration across a different story index; cancellation/stale results; responsive layouts; and an explicit no-WebGL fallback.

The four target checks build and open the three reference sites plus a fresh `acceptance-fresh` custom-TSX scaffold. They enforce selected-client identity, no unrelated client titles, no copied DuckDB/WASM assets, no database initialization, no unexpected external HTTP requests and no browser console errors. Their before/after source digest confirms that creating/building the fresh client did not modify `src/`.

## Selected output measurements

These are sums over emitted JavaScript files compressed individually with gzip, not first-load transfer measurements. Total output bytes include the other emitted site files.

| Client | JS gzip bytes | Total output bytes | Files | Result |
| --- | ---: | ---: | ---: | --- |
| operations-reference | 152016 | 493634 | 7 | Passed |
| wind-reference | 286786 | 1019545 | 10 | Passed |
| architecture-reference | 167012 | 564446 | 9 | Passed |
| acceptance-fresh, new custom TSX client | 349960 | 1247552 | 13 | Passed |

A custom component is opaque to the declarative registry, so optional renderer chunks remain conservatively available. Ordinary block-only apps prune unused capabilities. These tests prevent implicit inclusion of other client registries/public directories; they do not prevent a developer explicitly importing private data into trusted source.

## Durable evidence

[Workflow artifact: studio-web-evidence](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36931995901/artifacts/11195694996)

- Artifact id: `11195694996`.
- Size: `24644625` bytes.
- SHA256: `c95b98f28d64a6eabcc2026b3c29c604f88b081ea44c6bf286f250305c1bbe05`.
- GitHub expiry: 2026-10-04T22:00:53Z; committed code, schemas and this record remain in Git.
- Contains tracked source, built workbench, separately built client sites, browser report/diagnostics/screenshots, target-build logs and `qa/client-builds/results.json`.

The actual settled 3D/story screenshot and business reference screenshot were inspected after the run. The primitive turbine is an acceptance asset, not a final client model. Earlier failed-run findings remain recorded in `qa/FRAMEWORK_QUALIFICATION_NOTES.md`: a JSX error and a real Session-menu overlay defect were fixed rather than hidden by weakening tests.

## Product status

This is a qualified **source SDK / alpha framework kit**, not a published npm v1 or universal Streamlit compatibility layer. Client definitions, calculations, assets and optional TSX components now live under `clients/<id>/`. Reusable app/page/block contracts, typed state, dependency-aware small-data bindings, explicit async tasks, input-state restoration, lazy renderers, original VizForge integration, real Three.js assembly and independent selected-client builds are implemented.

All three committed reference clients are synthetic framework acceptance clients. They are not the final wind, Foil'o or portfolio websites. The optional same-origin JSON task transport is tested as a transport contract; no actual authenticated Python computation service is provided here.

Before a general v1: qualify a real client brief and approved assets/data, settle SDK/package versioning and migrations, test additional browsers/devices/accessibility, and add only the missing capabilities demonstrated by that client. GLTF/CAD import, continuous scroll choreography, video encoding, map packages, remote data, X-ray, DuckLake/Delta, native host adapters, auth and deployment remain outside this pass.

The existing integrated build still emits upstream annotation/circular-chunk and size warnings. They were not silenced or represented as solved. The selected site builds are independently measured above.

## Next author workflow

Read `docs/AI_SITE_AUTHORING.md`, `docs/contracts/components.json` and `docs/AI_CLIENT_BRIEF.md`.

```sh
npm ci
npm run client:new -- my-client --title "Client project"
npm run dev
# Open ?app=my-client
npm run client:check -- my-client
npm run build:client -- my-client
```

Output: `dist-clients/my-client/`. No deployment occurs. Use `--custom` when scaffolding only if the brief needs a client-owned React component. Do not rebuild framework internals for ordinary client pages.

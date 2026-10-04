# Fabric Bricks visual replication — 2026-10-04

Branch: `client/fabric-bricks-v1`. Worktree: `D:\PROJ\worktrees\fabric-bricks`.

Starting Fabric checkpoint: `ac4281e8fc73fe65a6bef9e71706a532cbd6cd3b`.
Qualified framework base: `1cf6dcce97d8061f10323f9dc4ae5bc924fb5376`.
Implementation commit: `f267eb4ddb43797e6ee857a38c7c3b1d63221d5f`.
The following QA commit saves this report, tests, captures and the recorded demonstration. Resolve final HEAD with `git rev-parse HEAD`.

## Delivered

- Editorial white client shell, compact navigation and narrow parts inspector.
- Default 2D gallery, with Lakehouse generated catalog image and procedural OneLake/Power BI illustrations.
- Lakehouse with 58 procedural components, studs and tiled surfaces. Ten stable semantic component groups, one shared runtime selection field across 2D/3D.
- Shared MosaicStudio SceneViewport and SceneContent adapter; no second renderer, state store, scheduler, watcher or server was implemented.
- Manual six-step build controller, layered explosion, selected-part focus, orbit/zoom and near-white isolation.
- Client-only content/material adaptation for white background, softened lighting and ghost colors.
- Generated image saved in `assets/lakehouse-generated.png`; exact built-in imagegen prompt and provenance in `assets/PROVENANCE.md`.
- A recorded local browser demonstration: `captures/fabric-bricks-demo.mp4`. This recording contains the implemented application, not the supplied reference footage.

## Verification

| Check | Actual result |
| --- | --- |
| `npm run client:check -- fabric-bricks` | PASS |
| `npm run typecheck` | PASS |
| `npm run build:client -- fabric-bricks` | PASS; selected production build |
| Dedicated semantic tests | PASS, 5/5 |
| Playwright on development client | PASS (initial 2 interaction/responsive scenarios) |
| Playwright on final production preview | PASS, 3/3 (expanded raycast, keyboard, focus, secondary-kit coverage) |
| Full Node suite | 460 tests: 455 PASS, 5 FAIL, 0 skipped |
| Raw `contracts:check` | FAIL: CRLF/LF byte comparison |
| Contracts in normalized temporary fixture | PASS; original shared files untouched |
| Codex in-app browser | Actual gallery, assembled, exploded, isolated and narrow layouts inspected |
| Browser console | No errors/warnings observed in the inspected in-app browser session |
| Responsive | 390 × 844 tested; no horizontal document overflow; controls and inspector accessible |
| Reduced motion | PASS; shared viewport settles immediately, CSS entrance animation suppressed |
| Keyboard | Gallery Enter, inspector Space, 2D SVG Enter; same semantic selection restored in 3D |
| HMR | CSS update observed without a Document request; selected `boardwalk` and detail screen retained |

The five full-suite failures also reproduce in an untouched archive of `ac4281e…`: `clients.test.mjs` symbolic directory rejection; `model-assets.test.mjs` symbolic asset rejection; `publication.test.mjs` symbolic social asset rejection (Windows EPERM), plus `contracts.test.mjs` and `motion-pro.test.mjs` generated schema byte comparisons (CRLF/LF). Baseline subset: 88 tests, 83 PASS, the same 5 FAIL. No framework repair was performed or required for the rendered client.

## Observed network

Codex browser CDP Network request events were captured around a gallery reload and kit opening. Before kit interaction: **zero** requests matching `KitModel`, `SceneViewport`, `Fabric3D` or Three.

After opening Lakehouse, actual requests included:

- `/clients/fabric-bricks/KitModel.tsx`
- `/src/framework/scene-renderer/SceneViewport.tsx`
- `/node_modules/.vite/deps/three.js`
- `/node_modules/.vite/deps/three_addons_geometries_RoundedBoxGeometry__js.js`
- `/node_modules/.vite/deps/three_addons_controls_OrbitControls__js.js`

Production Playwright independently checks that gallery navigation requests no KitModel/SceneViewport/Three chunk and opening a kit requests KitModel. First development import caused normal Vite dependency prebundling/reload; the final stable CSS HMR check was taken after build/optimizer activity completed.

## Reference comparison and boundaries

The uploaded video is 25 seconds, 1004 × 548, 30 fps. Lakehouse at 5s and ghosted/exploded at 7s informed the black base, cyan pool, tan L-shaped boardwalk, pale walls, flat gray roof and turquoise corner tile. The new UI follows its left editorial title, central model, compact right inspector and floating bottom timeline.

This is a first reference-inspired visual pass, not pixel-identical reconstruction. Procedural foliage and brick geometry are simplified, ten component groups replace the reference's detailed 34-lot physical BOM, lighting differs, and the gallery has three concepts rather than the full reference collection. OneLake and Power BI are secondary sketches. Build steps are manual; no autoplay clock was added. Prices are computed illustrative metadata, not live commerce prices. No third-party logos, model assets, commerce links or source footage were published.

All geometry, images, dimensions, build order and costs remain **GENERATED / SYNTHETIC / PROVISIONAL**. The initial four-brick fixture and tests remain in the client as the preserved interaction checkpoint. No claim of source-approved Fabric content is made.

## Files and recovery

Changed implementation: `app.ts`, `SOURCE_STATUS.md`; new `FabricExperience.tsx`, `KitIllustration.tsx`, `KitModel.tsx`, `kits.ts`, `experience.css`, generated image/provenance. QA is under this `qa/` directory; shared semantic regression coverage is in `tests/fabric-bricks.test.mjs`. The diff stays within `clients/fabric-bricks/**` and that dedicated test file. `src/framework/**` and upstream trees are unchanged.

The pre-existing local spelling edit `Synthetic/provional` in `app.ts` was preserved **unstaged**, separately from the authored commits. It affects only the hidden framework page description. No other prior user change was overwritten.

Run from this worktree:

```powershell
npm run client:dev -- fabric-bricks --port 5178
```

Open `http://127.0.0.1:5178/?app=fabric-bricks`. A local production preview was also tested at port 5180. Browser regressions:

```powershell
npx playwright test --config clients/fabric-bricks/qa/playwright.config.ts
```

To target production, set `$env:FABRIC_URL='http://127.0.0.1:5180'` first. To record a fresh demo, run `node clients/fabric-bricks/qa/record-demo.mjs`; this creates WebM which can be converted to MP4.

Captures: `gallery.png`, `lakehouse-assembled.png`, `lakehouse-exploded.png`, `lakehouse-isolated.png`, `lakehouse-mobile.png` under `captures/`.

No merge, deployment, package publication, Mongo write or remote Git push was performed. Commits are local and recoverable on the existing client branch.

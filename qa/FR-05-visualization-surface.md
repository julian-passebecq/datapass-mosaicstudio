# FR-05 Finish and preserve the visualization surface

Packet galaxy-full-release-2026-10-10 / 01-mosaicstudio. Base `origin/main` `f3a02bc` (0.9.0 + FR-01). Branch `claude/explanations-recovery`.

## 1. Inventory diff against `docs/PRODUCT_INVENTORY_0.9.md`

Checked by a new unit test, `tests/product-inventory.test.mjs`, so the comparison runs in CI instead of living only in this note.

| Inventory item | 0.9 inventory | This branch | Result |
|---|---|---|---|
| Workbench modules | 9 (`notebook`, `explore`, `linked`, `sql`, `pipeline`, `stories`, `explain`, `board`, `architecture`) | the same 9, all `implemented` in `src/core/host.ts` | nothing lost |
| Block types | 19 | the same 19 in `BLOCK_TYPES` (`src/framework/validate.ts`) | nothing lost. `architecture` gains an optional `selection` field |
| Client families | 5 (`content`, `knowledge`, `analytics`, `spatial`, `replay`), each with a guide | the same 5, guides present | nothing lost |
| Clients | 17 folders | the same 17 tracked `clients/*/app.ts`, none unlisted | nothing lost. `architecture-reference` 0.2.0 → 0.3.0 (new page), `animated-coding-lab` 0.1.0 → 0.2.0 (new view field) |
| D3 | viz kit `src/framework/viz/`, motion renderer | unchanged | kept |
| VizForge | pinned `.upstream/vizforge` via `@vizforge` alias; StoryPlayer drives motion | unchanged. Both explanations use the existing StoryPlayer controller, no new clock | kept |
| ConceptMotion | `@conceptmotion/*` aliases | unchanged | kept |
| Three.js | `scene-renderer`, `model-assets`, `viz/webgl`, `concept/three` | unchanged. Neither explanation loads it | kept |
| React Flow | Pipeline, Architecture panels and block | unchanged; the Architecture panel can now share its selection | kept |
| SQLRooms + UWData Mosaic + DuckDB-WASM | `store.ts`, `Linked.tsx`, `Sql.tsx`, `Explore.tsx` | unchanged | kept |

Routes, importers, exports and contracts in sections 1, 7 and 8 of the inventory were not touched, except that `docs/contracts/web-app.schema.json` and `components.json` gain the optional architecture `selection` (regenerated with `npm run contracts`).

## 2. Coding explanation: `clients/animated-coding-lab`

The recorded trace, VizForge StoryPlayer controller, `MotionViewport` and `SourceReader` already existed. The release adds:

- **Shared selection** `lab-selection` (view field; options `none`, the 4 stations, `row-0`…`row-31`). One value is written by the SVG (click a box or a value), by the `rows[i]` picker and by the explanation's "Clear selection", and read by:
  - the motion SVG (`data-selection`, highlighted object);
  - the code pane (`SourceReader` highlights the lines of the related steps; for `row-1` these are 6 lines);
  - the explanation ("Selected" panel: identity, description, related steps as jump buttons);
  - the transcript (`li[data-related]`).
  A row owns its loop iteration (`rowSteps`). A station owns the steps it is the focus of (`relatedSteps`). Both are pure functions over the recorded trace. Selecting never changes the step and never reruns anything.
- **Reset**: one `applyCue` with the declared defaults of the lab's five view fields, after pausing the player.
- Source evidence is unchanged: `py/examples/normalize_rows.py` excerpt, artifact/run/producer/input hash and the lineage page.

## 3. Architecture walkthrough: `clients/architecture-reference` page `walkthrough`

- A motion v2 resource (`walkthrough.ts`) built **from** `demoArchitecture`: 8 stations with the same ids as the review nodes, the 7 declared edges as links (control edges dashed), 1 illustrative token, 8 authored steps.
- **Source evidence**: 3 inert `SourceArtifact` excerpts taken literally from the document (the `code` of `clean_events` and `site_performance`, and the document notes). They are referenced by entities, steps and annotations and opened from the inspector or the transcript. All marked synthetic.
- **Shared selection across views**: the motion block (2D, ISO, outline, inspector) and a second `architecture` block on the same page both bind `arch-selection`. Advancing the walkthrough moves the review canvas selection. Selecting in the canvas outline selects the same component in the walkthrough. Generic extension: optional `architecture.selection` (validated as a view select field with a `none` option). The panel uses the shared value only while every node of its document is a field option, so an imported document keeps its own local selection. Documented in `docs/ARCHITECTURE_REVIEW.md`. The plain `review` page is unchanged.
- **Reset**: new framework motion-block button. It pauses, then applies one view-only cue with the block's declared field defaults (documented in `docs/MOTION_KIT.md`). The motion-reference client gets it as well.

The concept-standalone embed-fit fix is left to the FR-04 package. The concept viewer was not touched.

## 4. Light outputs: no database, kernel, WebGL or T3

`tests/browser/explanations.spec.ts` (in the main Playwright suite, so CI runs it) records every request and wraps `HTMLCanvasElement.getContext` to log any WebGL context:

| Output | How served | Assertions |
|---|---|---|
| animated-coding-lab (content family, motion) | selected-client build, production CSP | no `.wasm`/duckdb/three/SceneViewport/GLTF/WebGL chunk/T3 request, no request outside its origin (so no local runtime/kernel), no WebGL context, no `<canvas>` |
| motion-reference (light motion) | workbench preview | same |
| architecture-reference walkthrough | workbench preview | no wasm/duckdb/three/T3 request, no WebGL context |
| fabric-bricks (draft, spatial) | selected-client build | gallery opens, `synthetic/provisional`, no canvas or 3D chunk before choosing 3D |

Static grep of the built outputs (`dist-clients/<id>`) found no `.wasm`, no `WebGLRenderer|GLTFLoader`, no duckdb, no `t3code` and no python-service URL in architecture-reference, animated-coding-lab or motion-reference. fabric-bricks keeps its lazy Three.js chunks (spatial, as on main).

## 5. Payload against the existing budgets

Metric of `scripts/check-client-performance.mjs`: the sum of individually gzipped emitted JS. Measured locally by `build:client` on main `f3a02bc` and on this branch:

| Client | main f3a02bc | this branch | delta | approved baseline / budget | verdict |
|---|---|---|---|---|---|
| architecture-reference | 183,190 | 223,749 | +40,559 (motion capability: D3 + VizForge player + walkthrough) | 179,398 / 230,400 | within budget (6,651 B headroom) |
| animated-coding-lab | 168,210 | 169,200 | +990 | 158,683 / 189,440 | within budget |
| motion-reference | 157,254 | 157,425 | +171 (Reset) | 143,839 / 184,320 | within budget |

For context against `qa/PAYLOAD_0.9.md`: motion-reference was 155,613 there, and main `f3a02bc` (FR-01) already measured 157,254 before this change. The CI job `test:client-builds` runs the authoritative 19-target gate. Note: architecture-reference now uses most of its headroom. A future feature on that client needs a measured budget decision.

## 6. Tests run (local, Windows 11, Node 26.9, Playwright 1.63 Chromium)

- `npm test`: 629 tests, 628 pass, 0 fail, 1 skipped (it includes the new `explanations.test.mjs` 7/7 and `product-inventory.test.mjs` 5/5).
- `npx tsc --noEmit`: OK. `npm run contracts`, then the drift check: OK. `npm run build`: OK. `client:check` for both clients: OK.
- Browser: `explanations.spec.ts` 4/4, plus the affected existing specs `motion`, `motion-pro`, `motion-visual`, `architecture`, `framework`, `framework-restore` and `framework-responsive`: **40 passed, 0 failed** (local preview on port 24173, specs copied with the port rewritten; CI runs them unchanged on 4173).
- Screenshots inspected at 1440 px and 390 px (no horizontal overflow) are stored privately with hashes (see the receipt).

CI: run [38021360810](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/38021360810) at `3f5c120` passed: `npm test` 635/0/2 skipped, browser suite 113 passed (explanations 4/4), all 19 selected-client budgets passed with the same byte counts as measured locally. After the rebase on `0143e58`, local `npm test` gives 637 pass, 0 fail.

`timeout-minutes` raised from 24 (value after FR-02/03) to 28, because the new spec builds two selected clients.

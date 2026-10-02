# Research boundaries for the experience-navigation pass

This document separates inspected sources from inspiration and inaccessible material. It is not a claim that all linked websites or the entire private ChatGPT conversation were read.

## User intent recovered

The user wants a web framework for AI-built client sites, not another IDE. The useful patterns are stable domains/entities, overview/focus/evidence, native scroll movement, camera facets, a synchronized right panel, and a second minimal outline/search/document composition. Supplied mockups are visual direction, not literal implementation specifications or verified CV data. Existing Fluent/VizForge UI was explicitly disliked and must not be recopied.

Personal/project retrieval found related portfolio discussions about a compact single-domain view, bottom-domain navigation, evidence facets and differentiated select-versus-open actions. The exact linked conversation `6aba7eef-cb0c-83ed-a72f-50d0aa27a641` was not available as a complete transcript. No exact-transcript claim is made.

## Concrete code inspected

- `sqlrooms/examples/app-builder/src/store/store.ts`: modular room-store slices, canvas/layout/editor relationships, source-owned app-builder concerns.
- `sqlrooms/examples/canvas/src/store.ts`: separate schema/cells/canvas slices and multiple composable output renderers. The notebook/cell editor is not required in a client-facing site.
- `sqlrooms/examples/deckgl-mosaic/src/store.ts`: one Mosaic/DuckDB coordination layer alongside a deck.gl-specific rendering slice. Lesson: do not fork independent selection/query state for every visual surface.
- `julian-passebecq/julianvuev2/README.md` and `src/components/RoleFocusCard.vue`: prior portfolio distinguishes `select-role` from `view-project` and delegates compact domain/proof navigation. This pass takes that interaction distinction, not the Vue shell or its style.
- `julian-passebecq/diagramcloud/README.md`: artifact-backed exploration, edit and presentation are different concerns. Studio reuses its own already-qualified architecture module, not DiagramCloud's application or PowerPoint tooling.
- Pinned original ConceptMotion core/SVG/React source and VizForge grammar/player/adapters were read locally before exposing their existing interfaces. No donor source was modified.

## URLs and media

The supplied public URLs were attempted. Some returned cache misses or script-only content; screenshots and available repository source provide the actual visual/behavior evidence, not an asserted complete live-site audit. The uploaded Fabric/F1 recording was sampled locally: map movement, time-series telemetry and explanatory cards can coordinate, but no Fabric runtime, live telemetry or numerical physical simulation is implied.

## Decisions

Two new bounded blocks: `explorer` and `explanation`. Shared scene rendering is factorized. Client content and cameras remain separate. Search is local. Scroll remains native and opt-in. Cloud data runtime, new query engines, model assets, notebook interfaces and deployment remain outside the pass.

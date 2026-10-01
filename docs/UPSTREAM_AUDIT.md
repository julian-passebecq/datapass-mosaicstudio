# Front-end donor and SQLRooms example audit

This is a targeted integration audit, not a claim that every historical archive or repository in the ecosystem was exhaustively reviewed.

## Recovered DataPass visual work

| Donor | Pin | Reuse in this branch |
|---|---|---|
| julian-passebecq/Fluent2_J_Viz | 7aaa8fa601c5fa2c9f8acfd7a4d4eb54b887b9ef | actual React StoryView, StoryPlayer, D3 renderers, v1 and gallery specs |
| julian-passebecq/react_ms_fluent_2_framework | 30e69639bfc3929c348fd8f9c6c38a2cb61984d8 | actual ConceptMotion core/svg/react packages and canonical algorithm visuals |
| sqlrooms/examples | cb3b6d01609b6373e68af096c3724ed17f6f19dc | reference-only source audit; individual applications are not copied wholesale |

The old D3 engine is recovered; this does not establish which third-party demo URL originally inspired every historical request. No unverified original URL is asserted.

## What the supplied SQLRooms examples teach

| Example | Observed pattern | DataPass treatment |
|---|---|---|
| mosaic | createRoomStore + shell/database + createMosaicSlice, VgPlotChart spec and crossfilter params | reused directly; one coordinator links marks and a real table |
| deckgl | map rendering separate from room state; geometry preparation and table readiness | preserve this seam for an optional geospatial module; not shipped as a fake map |
| deckgl-discuss | feature slices add discussion state beside a renderer | UI-state composition is reusable; demo identity is not authentication |
| kepler | map/dataset lifecycle, artifact IDs, add/remove/rename and synchronization with db catalog | a future map module must manage lifecycle, not simply mount an iframe |
| cosmos | graph renderer fed by room-owned data and a Cosmos slice | separate graph consumer, not another pipeline scheduler |
| cosmos-embedding | point/embedding data consumer using a related renderer foundation | separate optional analytical use case; do not bundle eagerly |
| nextjs | browser/client integration boundary around SQLRooms | this repo stays Vite/React; SSR must not instantiate browser workers |

Reference paths are available under the pinned `.upstream/sqlrooms-examples/` after bootstrap. Published libraries are pinned to 0.29.0-rc.7; the example snapshot and package APIs are not assumed to be identical. Consumer code is checked against the installed declarations.

The deckgl-duckdb-geoarrow README was also inspected: its WKB-to-GeoArrow point preparation is an explicit conversion step. It does not justify a blanket zero-copy claim. Map provider credentials and external services must be optional and reviewed.

The linked-views-demo Netlify page could not be retrieved in this environment. No visual or behavior verification of that remote deployment is claimed. The implemented local linked view is qualified separately.

## Existing products that remain authoritative

**Data X-ray** already describes extensive Parquet metadata, schema, lineage and native adapter work. This branch does not claim those features were absent. The browser explorer is a smaller real vertical slice. Future work should extract pure, appropriately licensed adapters from that product instead of rebuilding its whole analyzer.

**Factory** contains a blocking execution architecture decision (ADR-FACTORY-EXECUTION-001). This repository does not evade it by adding a generic orchestration engine. The pipeline canvas is a source-definition editor/viewer. An authoritative execution bridge requires a separate reviewed decision.

**Mosaic Workbench** explicitly delegates editing, Git, terminals and Jupyter to VS Code. Its runtime and learning labs are not restarted here. Future integration should use artifact/data/selection/host contracts.

**Hop / lineage / repo explanations** are future input adapters and consumers. This pass imports the bounded ADF/Fabric activity shape; it does not claim a working Hop engine, dbt/OpenLineage importer or full repository analyzer.

**Original Studio** and its inert app/page/artifact contracts remain separate. They need an explicit versioned translation before being consumed here; no automatic format compatibility is claimed.

## Next useful order

1. Qualify all delivered browser surfaces and one actual client app.
2. Extract existing pure lineage and Parquet metadata contracts behind reviewed adapters.
3. Add a single optional geospatial consumer with real coordinate/schema checks.
4. Add a bounded backend task connector only when a client requires Python or native DuckLake.
5. Implement and test a second host, then publish stable shared packages.

Do not install every package in the screenshot simply because it exists. A feature package becomes a dependency when a qualified consumer needs it.

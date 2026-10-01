# Architecture review - web consumer

This module extends the existing Studio2 foundation; it does not replace Studio, DataPass VS Code, Workbench/Mosaic, DiagramCloud, Factory, Hop or Data X-ray.

## Open

- `?module=architecture`: inside the SQLRooms workspace.
- `?module=architecture&embed=1`: independent React web surface; no RoomStore or DuckDB initialization.
- `?module=architecture&embed=1&present=1`: presentation view from the start.

The eight-node renewable-operations example is entirely synthetic. Its intentional cost-field mismatch demonstrates a comparison, not a real incident or client architecture.

## Implemented

Read-only React Flow system map; searchable component outline; source/cost/serving roles; declared owners and source excerpts; transitive upstream/downstream highlighting; manual, source-derived presentation chapters; exact strongly-connected components; reverse displayed-layer links; paginated direct dependency matrix; design-versus-catalog schema comparison; reviewed local JSON import; explicit JSON/SVG/HTML downloads.

No second chart engine or notebook UI is introduced. Existing VizForge analytical stories and ConceptMotion explanations remain unchanged. React Flow is reused for architecture just as the existing Pipeline module uses it for activity definitions.

## Real input paths

1. DataPass `datapass.architecture/1` JSON, validated by `src/architecture/model.ts`.
2. A dbt `manifest.json`: sources, models, seeds, snapshots and exposures, using exact resource ids and `depends_on.nodes`.
3. Optional dbt `catalog.json`: matches exact unique ids to a labelled physical-schema snapshot. A project-id mismatch is rejected when both files expose it. A match does not prove environment or freshness.
4. DataPass pipeline JSON or the existing ADF/Fabric import subset: uses `parsePipeline` from `src/core/pipeline.ts`, not another ADF parser. Control and containment links remain separate.

All imports are limited to 2 MiB, 180 components, 400 links and 100 columns per schema. Import validation is atomic: the existing view remains until the user applies a valid preview. Unknown formats/fields are rejected; source strings never execute.

## Facts, not inferred authority

Design schemas and catalog snapshots are separate. Missing schema/type/nullability remains unknown. Column names are compared exactly. Type whitespace/casing is normalized; aliases are not assumed equivalent. A rename is not inferred from an added and a removed field. No live warehouse status, validation of Azure definitions, run status, column-level lineage or automatic breaking-change assessment is claimed.

Layer placement in the dbt adapter groups resource types; it does not infer a medallion architecture. The dependency matrix shows at most 24 matching components per page and explicitly notes off-page links. Cycle detection uses strongly connected components, so nodes downstream of a cycle are not incorrectly counted as cycle members.

## Presentation and privacy

`Present` hides workbench detail behind an in-place, full-window review. Previous/Next and Left/Right keys select chapters; Escape exits. There is no automatic animation timer or new playback engine.

The HTML report is script-free, includes the same semantic map, findings and expandable component details, and has no external assets. SVG/HTML exports use the canonical layer layout, not an exact pan/zoom screenshot. Source excerpts and relative artifact paths are excluded from JSON/HTML by default; including them requires an explicit checkbox. Component names, owners, descriptions and schemas are still included: review any report before sharing it.

Imports live in browser memory only and survive switching SQLRooms modules. Reloading discards them. No file upload, network source lookup, repository cloning, database execution or automatic publication happens in this module. The full-workspace draft export does not include architecture documents; use this module's export menu.

## Deliberately not in this pass

Apache Hop/Tomcat embedding, Hop XML import, an architecture authoring IDE, live source analysis, schema write-back, Jupyter/Python execution, DuckLake, a byte-level Parquet X-ray port, physical relationship inference, PPTX/PDF export, authentication and deployments.

Hop's interaction model is useful inspiration. Hop Web is a separate converted Hop GUI application, not the canvas dependency used here. DiagramCloud keeps its own presentation/export product and import contracts; this module does not claim compatibility with them.

## Source references consulted

- https://docs.getdbt.com/reference/artifacts/manifest-json
- https://docs.getdbt.com/reference/artifacts/catalog-json
- https://hop.apache.org/manual/latest/hop-gui/hop-web.html

## Verification commands

`npm test` includes the architecture core suite. `npm run build` includes strict TypeScript checks. `npm run test:browser` includes the existing seven workflows plus five architecture workflows: database-free embed, inspection, dependency direction, catalog drift, import review/failure preservation, presentation/keyboard, actual downloads, script-free report rendering, narrow layout, ADF reuse and SQLRooms module continuity. Consult the actual CI run before calling the whole gate successful.

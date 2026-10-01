# AI work order for a new Studio client

Use the existing Studio source SDK; do not rebuild the UI/data/graphics infrastructure.

## Inputs to request/confirm

Client name and audience; public versus private data; required pages and decisions; approved source data/model assets; units, assumptions and domain authority; desired visual style; static versus service-backed computation; hosting constraints; acceptance scenarios.

## Work sequence

1. Read AGENTS.md, docs/AI_SITE_AUTHORING.md and docs/contracts/components.json.
2. Scaffold a new clients/<id> folder. Use --custom only when the brief needs a source-owned React extension.
3. Keep app.ts manifest declarative. Put domain functions in model.ts and test them independently.
4. Use only the necessary blocks. A brochure or architecture site must not initialize a SQL workbench.
5. Reuse existing VizForge, scene3d and architecture bindings rather than writing duplicate renderers.
6. Label synthetic data, explicit calculations, imported snapshots and live results correctly.
7. Add client unit/browser tests, run client:check and build:client, inspect the actual result at desktop and mobile widths.
8. Report exact files changed, tests run, known limitations and build directory. Do not deploy, merge or publish private data without authorization.

## Definition of done

The requested site is assembled primarily under clients/<id>, framework internals remain unchanged, the selected bundle contains no unrelated client artifacts, and its specific acceptance tests pass. Any missing generic capability is proposed separately with a small reproducible consumer rather than implemented as an opaque one-off in the framework.

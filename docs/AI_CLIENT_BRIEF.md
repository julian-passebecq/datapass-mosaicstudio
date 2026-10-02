# Client website work order for an AI agent

Copy this brief into a new client task. Read `AI_SITE_AUTHORING.md` and the component catalog before coding.

## Required input

- Client id and site title:
- Intended visitors and primary task:
- Public/synthetic/private classification:
- Pages and information hierarchy:
- Visual references (what is liked and what must not be copied):
- Approved data and its schema/units:
- Approved images/models and their usage rights:
- Model assumptions and correctness checks:
- Inputs that stay local versus inputs sent to an approved service:
- Required accessibility, mobile and reduced-motion behavior:
- Hosting target and required computation service (if any):

## Agent contract

Create source under `clients/<client-id>/`. Use framework blocks before creating custom components. Do not copy a reference client's domain data or edit framework internals for ordinary pages. Keep executable domain calculations in trusted source bindings, not in JSON strings.

A public build makes its embedded content available to visitors. Do not include secrets or private evidence. Labelling a dataset private does not secure a static bundle.

No deployment, domain change, authentication setup or external service write is implied by this brief. Confirm the actual target and authorization before those operations.

## Acceptance

Run the client's source validation, strict TypeScript, selected production build and real browser checks. Test calculations, empty/error states, exports/restores, mobile, keyboard and reduced motion. Record failures and fix them rather than suppressing checks. Deliver the client source, build output and a clear distinction between implemented behavior and planned integrations.

## Experience and navigation choices

Specify whether the primary composition is a spatial map, a 2D architecture map, a minimal knowledge/document site, or an ordinary analytical app. Define stable objects and the information facets for each: for example capabilities, companies, projects and evidence.

Decide what selecting an object does, which facets change its camera, and which explicit action opens a separate project page. Do not confuse a selection with navigation or a declared relationship with measured runtime lineage.

For scroll-driven experiences, provide authored stops and retain direct controls. State whether geometry is illustrative or an approved product asset. No physical performance or weather effect may be inferred from presentation animation.

When no existing block fits, propose either a client-owned custom React component or a narrowly scoped generic framework extension with validation, documentation and a concrete regression test. Do not silently turn the framework into an IDE or a collection of client-specific exceptions.

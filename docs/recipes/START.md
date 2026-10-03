# Minimal authoring route

Do not open every library. Families are working starting points, not fixed product categories.

1. Run `npm run client:families` and choose the closest family.
2. Create `npm run client:new -- client-id --family <family>`.
3. Read the new client's `CLIENT_GUIDE.md`; run `npm run client:context -- client-id` for the current capability-specific guide.
4. Edit `clients/client-id/`. Use `src/framework/authoring.ts` for ordinary definitions and `src/framework/ui.ts` for custom React hooks. These entries do not import renderers.
5. Run `client:check` and `build:client`, then real browser checks for the client. No deployment is implied.

A family does not constrain the actual app. The capability plan is derived from the used blocks and resources, including scene use. A client may combine analytics, documents, replay and 3D. Start in 2D unless another representation helps the visitor.

Do not embed sensitive data or tokens in a static bundle. State exports contain declared user values, not secrets, source functions or results. Numbers, geometry and claims need approved sources. Synthetic examples must remain labelled.

For a reusable missing capability, propose a narrow shared change with a client and tests. Otherwise use client-owned TSX. `customCapabilities: {name: []}` declares a lightweight custom component. Missing declarations retain all renderers for compatibility; explicit declarations require review and testing.

Read the full AI guide only for tasks, complex state or publication boundaries. Do not read Three.js, a notebook or a SQL engine just to create a normal site.

For a pedagogical process, add the optional motion capability with `--family content --motion`, then read `docs/recipes/motion.md`. This is not an additional compulsory family and does not require 3D.


For explicit calculation history and multiple result views, use `--family analytics --foundation`, then read `docs/recipes/runs.md`. This does not add a family or an execution engine. For the compact portfolio, prefer content and `docs/recipes/public-site.md`; do not load runs or 3D without a requirement.

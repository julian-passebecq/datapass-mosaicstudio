# DataPass MosaicStudio

A browser analytics workbench (DuckDB-WASM) and a source SDK for technical websites. The framework lives in `src/framework/`; each client's data, model logic, pages and assets live in `clients/<id>/`. DataPass Studio releases are built from here. Start small: `docs/recipes/START.md`, then `npm run client:families` and `npm run client:context -- <id>`. `docs/FRAMEWORK-CONTRACTS.md` holds the design contracts per capability.

## Build and test
- `npm test`, `npm run typecheck`, the contract checks, a production build and the browser checks (`npm run test:browser`). Node 22.16 or later; `npm run bootstrap` fetches the commit-pinned upstreams in `upstreams.lock.json`.
- CI: private GitLab mirror `juliandatapass-group/datapass-mosaicstudio`, remote `gitlab`; `.gitlab-ci.yml` runs core tests, contracts, typecheck/production build and client/visual checks on `local-windows, imac`. Push branches to both remotes and quote the GitLab pipeline URL in the GitHub PR. The existing GitHub Actions Studio web gate also covers Python and browser flows; the GitLab job does not replace that broader qualification.

## Guidelines
- `.upstream/` is pinned and never edited, so upstream updates stay a clean pull.
- Creating a client never overwrites an existing folder, and one client's build never includes another client's source or data: each client's data is confidential.
- Imported documents never run anything: no eval, Function constructor, shell, Python or executable SQL.
- Reference data and geometry are labelled synthetic; no invented client evidence, accuracy or production status.
- A public build is not access control: client data and assets are approved before anything is published.
- Look at real rendered screenshots, not only source-level tests.

How work flows: the fleet guideline every session loads (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`). CI recipe and runners: datapass-fleet-facade `AGENTS.md`.

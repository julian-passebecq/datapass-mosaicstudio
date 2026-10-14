# galaxy-finition

A selected-client status board and architecture graph for the **Galaxy Finition pass of 13 Oct 2026**: the 13 retained apps (status, version, destination category), the 5 apps paused by the owner, and the dependency graph built from the `dependency_keys` of the pass dispatch packet.

## Data: owner-supplied snapshot, not live data

`data/pass.json` is a **screened, owner-supplied status snapshot** of the pass log taken at **2026-10-14 01:40 (+02:00)** (last journal entry at that time; all 13 retained apps DONE since 00:56, Contoso 0.3.0 and Rayfin 0.4.1 published, ConceptMotion 1.2.0 published after 1.1.1). It is not read from any live system and is not release evidence: statuses are written as in the pass log (DONE, PUBLISHED, RATIFIED, VERIFIED_NO_CHANGE, STAGED, PAUSED_BY_OWNER). The PbiBench status records what the log says: done under NO_MERGE, the pull request was merged afterwards and the keep-or-revert decision is open with the owner. The previous snapshot (00:35) still showed Contoso and Rayfin as STARTED.

Allowed fields only: app key, display name, repository name, version string, status and destination as a **generic category** (for example "private GitLab vault", "private GitLab package registry", "private GitHub draft release", "staged, no destination"). Paused apps carry only their key, name and `PAUSED_BY_OWNER`. No paths, links, hostnames, session ids, hashes, user names or receipts. The generator that read the private pass files is not committed; `pass.ts` re-screens the JSON and fails closed on unknown fields, dangling edges or private-looking values.

Graph edges are `app -> listed app` from `dependency_keys`, restricted to the 18 apps of the pass (satellite repositories of the paused DataPass VS Code app are not drawn). They are declared relations, not measured calls or data lineage; mutual declarations show as cycles in the review panel.

## Commands

- Preview: `npm run client:dev -- galaxy-finition`
- Check: `npm run client:check -- galaxy-finition`
- Build only this site: `npm run build:client -- galaxy-finition`
- Tests: `node --experimental-strip-types --test tests/galaxy-finition.test.mjs`, browser `npx playwright test tests/browser/galaxy-finition.spec.ts`

Selected-client build only: not part of the default production workbench or the public reference client list. No deployment is implied.

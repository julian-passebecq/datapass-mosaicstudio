# Engine consolidation recovery receipt

## Verified starting point (2026-10-04)

Repository: `julian-passebecq/datapass-mosaicstudio` only.
Working branch: `feat/studio2-engine-consolidation`, stacked on `feat/studio2-choreography-pro`.
Qualified baseline: `a6c42abaf111cd317d06501211f70bcc116875f8`.
Exact source tree: `d55fd482eb8b634e737ae64d1bc4a8b0e491dcc1`.

The live branch, draft PR #9 and latest Actions run agreed on this source.
Run `37134216508` completed successfully. Evidence artifact `11278755796`
was downloaded again; its bytes matched SHA-256
`04500c9063ed60a51395c376f9de9b285490426eadf3db90e907a42ec82ea770`.
The source archive reconstructs the exact Git tree above, not an approximation.
The artifact reports 87 browser passes, 16 isolated-client passes and 16 payload
passes. These are HISTORICAL baseline results, not results for a new commit.

## Historical work: do not restart it

| Work | Disposition | Current evidence / boundary |
| --- | --- | --- |
| Foundation Artifact, Run, ContextInspector and semantic navigation | PRESERVED | `src/framework/foundation`, `foundation-reference`, foundation tests and qualified baseline |
| Intermediate model.ts / Model.tsx collision and unqualified 3D attempt | SUPERSEDED | The subsequent ModelAssets implementation is present and qualified; do not copy the interrupted version over it |
| Static ModelAssets, semantic PartBinding, cameras, modes and fallback | PRESERVED | `src/framework/model-assets`, model-reference; historical PR #8 followed by qualified PR #9 |
| Motion v1/v2, bounded choreography, annotations and export | PRESERVED | Existing Motion controllers, schemas and production browser evidence |
| Missing source/evidence from interrupted conversations | RECOVERED | Exact baseline source and original hashed CI archive retrieved, rather than reconstructed from prose |
| New generic renderer, story player, universal CAD or old Studio migration | NOT NEEDED | Outside this consolidation; the existing optional engines remain authoritative |
| client:dev, structured host startup, reusable custom authoring ergonomics | GENUINELY MISSING / PARTIAL | No client:dev command at baseline; source audit guides the additive changes |

Older instructions to deliver five real clients are historical. This pass
consolidates the engine first; the five future prototypes are a requirement
matrix, not deliverables. No migration of other repositories is authorized.

## Recovery environment

The initial local environment had no outbound DNS and no installed repository
dependencies. This is an ENVIRONMENT FAILURE, not a regression. An exact shallow
baseline commit was reconstructed from Git metadata and the verified source tree.
The read-only Offline recovery kit workflow packages the frozen npm installation,
pinned upstream source and a full Git bundle for disconnected Linux qualification.
It does not deploy, publish packages, change dependencies or write repository refs.
Its artifact is temporary, not a claim of permanent archival storage.

Keep LATEST_WRITTEN_SHA separate from LAST_QUALIFIED_SHA. A new source must pass its
own complete qualification. Do not merge or deploy from a partial receipt.

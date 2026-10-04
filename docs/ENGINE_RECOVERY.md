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

## Resume diagnosis (2026-10-04, PR #10)

Recovered the four existing commits through
`dfb592109efdf94d2f46c4105a5cbc839258d4e4`, tree
`0a2c6deb267a0f0e264cc85110930c970ca12605`, from the CI Git bundle.
The feature branch and `backup/studio2-engine-consolidation-recovery-20261004`
agreed on that exact source. No previous local checkout was available; no
local-only implementation is claimed recovered. Nothing was reconstructed from
chat prose and the preserved implementation was not restarted.

The supplied claim that this SHA had no workflow runs is superseded by live
GitHub evidence: web run `37179770201` succeeded, while engine authoring run
`37179770219` / job `111369791775` failed. The failed engine artifact recorded
20 passing checks and two failures; later checks in those failed scopes did not
run. A successful web gate alone does not qualify this engine increment.

Verified original artifact bytes:

- Web `11294927834`:
  `b5396f05c741417d366851169214f3dc19a2ecc60a6269612028ae44b7908452`.
- Engine `11294477937`:
  `bb1e590f8f91ddad31c63d236422a20dab37f8f617a23f127aa43c33c3f9d021`.

**TEST FAILURE / validation gap:** the generated model/custom story specified
800 ms, below the pinned original StoryPlayer schema's 2,500 ms minimum. Its
render error prevented the plan and deterministic model capture from mounting.
The original parser/player reproduces this failure in `engine-story.test.mjs`.
Use a legal fixture interval; retain the upstream constraint. The manual-pause
browser assertion must wait longer than a whole legal interval, not its previous
1,100 ms. Generated engine compositions now also run through the existing
original-engine contract gate before browser work. Both Node validators resolve
client CSS imports without executing styles, and still reject missing CSS.

**ENVIRONMENT FAILURE:** local Git DNS was unavailable. The verified offline kit
restored only dependencies and pinned upstream sources; its dependency locks
match this source. Local Chromium blocks loopback navigation with
`ERR_BLOCKED_BY_ADMINISTRATOR`; no browser policy was bypassed and no application
assertion was weakened. Run full browser qualification in GitHub Actions.

**SESSION FAILURE / UNKNOWN:** the previous conversation stopped, but its cause
is not established. The changed-file count does not establish a root cause.

Targeted parser/CSS regressions passed; local core tests passed 448/448 and the
eight generated compositions passed strict typing and original visual contracts.
These are pre-commit local checks, not final exact-SHA browser qualification.
Keep `LAST_QUALIFIED_SHA=a6c42abaf111cd317d06501211f70bcc116875f8` until the
complete web and engine gates pass for the resulting exact source. Mongo was
not modified. See the final qualification receipt for the eventual disposition.

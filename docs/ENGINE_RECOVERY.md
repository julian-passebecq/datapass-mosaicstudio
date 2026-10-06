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
At this pre-qualification checkpoint,
`LAST_QUALIFIED_SHA=a6c42abaf111cd317d06501211f70bcc116875f8` remains unchanged
until complete web and engine gates pass for the resulting exact source. Mongo was
not modified. See the final qualification receipt for the eventual disposition.

### Engine repair verification and visual evidence correction

Repair source `b6f78e7f961592b1d708152ade2408d0400c92b2` passed all 32 engine
checks in run `37181789415`, job `111375663299`, using Node 22.16.0 and Chrome
154.0.8037.57. The clean source tree stayed unchanged; eight generated fixture
compositions and their inventory were preserved. Artifact `11296035008` was
downloaded and matched SHA-256
`cbbedbce8b2205b3c4cfd43d46001c4fe3be10ecc54eb90f09e9f523c5ae86db`.
This engine-only receipt does not stand in for the complete web gate.

**VISUAL EVIDENCE GAP:** reviewing the actual model capture showed that its
1,000px viewport framed the guide and semantic plan, leaving the loaded GLB
surface below the image. The full-page cross-view screenshot already showed the
model correctly. The capture test now explicitly requests the supported 2,160px
viewport and asserts that exact height; the capture engine and limits are
unchanged. A separate reduced-motion model/guide screenshot is also preserved.
Requalify this final test/documentation checkpoint at its own SHA; do not relabel
the earlier screenshot or infer its pixels from a successful GLB request.

The stable acceptance/limits map is `ENGINE_QUALIFICATION.md`. The final draft
PR #10 and delivery receipt carry the exact final source, full gate results,
reviewed screenshots and artifact hashes, rather than a self-referential SHA
inside a committed document.

### Visual review found and repaired a lazy-capture readiness race

Source `f0f2511d219e0116f9f56de216fdfa9bd6a54ed6` passed the 32 engine assertions
in run `37182212848` / job `111376886759`, but its actual taller model screenshot
still showed `Loading optional model viewer...`. The artifact bytes
`11294919478` matched SHA-256
`2e0a17ffcda1ec2334fa5eaddf967cc05602ba70dadb558b57d2c27821384b86`.
That intermediate source is NOT the visually qualified delivery: requesting a
GLB and exporting the intended view state did not prove a rendered model.

**CODE FAILURE / TEST EVIDENCE GAP:** the nested model Suspense fallback used
`model-note`, not either loading selector, and lacked the existing capture busy
marker. An empty set of mounted renderer statuses could therefore satisfy the
capture predicate while the selected model's lazy module was pending.

A red-then-green regression now renders the real ModelBlock with React's static
renderer and checks that its actual Suspense fallback declares
`data-capture-state="busy"`. That one attribute is the only ModelAssets code
change in this recovery; geometry/profile validation, loading, cameras and the
Three renderer remain unchanged. Capture now also requires a mounted model
canvas whenever model view is selected, rechecks readiness after UI state export,
and records observed model status/selection/camera/canvas state. The browser
acceptance requires `3D ready`, a settled nonzero canvas and complete canvas
framing inside the explicit viewport. Inspect the resulting pixels again.

Do not promote any earlier green assertion report over this visual finding.
The subsequent exact source must pass the full web and engine gates plus visual
review. No test count, schema limit or payload budget was lowered.

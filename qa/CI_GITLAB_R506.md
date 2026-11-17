# R506: private GitLab CI

2026-11-17. Coder: Codex gpt-6.1-sol, medium effort.

GitHub remains canonical. Created the private mirror at
https://gitlab.com/juliandatapass-group/datapass-mosaicstudio (project 89063517),
with hosted runners and Auto DevOps disabled. Pushed the existing `origin/main`
as `main` and the work branch with normal pushes, without merging.

The Windows job is pinned to `local-windows, imac`, uses the frozen npm lock
and pinned upstreams, checks generated contracts, runs the real `npm test`
suite, builds production modules (including TypeScript checking), validates
clients and checks visual engine contracts. Every native command's exit code
is propagated. Git checkout uses LF bytes for source-copy comparisons.

Coverage limits: this job does not install Python packages or run Playwright,
Python-only suites, isolated client builds or release qualification. Optional
Python integrations in `npm test` retain their existing environment-based
skips. The broader GitHub Actions workflow remains in place. A green GitLab
job is evidence for the listed checks, not a full release qualification.

Problems resolved: local `glab` authentication was incomplete; the existing
hub `glab` authentication supplies the scoped Git credential helper over SSH,
without copying credentials into this checkout. Connect's host/session and CI
receipts were stale; live GitLab runner and pipeline APIs are used for proof.
The backlog's claim of no CI was stale: GitHub Actions already existed.

Validation: the GitHub PR body records the final head SHA, the exact-head
GitLab pipeline URL/status and the independent review result. Pipeline history:
https://gitlab.com/juliandatapass-group/datapass-mosaicstudio/-/pipelines?ref=ci%2Fgitlab-pipeline

Independent Sonnet 5.5 high review of the initial CI commit found no blocker.
Its coverage concerns are documented above and in AGENTS.md; added an explicit
Node 22.16 minimum check. A fresh mirror has no earlier CRLF checkout to reuse;
the job's checkout environment keeps LF for subsequent runs.

Open questions: none. Rollback: revert the CI/documentation commits on GitHub
and push the reverted branch to the mirror; leave the private mirror and its
pipeline history intact. No deployment or merge was performed.

The first real run on `imac` failed in upstream bootstrap because Git refused
deep Windows paths. Added job-scoped `core.longpaths=true`, inherited by the
bootstrap's child Git commands. The red run also proves failures propagate:
https://gitlab.com/juliandatapass-group/datapass-mosaicstudio/-/pipelines/3079625071
The shared imac runner had a queue of about 20 jobs, so qualification used a
temporary project runner on the same machine, with the same tags and shell,
an isolated build folder, and one job per invocation. Its registration is
removed after each run; the shared runner and other jobs are untouched.

Local verification passed: 836 tests passed, 6 skipped, 0 failed; contract drift,
production build/typecheck and all 20 client/visual contract checks passed.

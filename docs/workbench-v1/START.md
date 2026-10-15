# Mosaic browser workbench V1 - implementation

TARGET=CHATGPT.COM

Owner requested implementation in the conversation on 2026-10-10. This is a new additive workbench surface in the existing MosaicStudio repository, not a replacement framework or public deployment.

Pinned baseline: 6f45dd06e95ee66d693fc08fb4369c2a6379e84c. Companion VSIX baseline: 544c4207d93975292fecd8e603feeda589315b88. The VSIX has an existing unmerged learning implementation in PR #72 at ee9f8c1dca0ca6725a27623974bf8a5fee7eddea; reuse it rather than duplicate it.

Selected outcome: blank notebook and optional samples, SQLRooms-backed SQL, source-preserving notebook/canvas views, Monaco editing, explicit browser Python, cancellable execution, source-only portable exports, explicit native-runtime integration, and infrastructure study/observability in the VSIX. Existing root workbench, framework, reference clients and native training labs remain available.

A build is not a release. No tag, merge, deployment, public asset approval or Windows qualification is implied. No user Windows worktree is accessible from this execution surface. Remote branch work is isolated; no local D:\\PROJ path is claimed verified.

Recovery: the V1 check emits an exact-commit source archive, lock hashes and a bounded offline development kit using the repository's existing recovery pattern. It contains no Git credentials or environment files. Required pre-existing CI jobs remain unchanged. Native adapters must preserve trust, cancellation, runtime identity and source revision; imported notebook content never executes on import.

Implementation status and qualification will be recorded in RESUME.md and the feature/UX acceptance tables before delivery.

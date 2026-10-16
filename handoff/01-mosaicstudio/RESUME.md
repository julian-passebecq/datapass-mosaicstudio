> **Newest (2026-10-16, V2 night):** V2 F201-F213 approved (PR #78) and running as one overnight workflow; wave plan, briefs, stop conditions and owner defaults: [`v2-night-2026-10-16/WAVES.md`](v2-night-2026-10-16/WAVES.md). Status per feature: [`v2-night-2026-10-16/STATUS.md`](v2-night-2026-10-16/STATUS.md). Stop: a feature after red twice on the same fix; the night if main's CI is red beyond one PR or a stored format/rollback check would break.

> **Newer (2026-10-14):** MosaicStudio **0.11.1** built from `3575e6b` (contains the `_headers` CSP fix #73) and delivered to the private vault under `0.11.1-3575e6b`: receipt [`qa/REL-0.11.1.md`](../../qa/REL-0.11.1.md), outcome [`release-0.11.1-2026-10-14/OUTCOME.json`](release-0.11.1-2026-10-14/OUTCOME.json). 0.11.0 record: [`qa/FIN-0.11.0.md`](../../qa/FIN-0.11.0.md), [`finition-2026-10-13/OUTCOME.json`](finition-2026-10-13/OUTCOME.json). Next: E2E-05 joint run against >= 0.11.1; licence stays an owner gate.

> **Newer:** the 0.10.0 full-release resume point (2026-10-10) is [`full-release-2026-10-10/RESUME.md`](full-release-2026-10-10/RESUME.md); this file is the 0.9.0 record, kept unchanged below.

# Resume: 01-mosaicstudio (MosaicStudio 0.9.0)

- **State:** review-ready PR from `feat/technical-site-sdk-0.9`; qualified commit `20ef865`, CI run 37863555025 green. Not merged: no LAUNCH.txt merge authorization was given in the session.
- **Worktree:** `D:/PROJ/datapass-mosaicstudio/.claude/worktrees/technical-site-sdk-authoring-80110b` (local branch `claude/technical-site-sdk-authoring-80110b`). Merged sub-branches: `claude/runtime-runs-api` (786c954) and `claude/sdk-release-preview` (2c153c6).
- **Processes:** none left running. Journeys start and stop `py/service/app.py` on port 8799 themselves.
- **Evidence:** `docs/RELEASE_0.9.md`, `qa/UX03_JOURNEY_0.9.md`, `qa/PAYLOAD_0.9.md`, `handoff/01-mosaicstudio/READY.json` and `OUTCOME.json`.
- **Blockers:**
  - F08: no peer concept-spec exporter exists.
  - Canonical vscode runtime browser access needs work in that repository.
- **Not run:** Positron/native VS Code gate; cloud (not authorized).
- **Next safe action:** review and merge on green CI. If the PR needs changes, push to `feat/technical-site-sdk-0.9`; CI runs on push.

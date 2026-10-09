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

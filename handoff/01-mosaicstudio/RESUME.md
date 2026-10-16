> **Newest (2026-10-16, 0.12.0 delivered):** MosaicStudio **0.12.0** built from `c6f5b97` (squash of #94: V2 F201-F213 + CSP-1 #77), qualified on the shipped bytes (Q1 workbench, Q2 SDK/CLI/clients, Q3 A/B and rollback: all PASS; one stock upgrade script not applicable) and delivered to the private vault under `0.12.0-c6f5b97` (8 files, re-download 7/7 OK). Receipt [`qa/REL-0.12.0.md`](../../qa/REL-0.12.0.md), outcome [`release-0.12.0-2026-10-16/OUTCOME.json`](release-0.12.0-2026-10-16/OUTCOME.json). 0.11.1 untouched. Nothing waits on T3; E2E-06 stays NOT_RUN/BLOCKED as history. Next (agent, optional): omissions 1-4 of the receipt. V3 stays CANDIDATE until the owner approves it. Owner: licence decision before any public publication.

> **Newer (2026-10-16, release 0.12.0 commit):** release commit for **0.12.0** (V2 F201-F213 + CSP-1 #77) on branch `release/0.12.0`: version, `docs/RELEASE_NOTES.md`, `docs/CONSUMING.md` (0.11.1 → 0.12.0 and rollback), standalone viewer and licence inventory. Next (agent, nothing waits on T3): build 0.12.0 from the merged release commit with the 0.11.1 recipe (`qa/REL-0.11.1.md`, deterministic workbench zip from `qa/FIN-0.11.0.md`), pack and verify the runtime companion (`npm run runtime:pack && npm run runtime:verify`), deliver privately under a new immutable path, write `qa/REL-0.12.0.md` and its OUTCOME. Release 0.11.1 stays untouched. **T3 is not a dependency (Julian, 16 Oct):** E2E-06 stays NOT_RUN/BLOCKED as history only and gates nothing. Owner: licence decision before any public publication.

> **Newer (2026-10-16, V2 night):** V2 F201-F213 approved (PR #78) and **all 13 merged** (#80-#92, F212 loop PASS on contoso-shape-analytics and foil-wind); next: V3 stays CANDIDATE, owner gates in STATUS.md; wave plan, briefs, stop conditions and owner defaults: [`v2-night-2026-10-16/WAVES.md`](v2-night-2026-10-16/WAVES.md). Status per feature: [`v2-night-2026-10-16/STATUS.md`](v2-night-2026-10-16/STATUS.md). Stop: a feature after red twice on the same fix; the night if main's CI is red beyond one PR or a stored format/rollback check would break.

> **Newer (2026-10-14):** MosaicStudio **0.11.1** built from `3575e6b` (contains the `_headers` CSP fix #73) and delivered to the private vault under `0.11.1-3575e6b`: receipt [`qa/REL-0.11.1.md`](../../qa/REL-0.11.1.md), outcome [`release-0.11.1-2026-10-14/OUTCOME.json`](release-0.11.1-2026-10-14/OUTCOME.json). 0.11.0 record: [`qa/FIN-0.11.0.md`](../../qa/FIN-0.11.0.md), [`finition-2026-10-13/OUTCOME.json`](finition-2026-10-13/OUTCOME.json). Next: superseded by the 0.12.0 entry above (E2E-05 joint run stays optional evidence, not a release gate); licence stays an owner gate.

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

# Families / replay checkpoint

Base: 8c769f3805946ca692a11720cb22d56d702bbd13 on the preserved v0.3 branch.
Working branch: feat/studio2-families-replay.

Before hosted qualification:
- 216 local unit/boundary/controller tests passed, using the pinned original VizForge player.
- Strict TypeScript and all five reference client contracts passed.
- Original VizForge / ConceptMotion contract checks passed, including replay charts.
- The actual selected energy client built successfully, emitted a capability/module report and separated its optional scene chunk.
- The local integrated workbench build exceeded the execution time budget during dependency transformation. This was not a successful full build.
- Local real-browser HTTP navigation was blocked with ERR_BLOCKED_BY_ADMINISTRATOR. It was not bypassed. The hosted workflow must provide the real browser/build gate and screenshots.

No dependencies or upstream pins were changed. Root package-version metadata and generated schemas are to be recorded once after the successful branch-scoped full gate, as in the previous pass. No merge, deployment or final Foil'o site is claimed.

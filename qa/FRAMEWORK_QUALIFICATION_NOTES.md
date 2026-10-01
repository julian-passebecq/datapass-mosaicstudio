# Framework qualification notes

First full source run: 36929920306 at 071cca6998b6eda42049fd651429107a02f164f8.

- Genuine npm lock generation, npm ci, schema generation and all 120 unit tests passed.
- The strict build caught a missing JSX closing brace in the saved-input review callback. No browser success is claimed for that run.
- After correction, the exact CI dependency capsule was used locally: full tsc --noEmit, production workbench build, all three client contract checks, original VizForge schema checks, and the selected operations client build passed.
- Local HTTP browser navigation is blocked by the managed Chromium policy (ERR_BLOCKED_BY_ADMINISTRATOR), and Python DuckDB is not installed locally. Those are environment limits, not passing application tests. Full HTTP/browser and synthetic-fixture qualification stays in the GitHub Actions gate.
- The one-off development dependency capsule was retrieved for diagnosis. Its automatic upload is now removed to avoid repeated 308 MB diagnostic artifacts. Normal source/build/browser evidence remains.

This is a progress record, not the final successful-run report. Consult the latest exact-SHA run and PR #3 qualification comment.

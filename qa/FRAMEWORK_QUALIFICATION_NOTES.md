# Framework qualification notes

First full source run: 36929920306 at 071cca6998b6eda42049fd651429107a02f164f8.

- Genuine npm lock generation, npm ci, schema generation and all 120 unit tests passed.
- Strict build caught a missing JSX closing brace in the saved-input review callback. No browser success is claimed for that run.

Second run: 36931024618 at 740b0ac1613e327ce50d2890b98875b2f36304ae.

- All 120 unit tests, strict TypeScript, production build, client source checks and original VizForge contract validation passed.
- 19 of 20 production HTTP browser tests passed, including real Three.js, original shared StoryPlayer, models, mobile layout and all existing workbench regressions.
- One genuine UI defect remained: an open Session menu could intercept the error-dismiss action after imported-state validation. The file-import path now closes the menu before opening the review or showing errors; no forced test click was added.
- A separate restore regression now checks that camera and component values are not overwritten by replaying the authored story cue when restoring a different scene index. Scene field controls also respect their declared limits; screenshots can wait for renderer interpolation to settle.

Local checks after the corrections: 121 unit tests and project-wide strict TypeScript pass. All three selected reference-client builds plus a newly scaffolded TSX client build passed locally. Full HTTP and isolated-client browser qualification remains assigned to the actual GitHub run.

Local HTTP navigation is blocked by managed Chromium policy (ERR_BLOCKED_BY_ADMINISTRATOR); Python DuckDB is absent locally. These are environment limitations, not passing tests. The exact CI dependency capsule was retrieved once for diagnosis, and automatic repeated 308 MB capsule uploads were removed.

This is a progress record. Consult the exact successful-run evidence and PR #3 qualification comment before describing the whole gate as passed.

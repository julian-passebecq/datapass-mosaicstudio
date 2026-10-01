# Third-party and donor provenance

This repository composes existing libraries and owner-provided DataPass source. It does not claim authorship of their engines or grant replacement licenses for upstream work.

Installed package metadata inspected for this pass identifies SQLRooms, DuckDB-WASM, Microsoft Fluent UI and React Flow as MIT; D3 as ISC; node-sql-parser as Apache-2.0. React, CodeMirror, UWData Mosaic, Arrow, Radix, Vite and other transitive dependencies retain their own notices and licenses. Review the actual resolved package license files before redistribution; this summary is not an exhaustive license audit.

The two DataPass visual source repositories are commit-pinned in `upstreams.lock.json` and were selected at the owner's explicit request. No root LICENSE file or package license field was found in the inspected VizForge package or ConceptMotion application package. Do not invent an MIT grant for those sources or publish them as a separately relicensed library without clarification from the owner.

The source installer keeps donor checkouts in ignored `.upstream/`. It does not commit their entire repositories, archived overlays, private-client assets or dependency trees. Only selected source entrypoints are imported into the application build. The generated Fluent bridge references official public SVG icon modules; it does not copy icon geometry or distribute font files.

The complete SQL parser is prebundled without dropping dialects. Its generated ESM keeps legal comments. Core library attribution and source pins must survive any packaging or later extraction.

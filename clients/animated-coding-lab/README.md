# Animated Coding Lab (prototype reference client)

Python records, Studio animates. `py/coding_lab_trace.py` really executes `py/examples/normalize_rows.py` under `sys.settrace` and writes every completed line, call and return (line number, exact source text, variables after the step, changed names, returned value) as one `datapass.artifact` v1 table: `public/artifacts/coding-lab-trace.json`. `write_sources` publishes the cited files to `public/sources/` for the code pane and the lineage panel.

The page validates the trace against the published source text (each row's `code` must equal its line), then composes it into the existing ConceptMotion v2 grammar (`labMotion` in `trace.ts`: `move` / `state` / `visibility` plus annotations). The spec is `provenance: "recorded"` and each input row is one token whose label becomes the returned value (`label` command). Progression is the pinned VizForge StoryPlayer (`createMotionController` from `motion/react.ts`, with a playback `speed`), the picture is the shared `MotionViewport` (2D + isometric SVG, finite D3 transitions), and the code pane is the framework `SourceReader` (line click + current line kept in view). No new clock, no animation engine, no Python in the browser.

- CODE: highlighted current line, run counts per line; selecting a line jumps to the next step that ran it.
- VISUAL EXECUTION: each input row is a stable semantic object that enters `normalize()` and is replaced by its returned value, which lands in `results`; KPI strip (processed, total, mean) read from the recorded variables.
- EXPLANATION: step text, source line, input/output, variables (changed ones marked), provenance (artifact, run, producer, input hash) and a link to the Lineage page.
- Controls: play/pause, step -1/+1, scrubber, speed (0.5x/1x/2x: the controller's playback rate on the same clock, never the snapshot), projection, reduced motion (also follows the OS preference). Full transcript. Step, speed, projection and reduced motion are view fields, so saved state and `client:capture` restore an exact step.

Regenerate: `python py/coding_lab_trace.py`. Check: `npm run client:check -- animated-coding-lab`, `node --experimental-strip-types --test tests/coding-lab.test.mjs`, `npm run build:client -- animated-coding-lab && npm run test:coding-lab` (browser qualification, budget, two stable captures; writes `stills/`). `stills/demo.mp4` is a 25 s recording at 2x.

Values are ILLUSTRATIVE readings, not client data.

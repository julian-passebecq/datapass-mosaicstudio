D. Mosaic with no T3 present (0.12.0 c6f5b97)
- Process list (tasklist) matched on "t3" before and after A, B, C: 0 processes. No T3 endpoint was configured or contacted: journey external requests = [] (only 127.0.0.1 workbench/runtime/Jupyter origins).
- grep t3code|t3-code|t3.chat|@t3|T3 Code|T3 server over the unzipped workbench, SDK and runtime companion: workbench 1 hit = false positive (WebGL constant COMPRESSED_RGBA_S3TC_DXT3_EXT in SceneViewport-*.js; other \bt3\b hits are minified identifiers). Companion py: 0. SDK package.json: no t3 dependency; SDK src/scripts: 0 hits.
- SDK docs only (README, GUIDE-0.11, WORKBENCH_AUTHORING, RELEASE_*, roadmap, spec/preview fixtures README): describe T3 as an optional authoring host / T3-neutral preview contract, e.g. GUIDE-0.11 section 4 "no server code, Node process or T3 is needed".
- Result: no T3 runtime dependency; JOURNEY-01 passes with nothing T3 running.

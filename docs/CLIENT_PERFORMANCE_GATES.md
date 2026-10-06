# Selected-client payload gates

The existing isolated build/browser matrix verifies 19 concrete targets: eight reference clients, three product clients (portfolio-showcase, animated-coding-lab, concept-viewer) and eight scaffolded acceptance clients. The count is `Object.keys(clientBudgets).length` in `scripts/check-client-performance.mjs`; a unit test keeps this page in step with it. The matrix asserts source isolation, no other-client payload, no unexpected network, and absence of unrequested heavyweight capabilities. The motion/content route stays free of Three.js and DuckDB; the model route loads geometry only on explicit 3D choice.

The Pro increment adds per-target emitted-JavaScript budgets after the complete matrix. `npm run test:client-builds` now runs the browser/build checks and `scripts/check-client-performance.mjs`. Re-check existing measured results with `npm run test:client-performance`. The machine-readable artifact is `qa/client-performance.json`.

## Measurement and provenance

The metric is the sum of the individually gzipped emitted JavaScript chunks. It includes lazy chunks whether or not the tested page requests them. It is NOT compressed initial network transfer, parse time, memory usage, frame rate, Core Web Vitals or a Lighthouse score.

Baselines come from qualified ModelAssets source `98df6afce557947716d07661d1f884890c31c772`, workflow `37128396156`, artifact `11275837378`, SHA-256 `1ff258d30fcd72baa660c110b9c2bc49a954e7da42f689c0af8f1e3ecd499d3b`. The baseline source and evidence were recovered before this work line. The budgets are engineering guardrails with explicit headroom, not external performance standards.

Examples: the fresh content starter has a 125 KiB ceiling, motion reference 180 KiB, motion starter 175 KiB, operations reference 210 KiB, and model reference 410 KiB. All 19 limits and baseline bytes are checked in the gate source. Raising a budget requires a named requirement and evidence, not just changing a failing number.

Missing clients, duplicated clients, unknown targets, failed browser status, absent/nonfinite measurements and mutated framework source fail the gate. Partial output cannot be labelled a passed matrix. Twelve negative/boundary unit tests protect this accounting.

## Scope limits

These limits do not cover future approved production asset sizes or prove mobile device performance. Real Galaxy/Foil'o/portfolio clients still need target-device, keyboard/screen-reader, font/zoom, network and production-asset checks. Static publication metadata and robots rules are not access control. Source-excerpt export opt-in does not make a publicly bundled excerpt private.

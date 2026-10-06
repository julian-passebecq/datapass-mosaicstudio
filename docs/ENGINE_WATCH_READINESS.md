# Selected-host readiness: retain immediate edits across Vite restart

Source `6f8bea24480b36c6f9f57b48d8b39377323affeb` failed engine run
`37183351525`, job `111380171060`, at publication refresh immediately after a
capability-triggered restart. The HMR edit itself passed. The independent
content, model, replay, responsive graph and capture checks subsequently passed;
remaining dev checks and the final source-preservation check were not executed.
Artifact `11296495276` matched SHA-256
`f22fc31bc3e6100e97821217b9d5535a547483141e1b858d5820c7bd018b4f16`.

## Observed code failure, not a reason to extend a test timeout

A controlled local probe running the same pinned Vite with an owned stdin pipe
reproduced the old host failure: `startClientDev` returned ready while
`server.watcher.getWatched()[clientRoot]` was undefined. An immediate capability
edit was lost. The probe then stopped cleanly. Repeating that same owned-process
probe with the repair preserved three immediate capability/publication/capability
cycles and verified each new publication title in actual HTTP output.

A listening/restarted Vite server is not sufficient evidence that its new native
watcher has scanned the selected source files. The original host reported ready
immediately after `listen`/`restart`. A save during the watcher's initial crawl
can be absorbed without a subsequent hot-update event. This explains the local
reproduction; the earlier HMR attempt without socket diagnostics still has no
independently established packet-level root cause.

## Bounded repair over the existing watcher

Before initial or post-restart ready, the host now requires the public native
watcher's `getWatched()` inventory to cover the selected client's regular files.
It adds no second watcher, server, daemon, process protocol or dependency. Native
watch events plus a bounded 25 ms readiness poll handle a crawl that completes
without another observable event under `ignoreInitial`. The barrier has a 10-second
deadline, actionable missing-file diagnostics, error propagation, cancellation
and listener/timer cleanup. Ignored tool trees and symlinks are not traversed.
The restart-in-progress guard is released before publishing ready, so a caller's
immediate next save can queue its own necessary restart.

Six unit regressions cover partial/already-complete coverage, absent follow-up
events, cancellation, watcher error and timeout. `tests/engine-host-watch.mjs`
exercises the real host in an owned process through three rapid cycles and HTTP
checks. It is an additional mandatory engine check, not a substitute for browser
HMR, metadata, invalid-source recovery or shutdown assertions. The existing
browser timeouts and all payload budgets remain unchanged.

The final source must pass both complete workflows and visual review. This note
records a mechanism and local red/green evidence, not a final qualification claim.

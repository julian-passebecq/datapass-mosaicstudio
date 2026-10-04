# Local authoring and host contract

Use Node >=22.16 and the committed lockfiles. From a clean checkout:

```sh
npm ci
npm run client:new -- my-lab --family analytics --custom
npm run client:context -- my-lab
npm run client:dev -- my-lab
```

The command validates the client ID, bootstraps the pinned upstreams, prepares
locked Fluent imports, checks the definition/assets, and starts the EXISTING Vite
selected-client entry. It does not start a second application server, install an
IDE extension, deploy, open cloud resources or edit framework source for the client.
The console prints the exact `http://127.0.0.1:5173/?app=my-lab` URL. A busy port is
an error, not permission to kill its owner or silently choose a different URL.
Use `--port 5178` explicitly when appropriate. Browser-blocked ports are rejected.

## Machine-readable status v1

```sh
npm run client:dev -- my-lab --port 5178 --json
```

With `--json`, the Node command emits newline-delimited JSON to stdout and
preparation diagnostics to stderr. `npm` itself may print a preamble: hosts should
invoke the Node script directly or select records by `format=datapass.client-host`.
The latest record is atomically mirrored in `.generated/client-host-my-lab-<pid>.json`.

Fields: `format`, `version=1`, `clientId`, `pid`, `status`, `url`, `capabilities`,
`buildTarget`, `descriptor`, and `message` on error. Statuses: preparing, ready, restarting,
invalid, stopped, error. `url` is present only when ready. Ready means validated
source and a bound dev listener, NOT browser/runtime qualification. The descriptor
is a receipt, not authority to kill a process whose PID may have been reused.

Vite owns source HMR. Capability/publication edits trigger a Vite restart so
compile-time feature flags do not stay stale. Invalid source produces an invalid
record and Vite's normal overlay; another saved edit can recover. SIGINT/SIGTERM
close this process's server and publish stopped before Vite exits. SIGTERM may
retain exit code 143, reflecting the requested signal. There is no detached daemon.

The server is loopback-only, not an access-control boundary between trusted local
users. A selected entry avoids importing other clients; it is not a promise that
every repository path is hidden from a developer who controls the machine.

## Source-first composition

Families select starter content, not runtime silos. `--custom` is additive for all
five families and the existing motion/foundation/model addons. The scaffold never
overwrites an existing client. Read `CLIENT_GUIDE.md`, then the generated focused
context. It lists actual top-level client files, used blocks, selected recipes,
lightweight public hooks and relevant tests, rather than every donor repository.

See `docs/recipes/custom-visuals.md` for SVG/Canvas/D3/graph ownership, semantic
selection, original story/replay consumers and generic opt-in scroll binding.
Business outputs remain immutable datasets/artifacts. View, camera, selection and
presentation steps are not new model inputs or implicit calls to runTask.

## Target-state capture

```sh
npm run client:capture -- my-lab --page custom-lab --out qa/captures/my-lab-first
npm run client:capture -- my-lab --state saved-inputs.json --out qa/captures/my-lab-restored
```

The CLI builds only this selected client, launches a loopback production preview,
restores state through the normal reviewed UI, verifies an actual export matches,
waits for fonts/images/custom readiness, then captures a fixed viewport. Defaults:
1440x1000, device scale 1, reduced motion, light scheme, en-US, UTC. Override width,
height and port within documented bounds. A supplied state and --page must agree.
A new output directory is required; previous evidence is never overwritten.

Output: capture.png, state.json and metadata.json with screenshot/state/build-file
SHA-256s, exact browser/Node, viewport, source HEAD and dirty flag, request paths,
errors and limits. Failure emits failure.json and no successful receipt. Metadata
is not a scientific/model validity assertion. A dirty source is explicitly dirty,
not qualified at HEAD. Saved inputs and embedded data may be sensitive: inspect
before publishing. External HTTP requests are blocked during this offline capture.

This is a reproducible target-state tool within a fixed environment, not guaranteed
cross-OS/GPU pixel identity. It is not video production or a substitute for the
original story player. Capture does not click Run; trusted custom source retains
responsibility for its own mount effects and readiness/error signals.

# Preview descriptor v1 (`datapass.preview/1`)

A `preview.json` file sits at the root of one built static app folder and describes it, so that any viewer (a file browser, a review tool, a local launcher, an optional third-party host) can list the app, check its files and know how it can be opened, **without reading the app's code**. It is inert metadata: it grants no access, holds no credentials, names no hosting provider and implies no deployment.

| File | Purpose |
|---|---|
| `preview.schema.json` | JSON Schema 2020-12 (structure and bounds). `$id`: `https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/preview/v1/preview.schema.json` |
| `scripts/preview-validate.mjs` | Dependency-free validator that mirrors the schema and adds the cross-reference rules; `--check-files` re-hashes the folder |

Producer today: `npm run build:client -- <id>` writes `dist-clients/<id>/preview.json` after a successful build.

## Document

```json
{
  "format": "datapass.preview", "version": 1,
  "app": {"id": "motion-reference", "title": "Motion / reference app", "variant": "client"},
  "entry": "index.html",
  "sdkVersion": "0.8.1",
  "sourceCommit": "8b22d9c121743d8cd5e78ca74098c5e332e4e45c",
  "publication": {"mode": "preview", "noindex": true},
  "capabilities": ["motion"],
  "files": [{"path": "index.html", "bytes": 1234, "sha256": "…64 lowercase hex…"}],
  "artifacts": [{"id": "coding-lab-trace", "path": "artifacts/coding-lab-trace.json", "sha256": "…", "provenance": "computed"}],
  "open": {"file": false, "httpLoopback": true},
  "csp": "default-src 'self'; …"
}
```

| Field | Rule |
|---|---|
| `app.id` | `^[a-z][a-z0-9-]{0,59}$` (the client id) |
| `app.title` | 1-160 characters, no control characters |
| `app.variant` | `client` (one selected client), `workbench` (the full studio) or `standalone` (a single self-contained HTML file) |
| `entry` | Relative path of the page to open; must be listed in `files` |
| `sdkVersion` | `package.json` version of the SDK that built the folder (`x.y.z[-pre]`) |
| `sourceCommit` | 40 (or 64) lowercase hex Git commit, or `null` when the build came from uncommitted changes or outside Git |
| `publication` | `mode` copies the client's publication profile (`preview` by default); `noindex` is true unless `public`. Robots directives are not access control |
| `capabilities` | Capability ids the build planned (for example `charts`, `motion`, `spatial`), unique, at most 32 |
| `files` | Every regular file in the folder except `preview.json` itself, sorted, unique, 1-2000 entries; `bytes` and lowercase `sha256` of the exact bytes |
| `artifacts` | Files under `artifacts/` that validate as `datapass.artifact/1`; `provenance` is the artifact's own declared kind (`synthetic`, `provided`, `computed`). Each `path` must be in `files` with the same `sha256`. Declared provenance is not proof of execution |
| `open.file` | `true` when double-clicking `entry` from disk works. Client builds use module scripts, so `false` |
| `open.httpLoopback` | `true` when any static server on `127.0.0.1` serving the folder works |
| `csp` | The Content-Security-Policy the folder ships (`_headers`), at most 4096 characters. A host that can set headers should apply it |

**Paths** are relative POSIX paths inside the folder: no leading `/`, no drive letter, no backslash, no empty, `.` or `..` segment, characters `A-Z a-z 0-9 . _ ~ @ + -` and `/`, at most 260 characters. Unknown fields are **rejected** (`additionalProperties: false`); a future change of shape is `datapass.preview/2` in `spec/preview/v2/`.

## Validate

```sh
node scripts/preview-validate.mjs dist-clients/<id>/preview.json --check-files
```

Exit 0 valid, 1 invalid or a file differs (missing, changed or unlisted), 2 bad usage. `--json` prints `{file, ok, issues:[{path, message}]}`.

## What a consumer may and may not assume

- It may show `app`, list `files`, verify hashes before serving and open `entry` the way `open` says, applying `csp`.
- It must not execute anything because of this file, fetch anything it names outside the folder, or treat `publication.mode: "public"` as permission to publish: publication remains a separate, explicit decision.
- The folder may contain potentially sensitive result data (artifacts). Review before sharing it, like any build output.

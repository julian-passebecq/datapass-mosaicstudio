# Browser now; native hosts later

The implemented capability record reports a browser file picker and explicitly reports **no native DuckLake, Python kernel or native source-location opening**.

## Browser

Current code opens user-selected files as browser File objects, queries DuckDB-WASM and downloads explicit Blob exports. Local file bytes are not automatically uploaded. A same-origin production asset policy is generated. Reloaded sessions do not recover imported files.

Narrative embeds (`?module=stories&embed=1`, `?module=explain&embed=1`) render the existing visual components without creating a database store. The data workbench uses real SQLRooms and a shared connection.

## Electron adapter — proposed, not implemented

Use an isolated preload API for explicitly selected file handles, bounded metadata/query requests and explicit exports. Renderer code must not import Node filesystem APIs or receive raw credentials. Native DuckDB/DuckLake ownership belongs in a separate process with a reviewed catalog and file-authorization policy.

## VS Code / VSIX adapter — proposed, not implemented

Reuse web rendering components, not the whole browser bootstrap unchanged. The extension host owns workspace trust, file picking, `asWebviewUri` resource translation, source navigation and any native runtime. Webviews use a nonce-based CSP and a versioned message protocol. A source link carries an artifact ID and safe relative path, not an arbitrary command URI.

Suggested message envelope: version, request ID, method from an allowlist, bounded payload, cancellation ID and response source/revision. This is design guidance, not an implemented or validated protocol.

## Data boundaries

DuckDB-WASM, native DuckDB, a DuckLake catalog and a remote MotherDuck connection are different execution/ownership choices. Never silently map one onto another or put credentials in an exported page document. Do not create a replacement Mosaic kernel merely to host these views.

Stable reuse should follow two real hosts, not precede them. `src/core/host.ts` currently defines small capability/source/download interfaces; consumers still use the browser adapter. A future host-provider injection needs its own tests.

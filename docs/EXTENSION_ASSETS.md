# Same-origin DuckDB extensions

The first real browser gate exposed an important deployment gap: bundling the DuckDB worker and main WASM does not bundle its dynamically loaded JSON and Parquet extensions. SQLRooms' SQL inspection needs JSON functionality and local Parquet loading needs the Parquet extension.

`prepare-extensions.mjs` mirrors those two official signed extensions for both shipped WASM platforms at build time. The pinned npm package 1.32.0 uses engine v1.4.3. The browser connection selects the same-origin repository before loading them, while original signature checking stays enabled and community extensions are disabled. No unsigned-extension bypass or remote-domain CSP exception is added.

The generated manifest records the source URL, engine/package identity, byte count and SHA-256 of each asset. Cached asset edits fail the build. The first download still relies on the official HTTPS source and the engine's signature verification; the generated manifest is an audit record, not a separately trusted signature authority.

References checked: DuckDB's official WASM extension/deployment documentation and Observable Framework's source-level extension mirroring pattern. The implementation here is original packaging glue, not a copied database engine.

The development build now needs the official extension downloads as well as npm/Git access. Runtime page interactions use the packaged same-origin assets. Additional extensions must be explicitly reviewed and packaged before adding new file formats or geospatial capabilities.

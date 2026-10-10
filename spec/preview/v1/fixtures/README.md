# datapass.preview/1 consumer fixtures

`synthetic-client/` is a versioned, **synthetic** app folder for consumers of `datapass.preview/1` (for example the optional T3 authoring host). It is not a build of any commit (`sourceCommit: null`) and holds no real data.

| File | Role |
|---|---|
| `preview.json` | The descriptor, written by `writePreview` in `scripts/preview-validate.mjs` |
| `index.html` | Entry page |
| `studio-build.json` | Build evidence in the shape `vite.client.config.ts` emits (T3 reads `capabilities` from it) |
| `_headers` | The CSP a static host should apply (the same value as `preview.json` `csp`) |
| `artifacts/orchard-monthly-yield.json` | A synthetic `datapass.artifact` v1 with declared lineage |

Check it:

```sh
npm run preview:validate -- spec/preview/v1/fixtures/synthetic-client/preview.json --check-files
```

Bytes are hashed exactly, so `.gitattributes` marks this folder `-text` (no line-ending conversion). Regenerate `preview.json` with `writePreview` after any change to the folder; `tests/consumer-interop.test.mjs` fails otherwise.

## Compatibility with T3 (`t3code-datapass` origin/main `3dfcecd`, read-only)

What that revision reads from a client folder, and how this fixture relates (asserted in `tests/consumer-interop.test.mjs`):

- It requires `index.html` and reads `studio-build.json` `capabilities`. Both are present; the capabilities equal `preview.json` `capabilities`.
- It hashes every file into one digest and serves the folder with the CSP from `_headers`. It **does not read `preview.json`** yet, so the descriptor's file list and hashes are not verified by T3 at that revision; adopting them is a T3-side change.
- It lists contract documents (`artifacts/*.json`, `*.concept.json`) with a top-level check. The artifact passes. Known T3-side gap: its check treats `provenance` as an object for every format, while `datapass.concept-spec` v1 `provenance` is a string, so it reports a false "missing provenance" for every valid concept spec.

# Provenance export bundle (`datapass.bundle` v1, candidate)

A bundle is one JSON file that carries a provenance file set as exact strings, so it can be exported in one place and
validated elsewhere with the same hashes (F208, U207). The format is a **candidate**: `status` is `candidate` and the
name may still change before it is declared stable. It is not a signature, a release, verified cloud lineage or access
control.

## What is inside

| File | Content |
|---|---|
| `artifacts/<id>.json` | Each `datapass.artifact` v1 document, byte for byte as exported (never re-serialized). |
| `runs.json` | `datapass.bundle-runs` v1: run references (ids, task, app, declared model/provider, outcome, times, the artifact path and hash, the ResultStore hash when the run was saved durably). |
| `inputs.json` | `datapass.bundle-inputs` v1: the captured input values of each run. They may be sensitive. |
| `lineage.json` | `datapass.bundle-lineage` v1: what each artifact's producer declared (kind, source, run, input hash, dependsOn). MosaicStudio did not observe or rerun it. |
| `SHA256SUMS` | One `<sha256>  <path>` line per other file, sorted by path. Its own SHA-256 identifies the bundle. |

Each file entry is `{path, mediaType, bytes, sha256, text}`; `sha256` is the SHA-256 of the exact UTF-8 `text`.
Schema: `spec/bundle/v1/bundle.schema.json` (structure). Hashes, SHA256SUMS, members and cross-references are checked by
the validators; refusals carry `DP-BUN-nnn` codes (`docs/DIAGNOSTIC_CODES.md`).

## Export

- A page with a `runs` block shows **Provenance bundle** under the run workbench: it exports the retained, successful
  runs of that page after the sharing checkbox is ticked.
- The artifact viewer (`?artifact=1`) exports the open artifact file as a bundle, after the same review.
- Code: `exportBundle({title, artifacts:[{text}], runs, secrets})` from `src/framework/foundation/bundle.ts`;
  `bundleFromRecords(records)` maps journal records; `bundlePort()` is the StorageAdapter tier 3 implementation.

Nothing is written implicitly. The export refuses (no redaction) a token-shaped key (`DP-BUN-009`) and any file that
would contain the paired runtime token (`DP-BUN-010`).

## Validate elsewhere

```bash
# Python, standard library only (works outside a checkout next to py/datapass_artifact.py)
python py/datapass_bundle.py validate my-run.datapass-bundle.json
```

```powershell
python py\datapass_bundle.py validate my-run.datapass-bundle.json
```

Each file prints one JSON line: `{"ok": true, "bundleSha256", "files"}` or `{"ok": false, "code", "where", "message"}`;
the exit code is 1 when a file is refused. Opening the same file in the artifact viewer shows the same file hashes and
bundle identity. `tests/fixtures/bundle/` (synthetic) pins both validators to the same decisions and hashes.

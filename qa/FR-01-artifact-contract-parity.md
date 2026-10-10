# FR-01 Artifact contract parity (JSON Schema / TypeScript / Python)

Packet galaxy-full-release-2026-10-10 / 01-mosaicstudio. Baseline main `6f45dd0`. Branch `claude/artifact-contract-parity`, PR #46.

## What was wrong at the baseline (observed, not assumed)

| Leg | Drift | Proof |
|---|---|---|
| JSON Schema `docs/contracts/artifact.schema.json` | No `provenance.producer`, `inputs`, `inputHash`, `dependsOn`, no `representation.inputs`, with `additionalProperties: false`; blank titles/labels accepted | The baseline schema rejects all 11 actual Contoso and FOIL exports checked locally (`/provenance/producer`, `/provenance/inputs`, `/provenance/inputHash`, `/provenance/dependsOn`); 17 corpus fixtures decided differently from the structure gate |
| Python mirror `py/datapass_artifact.py` | `re.match` + `$` accepted a trailing newline in ids and `inputHash`; `version: true` accepted (`True == 1`); `str.strip()` whitespace differs from ECMAScript (U+FEFF, U+0085); `1.0` refused as an integer; metric rows compared with Python `str(2.0)` = `"2.0"` instead of JavaScript `"2"` | 7 corpus fixtures decided differently from TypeScript by the baseline mirror |
| TypeScript | Lengths counted in UTF-16 units; JSON Schema `maxLength` counts code points | `edge-astral-title` (160 astral characters) |

## Contract after FR-01

- One set of bounds (`src/framework/foundation/artifact-limits.ts`, mirrored in Python): 1 MiB compact UTF-8, 10,000 rows, 40 columns, 12 representations, 24 inputs, 8 evidence links per producer/input, 12 `dependsOn`, evidence lines 1..100000, evidence paths at most 260 characters, relative, forward slashes, no drive, backslash, control character, empty, `.` or `..` segment. `inputHash` is exactly `^[0-9a-f]{64}$`. Every lineage field is optional; plain v1 files (for example the file committed at `6e97cae`) stay valid.
- `additionalProperties: false` is kept on every object; nothing was relaxed globally.
- Three explicit gates, same order in TypeScript and Python:
  1. envelope: inert finite JSON, depth 24, 500,000 nodes, no prototype keys, 1 MiB compact UTF-8 (JSON Schema cannot see this);
  2. structure: exactly the JSON Schema (types, required and unknown fields, enums, lengths, patterns, list bounds, unique id lists);
  3. semantic: duplicate input/column/representation ids, evidence ranges (end before start, duplicates), self-dependency, undeclared representation inputs, payload/representation compatibility, chart/metric references, row cells and row keys. `validateArtifactSet` / `validate_set` add unique ids and `dependsOn` cycles across a bundle.
- Every rejection names its gate and the JSON Pointer of the offending field (`ArtifactValidationError.gate/.path`, `artifactDecision()`; Python `ArtifactError.gate/.path`, `decide()`, CLI `python py/datapass_artifact.py [--set] FILE...`). The UI shows the same text, for example `The run output failed datapass.artifact v1 validation: /provenance/inputHash: ...`.

## Shared corpus

`tests/fixtures/artifact-corpus` (all SYNTHETIC, generator `scripts/make-artifact-corpus.mjs`, drift-checked by `npm run contracts:check`):

- 17 valid: legacy v1 (6e97cae file, plain table, plain text), full lineage, Contoso-shaped Gold export, three FOIL-shaped exports (capture series, summary with `dependsOn`, campaign), edge cases (empty rows, empty text, falsy input values, astral title, U+0085 title, safe dotted paths and the 260-character path, integral floats, numeric row keys `2.0`/`1e-7`/`1e+21`, every list at its maximum).
- 91 invalid with expected gate and path: 67 structure, 22 semantic, 2 envelope.
- 3 sets: FOIL-shaped series + summary (accept), `dependsOn` cycle, duplicate id.

`tests/artifact-corpus.test.mjs` (part of `npm test`) decides every fixture with Ajv 2020-12 (pinned dev dependency `ajv@8.17.1`), the TypeScript validator and the Python mirror (spawned `python -I py/datapass_artifact.py`): identical accept/reject, identical gate and path; the schema rejects exactly the structure fixtures and its error list contains the expected path. `py/test_artifact_corpus.py` (part of `npm run test:python`) asserts the Python leg alone.

## Actual Contoso and FOIL exports (private, not committed)

- Contoso: the real `ExportService` of contoso-data-studio origin/main `f2d0c75` was run from an archive copy in %TEMP% on a fresh synthetic workspace (generator, DuckLake, dbt-duckdb 1.11.0 build, export) for all 7 Gold marts.
- FOIL: the 4 exported artifacts committed in datapass-factory-foil origin/main `adcb9e6` (`fixtures/interop/v1`).
- All 11 accepted by the new schema, TypeScript and Python; the FOIL capture pair also passes the set check. All 11 rejected by the baseline schema.
- Stored only in `D:/PROJ/_release-evidence/2026-10-10/mosaicstudio/FR-01/` with `SHA256SUMS.txt`. The committed Contoso/FOIL fixtures are invented look-alikes of the export shape.

## Browser journey

`tests/browser/artifact-contract.spec.ts`: the real Python runtime (`py/service/app.py`) on loopback, a Python cell run, then the artifact altered in transit (hash re-recorded so only the contract can refuse it): refused at the structure gate (`/provenance/inputHash`) and the semantic gate (`/provenance/dependsOn/0`) while the last valid result stays visible as "Previous result"; an untampered run is accepted again. Inspected screenshot: the error banner names the field, the stale banner and the previous result are visible.

## Tests run

See `handoff/01-mosaicstudio/full-release-2026-10-10/receipts/FR-01.json` for the exact commands and counts (local Windows 11 + CI ubuntu-latest).

## Omissions and limits

- The 1 MiB budget is checked on compact JSON; Python formats numbers like `JSON.stringify` but encodes lone surrogates as 3 UTF-8 bytes where JavaScript writes a 6-byte escape. No corpus fixture sits on the byte boundary.
- Integers beyond 2^53 parse exactly in Python but lose precision in JavaScript; not covered.
- The FOIL artifacts are the committed exporter outputs at `adcb9e6`; the FOIL exporter was not re-run.
- The existing browser specs that hard-code port 4173 (foundation, framework, workbench) were not run locally (the local rule requires ports above 20000); CI ran the whole suite.
- Concept-spec (F08) interoperability is not part of FR-01.

# Diagnostic codes

Every refusal of the `datapass.artifact` v1 validators carries a stable code `DP-ART-nnn`. The TypeScript validator
(`validateArtifact`, `artifactDecision`, `ArtifactValidationError.code` in `src/framework/foundation/artifact.ts`) and the
Python mirror (`py/datapass_artifact.py`: `ArtifactError.code`, `decide()["code"]`, the `code` field of the command line's
JSON lines) report the **same code for the same file**. The differential corpus asserts it for every invalid fixture
(`tests/fixtures/artifact-corpus/manifest.json` declares the expected code; `npm run test:artifact-corpus`).

## Rules

- A code names a **rule**, not a message. Message text is unchanged by the codes, may differ between the two languages
  and may be reworded; scripts and tools match on `code` (and `gate`, `path`), never on the message.
- A code is never renumbered or reused. A retired rule keeps its row.
- Source of truth: `src/framework/diagnostics/` (one file per area). `npm run contracts` publishes
  `docs/contracts/diagnostic-codes.json`; `npm run contracts:check` refuses drift. The Python module keeps an inline
  copy (`ARTIFACT_CODES`, standard library only, so it works outside a checkout); `py/test_diagnostic_codes.py` checks it
  against the published contract.
- Writer-side Python errors that are not validator decisions (for example column inference from zero rows) have
  `code = None`.

## Prefixes

| Prefix | Area | Owner | Table |
|---|---|---|---|
| `DP-ART` | `datapass.artifact` v1 validators, TypeScript and Python | F209 | `src/framework/diagnostics/artifact.ts` |
| `DP-ENV` | doctor: author and consumer environment checks | F210 | `src/framework/diagnostics/env.ts` |
| `DP-CLI` | client profile and client checks | F213 (reserved, empty) | `src/framework/diagnostics/client.ts` |
| `DP-STO` | workspace, run and result storage | F205 (001-009), F206-F207 (reserved) | `src/framework/diagnostics/storage.ts` |
| `DP-BUN` | export bundles | F208 (reserved, empty) | `src/framework/diagnostics/bundle.ts` |

## DP-ART codes

Gates run in order: envelope, structure (exactly `docs/contracts/artifact.schema.json`), semantic. The first refusal wins.

| Code | Gate | Rule | Reported by | Meaning |
|---|---|---|---|---|
| `DP-ART-001` | envelope | `inert-json` | TS, Python | Not inert finite JSON: a non-finite number, a non-JSON value, a cycle, a prototype key (`__proto__`, `prototype`, `constructor`) or text that does not parse as JSON. |
| `DP-ART-002` | envelope | `structure-budget` | TS, Python | JSON structure budget exceeded (depth above 24 or more than 500 000 nodes). |
| `DP-ART-003` | envelope | `byte-budget` | TS, Python | More than 1 MiB of compact UTF-8 JSON. |
| `DP-ART-010` | structure | `expected-object` | TS, Python | An object is required at this position. |
| `DP-ART-011` | structure | `unexpected-field` | TS, Python | A field the schema does not declare (`additionalProperties: false`). |
| `DP-ART-012` | structure | `missing-field` | TS, Python | A required field is absent. |
| `DP-ART-013` | structure | `format` | TS, Python | `format` is not `"datapass.artifact"`. |
| `DP-ART-014` | structure | `version` | TS, Python | `version` is not 1. |
| `DP-ART-015` | structure | `invalid-id` | TS, Python | Not an id (`^[a-z][a-zA-Z0-9_-]{0,79}$`, not `constructor`/`prototype`/`__proto__`). |
| `DP-ART-016` | structure | `invalid-text` | TS, Python | Not a string, too many Unicode code points, or blank where text must be filled. |
| `DP-ART-017` | structure | `integer-range` | TS, Python | Not an integer within the allowed range. |
| `DP-ART-018` | structure | `enum-value` | TS, Python | Not one of the allowed values (provenance kind, producer kind, column type, chart). |
| `DP-ART-019` | structure | `expected-array` | TS, Python | An array is required at this position. |
| `DP-ART-020` | structure | `list-budget` | TS, Python | A list has fewer or more items than allowed. |
| `DP-ART-021` | structure | `duplicate-list-id` | TS, Python | An id list (`dependsOn`, representation `inputs`) repeats an id (`uniqueItems`). |
| `DP-ART-022` | structure | `evidence-path` | TS, Python | Evidence path is not a safe relative path (forward slashes, no drive, no `..`, no empty or `.` segment, at most 260 characters). |
| `DP-ART-023` | structure | `input-hash` | TS, Python | `inputHash` is not 64 lowercase hex characters (sha256). |
| `DP-ART-024` | structure | `input-value` | TS, Python | An input value is not a finite number, a boolean or a string of at most 400 characters. |
| `DP-ART-025` | structure | `nullable-flag` | TS, Python | `column.nullable` is not a boolean. |
| `DP-ART-026` | structure | `row-cell-budget` | TS, Python | A row has more cells than the column budget. |
| `DP-ART-027` | structure | `row-cell-name` | TS, Python | A row cell name is not a column id. |
| `DP-ART-028` | structure | `row-cell-value` | TS, Python | A cell is not null, a boolean, a finite number or a string of at most 4000 characters. |
| `DP-ART-029` | structure | `payload-kind` | TS, Python | Unknown payload kind (table or text). |
| `DP-ART-030` | structure | `representation-kind` | TS, Python | Unsupported representation kind (table, chart, metric, text or json). |
| `DP-ART-040` | semantic | `evidence-range` | TS, Python | Evidence line range ends before it starts. |
| `DP-ART-041` | semantic | `evidence-duplicate` | TS, Python | The same evidence path and line range is listed twice. |
| `DP-ART-042` | semantic | `input-duplicate` | TS, Python | Two provenance inputs share an id. |
| `DP-ART-043` | semantic | `depends-on-self` | TS, Python | An artifact lists itself in `dependsOn`. |
| `DP-ART-044` | semantic | `column-duplicate` | TS, Python | Two columns share an id. |
| `DP-ART-045` | semantic | `row-key-undeclared` | TS, Python | `rowKey` is not a declared column. |
| `DP-ART-046` | semantic | `row-undeclared-cell` | TS, Python | A row has a cell for an undeclared column. |
| `DP-ART-047` | semantic | `row-missing-cell` | TS, Python | A row lacks a cell for a declared column. |
| `DP-ART-048` | semantic | `cell-type` | TS, Python | A cell does not match its column type (or is null in a non-nullable column). |
| `DP-ART-049` | semantic | `row-key-invalid` | TS, Python | A row key is missing, not a string or number, or duplicated. |
| `DP-ART-050` | semantic | `representation-duplicate` | TS, Python | Two representations share an id. |
| `DP-ART-051` | semantic | `representation-input` | TS, Python | A representation names an input that provenance does not declare. |
| `DP-ART-052` | semantic | `text-needs-text` | TS, Python | A text representation needs a text payload. |
| `DP-ART-053` | semantic | `needs-table` | TS, Python | A table, chart or metric representation needs a table payload. |
| `DP-ART-054` | semantic | `chart-x` | TS, Python | Chart `x` names an unknown column. |
| `DP-ART-055` | semantic | `chart-y` | TS, Python | Chart `y` is not a number column. |
| `DP-ART-056` | semantic | `chart-x-number` | TS, Python | Line or scatter chart `x` is not a number column. |
| `DP-ART-057` | semantic | `metric-column` | TS, Python | Metric names an unknown column. |
| `DP-ART-058` | semantic | `metric-row` | TS, Python | Metric names a row key that no row has (compared with JavaScript `String()`). |
| `DP-ART-059` | semantic | `derived-manifest` | TS | Defence in depth: the app manifest derived from the artifact was refused by the existing app contracts. |
| `DP-ART-060` | semantic | `set-duplicate-id` | TS, Python | Two artifacts published together share an id. |
| `DP-ART-061` | semantic | `set-cycle` | TS, Python | Artifacts published together form a `dependsOn` cycle. |

Two codes are absent from the corpus. `DP-ART-002`: any value nested deep enough also fails the JSON Schema, so it is
tested directly in `tests/diagnostic-codes.test.mjs` and `py/test_diagnostic_codes.py`. `DP-ART-059`: a TypeScript-only
defence in depth that the three gates are designed never to reach; it has no Python counterpart.

## Example

```text
$ python py/datapass_artifact.py tests/fixtures/artifact-corpus/invalid/s-format.json
{"file": "...", "ok": false, "gate": "structure", "path": "/format", "message": "/format: unsupported artifact format", "code": "DP-ART-013"}
```

```ts
artifactDecision(value); // {ok:false,gate:'structure',path:'/format',message:'/format: Unsupported artifact format',code:'DP-ART-013'}
```

## DP-ENV codes (doctor)

`npm run doctor` (`scripts/doctor.mjs`) is a read-only environment report for authors and consumers: it starts no
service and writes nothing; it reads this checkout, asks node, npm and python for their versions and briefly binds,
then releases, loopback ports. `npm run doctor -- --json` prints
`{"format":"datapass.doctor","version":1,"checks":[{"id","code","status","detail","fix"}]}`. Status is `pass`, `warn`,
`fail` or `skip`; every `warn` and `fail` names one `fix` (`null` otherwise). The exit code is 1 when any check fails.

- `--ci` reports failures of environment-only families that a CI runner cannot change (today only `ports`) as warnings.
  CI runs `npm run doctor -- --json --ci` after the Python install, so a stale `dist/_headers`, a wrong upstream pin or
  a Python package at another version than its pin still fails the job.
- Python is optional (SQL, client sites and the allowlisted runtime models do not need it): no interpreter, no venv or a
  missing package is a warning; a package installed at another version than its pin is a failure. The interpreter is
  `--python <exe>`, else `DATAPASS_PYTHON`, else `.venv` of the checkout, else `python`.
- `--results-dir <dir>` (else `DATAPASS_RESULTS_DIR`) checks that the opt-in ResultStore folder is outside Git; without
  either the check is skipped.

| Code | Gate | Rule | Reported by | Meaning |
|---|---|---|---|---|
| `DP-ENV-001` | node | `node-version` | TS | Node.js is older than `engines.node` of `package.json`. |
| `DP-ENV-002` | node | `npm-missing` | TS | npm cannot be found or does not report a version. |
| `DP-ENV-010` | upstream | `upstream-missing` | TS | A pin of `upstreams.lock.json` is not bootstrapped under `.upstream/` (fix: `npm run bootstrap`). |
| `DP-ENV-011` | upstream | `upstream-pin-mismatch` | TS | `.upstream/<id>/.source-commit` differs from the lock pin. |
| `DP-ENV-020` | python | `python-missing` | TS | No Python interpreter answers (warning). |
| `DP-ENV-021` | python | `python-not-venv` | TS | The interpreter is not a virtual environment (warning). |
| `DP-ENV-022` | python | `python-requirement-missing` | TS | A package pinned in `py/service/requirements*.txt` is not installed (warning). |
| `DP-ENV-023` | python | `python-requirement-version` | TS | An installed package differs from its pin. |
| `DP-ENV-030` | ports | `port-busy` | TS | One of 21481, 21491, 24190, 24799, 24811, 24812 on 127.0.0.1 cannot be bound. |
| `DP-ENV-040` | headers | `headers-drift` | TS | `dist/_headers` differs from `WORKBENCH_HEADERS` (skipped when `dist/` is absent). |
| `DP-ENV-050` | store | `results-dir-in-git` | TS | The ResultStore folder is inside a Git work tree. |

## DP-STO codes

Cross-tab workspace revisions (F205). The `datapass.workspace` v1 document is unchanged; the revision lives in the sidecar
key `datapass.workspace.revision` = `{rev,tab,sha256}` (`src/workspace/revision.ts`). TypeScript only.

| Code | Gate | Rule | Reported by | Meaning |
|---|---|---|---|---|
| `DP-STO-001` | workspace-revision | `workspace-conflict` | TS | Another tab or writer saved (or reset) the workspace after this tab loaded it. Nothing is written until the user keeps mine, takes theirs or exports both. |
| `DP-STO-002` | workspace-revision | `revision-sidecar-mismatch` | TS | The sidecar is missing, unreadable or does not hash to the stored document: an older studio or an unknown writer saved it. Still a conflict; the writer is shown as unknown. |
| `DP-STO-003` | workspace-revision | `theirs-invalid` | TS | Take theirs refused: the other document failed `validateWorkspace`. This tab and the conflict are unchanged. |

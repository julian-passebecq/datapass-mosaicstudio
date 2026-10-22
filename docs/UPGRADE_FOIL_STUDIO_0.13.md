# Consumer upgrade to 0.13.0 from a 0.8.1 framework snapshot

For a consumer repository that carries its own copy of the 0.8.1 framework (for example foil-studio-3d) and wants the
0.13.0 engineering contract and runtime wire without taking the whole SDK. Generic: no consumer data, model or private
detail is needed or assumed here. Full contract: [`spec/engineering/v1/README.md`](../spec/engineering/v1/README.md);
release notes: [`RELEASE_NOTES.md`](RELEASE_NOTES.md#0130-2026-10-22); Studio-side upgrade:
[`CONSUMING.md`](CONSUMING.md#0120--0130).

## 1. What to vendor

Pick **one commit** of this repository that contains 0.13.0 (the release merge commit or later) and copy, unchanged:

| File | Why |
|---|---|
| `src/framework/engineering/contract.ts` | types, `validateEngineering`, `canonicalJson`, `digest`; self-contained, no imports, no dependencies, so it drops into a 0.8.1 tree |
| `spec/engineering/v1/engineering.schema.json` | JSON Schema 2020-12 (structure only); sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83` at 0.13.0 |
| `tests/fixtures/engineering/` (whole folder with `manifest.json`) | conformance corpus: valid and invalid records, c14n vectors, the byte-exact 0.8.1 legacy artifact |
| `py/datapass_engineering.py` (optional) | Python mirror, standard library only, for a Python side of the consumer |

Then:

1. Add `.gitattributes` `tests/fixtures/engineering/** -text` (or the vendored path) so line endings stay byte-exact.
2. Record the source commit and the sha256 of every copied file next to the copy (a small `VENDORED.json` is enough).
3. Run the corpus in the consumer: every `manifest.json` entry must give the same decision, `code` and `where`; every
   c14n vector the same bytes and sha256. `tests/engineering.test.mjs` and `py/test_datapass_engineering.py` in this
   repository show the loop.
4. Never edit the copy. A rule change is a new contract version (`datapass.engineering/2`) and a new vendoring.

`binding.ts`, `receipt.ts` and `EngineeringBlocks.tsx` are not part of the contract. They import the 0.13.0 framework
(artifact views, runtime client), so on a 0.8.1 snapshot reimplement the few pieces you need against the vendored
`contract.ts` (exact signal lookup, `unmapped` never animates, `inferred` only after an opt-in, view state excluded
from design digests) rather than copying them.

The 0.8.1 artifact format is still accepted: the corpus holds `legacy-0.8.1/wind-aep-weibull.json` byte for byte, an
`artifact-ref` to it is valid, and the 0.13.0 `datapass.artifact/1` validators accept it.

## 2. Runtime wire changes (`datapass.runtime/1`, additive)

If the consumer calls the DataPass Python service or companion:

- **`Idempotency-Key`** request header on `POST /api/runtime/v1/runs`: 8-128 characters of `A-Za-z0-9._:-`. Send a
  new key per user submit and reuse it only to resend the same submit after a network error, timeout or 5xx. Same
  key and same payload returns the first run record (200, no new run); a different payload under the same key
  returns **409** `DP-RT-IDEMPOTENCY-CONFLICT`. Never resend on 409, 422, 401 or 429.
- **`cancelRequested`** on every run record. After a cancel, a running run stays `running` with
  `cancelRequested: true` until the model observes it; show "cancel requested", not "cancelled". Treat a missing
  field as `false` (older services).
- **`GET /api/runtime/v1/ready`** with the `X-Datapass-Token` header: `{live, ready, checks[{id, ok, detail}]}`. Use it
  before enabling run controls; `/health` is only a minimal liveness probe.
- A poll that keeps failing, a refused token or an unknown run after a restart is **not observed**, never cancelled or
  failed.

Clients that ignore these keep working on the runs API.

## 3. Profile migration

The service and the packaged companion start in the **`safe`** profile. There, `POST /compute/wind-reference`,
`GET /artifacts/{id}`, `/docs`, `/redoc` and `/openapi.json` answer **404**. A consumer that used them either:

- moves to `POST /api/runtime/v1/runs` (token) and `GET /api/runtime/v1/runs/{runId}/artifact`, or ships precomputed
  artifacts as static files; or
- for a local demo only, starts the service with `--profile demo` (loopback Host and allowed Origin enforced). Never
  ship or document `demo` as the default for a delivered companion.

Details: [`RUNTIME_COMPANION.md`](RUNTIME_COMPANION.md#profiles-and-legacy-route-migration).

## 4. Mapping `foilai.design-change/1` in the consumer

The mapping is a **consumer adapter**, written and owned in the consumer repository. Studio contains no FOIL import and
no FOIL type. For one design-change proposal (`base_revision`, typed `from` / `to` values with units,
`approval_status`):

1. Reject before mapping: an ambiguous or unnormalized unit, an unknown parameter id, a non-finite number, or a change
   whose value does not change or changes type.
2. Build a `parameter-diff`:
   `baseRevision = {alg: "sha256", over: <what the producer hashed: "bytes" or "datapass-c14n/1">, value: base_revision}`;
   one entry in `changes` per typed parameter with `id`, `unit` (`""` when dimensionless), `from`, `to` unchanged, and
   `consumedBy` from the model's declared coverage (possibly empty).
3. Build an `approval-request`: the same `baseRevision`, `proposalDigest = digest(parameter-diff)` over
   `datapass-c14n/1`, `purpose`, `requester`, `endpointHint` (an absolute path hint of the domain service, no host or
   query) and `presentationOnly: true`.
4. **Do not carry `approval_status`** (or `approved`, `decision`, `token`, ...) into either record: such a record is
   refused (`DP-ENG-014`, see `invalid/a-approval-status.json` in the corpus).
5. Validate both records with the vendored `validateEngineering` before showing them. Show the diff with its units and
   the request with its digests; the request button only calls the consumer's own callback to the domain service.

The corpus `valid/parameter-diff.json` and `valid/approval-request.json` are a matching synthetic pair to test the
adapter's output shape against.

## 5. What not to expect

- **No CAD, physics or AI in Studio.** Studio presents records and artifacts produced elsewhere; it does not compute
  geometry, loads, performance or design proposals, and it does not validate a model scientifically.
- **Approvals are issued by the domain service.** Studio never issues, stores or checks an approval. The domain
  service authenticates the actor, checks purpose, digests and expiry, and records the decision.
- **Cancel is cooperative.** A model that does not observe cancellation runs to its end.
- **Coverage is declared, not verified.** `consumed` / `ignored` / `fixed` come from the producer.
- **Units are never converted.** Mismatched units are refused with the reason.
- **No publication.** The companion and SDK archives are private deliveries; nothing here is a public release.

## Rollback

Keep the previous vendored copy (or none) under version control. Removing the vendored contract changes nothing stored
by Studio. If the consumer talks to a 0.12.0 service again, drop the `--profile` flag from its start command and expect
no `/ready`, no `cancelRequested` and no idempotent replay.

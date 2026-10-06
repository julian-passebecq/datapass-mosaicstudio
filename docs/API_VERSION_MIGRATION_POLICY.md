# Source API, format versions and migration policy

This repository is a private-package, source-consumed framework. A work-line name such as v0.8 is not an npm publication or a promise of a stable hosted API. This Pro increment deliberately retains the frozen package/dependency metadata and upstream pins; each qualification is identified by its exact Git commit, not a marketing version.

## Authoritative interfaces

Client definitions use the pure `framework/authoring.ts` entry. Optional features have narrow authoring entries, including `motion/index.ts`, and separate React/renderer entries. Client authors do not import `.upstream` internals or edit shared renderers to define ordinary content. Existing native producers remain authoritative for calculations and data. Studio does not turn an inert JSON document into a programmable endpoint.

Three identities must not be conflated:

1. The framework implementation commit and its verification evidence.
2. The data format discriminator/version, which selects a validator.
3. The client manifest ID/version, which protects saved user input compatibility.

Current web-app `schemaVersion: 1` and saved web-state `version: 1` are unchanged. Saved input restore requires the same app ID, app version and a declared page; invalid restore is rejected before applying values. Runs, artifacts, navigation, replay and model3d retain their existing v1 formats. Motion accepts v1 and v2. Schema files describe structure; runtime validators additionally enforce budgets, exact references and contextual invariants.

## Allowed evolution

A correction that preserves accepted inputs and semantics may remain in the same format version, with regression tests. New required fields, changed units/identity/semantics, removal of an accepted field, or changing a closed schema's accepted shape require explicit version consideration. Do not silently strip unknown fields to make an old reader accept a new document.

Motion v2 is an example: timing windows and annotations are admitted only by v2; v1 stays closed. V1 examples remain executable regression fixtures. `migrateMotion(input, 2)` is explicit, validated, deterministic, non-mutating and idempotent for v2. It introduces no guessed choreography and preserves historical full-step easing. Downgrades and unknown formats fail. A client can stay on v1 indefinitely within this work line.

There is no automatic migration of saved client state, model geometry, data producer outputs, run history or database schemas. Where a future client changes fields, implement a reviewed client-owned migration with source and target versions, a preview of changes, validation before application and rollback to the original bytes. This is a policy for future migrations, not an implemented general migration engine.

## Required change evidence

A format/API change must carry its source validator, authoring types, generated schema, recipe, negative tests, legacy acceptance fixtures and real client coverage. Migration tests must prove input immutability, idempotency or an explicit one-way rule, exact target validation and behavior at boundaries. Run comparison must not erase model/provider/version distinctions.

The default release gate remains frozen dependency installation, generated-contract drift, core tests, strict TypeScript, production build, original engine contracts, production HTTP browser checks and selected-client isolation. An implementation claim must point to the tested SHA and resulting evidence artifact. Documentation-only follow-up commits must be distinguishable from the tested source.

## Deprecation and publication

Do not delete a currently consumed entry or validator during a client pass. Introduce the replacement, document an explicit migration, qualify the legacy and replacement paths, inventory remaining consumers and obtain a release decision before removal. No elapsed-time support guarantee or semver stability is invented for this alpha source framework.

Public-site publication remains opt-in with an explicit HTTPS canonical URL and reviewed content. Preview robots directives are not authentication. Every bundled source excerpt is readable by visitors, even when export excludes it by default. A framework/browser gate does not certify legal asset rights, real-domain accuracy, hosting security or production accessibility.

No merge, deployment, domain change, package publication, upstream change or dependency upgrade is implied by a successful code qualification.

# Consuming DataPass MosaicStudio

This is a **source-consumed** framework (public GitHub repository, no license granted). Nothing is published to npm, no tag is created and nothing is deployed by the commands below. There are three supported ways to use it; pick one per consumer and pin it exactly.

**License.** No license file or package license field exists, in the tree or in its Git history. The repository is publicly visible on GitHub, but visibility is not a license: all rights are reserved by the owner and public SDK publication is **NOT_AUTHORIZED** until the owner decides a license. Third-party components keep their own licenses: prose notices in `THIRD_PARTY_NOTICES.md`, the generated per-package inventory in [`licenses/THIRD_PARTY_INVENTORY.md`](licenses/THIRD_PARTY_INVENTORY.md). Do not redistribute an archive or a built site outside the owner's approval.

## 1. Pinned Git source at an exact SHA (current method, unchanged)

Use the repository itself at one full commit SHA, never a branch name.

```sh
git clone <repository-url> datapass-mosaicstudio
cd datapass-mosaicstudio
git checkout --detach <40-hex-sha>        # the exact SHA you qualified
git rev-parse HEAD                          # must print that SHA
npm ci --no-audit --no-fund                 # frozen lockfile
npm run bootstrap                           # upstream engines at the commits in upstreams.lock.json
```

Record the SHA wherever the consumer records its dependencies. A consumer repository can also hold it as a Git submodule pinned to the same SHA.

## 2. Release archive from `dist-sdk/` (verified)

A release folder is produced from a commit by the owner and handed over as a folder:

```sh
npm run sdk:pack            # node scripts/sdk-pack.mjs; refuses a dirty tree (--allow-dirty records sourceTreeClean:false)
```

`dist-sdk/` then holds:

| File | Content |
|---|---|
| `datapass-mosaicstudio-sdk-<version>.tar.gz` | `git archive` of **HEAD**, SDK paths only: `src/framework`, `src/core`, the selected-client entry and its imports, `spec/`, `scripts/` (with the `client:new` templates), `docs/` (without recorded media), `package.json`, `package-lock.json`, `upstreams.lock.json`, `tsconfig.json`, `vite.client.config.ts`, `index.html`, `AGENTS.md`, `README.md`, `THIRD_PARTY_NOTICES.md`. Never `node_modules`, `.upstream`, `clients/`, builds or secrets |
| `concept-viewer.html` | The committed standalone concept viewer (see 3) |
| `sdk-release.json` | `datapass.sdk-release/1`: `sdkVersion`, `sourceCommit`, `sourceTreeClean`, `commitDate`, license statement, archive name/bytes/sha256, every file inside the archive (`path`, `bytes`, `sha256`, sorted), the standalone files, and the contract files (`datapass.concept-spec/1`, `datapass.artifact/1`, `datapass.preview/1`) with their hashes |

Content always comes from the commit, so packing the same commit twice gives the same manifest.

**Before using a release, verify it** (Node 22, no install needed):

```sh
node scripts/sdk-verify.mjs <release-folder>     # or: npm run sdk:verify -- <release-folder>
```

It re-hashes the archive, every file inside it, the standalone files and the contract entries and exits 1 on any difference. Then check the identity by hand:

1. `sdkVersion` is the version you expect, and `sourceCommit` is the SHA you were told (compare all 40 characters).
2. `sourceTreeClean` is `true`. A `false` release was packed with `--allow-dirty`: the archive still holds the commit, but it is not a qualified release.
3. `archive.sha256` matches the hash you received through a separate channel (for example the hand-over message).

Then unpack and install:

```sh
mkdir sdk && tar -xzf datapass-mosaicstudio-sdk-<version>.tar.gz -C sdk --strip-components=1
cd sdk && npm ci --no-audit --no-fund && npm run bootstrap
npm run client:new -- my-client --family content
```

The archive has no `.git` folder: builds then record `sourceCommit: null` in their `preview.json`. Keep the `sdk-release.json` next to the consumer as the provenance record.

## 3. Standalone concept viewer (single file)

`dist-standalone/concept-viewer.html` (also copied into every release folder) is one self-contained HTML file: open it by double-click or serve it from any static host. It needs no build and no network unless `?src=` asks for a URL. Its first lines carry the source commit and build date; its `sha256` is in `sdk-release.json`. Embedding and options: `spec/concept/v1/README.md`.

## Contracts

| Contract | File | Readers must |
|---|---|---|
| `datapass.concept-spec/1` | `spec/concept/v1/concept-spec.schema.json` | accept any `1.y.z`; see the folder README |
| `datapass.artifact/1` | `src/framework/foundation/artifact.ts` (`validateArtifact`) | reject unknown fields; the JSON Schema `docs/contracts/artifact.schema.json` is the exact structure gate (lineage fields included); semantic rules (references, duplicate ids, self-reference, row typing) and the 1 MiB envelope are separate validator gates. `py/datapass_artifact.py` mirrors all three; `tests/fixtures/artifact-corpus` is decided identically by all three (`npm run test:artifact-corpus`) |
| `datapass.preview/1` | `spec/preview/v1/preview.schema.json` | reject unknown fields; validate with `scripts/preview-validate.mjs --check-files` |

## Upgrade

1. Read `docs/API_VERSION_MIGRATION_POLICY.md` and the release notes or commit log between your current SHA and the new one.
2. Move to the new SHA (method 1) or to the new verified release folder (method 2). Keep the previous one.
3. `npm ci --no-audit --no-fund && npm run bootstrap`.
4. `npm run contracts:check` (generated contracts have not drifted).
5. `npm run client:check -- <your-client>` for each client.
6. `npm run build:client -- <your-client>`, then `node scripts/preview-validate.mjs dist-clients/<your-client>/preview.json --check-files`, then the client's real browser checks.
7. Record the new SHA (and archive sha256) only when all of the above pass.

## Rollback

Go back to the previous pinned SHA (`git checkout --detach <previous-sha>`) or the previous verified release folder, run `npm ci` and `npm run bootstrap` again, and rebuild the client. Client folders are owned by the consumer and are never overwritten by an upgrade, so a rollback only changes the framework. Saved user states follow the format rules in the migration policy: a state saved by a newer client version may be refused by the older one.

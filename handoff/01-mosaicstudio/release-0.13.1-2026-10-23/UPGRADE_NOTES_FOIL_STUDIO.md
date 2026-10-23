# MosaicStudio 0.13.1 for foil-studio-3d (lane 02)

Patch of 0.13.0. The receipt is [`qa/REL-0.13.1.md`](../../../qa/REL-0.13.1.md); the 0.13.0 notes in [`../foil-lane01-2026-10-22/UPGRADE_NOTES_FOIL_STUDIO.md`](../foil-lane01-2026-10-22/UPGRADE_NOTES_FOIL_STUDIO.md) still apply.

## Pin

| What | Value |
|---|---|
| Contract | `datapass.engineering/1`, unchanged: commit `d20ecd6a3b9e3a74ab497b3c425d1ce2ec649eb5`, schema sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83` |
| Release commit | `60c7cac75332cabcf0aa689b2c1988b54130bbae` (PR #104) |
| Package | existing private vault, generic package `datapass-mosaicstudio-sdk`, version path **`0.13.1-60c7cac`** (0.13.0-7adbbb7 unchanged) |
| SDK archive | `datapass-mosaicstudio-sdk-0.13.1.tar.gz`, 840,467 bytes, sha256 `0c7b5449c75bc650bf19d78315e619fba999a3a6b579bb895a5ce8d24384af39` |
| Runtime companion | `datapass-runtime-companion-0.13.1.tar.gz`, 53,724 bytes, sha256 `cc712ee0b9e4bd51e3f4690c8b65c2ec54bd7b6d716f0d35bdb43cd2d7ac0827` (service 0.5.0, `--profile safe`) |
| `SHA256SUMS` | sha256 `e34fc1809662ade9686567986ea7105d791cb920686b6d79f364f9b5cf8432de` (7/7 OK) |

## What changes for a consumer

- A vendored copy of `datapass.engineering/1` at `d20ecd6` needs nothing.
- `sdk-verify` / `runtime-verify` refuse unsafe archive paths before extracting (#102).
- Wind reference notebook artifacts now declare the `k` they used (#103); a `k` ≠ 2 export from 0.13.0 should be re-exported.

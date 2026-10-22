# Lane 01 → lane 02: MosaicStudio 0.13.0 for foil-studio-3d

Short receipt for lane 02 (foil-studio-3d, 0.8.1 framework snapshot). The full guide is [`docs/UPGRADE_FOIL_STUDIO_0.13.md`](../../../docs/UPGRADE_FOIL_STUDIO_0.13.md); the release receipt is [`qa/REL-0.13.0.md`](../../../qa/REL-0.13.0.md).

## Pin

| What | Value |
|---|---|
| Contract | `datapass.engineering/1`, canonical JSON `datapass-c14n/1` (RFC 8785 JCS) |
| Contract commit | `d20ecd6a3b9e3a74ab497b3c425d1ce2ec649eb5` (PR #96); unchanged through `7adbbb7` |
| Schema | `spec/engineering/v1/engineering.schema.json` sha256 `6ba8ee851986425c79ce2554d2f990cd0977f825986f6608292b6af81b4f5a83` |
| Release commit | `7adbbb7973756373090ce4872c54bf5f3ea2dacc` (PR #100) |
| Package | existing private vault, generic package `datapass-mosaicstudio-sdk`, version path **`0.13.0-7adbbb7`** |
| SDK archive | `datapass-mosaicstudio-sdk-0.13.0.tar.gz`, 837,859 bytes, sha256 `db0d32b04fc073c5fcff53e3d22c21f15c42f0096afff59afaa2109ce1d0fe6b` |
| Runtime companion | `datapass-runtime-companion-0.13.0.tar.gz`, 53,577 bytes, sha256 `51e4399cc0baedc5082c5276d01ecff9cab02c150a5da89b502597d158ced88d` (service 0.5.0) |
| `SHA256SUMS` | sha256 `16bfbdbe671eb76db13852d7c0a4b5563c222e067bc7901cc316220b4366f8fd` (7/7 OK) |

## What to vendor

At `d20ecd6`: `src/framework/engineering/contract.ts` (no imports), the schema above, `tests/fixtures/engineering/` (corpus: 11 valid, 48 invalid, 17 c14n vectors, legacy 0.8.1 artifact), optionally `py/datapass_engineering.py`. Check the schema sha256 after copying.

## What changes for a consumer

- The runtime companion starts in the **`safe`** profile: legacy `/compute/wind-reference`, `/artifacts/*`, `/docs` answer 404. Pass `--profile demo` or move to `/api/runtime/v1`.
- Additive `datapass.runtime/1` wire: `Idempotency-Key` on `POST /runs` (409 on a changed payload), `cancelRequested` on run records, authenticated `GET /api/runtime/v1/ready`.
- `foilai.design-change/1` maps to `parameter-diff` + `approval-request` in the consumer adapter. `approval-request` is presentation only: Studio never issues, stores or checks approvals.
- Not in Studio: CAD, physics, AI. All fixtures synthetic.

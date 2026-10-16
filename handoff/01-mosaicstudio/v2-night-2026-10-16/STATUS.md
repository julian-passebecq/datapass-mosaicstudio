# V2 night status (2026-10-16)

All 13 approved V2 features merged by squash on green GitHub Actions ("Studio web gate"); none stopped. One workflow, 49 agents (Opus coders, Sonnet verify/merge), lead session fixes on #86 and #92.

| Feature | State | PR | Merge SHA | Rollback check vs 0.11.1 | Notes |
|---|---|---|---|---|---|
| F203 run-state vocabulary | MERGED | #81 | 6a7a95f | n/a | pure mapping, lands before F202 |
| F204 StorageAdapter facade | MERGED | #80 | 4d9a42c | PASS | one fix round |
| F209 diagnostic codes TS + Python | MERGED | #82 | d5a10aa | n/a | release-0.10 receipt checked at its source_sha for changed files |
| F201 Python runtime companion | MERGED | #83 | 2d434ea | n/a | not delivered (release act) |
| F202 ComputeAdapter | MERGED | #84 | 82f5a11 | n/a | |
| F213 client status | MERGED | #85 | de0e467 | n/a | missing status refused |
| F205 cross-tab conflicts | MERGED | #86 | 53fc828 | PASS | persist.ts kept byte-identical (0.10 READY pin) |
| F210 doctor | MERGED | #87 | 0fcadb6 | n/a | |
| F206 durable site runs | MERGED | #88 | ff9fe5d | PASS | runtime-produced runs only |
| F211 datapass CLI | MERGED | #89 | 7b603f1 | n/a | |
| F207 A/B survives reopen | MERGED | #90 | 91b505f | PASS | `datapass.ab-pair` v1 browser key |
| F208 provenance bundle | MERGED | #91 | 972b7f2 | PASS | `datapass.bundle` v1, candidate |
| F212 product loop on 2 consumers | MERGED | #92 | 03c52dc | n/a (no storage change) | **PASS**: `npm run test:product-loop` 2/2 (contoso-shape-analytics, foil-wind), also a CI step |

**Release:** all 13 features ship in **0.12.0**, built from `c6f5b97` (#94) and delivered privately under `0.12.0-c6f5b97`, with the runtime companion (the F201 owner default "not delivered" is lifted by the release act); receipt [`qa/REL-0.12.0.md`](../../../qa/REL-0.12.0.md).

F212 receipts (sha256 of saved results, reopened after service restart, "Not recomputed"; run ids differ per run, so hashes are per-run): `qa/V2-LOOP/receipts.json`.

Owner defaults applied (BLOCKED_OWNER, see WAVES.md §4): no durable browser-task results (needs an ADR for a new cell-result origin); runtime CSP names the exact port; companion not delivered to the vault; `datapass.bundle` v1 and `datapass.ab-pair` v1 names; F213 refuses a missing client status (out-of-tree consumers add one line, CONSUMING.md).

Known CI flakes seen tonight (one rerun each, code not touched by the PR): `tests/browser/workbench-notebook.spec.ts:158` (UX02b), `tests/browser/concept-standalone.spec.ts:107` (embed fit).

# Final framework gate

Final tested source: `668d1e95b73f0a23ef2f1c08f851e7b4912e302c`.

[Successful workflow 36932904549](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36932904549), job `110606300792`.

- Frozen npm ci and generated-contract drift checks passed.
- All 121 unit/boundary tests, strict TypeScript, production build, client contract checks and original VizForge validation passed.
- All **22 production HTTP browser scenarios passed**: 22 expected, 0 unexpected, 0 skipped, 0 flaky.
- All **four isolated build/browser checks passed**: operations, wind, architecture and a freshly scaffolded custom-TSX client.
- `qa/client-builds/results.json` reports `sourceUnchanged: true` after creating/building the new client.
- Final visual inspection found and corrected narrow-screen 3D control clipping. A new geometry assertion checks every control against the card bounds, not just overall page overflow. The updated screenshot was inspected.

| Client | Emitted JS gzip bytes | Total output bytes |
| --- | ---: | ---: |
| operations-reference | 152013 | 493897 |
| wind-reference | 286792 | 1019808 |
| architecture-reference | 167006 | 564709 |
| acceptance-fresh | 349951 | 1247815 |

These are sums over emitted files, not first-load network measurements. Selected-client checks verify no copied DuckDB/WASM, unrelated client payload, unexpected external HTTP or browser console errors. Browser: hosted Linux Chrome 154.0.8037.57, software WebGL2. Cross-browser and physical-device guarantees are not implied.

[Source, client builds and browser evidence](https://github.com/julian-passebecq/datapass-mosaicstudio/actions/runs/36932904549/artifacts/11196833052)

Artifact `studio-web-evidence`, id `11196833052`, size `24777417` bytes, SHA256 `95d3ddaf4a32eec639857f82c8122913c39814ccf2b85ca262664a3ac8174edf`. GitHub retention ends 2026-10-04T22:09:29Z; this committed record and the source persist.

The earlier full qualification is preserved in `docs/FRAMEWORK_V0_2_QUALIFICATION.md`; this final run additionally covers the mobile-control correction and frozen-lock/schema reproducibility. This file is a documentation-only follow-up to tested source. No merge, deployment, package publication or old-repository replacement occurred.

Status: qualified v0.2 **source SDK / alpha kit**, not final customer websites or universal Streamlit compatibility. See `docs/AI_SITE_AUTHORING.md` for the client-only workflow and `docs/FRAMEWORK_KIT.md` for remaining v1 scope. Remote data, X-ray, DuckLake/Delta, notebook/IDE features, GLTF/CAD, video encoding and a real authenticated backend remain outside this pass.

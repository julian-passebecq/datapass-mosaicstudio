# DataPass MosaicStudio roadmap

## Plans (candidates, not approved)
- 2026-10-14 · Tech-lead product plan V1 existing / V2 / V3 / V4 / R&D, proposals evaluated against the code, Anatomy evaluation: [`docs/roadmap/tech-lead-2026-10-14/PLAN.md`](../docs/roadmap/tech-lead-2026-10-14/PLAN.md). Every item not built is CANDIDATE. **2026-10-16: V2 (F201-F213) APPROVED**; V3, V4 and R&D (R01-R05) stay CANDIDATE.

## Releases
- 2026-10-22 · **0.13.0** (lane 01 engineering consumer, #96-#99: `datapass.engineering/1`, runtime `safe` profile default, additive runtime wire, client run lifecycle): release commit `release/0.13.0`; private build and delivery follow the 0.12.0 recipe. 0.12.0 (`c6f5b97`) stays as delivered.
- 2026-10-16 · **0.12.0** (V2 F201-F213 + CSP-1 #77): built from `c6f5b97` (#94), qualified on the shipped bytes and delivered privately under `0.12.0-c6f5b97` (SDK, workbench zip, runtime companion, viewer); receipt [`qa/REL-0.12.0.md`](../qa/REL-0.12.0.md). No tag, public release or deployment. 0.11.1 (`3575e6b`) stays as delivered.
- 2026-10-16 · **T3 is out of the critical path (Julian, 16 Oct).** E2E-06 (native agent in T3) stays NOT_RUN/BLOCKED as history only; it is explicitly not a dependency of 0.12.0 or of any later Mosaic release or package.

## Idées de Julian (2026-10-16)
- 2026-10-16 · V2 block F201-F213 of the tech-lead plan approved as planned ("launch mosaic v2 for tonight"); run overnight as one workflow, F212 (the loop on Contoso-shape synthetic and foil-wind) closes it. V3, V4 and Anatomy R01-R05 out of scope. Target: V2.
- 2026-10-16 · Nothing in Mosaic waits on T3: E2E-06 stays NOT_RUN/BLOCKED as history, not a dependency. Target: 0.12.0 and later.

## Idées de Julian (2026-10-06)
- 2026-10-06 · Concept visuals like the Architecture Atlas (natural icons, layered planes, a shared lake below, apps at different heights) are the direction for architecture, app and cloud diagrams. Target: 0.9.
- 2026-10-06 · Fabric Bricks (LEGO-style client) stays a DRAFT with no further investment ("ça fait plus pro sans lego"). `clients/fabric-bricks/README.md` and its portfolio catalog entry are marked draft. Target: none (frozen).
- 2026-10-06 · Galaxy Navigator gets 3D and other views (GALAXY-N2). Target: 0.9.
- 2026-10-06 · Chart blocks move to the viz kit by default (approved; CHART-N1a/N1b landed in 0.8 rc.4). Target: 0.9 default switch.
- 2026-10-06 · Architecture atlas: natural representations of each concept (not fake blocks), vertical layers (lake below, apps at their own heights), scroll up/down/left/right, same spec renders static 2D diagrams; usable for an app or a cloud project. Target: next milestone after 0.8 RC. (Prototype: `clients/arch-atlas/`, branch `proto/arch-atlas`.)

## Idées de Julian (2026-10-05)
- Studio = front end for artifacts computed by any Python tool (scripts, Jupyter, marimo, services) — not tied to one notebook; target: next milestone. (First step: PR feat/python-artifact-bridge, docs/PYTHON_BRIDGE.md.)

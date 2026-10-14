# Anatomy evaluation (R&D candidate, not approved)

Date: 2026-10-14. Subject: [`wheresryan22/anatomy`](https://github.com/wheresryan22/anatomy), read at `main` = `e6600ffc4e8e6620eeb45bf49bcdbd5e4b84163f` (2026-10-13). Read through the GitHub API: README, LICENSE, SKILL.md, CHANGELOG, SECURITY, `references/react.md`, `references/publish.md`, `kit/react/live.tsx`, `examples/test-rig/figure.tsx`, CI workflow and the full file tree. Nothing was installed, run or vendored.

Question: is Anatomy a good tool for **FOIL mechanical figures** and **architecture explanations** in MosaicStudio, and how would it enter without becoming a second engine?

## Verdict

**Adopt as an isolated R&D lab (R01-R05 in `features.csv`), SVG first. Not a release dependency, not a renderer in `src/framework/`, not a replacement for any existing engine.**

- **FOIL mechanical figures: good fit**, within limits. Anatomy draws machines, instruments and rigs as many small solid parts, with a live readout driven by a small model. That matches "how the capture rig / foil strut / sensor chain works". It is illustration, not CAD: exact geometry stays with `model3d` (hash-checked GLB) and FOIL physics stays with the producers.
- **Architecture explanations: weak fit, explainer only.** Anatomy explains one idea by inventing a physical metaphor (a cache becomes a pin-tumbler lock). Useful for one mechanism (for example, the ResultStore's "manifest written last" commit point). It must not show topology: the concept spec v1 renderers (isometric, layer cake, 3D) and Julian's Architecture Atlas direction remain the architecture surface. A figure may link to a concept node (R05), never replace the concept spec.

## Facts

| Item | Finding |
|---|---|
| What it is | An Agent Skill (`SKILL.md` + long-form references) plus a drawing kit (`kit/`) and headless-Chrome checks (`scripts/`). Output is source the user owns: a Node build script writing standalone HTML/SVG, or React components. |
| Licence | **MIT**, "Copyright (c) 2026 Ryan". Compatible with vendoring and modification; requires keeping the notice. Example images and community-gallery figures can carry other licences (gallery allows CC-BY-4.0): reuse only the kit, never gallery figures. |
| Maturity | Created 2026-10-08; v1.0.0 on 2026-10-10, v1.1.0 on 2026-10-12; about 9.9k stars, 8 contributors, one main maintainer (76 commits). Very young and moving fast (unreleased changes on `main` already). |
| Dependencies | Kit and scripts use only Node built-ins (Node 20.10+). React 18+ only for `kit/react/`. Our stack is Node >= 22.16 and React 19.2: compatible. |
| Size | `kit/iso-kit.ts` about 39 KB source; the 3D runtime `turn.mjs` about 140 KB; built example pages 0.14-1.6 MB because they inline art. A static SVG figure is the cheapest output. |
| Modes | SVG (core), SVG + WebGL shader layer (fire, water, glow), 3D (beta: "proved on its example and one test figure"). |
| Motion | `kit/react/live.tsx` `useLoop` runs a `requestAnimationFrame` loop; honours `prefers-reduced-motion` and pauses offscreen. SKILL.md asks for "an idle tour" that loops when nobody touches the figure. |
| Verification | `kit/audit.mjs` (no interpenetration, mounts, depth order), `scripts/lines.mjs` (line ends), capture and drive scripts in headless Chrome. Strong for drawing quality; says nothing about domain truth. |
| Self-stated limits | Not a chart library (no axes or series); machines and instruments, not people or maps; slow by design (a figure is a long session; the 3D orbit audit takes 15-20 min for 30 parts). |

## Fit against what MosaicStudio already has

| Need | Existing owner | Anatomy's role |
|---|---|---|
| Charts, KPIs, comparisons | D3 viz kit, VizForge | None (explicitly not a chart library). |
| Architecture topology (layers, domains, flows) | Concept spec v1 + iso/flat/3D renderers, React Flow architecture review | None for topology. Optional mechanism explainer linked to one node (R05). |
| Step-by-step isometric motion of a process | Authored motion (SVG/D3, isometric) on the VizForge player | Overlap. Keep authored motion for process steps; Anatomy only for a crafted single machine figure. |
| Exact 3D product geometry | `model3d` static GLB profile, Three.js viewport | None. Anatomy geometry is invented; never a substitute for approved GLB bytes. |
| Semantic explanations of algorithms | ConceptMotion | None. |
| A crafted figure of a physical rig or instrument | Nothing equivalent | **The gap Anatomy fills.** |

## Conflicts with repository rules, and how the lab resolves them

| Rule (AGENTS.md, VISUALIZATION_STACK.md) | Conflict | Resolution in the lab |
|---|---|---|
| One progression clock per page (VizForge StoryPlayer); no autoplay timers (rules 20, 27) | `useLoop` rAF loop; SKILL.md idle tour | No idle tour. Pose comes from a SiteRuntime view field or the StoryPlayer step (R02); the loop runs only for a finite eased transition to that pose, like the D3 transitions allowed today. |
| Reduced motion and manual controls are release requirements (rule 13) | Already honoured by the kit | Keep, and test (U501). |
| Reference data and geometry labelled synthetic; no invented physics (rules 12, 37) | "Every number comes from the same small model that moves its parts" invites invented models | Readout values come from a validated `datapass.artifact` (R03); figures carry ILLUSTRATIVE and synthetic labels; no Foil'O geometry inferred. |
| Optional engines stay out of builds that do not need them (rules 25, 41) | WebGL layer and 3D runtime are heavy | SVG first; WebGL and 3D only as a measured evaluation (R04), never in the shared framework. |
| Upstream engines are pinned and immutable (rule 2) | Fast-moving upstream | Pin `e6600ffc…` (or a later reviewed commit) in `upstreams.lock.json`; `.upstream/anatomy` is ignored and never edited. |
| No second isometric renderer in the framework | Anatomy has its own camera and projection | The camera stays inside the lab's figures; no merge with `src/framework/motion` or `src/framework/concept/iso.ts`. |

## Risks

1. **Confidentiality.** `scripts/publish.mjs` publishes a figure to a public community gallery and reads the Claude Code session log (time and tokens) through `CLAUDE_CODE_SESSION_ID`. Never run it for DataPass or FOIL work; the lab README must say so. A FOIL figure must not reach a public repository: this repository is public, so committed lab figures use synthetic or generic subjects only.
2. **Skill auto-trigger.** The skill loads itself on phrases such as "isometric illustration" or "explanatory figure". Installed globally, it would take over diagram requests in every DataPass repository and compete with concept spec and authored motion. Use the kit only (vendored); do not install the skill globally; if a lane needs it, a project-scoped install in the lab only.
3. **Headless Chrome checks.** `capture.mjs` and `drive.mjs` start Chrome with `--allow-file-access-from-files`, and `drive.mjs` runs page JavaScript you pass it. Point them only at lab pages; Playwright remains the repository's browser test tool.
4. **Misleading metaphors.** A beautiful mechanism does not prove a topology, a throughput or a yield. Each figure states what it explains and what it does not.
5. **Upstream churn and bus factor.** Five days old, one main maintainer, behaviour changes weekly. Pin, vendor at build time, and keep the static SVG output so a figure survives the upstream changing or disappearing.
6. **Cost.** A figure is a long agent session plus audits. Budget per figure, not per feature (R01 estimate 8-16 h for two figures).
7. **Payload.** WebGL and 3D modes add runtime and frame cost; 3D is beta. Measured gate before any adoption (R04).

## Integration path

| Stage | Content | Exit condition |
|---|---|---|
| 0 | This evaluation (docs only). | Merged as CANDIDATE. |
| 1 (R01) | `upstreams.lock.json` entry `anatomy` at a reviewed commit, fetched by `bootstrap-upstreams`; `clients/anatomy-lab/` (prototype status, not rule 17, not in the workbench); one synthetic FOIL rig figure and one architecture mechanism explainer, each built by a Node script into static SVG under the client's `public/`, shown through a `custom` block with minimum `customCapabilities`; THIRD_PARTY_NOTICES and licence inventory list Anatomy as MIT. | `client:check` and `build:client` pass; 0 network requests; screenshots in light and dark at 1440 and 390 px inspected; payload gate passes. |
| 2 (R02, R03, R05) | React live component from `kit/react`, pose bound to a view field or StoryPlayer step; readout from a validated artifact with an evidence sidecar; part selection synced with concept spec node ids. | U501 and U502 pass; reduced motion holds a still pose; changing the pose reruns nothing. |
| 3 (R04) | Measured evaluation of the WebGL layer and 3D beta on one figure. | Decision recorded: keep SVG only, or allow WebGL for that client with a payload budget. |

**Stop criteria:** a figure needs network access or `eval`; reduced motion cannot hold a still pose; the pinned build breaks on an upstream change we cannot pin around; or a figure cannot keep its claims within synthetic and illustrative labels. Then keep the static SVGs already produced and stop.

## What Anatomy will not be used for

Not the central renderer, not a chart engine, not the architecture model, not CAD or physics, not a source of FOIL numbers, not a reason to load WebGL in ordinary clients, and not a release condition for any version in `PLAN.md`.

import type {ArchSpec} from '../spec.ts';

/**
 * Our own DataPass MosaicStudio stack, from repository documents only (docs/PYTHON_BRIDGE.md, README.md,
 * vite.client.config.ts, .github/workflows/ci.yml). Paths marked with a branch exist on that open PR branch,
 * not yet on main. Nothing here claims a deployment: the repository builds static bundles, it does not host them.
 */
const BRIDGE='feat/fastapi-artifact-service';
export const datapassStack:ArchSpec={
  format:'datapass.arch-atlas',version:1,id:'datapass-stack',
  title:'DataPass MosaicStudio stack',
  subtitle:'Python computes, artifacts carry the result, Studio clients render it as static sites.',
  provenance:'documented',
  note:'DOCUMENTED from repository files (see each node). Python bridge, service and file watch are prototype branches; no deployment, authentication or hosting provider is implied.',
  layers:[
    {id:'files',label:'Repository & files',role:'storage',description:'Source of truth: the git repository and the artifact JSON files producers write beside each client.'},
    {id:'producers',label:'Python producers',role:'compute',description:'Any Python code computes: plain scripts, Jupyter, marimo. All of them write the same artifact contract.'},
    {id:'service',label:'Live services',role:'serving',description:'Optional on-demand paths for local authoring: a FastAPI compute service and a dev-server file watch.'},
    {id:'studio',label:'Studio clients',role:'experience',description:'TypeScript framework and the client pages that validate and render artifacts. The browser never runs a calculation.'},
    {id:'delivery',label:'Build & CI',role:'delivery',description:'One client per static bundle, gated by GitHub Actions.'},
    {id:'people',label:'People',role:'users',description:'Who runs producers and who reads the pages.'}
  ],
  groups:[
    {id:'python',label:'Python side',description:'Producers and the local compute service (py/).'},
    {id:'studio-ts',label:'Studio (TypeScript)',description:'Framework (src/framework) and clients (clients/<id>).'},
    {id:'ci',label:'Repository & CI',description:'GitHub repository, workflow gate and static bundles.'}
  ],
  nodes:[
    {id:'artifact-files',label:'Artifact files',kind:'artifact',layer:'files',group:'python',purpose:'datapass.artifact v1 JSON written to clients/<id>/public/artifacts with a manifest. Bounded: ≤ 10 000 rows, ≤ 40 columns, 1 MB. Optional Parquet sidecar for other tools; the page never reads it.',sources:[{path:'docs/PYTHON_BRIDGE.md',note:BRIDGE},{path:'clients/python-wind-reference/public/artifacts/manifest.json',note:BRIDGE}]},
    {id:'git-repo',label:'Git repository',kind:'repo',layer:'files',group:'ci',purpose:'datapass-mosaicstudio on GitHub. One branch per package; pull requests merge on green CI.',sources:[{path:'README.md'}]},
    {id:'wind-script',label:'Wind model script',kind:'producer',layer:'producers',group:'python',purpose:'Plain Python script: an illustrative Weibull AEP table (generic power curve, k = 2, no losses).',sources:[{path:'py/wind_reference_model.py',note:BRIDGE}]},
    {id:'notebooks',label:'Jupyter & marimo',kind:'notebook',layer:'producers',group:'python',purpose:'The same model called from one notebook cell (Jupyter) or a slider app (marimo).',sources:[{path:'py/notebooks/wind_reference.ipynb',note:BRIDGE},{path:'py/notebooks/wind_reference.py',note:BRIDGE}]},
    {id:'artifact-writer',label:'Artifact writer',kind:'library',layer:'producers',group:'python',purpose:'Standard-library helper to_artifact / write_manifest. Enforces ids, provenance and size limits early; atomic writes.',sources:[{path:'py/datapass_artifact.py',note:BRIDGE}]},
    {id:'compute-service',label:'FastAPI service',kind:'api',layer:'service',group:'python',purpose:'Prototype on 127.0.0.1:8765: GET /health, GET /artifacts/{id}, POST /compute/wind-reference. Same artifact contract; runId = hash of model version + inputs. Loopback only, no authentication.',sources:[{path:'py/service/app.py',note:BRIDGE},{path:'docs/PYTHON_BRIDGE.md',note:BRIDGE}]},
    {id:'artifact-watch',label:'Artifact file watch',kind:'stream',layer:'service',group:'studio-ts',purpose:'Dev-only Vite plugin: watches public/artifacts, dedupes by sha256 and pushes datapass:artifact-changed so pages refetch.',sources:[{path:'docs/PYTHON_BRIDGE.md',note:'feat/artifact-watch'}]},
    {id:'studio-framework',label:'Studio framework',kind:'library',layer:'studio',group:'studio-ts',purpose:'src/framework: runtime, view state, blocks, renderers and ArtifactSource, which re-validates every artifact before rendering.',sources:[{path:'src/framework/authoring.ts'},{path:'src/framework/foundation/ArtifactSource.tsx',note:BRIDGE}]},
    {id:'wind-client',label:'Wind reference page',kind:'report',layer:'studio',group:'studio-ts',purpose:'Client page with static, live-service and live-file modes over the same artifact.',sources:[{path:'clients/python-wind-reference/app.ts',note:BRIDGE}]},
    {id:'atlas-client',label:'Architecture atlas',kind:'dashboard',layer:'studio',group:'studio-ts',purpose:'This client: one architecture spec rendered as a layered 3D atlas and static 2D diagrams.',sources:[{path:'clients/arch-atlas/app.ts'}]},
    {id:'client-build',label:'Client build',kind:'pipeline',layer:'delivery',group:'studio-ts',purpose:'npm run build:client -- <id> emits dist-clients/<id>: one client, its artifacts, a CSP _headers file and studio-build.json evidence.',sources:[{path:'vite.client.config.ts'},{path:'scripts/build-client.mjs'}]},
    {id:'ci-gate',label:'Studio web gate',kind:'ci-runner',layer:'delivery',group:'ci',purpose:'GitHub Actions on ubuntu-latest: unit tests, build, browser tests and selected-client builds on every push and PR.',sources:[{path:'.github/workflows/ci.yml'}]},
    {id:'static-bundle',label:'Static bundle',kind:'static-host',layer:'delivery',group:'ci',purpose:'Any static host can serve dist-clients/<id>. Built pages keep connect-src self, so they show static artifacts unless a deployment allows a service origin.',sources:[{path:'vite.client.config.ts'},{path:'docs/recipes/public-site.md'}]},
    {id:'author',label:'Author',kind:'users',layer:'people',group:'python',purpose:'Runs producers locally and previews pages with npm run client:dev.',sources:[{path:'docs/PYTHON_BRIDGE.md',note:BRIDGE}]},
    {id:'visitor',label:'Page visitor',kind:'browser',layer:'people',group:'ci',purpose:'Opens the static page in a browser; artifacts load same-origin and are validated client-side.',sources:[{path:'README.md'}]}
  ],
  edges:[
    {id:'e-author-script',from:'author',to:'wind-script',kind:'control',label:'Run'},
    {id:'e-script-writer',from:'wind-script',to:'artifact-writer',kind:'data',label:'Rows'},
    {id:'e-nb-writer',from:'notebooks',to:'artifact-writer',kind:'data',label:'Rows'},
    {id:'e-writer-files',from:'artifact-writer',to:'artifact-files',kind:'data',label:'Write JSON'},
    {id:'e-script-service',from:'wind-script',to:'compute-service',kind:'data',label:'Model'},
    {id:'e-files-watch',from:'artifact-files',to:'artifact-watch',kind:'data',label:'File change'},
    {id:'e-service-client',from:'compute-service',to:'wind-client',kind:'data',label:'Artifact (live)'},
    {id:'e-watch-client',from:'artifact-watch',to:'wind-client',kind:'control',label:'Refetch'},
    {id:'e-fw-client',from:'studio-framework',to:'wind-client',kind:'control',label:'ArtifactSource'},
    {id:'e-client-build',from:'wind-client',to:'client-build',kind:'data',label:'Source'},
    {id:'e-files-build',from:'artifact-files',to:'client-build',kind:'data',label:'public/'},
    {id:'e-repo-ci',from:'git-repo',to:'ci-gate',kind:'control',label:'Push / PR'},
    {id:'e-ci-build',from:'ci-gate',to:'client-build',kind:'control',label:'Runs'},
    {id:'e-build-bundle',from:'client-build',to:'static-bundle',kind:'data',label:'dist-clients/<id>'},
    {id:'e-bundle-visitor',from:'static-bundle',to:'visitor',kind:'data',label:'HTML + JS + JSON'}
  ]
};

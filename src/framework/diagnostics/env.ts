import type {DiagnosticEntry} from './types.ts';

/** DP-ENV-nnn: doctor checks for authors and consumers (F210, `npm run doctor`, scripts/doctor.mjs).
 *  `gate` is the check family. The doctor reports the code of the rule a check covers; message text is not part of the contract. */
export const ENV_DIAGNOSTICS:readonly DiagnosticEntry[]=[
  {code:'DP-ENV-001',gate:'node',rule:'node-version',summary:'Node.js is older than the engines.node range of package.json.',languages:['ts']},
  {code:'DP-ENV-002',gate:'node',rule:'npm-missing',summary:'npm cannot be found or does not report a version.',languages:['ts']},
  {code:'DP-ENV-010',gate:'upstream',rule:'upstream-missing',summary:'A pinned upstream of upstreams.lock.json is not bootstrapped under .upstream/.',languages:['ts']},
  {code:'DP-ENV-011',gate:'upstream',rule:'upstream-pin-mismatch',summary:'A bootstrapped upstream records a commit other than its upstreams.lock.json pin.',languages:['ts']},
  {code:'DP-ENV-020',gate:'python',rule:'python-missing',summary:'No Python interpreter answers (optional: only the local Python runtime and authoring need it).',languages:['ts']},
  {code:'DP-ENV-021',gate:'python',rule:'python-not-venv',summary:'The Python interpreter is not a virtual environment; the runtime requirements belong in a venv the author owns.',languages:['ts']},
  {code:'DP-ENV-022',gate:'python',rule:'python-requirement-missing',summary:'A package pinned in py/service/requirements*.txt is not installed for the selected interpreter.',languages:['ts']},
  {code:'DP-ENV-023',gate:'python',rule:'python-requirement-version',summary:'An installed Python package differs from its pin in py/service/requirements*.txt.',languages:['ts']},
  {code:'DP-ENV-030',gate:'ports',rule:'port-busy',summary:'A loopback port used by the local checks and services (above 20000) cannot be bound.',languages:['ts']},
  {code:'DP-ENV-040',gate:'headers',rule:'headers-drift',summary:'The built dist/_headers differs from WORKBENCH_HEADERS (scripts/workbench-headers.mjs).',languages:['ts']},
  {code:'DP-ENV-050',gate:'store',rule:'results-dir-in-git',summary:'The ResultStore folder (--results-dir or DATAPASS_RESULTS_DIR) is inside a Git work tree.',languages:['ts']},
];

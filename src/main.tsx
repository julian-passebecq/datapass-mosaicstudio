// The shipped CSP has no 'unsafe-eval'. zod 4 (bundled several times by @sqlrooms/*) probes `new Function('')` on
// its first object parse to decide whether to JIT; the probe is caught, but the browser still reports one script-src
// violation per zod copy and page (REL-0.11.1 JOURNEY-01 under _headers). All copies share this global config, and
// jitless skips the probe: parsing takes the same non-JIT path the CSP already forces. Set before any import runs.
((globalThis as {__zod_globalConfig?:{jitless?:boolean}}).__zod_globalConfig??={}).jitless=true;
// Separate entry graphs: a client website does not import the analytical workbench.
const params=new URLSearchParams(location.search);
if(params.has('app')||params.has('sites'))void import('./client-main');
else if(params.has('artifact'))void import('./artifact-main');
else void import('./workbench-main');
export {};

/**
 * doctor (F210): an environment report for authors and consumers. Read-only: it starts no service, writes no file and
 * changes nothing; it only reads files of this checkout, asks node/npm/python for their versions and briefly binds
 * (then releases) loopback ports.
 *
 *   npm run doctor                      human report
 *   npm run doctor -- --json            {format:"datapass.doctor",version:1,checks:[{id,code,status,detail,fix}]}
 *   npm run doctor -- --ci              environment-only failures CI cannot fix (busy ports) become warnings
 *   options: --python <exe>  --results-dir <dir>  --root <checkout>
 *
 * Status is pass, warn, fail or skip. Every warn and fail names one fix. Exit code 1 when any check fails, else 0.
 * Python is optional (SQL, client sites and the allowlisted runtime models do not need it): a missing interpreter or
 * package is a warning, a package installed at another version than its pin is a failure.
 * Codes: src/framework/diagnostics/env.ts (DP-ENV-nnn), documented in docs/DIAGNOSTIC_CODES.md.
 */
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WORKBENCH_HEADERS,parseHeadersFile} from './workbench-headers.mjs';
import {ENV_DIAGNOSTICS} from '../src/framework/diagnostics/env.ts';

export const DOCTOR_FORMAT='datapass.doctor';
export const DOCTOR_VERSION=1;
/** Loopback ports above 20000 used by the local checks (for example 21481 foil-wind preview, 24190/24799 the rollback check). */
export const DOCTOR_PORTS=Object.freeze([21481,21491,24190,24799,24811,24812]);
/** Check families that only describe the machine and that CI cannot change: --ci reports their failures as warnings. */
export const CI_DOWNGRADED=Object.freeze(['ports']);
const REQUIREMENT_FILES=Object.freeze(['py/service/requirements.txt','py/service/requirements-jupyter.txt']);

const CODE=Object.fromEntries(ENV_DIAGNOSTICS.map(row=>[row.rule,row.code]));
const GATE=Object.fromEntries(ENV_DIAGNOSTICS.map(row=>[row.code,row.gate]));

/** Numeric x.y.z comparison; missing parts count as 0. */
export function compareVersions(a,b){
  const pa=String(a).replace(/^v/,'').split('.').map(n=>parseInt(n,10)||0),pb=String(b).replace(/^v/,'').split('.').map(n=>parseInt(n,10)||0);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return Math.sign(d);}
  return 0;
}
/** `>=x.y.z` (the only form package.json uses) to its minimum version; anything else is not checked. */
export function minimumFromRange(range){const m=/^\s*>=\s*v?(\d+(?:\.\d+){0,2})\s*$/.exec(String(range||''));return m?m[1]:null;}

/** `name==version` lines of a pip requirements file; comments and blank lines ignored, other specifiers kept unpinned. */
export function parseRequirements(text){
  const rows=[];
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.replace(/#.*/,'').trim();if(!line)continue;
    const m=/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:==\s*([^\s;]+))?/.exec(line);
    if(m)rows.push({name:m[1],version:m[2]??null});
  }
  return rows;
}

function check(id,rule,status,detail,fix=null){
  if(!(rule in CODE))throw new Error('Unknown doctor rule '+rule);
  if((status==='fail'||status==='warn')&&!fix)throw new Error('A '+status+' check must name its fix: '+id);
  return {id,code:CODE[rule],status,detail,fix:status==='fail'||status==='warn'?fix:null};
}

/**
 * Runs every check through injected probes and returns the report. Pure apart from the probes, so tests pass fakes.
 * probes: {nodeVersion(), npmVersion(), engines(), lock(), upstreamMarker(id), requirements(file), python(exe,names),
 *          portFree(port), distHeaders(), gitRoot(dir), env, pythonDefault()}
 */
export async function runDoctor(probes,options={}){
  const checks=[];const ci=!!options.ci;

  const nodeVersion=probes.nodeVersion(),min=minimumFromRange(probes.engines()?.node);
  if(!min)checks.push(check('node','node-version','pass',`Node ${nodeVersion}; package.json declares no >= engines range`));
  else if(compareVersions(nodeVersion,min)>=0)checks.push(check('node','node-version','pass',`Node ${nodeVersion} satisfies >=${min}`));
  else checks.push(check('node','node-version','fail',`Node ${nodeVersion} is older than the required >=${min}`,`Install Node.js ${min} or newer (an LTS 22 release), then run npm ci again.`));

  const npmVersion=probes.npmVersion();
  checks.push(npmVersion?check('npm','npm-missing','pass',`npm ${npmVersion}`):check('npm','npm-missing','fail','npm did not answer npm --version','Install npm with Node.js (it ships with the Node installer) and make sure npm is on PATH.'));

  let lock;
  try{lock=probes.lock();}catch(error){lock=null;checks.push(check('upstream','upstream-missing','fail','upstreams.lock.json cannot be read: '+error.message,'Restore upstreams.lock.json from Git (git checkout -- upstreams.lock.json).'));}
  for(const source of lock?.sources??[]){
    const marker=probes.upstreamMarker(source.id),id='upstream:'+source.id;
    if(marker==null)checks.push(check(id,'upstream-missing','fail',`.upstream/${source.id} is not bootstrapped (pin ${source.commit.slice(0,12)})`,'Run npm run bootstrap.'));
    else if(marker!==source.commit)checks.push(check(id,'upstream-pin-mismatch','fail',`.upstream/${source.id} is at ${marker.slice(0,12)}, the lock pins ${source.commit.slice(0,12)}`,`Review and remove .upstream/${source.id} (bootstrap never overwrites it), then run npm run bootstrap.`));
    else checks.push(check(id,'upstream-pin-mismatch','pass',`.upstream/${source.id} at the pinned ${source.commit.slice(0,12)}`));
  }

  const pins=[];
  for(const file of REQUIREMENT_FILES){let text=null;try{text=probes.requirements(file);}catch{}if(text!=null)for(const row of parseRequirements(text))pins.push({...row,file});}
  const exe=options.python||probes.env.DATAPASS_PYTHON||probes.pythonDefault();
  const py=probes.python(exe,pins.map(pin=>pin.name));
  if(!py){
    checks.push(check('python','python-missing','warn',`${exe} did not answer; the local Python runtime and Python authoring are unavailable (SQL and client sites do not need them)`,'Optional: create a venv with python -m venv .venv, or pass --python <interpreter> (or set DATAPASS_PYTHON).'));
    for(const pin of pins)checks.push(check('python:'+pin.name,'python-requirement-missing','skip',`not checked without a Python interpreter (${pin.file})`));
  }else{
    checks.push(check('python','python-missing','pass',`Python ${py.version} at ${py.executable}`));
    checks.push(py.venv?check('python-venv','python-not-venv','pass','the interpreter is a virtual environment')
      :check('python-venv','python-not-venv','warn',`${py.executable} is not a virtual environment`,'Create one you own: python -m venv .venv, then install py/service/requirements*.txt into it (never globally).'));
    for(const pin of pins){
      const installed=py.packages?.[pin.name]??null,id='python:'+pin.name,install=`${py.venv?'':'In your venv, '}run python -m pip install -r ${pin.file}`;
      if(installed==null)checks.push(check(id,'python-requirement-missing','warn',`${pin.name} is not installed (pinned ${pin.version??'unpinned'} in ${pin.file})`,`Optional: ${install}.`));
      else if(pin.version&&installed!==pin.version)checks.push(check(id,'python-requirement-version','fail',`${pin.name} ${installed} is installed, ${pin.file} pins ${pin.version}`,`${install[0].toUpperCase()+install.slice(1)} to get ${pin.name}==${pin.version}.`));
      else checks.push(check(id,'python-requirement-version','pass',`${pin.name} ${installed}${pin.version?' matches the pin':''}`));
    }
  }

  const ports=await Promise.all(DOCTOR_PORTS.map(async port=>[port,await probes.portFree(port)]));
  for(const [port,free] of ports)checks.push(free?check('port:'+port,'port-busy','pass',`127.0.0.1:${port} can be bound`)
    :check('port:'+port,'port-busy','fail',`127.0.0.1:${port} is in use`,`Stop the process listening on ${port} (netstat -ano | findstr :${port}, then taskkill /PID <pid> /T) or pick another port above 20000 for that check.`));

  const headers=probes.distHeaders();
  if(headers==null)checks.push(check('headers','headers-drift','skip','dist/ is not built; nothing to compare'));
  else{
    let rules=null;try{rules=parseHeadersFile(headers);}catch{}
    const got=rules?.['/*'],keys=Object.keys(WORKBENCH_HEADERS);
    const same=got&&Object.keys(got).length===keys.length&&keys.every(k=>got[k]===WORKBENCH_HEADERS[k])&&Object.keys(rules).length===1;
    checks.push(same?check('headers','headers-drift','pass','dist/_headers equals WORKBENCH_HEADERS')
      :check('headers','headers-drift','fail','dist/_headers differs from WORKBENCH_HEADERS (stale or edited build)','Run npm run build to regenerate public/_headers and dist/ from scripts/workbench-headers.mjs; never edit _headers by hand.'));
  }

  const dir=options.resultsDir||probes.env.DATAPASS_RESULTS_DIR||null;
  if(!dir)checks.push(check('results-dir','results-dir-in-git','skip','no ResultStore folder set (--results-dir or DATAPASS_RESULTS_DIR); the store is opt-in'));
  else{
    const repo=probes.gitRoot(path.resolve(dir));
    checks.push(repo?check('results-dir','results-dir-in-git','fail',`${path.resolve(dir)} is inside the Git work tree ${repo}`,'Choose a ResultStore folder outside every Git work tree, for example under %LOCALAPPDATA% or ~/.datapass/results.')
      :check('results-dir','results-dir-in-git','pass',`${path.resolve(dir)} is outside Git`));
  }

  if(ci)for(const row of checks)if(row.status==='fail'&&CI_DOWNGRADED.includes(GATE[row.code])){row.status='warn';row.detail+=' (reported as a warning under --ci)';}
  return {format:DOCTOR_FORMAT,version:DOCTOR_VERSION,checks};
}

export const doctorFailed=report=>report.checks.some(row=>row.status==='fail');

/** Human report: one line per check, the fix under every warn and fail, a count line last. */
export function formatHuman(report){
  const lines=[];const count={pass:0,warn:0,fail:0,skip:0};
  for(const row of report.checks){
    count[row.status]++;
    lines.push(`${row.status.toUpperCase().padEnd(4)} ${row.code} ${row.id}: ${row.detail}`);
    if(row.fix)lines.push(`     fix: ${row.fix}`);
  }
  lines.push(`doctor: ${count.pass} pass, ${count.warn} warn, ${count.fail} fail, ${count.skip} skip`);
  return lines.join('\n');
}

const PY_PROBE=`import json,sys
from importlib import metadata
out={}
for name in json.loads(sys.argv[1]):
    try: out[name]=metadata.version(name)
    except metadata.PackageNotFoundError: out[name]=None
print(json.dumps({"executable":sys.executable,"version":"%d.%d.%d"%sys.version_info[:3],"venv":sys.prefix!=getattr(sys,"base_prefix",sys.prefix),"packages":out}))`;

/** Probes that read the real machine; the checks above never touch it directly. */
export function realProbes(root){
  const at=p=>path.join(root,p);
  const read=p=>{try{return readFileSync(at(p),'utf8');}catch{return null;}};
  return {
    env:process.env,
    nodeVersion:()=>process.versions.node,
    npmVersion:()=>{
      const agent=/\bnpm\/(\S+)/.exec(process.env.npm_config_user_agent||'');if(agent)return agent[1];
      const r=spawnSync('npm --version',{encoding:'utf8',shell:true,timeout:30000});return r.status===0?r.stdout.trim()||null:null;
    },
    engines:()=>JSON.parse(readFileSync(at('package.json'),'utf8')).engines??{},
    lock:()=>JSON.parse(readFileSync(at('upstreams.lock.json'),'utf8')),
    upstreamMarker:id=>{const text=read(path.join('.upstream',id,'.source-commit'));return text==null?null:text.trim();},
    requirements:file=>read(file),
    pythonDefault:()=>{for(const p of ['.venv/Scripts/python.exe','.venv/bin/python'])if(existsSync(at(p)))return at(p);return 'python';},
    python:(exe,names)=>{
      const r=spawnSync(exe,['-c',PY_PROBE,JSON.stringify(names)],{encoding:'utf8',timeout:30000,windowsHide:true});
      if(r.status!==0)return null;try{return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());}catch{return null;}
    },
    portFree:port=>new Promise(resolve=>{
      const server=createServer();server.unref();
      server.once('error',()=>resolve(false));
      server.listen({port,host:'127.0.0.1',exclusive:true},()=>server.close(()=>resolve(true)));
    }),
    distHeaders:()=>existsSync(at('dist'))?read('dist/_headers')??'':null,
    gitRoot:dir=>{for(let p=dir;;p=path.dirname(p)){if(existsSync(path.join(p,'.git')))return p;if(path.dirname(p)===p)return null;}},
  };
}

export function parseArgs(argv){
  const opt={json:false,ci:false,python:null,resultsDir:null,root:null};
  for(let i=0;i<argv.length;i++){
    const a=argv[i],value=()=>{const v=argv[++i];if(v==null||v.startsWith('--'))throw new Error(a+' needs a value');return v;};
    if(a==='--json')opt.json=true;else if(a==='--ci')opt.ci=true;
    else if(a==='--python')opt.python=value();else if(a==='--results-dir')opt.resultsDir=value();else if(a==='--root')opt.root=value();
    else throw new Error('Unknown option '+a+' (use --json, --ci, --python <exe>, --results-dir <dir>, --root <checkout>)');
  }
  return opt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  let opt;try{opt=parseArgs(process.argv.slice(2));}catch(error){console.error('doctor: '+error.message);process.exit(2);}
  const root=path.resolve(opt.root||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
  const report=await runDoctor(realProbes(root),opt);
  console.log(opt.json?JSON.stringify(report,null,2):formatHuman(report));
  process.exitCode=doctorFailed(report)?1:0;
}

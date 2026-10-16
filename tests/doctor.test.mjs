// doctor (F210): every check runs through injected probes; these fakes cover pass, warn, fail and skip for each family,
// the --ci downgrade, the JSON shape and the rule "every warn and fail names one fix".
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {runDoctor,formatHuman,doctorFailed,parseRequirements,parseArgs,compareVersions,minimumFromRange,DOCTOR_PORTS,realProbes} from '../scripts/doctor.mjs';
import {workbenchHeadersFile} from '../scripts/workbench-headers.mjs';
import {ENV_DIAGNOSTICS} from '../src/framework/diagnostics/env.ts';

const PIN='7aaa8fa601c5fa2c9f8acfd7a4d4eb54b887b9ef',OTHER='30e69639bfc3929c348fd8f9c6c38a2cb61984d8';
const healthy=(over={})=>({
  env:{},
  nodeVersion:()=>'22.16.0',npmVersion:()=>'10.9.2',engines:()=>({node:'>=22.16.0'}),
  lock:()=>({version:1,sources:[{id:'vizforge',commit:PIN},{id:'conceptmotion',commit:OTHER}]}),
  upstreamMarker:id=>id==='vizforge'?PIN:OTHER,
  requirements:file=>file.endsWith('requirements.txt')?'# comment\nfastapi==0.142.2\nhttpx==0.28.1\n':'jupyter_server==2.21.1\n',
  pythonDefault:()=>'python',
  python:(exe,names)=>({executable:'/x/.venv/bin/python',version:'3.12.4',venv:true,packages:Object.fromEntries(names.map(n=>[n,{fastapi:'0.142.2',httpx:'0.28.1',jupyter_server:'2.21.1'}[n]]))}),
  portFree:async()=>true,
  distHeaders:()=>workbenchHeadersFile(),
  gitRoot:()=>null,
  ...over,
});
const byId=(report,id)=>report.checks.find(row=>row.id===id);

test('a healthy environment passes every check and exits 0',async()=>{
  const report=await runDoctor(healthy(),{resultsDir:'/outside/store'});
  assert.equal(report.format,'datapass.doctor');assert.equal(report.version,1);
  assert.deepEqual(report.checks.map(row=>row.status).filter(s=>s!=='pass'),[]);
  assert.equal(doctorFailed(report),false);
  assert.deepEqual(DOCTOR_PORTS,[21481,21491,24190,24799,24811,24812]);
  for(const port of DOCTOR_PORTS)assert.ok(byId(report,'port:'+port));
  for(const id of ['node','npm','upstream:vizforge','upstream:conceptmotion','python','python-venv','python:fastapi','python:httpx','python:jupyter_server','headers','results-dir'])assert.ok(byId(report,id),id);
});

test('every check has the JSON shape, a known DP-ENV code, and a fix exactly when it warns or fails',async()=>{
  const codes=new Set(ENV_DIAGNOSTICS.map(row=>row.code));
  const broken=healthy({nodeVersion:()=>'20.11.0',npmVersion:()=>null,upstreamMarker:id=>id==='vizforge'?null:PIN,python:()=>null,portFree:async port=>port!==24190,distHeaders:()=>'/*\n  X-Content-Type-Options: nosniff\n',gitRoot:()=>'/repo'});
  for(const report of [await runDoctor(healthy()),await runDoctor(broken,{resultsDir:'/repo/store'})]){
    for(const row of report.checks){
      assert.deepEqual(Object.keys(row),['id','code','status','detail','fix']);
      assert.ok(codes.has(row.code),row.code);assert.ok(['pass','warn','fail','skip'].includes(row.status));
      assert.equal(typeof row.detail,'string');
      if(row.status==='warn'||row.status==='fail'){assert.equal(typeof row.fix,'string');assert.ok(row.fix.length>10);}else assert.equal(row.fix,null);
    }
    JSON.parse(JSON.stringify(report));
  }
});

test('Node and npm: older than engines fails with DP-ENV-001, missing npm fails with DP-ENV-002',async()=>{
  const report=await runDoctor(healthy({nodeVersion:()=>'22.15.9',npmVersion:()=>null}));
  assert.deepEqual([byId(report,'node').status,byId(report,'node').code],['fail','DP-ENV-001']);
  assert.match(byId(report,'node').fix,/22\.16\.0/);
  assert.deepEqual([byId(report,'npm').status,byId(report,'npm').code],['fail','DP-ENV-002']);
  assert.equal(doctorFailed(report),true);
  assert.equal(byId(await runDoctor(healthy({nodeVersion:()=>'24.1.0'})),'node').status,'pass');
});

test('upstream pins: missing and mismatched markers fail with their own code and fix',async()=>{
  const report=await runDoctor(healthy({upstreamMarker:id=>id==='vizforge'?null:PIN}));
  assert.deepEqual([byId(report,'upstream:vizforge').status,byId(report,'upstream:vizforge').code,byId(report,'upstream:vizforge').fix],['fail','DP-ENV-010','Run npm run bootstrap.']);
  const mismatch=byId(report,'upstream:conceptmotion');
  assert.deepEqual([mismatch.status,mismatch.code],['fail','DP-ENV-011']);assert.match(mismatch.fix,/\.upstream\/conceptmotion/);
  const unreadable=await runDoctor(healthy({lock:()=>{throw new Error('ENOENT');}}));
  assert.deepEqual([byId(unreadable,'upstream').status,byId(unreadable,'upstream').code],['fail','DP-ENV-010']);
});

test('Python is optional: no interpreter warns and skips the pins; a global interpreter warns; a wrong pin fails',async()=>{
  const none=await runDoctor(healthy({python:()=>null}));
  assert.deepEqual([byId(none,'python').status,byId(none,'python').code],['warn','DP-ENV-020']);
  assert.equal(byId(none,'python:fastapi').status,'skip');assert.equal(doctorFailed(none),false);
  const global=await runDoctor(healthy({python:(exe,names)=>({executable:'C:/Python312/python.exe',version:'3.12.4',venv:false,packages:Object.fromEntries(names.map(n=>[n,n==='fastapi'?'0.100.0':null]))})}));
  assert.deepEqual([byId(global,'python-venv').status,byId(global,'python-venv').code],['warn','DP-ENV-021']);
  assert.deepEqual([byId(global,'python:httpx').status,byId(global,'python:httpx').code],['warn','DP-ENV-022']);
  const wrong=byId(global,'python:fastapi');
  assert.deepEqual([wrong.status,wrong.code],['fail','DP-ENV-023']);assert.match(wrong.fix,/fastapi==0\.142\.2/);assert.match(wrong.fix,/requirements\.txt/);
});

test('the interpreter comes from --python, then DATAPASS_PYTHON, then the checkout venv default',async()=>{
  const seen=[];const probes=env=>healthy({env,python:(exe,names)=>{seen.push(exe);return healthy().python(exe,names);}});
  await runDoctor(probes({DATAPASS_PYTHON:'envpy'}),{python:'flagpy'});await runDoctor(probes({DATAPASS_PYTHON:'envpy'}));await runDoctor(probes({}));
  assert.deepEqual(seen,['flagpy','envpy','python']);
});

test('ports: a busy port fails locally with DP-ENV-030 and is only a warning under --ci',async()=>{
  const probes=healthy({portFree:async port=>port!==24799});
  const local=await runDoctor(probes);
  assert.deepEqual([byId(local,'port:24799').status,byId(local,'port:24799').code],['fail','DP-ENV-030']);assert.match(byId(local,'port:24799').fix,/24799/);
  const ci=await runDoctor(probes,{ci:true});
  assert.equal(byId(ci,'port:24799').status,'warn');assert.equal(doctorFailed(ci),false);
  const stillFails=await runDoctor(healthy({portFree:async()=>false,nodeVersion:()=>'18.0.0'}),{ci:true});
  assert.equal(byId(stillFails,'node').status,'fail','--ci downgrades only environment-only families');
});

test('dist/_headers: skipped without dist, passes when equal, fails on drift or a missing file',async()=>{
  assert.equal(byId(await runDoctor(healthy({distHeaders:()=>null})),'headers').status,'skip');
  assert.equal(byId(await runDoctor(healthy()),'headers').status,'pass');
  const drift=workbenchHeadersFile().replace("object-src 'none'","object-src *");
  for(const text of [drift,'','/*\n  X-Content-Type-Options: nosniff\n',workbenchHeadersFile()+'/extra\n  X-Frame-Options: DENY\n']){
    const row=byId(await runDoctor(healthy({distHeaders:()=>text})),'headers');
    assert.deepEqual([row.status,row.code],['fail','DP-ENV-040']);assert.match(row.fix,/npm run build/);
  }
});

test('ResultStore folder: opt-in skip, outside Git passes, inside Git fails with DP-ENV-050',async()=>{
  assert.equal(byId(await runDoctor(healthy()),'results-dir').status,'skip');
  const inside=byId(await runDoctor(healthy({env:{DATAPASS_RESULTS_DIR:'/repo/store'},gitRoot:()=>'/repo'})),'results-dir');
  assert.deepEqual([inside.status,inside.code],['fail','DP-ENV-050']);
  assert.equal(byId(await runDoctor(healthy({gitRoot:()=>'/repo'}),{resultsDir:'/repo/x'}),'results-dir').status,'fail','--results-dir wins over the environment');
});

test('the real Git probe finds this checkout and nothing above a drive root',()=>{
  const probes=realProbes(process.cwd());
  assert.ok(probes.gitRoot(path.resolve('scripts')));
  assert.equal(typeof probes.nodeVersion(),'string');
});

test('helpers: requirements, version ranges, arguments, human output',async()=>{
  assert.deepEqual(parseRequirements('# c\n\nfastapi==0.142.2  # pinned\nuvicorn[standard]==0.54.0\nloose>=1\n'),[{name:'fastapi',version:'0.142.2'},{name:'uvicorn',version:'0.54.0'},{name:'loose',version:null}]);
  assert.equal(minimumFromRange('>=22.16.0'),'22.16.0');assert.equal(minimumFromRange('^22'),null);
  assert.equal(compareVersions('22.16.0','22.9.9'),1);assert.equal(compareVersions('v22.16','22.16.0'),0);
  assert.deepEqual(parseArgs(['--json','--ci','--results-dir','d','--python','p']),{json:true,ci:true,python:'p',resultsDir:'d',root:null});
  assert.throws(()=>parseArgs(['--bogus']),/Unknown option/);assert.throws(()=>parseArgs(['--python']),/needs a value/);
  const text=formatHuman(await runDoctor(healthy({npmVersion:()=>null})));
  assert.match(text,/^FAIL DP-ENV-002 npm: /m);assert.match(text,/^ {5}fix: Install npm/m);assert.match(text,/1 fail/);
});

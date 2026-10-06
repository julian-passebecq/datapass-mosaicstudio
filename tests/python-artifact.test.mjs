import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateArtifact,artifactDefinition} from '../src/framework/foundation/artifact.ts';
import {loadArtifact,artifactUrl,loadHttpArtifact,loadArtifactSource,httpArtifactUrl} from '../src/framework/foundation/artifact-loader.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';

const committed='clients/python-wind-reference/public/artifacts/wind-aep-weibull.json';
const python=['python','python3','py'].find(cmd=>spawnSync(cmd,['--version'],{encoding:'utf8'}).status===0);
const response=(body,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},text:async()=>body});
const base='http://127.0.0.1:4174/index.html';

test('committed Python-written artifact passes the TypeScript validator and adapts to blocks',async()=>{
  const artifact=validateArtifact(JSON.parse(await readFile(committed,'utf8')));
  assert.equal(artifact.provenance.kind,'computed');assert.match(artifact.provenance.source,/ILLUSTRATIVE/);
  const runtime=new SiteRuntime(artifactDefinition(artifact));
  assert.deepEqual(runtime.manifest.pages[0].sections[0].blocks.map(b=>b.type),['metric','metric','table','chart','code']);
  assert.ok(runtime.resolve({dataset:'artifact-data',row:'mean-8-0',column:'aep'})>0);
});

test('cross-language contract: Python writes a fresh artifact, node validates it',{skip:python?false:'python not on PATH'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'py-artifact-'));
  try{
    const run=spawnSync(python,['py/wind_reference_model.py',dir],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const written=JSON.parse(await readFile(path.join(dir,'wind-aep-weibull.json'),'utf8'));
    assert.deepEqual(validateArtifact(written),JSON.parse(await readFile(committed,'utf8')),'committed artifact is stale; rerun python py/wind_reference_model.py');
    const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
    assert.equal(manifest.artifacts[0].id,'wind-aep-weibull');
    const bad=spawnSync(python,['-c','import sys;sys.path.insert(0,"py");import datapass_artifact as d;d.to_artifact([{"id":"a"}],id="Bad",title="t",source="s")'],{encoding:'utf8'});
    assert.notEqual(bad.status,0);assert.match(bad.stderr,/invalid id/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('static loader resolves by id beside the page and validates before display',async()=>{
  assert.equal(artifactUrl('wind-aep-weibull','http://h/app/index.html'),'http://h/app/artifacts/wind-aep-weibull.json');
  assert.throws(()=>artifactUrl('../secret','http://h/'),/invalid id/);
  const body=await readFile(committed,'utf8');let seen='';
  const {artifact,url}=await loadArtifact('wind-aep-weibull',{base,fetch:async u=>{seen=u;return response(body);}});
  assert.equal(artifact.id,'wind-aep-weibull');assert.equal(url,seen);assert.ok(Object.isFrozen(artifact));
});

test('static loader fails closed with readable errors',async()=>{
  const good=JSON.parse(await readFile(committed,'utf8'));
  const cases=[
    [async()=>response('',404),/missing \(HTTP 404\)/],
    [async()=>response('{not json'),/not valid JSON/],
    [async()=>response(JSON.stringify({...good,onLoad:'x()'})),/failed datapass.artifact v1 validation/],
    [async()=>response(JSON.stringify({...good,id:'other'})),/declares id "other"/],
    [async()=>{throw new TypeError('offline');},/could not be fetched/],
  ];
  for(const [fetch,error] of cases)await assert.rejects(loadArtifact('wind-aep-weibull',{base,fetch}),error);
});

// Bridge level 3: live loopback service (py/service/app.py). The Python side needs py/service/requirements.txt.
const servicePython=[path.join('.venv','Scripts','python.exe'),path.join('.venv','bin','python'),python].filter(Boolean)
  .find(cmd=>(cmd===python||existsSync(cmd))&&spawnSync(cmd,['-c','import fastapi,pydantic'],{encoding:'utf8'}).status===0);

test('service response validates in node (same contract as the static file)',{skip:servicePython?false:'fastapi not installed (pip install -r py/service/requirements.txt)'},async()=>{
  const script='import sys,json;sys.path.insert(0,"py/service");import app as s;print(json.dumps(s.compute_wind_reference(s.WindReferenceInputs(k=2.2,c=8.5,hubHeight=130))))';
  const run=spawnSync(servicePython,['-c',script],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const artifact=validateArtifact(JSON.parse(run.stdout));
  assert.equal(artifact.id,'wind-aep-live');assert.equal(artifact.provenance.kind,'computed');assert.match(artifact.provenance.runId,/^run-[0-9a-f]{16}$/);
  const runtime=new SiteRuntime(artifactDefinition(artifact));
  assert.ok(runtime.resolve({dataset:'artifact-data',row:'selected',column:'aep'})>0);
  let init;
  const loaded=await loadHttpArtifact({url:'http://127.0.0.1:8765/compute/wind-reference',body:{k:2.2,c:8.5,hubHeight:130},id:'wind-aep-live'},{base,fetch:async(u,i)=>{init=i;return response(run.stdout);}});
  assert.equal(loaded.artifact.provenance.runId,artifact.provenance.runId);
  assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.deepEqual(JSON.parse(init.body),{k:2.2,c:8.5,hubHeight:130});
});

test('http loader: loopback or same-origin only, bounded request, readable errors',async()=>{
  assert.equal(httpArtifactUrl('http://localhost:8765/x','https://site.example/'),'http://localhost:8765/x');
  assert.equal(httpArtifactUrl('/api/x','https://site.example/app/'),'https://site.example/api/x');
  for(const bad of ['http://evil.example/x','file:///c:/x','http://u:p@127.0.0.1/x'])assert.throws(()=>httpArtifactUrl(bad,base),/loopback|http|credentials/);
  const url='http://127.0.0.1:8765/compute/wind-reference',good=await readFile(committed,'utf8');
  await assert.rejects(loadHttpArtifact({url,body:{pad:'x'.repeat(3000)}},{base,fetch:async()=>response(good)}),/above 2048 bytes/);
  await assert.rejects(loadHttpArtifact({url,body:{}},{base,fetch:async()=>{throw new TypeError('refused');}}),/unreachable/);
  await assert.rejects(loadHttpArtifact({url,body:{k:9}},{base,fetch:async()=>response(JSON.stringify({detail:[{loc:['body','k'],msg:'Input should be less than or equal to 4'}]}),422)}),/HTTP 422: k Input should be less/);
  await assert.rejects(loadHttpArtifact({url,body:{}},{base,fetch:async()=>response('{"format":"x"}')}),/failed datapass.artifact v1 validation/);
  await assert.rejects(loadHttpArtifact({url,id:'wind-aep-live'},{base,fetch:async()=>response(good)}),/expected "wind-aep-live"/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(loadArtifactSource({kind:'http',url},{base,signal:abort.signal,fetch:async(_u,i)=>{if(i.signal.aborted){const e=new Error('aborted');e.name='AbortError';throw e;}return response(good);}}),{name:'AbortError'});
  assert.equal((await loadArtifactSource({kind:'static',id:'wind-aep-weibull'},{base,fetch:async()=>response(good)})).artifact.id,'wind-aep-weibull');
});

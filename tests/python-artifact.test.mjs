import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateArtifact,artifactDefinition} from '../src/framework/foundation/artifact.ts';
import {loadArtifact,artifactUrl} from '../src/framework/foundation/artifact-loader.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';

const committed='clients/python-wind-reference/public/artifacts/wind-aep-weibull.json';
const python=['python','python3','py'].find(cmd=>spawnSync(cmd,['--version'],{encoding:'utf8'}).status===0);
const response=(body,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},text:async()=>body});
const base='http://127.0.0.1:4174/index.html';

test('committed Python-written artifact passes the TypeScript validator and adapts to blocks',async()=>{
  const artifact=validateArtifact(JSON.parse(await readFile(committed,'utf8')));
  assert.equal(artifact.provenance.kind,'computed');assert.match(artifact.provenance.source,/ILLUSTRATIVE/);
  const runtime=new SiteRuntime(artifactDefinition(artifact));
  assert.deepEqual(runtime.manifest.pages[0].sections[0].blocks.map(b=>b.type),['metric','table','chart','code']);
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

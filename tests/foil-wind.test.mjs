import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateArtifact} from '../src/framework/foundation/artifact.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {loadClient} from '../scripts/load-client.mjs';

const dir='clients/foil-wind/public/artifacts';
const python=['python','python3','py'].find(cmd=>spawnSync(cmd,['--version'],{encoding:'utf8'}).status===0);

test('foil-wind committed artifacts are the hand-made placeholder and validate',async()=>{
  const names=(await readdir(dir)).filter(n=>n.endsWith('.json')).sort();
  assert.equal(names.length,9);
  for(const name of names){
    const a=validateArtifact(JSON.parse(await readFile(path.join(dir,name),'utf8')));
    assert.equal(a.provenance.kind,'synthetic');
    assert.match(a.provenance.source,/HAND-MADE PLACEHOLDER/,name);
  }
});

test('foil-wind adapter and data step (Python unittest, hand-made bundles)',{skip:python?false:'python not on PATH'},()=>{
  const run=spawnSync(python,['-m','unittest','-q','test_foil_wind'],{cwd:'clients/foil-wind/py',encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
});

test('foil-wind committed artifacts are fresh (Python regenerates identical bytes)',{skip:python?false:'python not on PATH'},async()=>{
  const out=await mkdtemp(path.join(tmpdir(),'foil-wind-'));
  try{
    const run=spawnSync(python,['-c','import sys;sys.path.insert(0,"clients/foil-wind/py");import build_data as b;from pathlib import Path;b.build(b.load_placeholder(),Path(sys.argv[1]))',out],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json')))
      assert.equal((await readFile(path.join(out,name),'utf8')).replace(/\r\n/g,'\n'),(await readFile(path.join(dir,name),'utf8')).replace(/\r\n/g,'\n'),name+' is stale: run python clients/foil-wind/py/build_data.py');
  }finally{await rm(out,{recursive:true,force:true});}
});

test('foil-wind compare task is explicit, fetches the comparison and rejects equal runs',async()=>{
  const body=await readFile(path.join(dir,'foil-wind-comparison.json'),'utf8');
  const realFetch=globalThis.fetch,hadDocument='document' in globalThis;
  globalThis.document={baseURI:'http://127.0.0.1:21481/index.html'};
  globalThis.fetch=async url=>{assert.match(String(url),/artifacts\/foil-wind-comparison\.json$/);return new Response(body,{status:200,headers:{'content-type':'application/json'}});};
  try{
    const runtime=new SiteRuntime(await loadClient('foil-wind'));
    assert.equal(runtime.getSnapshot().tasks.compare.status,'idle');
    await runtime.runTask('compare');
    assert.equal(runtime.getSnapshot().tasks.compare.status,'ready');
    const rows=runtime.dataset('comparison');
    assert.equal(rows.length,7);
    assert.equal(rows.find(r=>r.metric==='samples').delta,0);
    runtime.set('runB','run-1');
    await runtime.runTask('compare');
    assert.equal(runtime.getSnapshot().tasks.compare.status,'error');
    assert.match(runtime.getSnapshot().tasks.compare.message,/two different runs/);
  }finally{globalThis.fetch=realFetch;if(!hadDocument)delete globalThis.document;}
});

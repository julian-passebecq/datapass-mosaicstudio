// F212: static contract of the two product-loop consumers (the browser journeys live in tests/product-loop/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {RUNTIME_TASK_CAPABILITIES} from '../src/framework/compute/runtime-task.ts';
import {loadClient} from '../scripts/load-client.mjs';
import {readClientProfile} from '../scripts/client-context.mjs';
import {referenceClients} from '../scripts/client-plugin.ts';

const CONSUMERS={'contoso-shape-analytics':{runtime:'http://127.0.0.1:24811',task:'scenario',model:'contoso-shape-scenario'},'foil-wind':{runtime:'http://127.0.0.1:24812',task:'compareRuntime',model:'foil-wind-compare'}};

test('the contoso-shape base artifact is a byte copy of the synthetic interop fixture',async()=>{
  const copy=await readFile('clients/contoso-shape-analytics/data/contoso-shape.synthetic.artifact.json'),fixture=await readFile('tests/fixtures/interop/contoso-shape.synthetic.artifact.json');
  assert.ok(copy.equals(fixture));
  const artifact=JSON.parse(copy.toString('utf8'));
  assert.equal(artifact.id,'orchard-monthly-yield');assert.equal(artifact.provenance.kind,'synthetic');assert.equal(artifact.payload.rows.length,12);
});

for(const [id,expected] of Object.entries(CONSUMERS)){
  test(`${id}: prototype, not a public reference, CSP names exactly its runtime origin`,async()=>{
    const profile=await readClientProfile(id);
    assert.equal(profile.status,'prototype');
    assert.ok(!referenceClients.includes(id),'not in the default workbench build');
    assert.deepEqual(profile.csp,{connect:[expected.runtime]});
  });
  test(`${id}: durable runs bind only the runtime task, nothing runs on load`,async()=>{
    const definition=await loadClient(id),runtime=new SiteRuntime(definition);
    const [binding]=Object.values(definition.durableRuns);
    assert.deepEqual(binding.tasks.map(t=>[t.taskId,t.model]),[[expected.task,expected.model]]);
    assert.equal(definition.bindings.tasks[expected.task],binding.tasks[0].handler);
    assert.deepEqual(binding.tasks[0].capabilities,RUNTIME_TASK_CAPABILITIES);
    assert.equal(runtime.getSnapshot().tasks[expected.task].status,'idle');
    assert.equal(binding.link.get(),null,'no runtime is paired without the link and an explicit Connect');
    const spec=definition.resources.runs.loop.specs[0];
    assert.equal(spec.provenance,'synthetic');assert.equal(spec.modelId,expected.model);
    assert.ok(spec.representations.some(r=>r.kind==='metric'),'declared metrics give A/B deltas');
    assert.match(JSON.stringify(definition.manifest),/SYNTHETIC/);
  });
}

test('foil-wind keeps its static compare path for visitors without Python',async()=>{
  const definition=await loadClient('foil-wind');
  assert.deepEqual(definition.manifest.tasks.map(t=>t.id),['compare','compareRuntime']);
  assert.deepEqual(definition.manifest.pages.map(p=>p.id),['runs','measurements','sql','compare','loop']);
  const compare=definition.manifest.pages.find(p=>p.id==='compare');
  assert.ok(compare.sections.flatMap(s=>s.blocks).some(b=>b.type==='task'&&b.task==='compare'));
});

test('the runtime slot mapping refuses anything but run-1..run-8',async()=>{
  const definition=await loadClient('foil-wind');
  const runtime=new SiteRuntime(definition);
  runtime.set('runA','run-1');runtime.set('runB','run-3');
  // Without a paired runtime the task fails with the pairing message and never contacts anything.
  const realFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('no network');};
  try{await runtime.runTask('compareRuntime');}finally{globalThis.fetch=realFetch;}
  assert.equal(runtime.getSnapshot().tasks.compareRuntime.status,'error');
  assert.match(runtime.getSnapshot().tasks.compareRuntime.message,/No local runtime is paired/);
  assert.equal(calls,0);
});

test('the committed loop receipts are PASS on both consumers and carry hashes only',async()=>{
  const text=await readFile('qa/V2-LOOP/receipts.json','utf8'),receipts=JSON.parse(text);
  assert.equal(receipts.format,'datapass.v2-loop-receipts');assert.equal(receipts.feature,'F212');
  assert.deepEqual(receipts.consumers.map(c=>[c.consumer,c.verdict,c.synthetic]),[['contoso-shape-analytics','PASS',true],['foil-wind','PASS',true]]);
  for(const c of receipts.consumers){
    assert.equal(c.savedResultSha256.length,2);
    assert.deepEqual(c.reopenedAfterRestart.map(r=>r.resultSha256),c.savedResultSha256);
    assert.ok(c.reopenedAfterRestart.every(r=>r.sameHash&&r.state==='Not recomputed'));
    assert.ok(c.steps.every(s=>s.requests===0),'a representation change never reran');
    assert.equal(c.runtimeRunRequestsAfterReopen,0);
    assert.match(c.bundle.bundleSha256,/^[0-9a-f]{64}$/);
  }
  assert.doesNotMatch(text,/token=|run-[0-9a-f]{16}|[A-Z]:\\\\|\/tmp\/|AppData|Users/,'no tokens, run ids or local paths');
});

test('the loop runs in CI after the isolated client builds',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8')),ci=await readFile('.github/workflows/ci.yml','utf8');
  assert.equal(pkg.scripts['test:product-loop'],'playwright test -c tests/product-loop/playwright.config.ts');
  const at=ci.indexOf('npm run test:client-builds'),loop=ci.indexOf('npm run test:product-loop');
  assert.ok(at>0&&loop>at);
  for(const id of Object.keys(CONSUMERS))assert.ok(ci.indexOf('npm run build:client -- '+id)>at);
});

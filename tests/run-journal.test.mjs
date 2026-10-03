import test from 'node:test';
import assert from 'node:assert/strict';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {RunJournal,validateRunRecord,compareRuns} from '../src/framework/foundation/journal.ts';
import {definition,runSpec,rows,tick} from './foundation-fixture.mjs';
function setup(d=definition(),options){const runtime=new SiteRuntime(d),journal=new RunJournal(runtime,[runSpec()],options),detach=journal.attach();return {runtime,journal,detach};}
test('opt-in observation adds no default history listeners or saved-state payload',async()=>{const r=new SiteRuntime(definition());assert.equal(r.runObserverDiagnostics().listeners,0);await r.runTask('compute');assert.deepEqual(Object.keys(r.save('home')),['format','version','appId','appVersion','page','values']);});
test('a completed run captures exact parameters and the validated result',async()=>{const {runtime,journal}=setup();await runtime.runTask('compute');const r=journal.getSnapshot().records[0];assert.equal(r.status,'succeeded');assert.deepEqual(r.parameters,{gain:1});assert.deepEqual(r.artifact.payload.rows,rows());assert.equal(r.artifact.provenance.runId,r.id);assert.equal(r.retention,'retained');assert.ok(r.durationMs>=0);});
test('changing view state does not create a run or mutate completed evidence',async()=>{const {runtime,journal}=setup();await runtime.runTask('compute');const before=journal.getSnapshot();runtime.set('camera',5);assert.equal(journal.getSnapshot(),before);runtime.set('gain',2);assert.equal(journal.getSnapshot(),before);assert.equal(before.records[0].parameters.gain,1);});
test('two runs can be compared without changing either snapshot',async()=>{const {runtime,journal}=setup();await runtime.runTask('compute');runtime.set('gain',3);await runtime.runTask('compute');const [a,b]=journal.getSnapshot().records;assert.equal(a.artifact.payload.rows[0].value,2);assert.equal(b.artifact.payload.rows[0].value,6);assert.equal(compareRuns(a,b).parameters[0].changed,true);assert.throws(()=>compareRuns(a,{...b,modelVersion:'2'}));});
test('superseded late result never overwrites either newer output or history',async()=>{const d=definition();let release,calls=0;d.bindings.tasks.compute=async()=>++calls===1?await new Promise(resolve=>release=resolve):rows();const {runtime,journal}=setup(d),first=runtime.runTask('compute');await tick();await runtime.runTask('compute');release([{id:'a',value:999,time:0}]);await first;assert.deepEqual(journal.getSnapshot().records.map(r=>r.status),['superseded','succeeded']);assert.equal(runtime.dataset('result')[0].value,2);});
test('input invalidation ends the old observation as superseded',async()=>{const d=definition();let release;d.bindings.tasks.compute=()=>new Promise(resolve=>release=resolve);const {runtime,journal}=setup(d),work=runtime.runTask('compute');await tick();runtime.set('gain',2);release(rows());await work;assert.equal(journal.getSnapshot().records[0].status,'superseded');assert.equal(journal.getSnapshot().records[0].artifact,null);});
test('cancellation before the provider microtask prevents invocation',async()=>{const d=definition();let called=0;d.bindings.tasks.compute=async()=>{called++;return rows();};const {runtime,journal}=setup(d),work=runtime.runTask('compute');runtime.cancelTask('compute');await work;assert.equal(called,0);assert.equal(journal.getSnapshot().records[0].status,'cancelled');});
test('timeout and model error remain different observed outcomes',async()=>{for(const [handler,status] of [[()=>new Promise(()=>{}),'timed-out'],[async()=>{throw new Error('Expected failure');},'failed']]){const d=definition();d.manifest.tasks[0].timeoutMs=100;d.bindings.tasks.compute=handler;const {runtime,journal}=setup(d);await runtime.runTask('compute');assert.equal(journal.getSnapshot().records[0].status,status);}});
test('invalid output rows are rejected before success can be recorded',async()=>{const d=definition();d.bindings.tasks.compute=async()=>[{id:'bad',value:Infinity,time:0}];const {runtime,journal}=setup(d);await runtime.runTask('compute');assert.equal(journal.getSnapshot().records[0].status,'failed');});
test('observer exceptions cannot turn a valid task into a failure',async()=>{const r=new SiteRuntime(definition());r.subscribeTaskRuns(()=>{throw new Error('bad UI subscriber');});assert.equal((await r.runTask('compute')).status,'ready');assert.equal(r.runObserverDiagnostics().errors,2);});
test('journal limits evict old records and report it explicitly',async()=>{const {runtime,journal}=setup(definition(),{maxRecords:2});for(let i=0;i<4;i++)await runtime.runTask('compute');assert.equal(journal.getSnapshot().records.length,2);assert.equal(journal.getSnapshot().evicted,2);});
test('an output too large for the journal does not undo a successful task',async()=>{const d=definition();d.bindings.tasks.compute=async()=>Array.from({length:500},(_,i)=>({id:'r'+i,value:i,time:i}));const r=new SiteRuntime(d),s=runSpec();s.representations=s.representations.filter(v=>v.kind!=='metric');const j=new RunJournal(r,[s],{maxBytes:4096});j.attach();assert.equal((await r.runTask('compute')).status,'ready');assert.equal(j.getSnapshot().records[0].retention,'omitted-budget');assert.equal(j.getSnapshot().records[0].status,'succeeded');});
test('record export contains immutable evidence but never reexecutes a task',async()=>{const {runtime,journal}=setup();await runtime.runTask('compute');const r=journal.getSnapshot().records[0],encoded=journal.exportRecord(r.id);assert.deepEqual(validateRunRecord(JSON.parse(encoded)),r);assert.equal(journal.getSnapshot().records.length,1);assert.throws(()=>journal.exportRecord('missing'));});
test('detach reports unknown completion rather than claiming cancellation',async()=>{const d=definition();let release;d.bindings.tasks.compute=()=>new Promise(resolve=>release=resolve);const {runtime,journal,detach}=setup(d),work=runtime.runTask('compute');await tick();detach();release(rows());await work;assert.equal(runtime.getSnapshot().tasks.compute.status,'ready');assert.equal(journal.getSnapshot().records[0].status,'unobserved');assert.equal(journal.getSnapshot().records[0].finishedAt,null);});
test('attach detaches cleanly and can be reattached without duplicate observers',async()=>{const {runtime,journal,detach}=setup();assert.throws(()=>journal.attach());detach();assert.equal(runtime.runObserverDiagnostics().listeners,0);const off=journal.attach();await runtime.runTask('compute');assert.equal(journal.getSnapshot().records.length,1);off();});
test('journal clear does not cancel a running task',async()=>{const d=definition();let release;d.bindings.tasks.compute=()=>new Promise(resolve=>release=resolve);const {runtime,journal}=setup(d),work=runtime.runTask('compute');await tick();journal.clear();release(rows());await work;assert.equal(runtime.getSnapshot().tasks.compute.status,'ready');assert.equal(journal.getSnapshot().records.length,0);});
test('run records enforce cross-field invariants and reject foreign artifacts',async()=>{const {runtime,journal}=setup();await runtime.runTask('compute');const r=journal.getSnapshot().records[0];for(const mutate of [v=>v.status='failed',v=>v.retention=['retained'],v=>v.artifact.provenance.runId='other',v=>v.finishedAt='yesterday',v=>v.parameters.gain={code:'bad'},v=>v.extra='x']){const c=structuredClone(r);mutate(c);assert.throws(()=>validateRunRecord(c));}});
test('run specs cannot reference unknown tasks or silently duplicate ownership',()=>{const r=new SiteRuntime(definition());assert.throws(()=>new RunJournal(r,[{...runSpec(),taskId:'unknown'}]));assert.throws(()=>new RunJournal(r,[runSpec(),runSpec()]));});

test('task event observers are read-only and cannot reenter runtime mutations', async()=>{
  const r=new SiteRuntime(definition());
  const phases=[];
  r.subscribeTaskRuns(e=>{if(e.phase==='started')r.cancelTask('compute');});
  r.subscribeTaskRuns(e=>{if(e.phase==='started')r.runTask('compute');});
  r.subscribeTaskRuns(e=>{if(e.phase==='succeeded')r.set('gain',4);});
  r.subscribeTaskRuns(e=>phases.push(e.phase));
  await r.runTask('compute');
  assert.deepEqual(phases,['started','succeeded']);
  assert.equal(r.getSnapshot().tasks.compute.status,'ready');
  assert.equal(r.getSnapshot().values.gain,1);
  assert.equal(r.runObserverDiagnostics().errors,3);
});

test('selected run stays pinned across a new result until follow-latest is requested',async()=>{
  const r=new SiteRuntime(definition()),j=new RunJournal(r,[runSpec()]);const off=j.attach();
  await r.runTask('compute');const first=j.getSnapshot().records[0];j.select(first.id);
  await r.runTask('compute');assert.equal(j.getSnapshot().selectedId,first.id);
  j.select(null);assert.equal(j.getSnapshot().selectedId,j.getSnapshot().records[1].id);
  off();
});

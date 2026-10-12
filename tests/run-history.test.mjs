import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {RunJournal} from '../src/framework/foundation/journal.ts';
import {validateDefinition} from '../src/framework/validate.ts';
import {bindRunHistory,loadRunHistory,saveRunHistory,resetRunHistory,runHistoryKey,toReference,validateRunHistory} from '../src/framework/foundation/run-history.ts';
import {definition,runSpec,tick} from './foundation-fixture.mjs';

// Synthetic marker values: if any of them reaches storage, a result payload or message leaked.
const MARK=7777.125,MESSAGE='SYNTHETIC-FAILURE-MARKER';
const KEY=runHistoryKey('example','experiments');
function spyStore(initial={}){
  const data=new Map(Object.entries(initial)),calls=[];
  return {data,calls,getItem:k=>{calls.push(['get',k]);return data.has(k)?data.get(k):null;},setItem:(k,v)=>{calls.push(['set',k]);data.set(k,String(v));},removeItem:k=>{calls.push(['remove',k]);data.delete(k);}};
}
function fixture(handler){
  const d=definition();d.bindings.tasks.compute=handler??(async({values})=>[{id:'a',value:MARK*values.gain,time:0},{id:'b',value:3,time:1}]);
  const runtime=new SiteRuntime(d),journal=new RunJournal(runtime,[runSpec()]);
  return {d,runtime,journal};
}
const scope=(runtime,maxRefs=20)=>({manifest:runtime.manifest,resource:'experiments',specs:[runSpec()],maxRefs});
function bind(runtime,journal,store,maxRefs){const notices=[];const c=bindRunHistory(journal,{store,...(maxRefs?{maxRefs}:{})},{manifest:runtime.manifest,resource:'experiments',specs:[runSpec()]},n=>notices.push(n));const off=journal.attach();return {c,off,notices};}
async function savedValue(){
  const {runtime,journal}=fixture(),store=spyStore();bind(runtime,journal,store);
  await runtime.runTask('compute');return {raw:store.data.get(KEY),runtime};
}

test('saved history holds references only: no payload, rows, message or marker values',async()=>{
  const d=definition();let fail=false;
  d.bindings.tasks.compute=async()=>{if(fail)throw new Error(MESSAGE);return [{id:'a',value:MARK,time:0}];};
  const runtime=new SiteRuntime(d),journal=new RunJournal(runtime,[runSpec()]),store=spyStore();bind(runtime,journal,store);
  await runtime.runTask('compute');fail=true;await runtime.runTask('compute');
  const raw=store.data.get(KEY);assert.ok(raw);
  for(const forbidden of [String(MARK),MESSAGE,'"payload"','"rows"','"message"','"artifact":'])assert.equal(raw.includes(forbidden),false,'leaked '+forbidden);
  const doc=JSON.parse(raw);assert.equal(doc.format,'datapass.run-history');assert.equal(doc.version,1);
  assert.deepEqual(doc.refs.map(r=>r.outcome),['succeeded','failed']);
  assert.deepEqual(doc.refs[0].artifactRef.representationIds,['table','curve','metric','json']);
  assert.equal(doc.refs[1].artifactRef,null);assert.ok(doc.refs.every(r=>r.restored===true));
});
test('a run still running when saved is written as unobserved with no finish time',async()=>{
  let release;const {runtime,journal}=fixture(()=>new Promise(r=>release=r)),store=spyStore();bind(runtime,journal,store);
  const work=runtime.runTask('compute');await tick();
  const ref=JSON.parse(store.data.get(KEY)).refs[0];
  assert.equal(ref.outcome,'unobserved');assert.equal(ref.finishedAt,null);assert.equal(ref.artifactRef,null);
  release([{id:'a',value:1,time:0}]);await work;
  assert.equal(JSON.parse(store.data.get(KEY)).refs[0].outcome,'succeeded');
});
test('reload restores references separately, labelled restored, without rerunning anything',async()=>{
  const first=fixture(),store=spyStore();bind(first.runtime,first.journal,store);
  await first.runtime.runTask('compute');await first.runtime.runTask('compute');
  const next=fixture();let runs=0,subs=0;
  const runTask=next.runtime.runTask.bind(next.runtime),subscribe=next.runtime.subscribeTaskRuns.bind(next.runtime);
  next.runtime.runTask=(...a)=>{runs++;return runTask(...a);};next.runtime.subscribeTaskRuns=(...a)=>{subs++;return subscribe(...a);};
  const {c}=bind(next.runtime,next.journal,store);
  const s=next.journal.getSnapshot();
  assert.equal(s.records.length,0);assert.equal(s.restored.length,2);assert.ok(s.restored.every(r=>r.restored&&r.outcome==='succeeded'));
  assert.equal(runs,0,'restore never runs a task');assert.equal(subs,1,'only the existing journal attach subscribes');
  assert.equal(next.runtime.getSnapshot().tasks.compute.status,'idle');
  assert.equal(c.notice,null);
});
test('the reference count limit holds and keeps the newest',async()=>{
  const {runtime,journal}=fixture(),store=spyStore();bind(runtime,journal,store,3);
  for(let i=0;i<5;i++)await runtime.runTask('compute');
  const refs=JSON.parse(store.data.get(KEY)).refs;assert.equal(refs.length,3);
  assert.deepEqual(refs.map(r=>r.id),journal.getSnapshot().records.slice(-3).map(r=>r.id));
});
test('v2, other app version, unknown task and malformed data are refused whole and kept aside',async()=>{
  const {raw}=await savedValue(),doc=JSON.parse(raw);
  const cases={
    newer:JSON.stringify({...doc,version:2}),
    appVersion:JSON.stringify({...doc,appVersion:'2'}),
    unknownTask:JSON.stringify({...doc,refs:[doc.refs[0],{...doc.refs[0],id:doc.refs[0].id+'x',taskId:'removed'}]}),
    payload:JSON.stringify({...doc,refs:[{...doc.refs[0],artifact:{rows:[]}}]}),
    claimedFinish:JSON.stringify({...doc,refs:[{...doc.refs[0],outcome:'unobserved'}]}),
    malformed:'{"format":"datapass.run-history",',
  };
  for(const [name,value] of Object.entries(cases)){
    const {runtime,journal}=fixture();journal.attach();await runtime.runTask('compute');
    const before=journal.getSnapshot(),store=spyStore({[KEY]:value}),notices=[];
    bindRunHistory(journal,{store},{manifest:runtime.manifest,resource:'experiments',specs:[runSpec()]},n=>notices.push(n));
    assert.equal(before.records.length,1);
    assert.equal(journal.getSnapshot(),before,name+': current journal state unchanged');
    assert.equal(journal.getSnapshot().restored.length,0,name);
    assert.equal(store.data.get(KEY+'.rejected'),value,name+': kept aside verbatim');
    assert.equal(store.data.has(KEY),false,name+': main key cleared, nothing deleted');
    assert.match(notices[0],/was not restored/,name);
  }
});
function asideFailStore(initial,mode){
  const s=spyStore(initial),set=s.setItem;
  s.setItem=(k,v)=>{if(k===KEY+'.rejected'){s.calls.push(['set-fail',k]);if(mode==='silent')return;throw new Error('QuotaExceededError');}set(k,v);};
  return s;
}
for(const mode of ['throws','silent']){
  test(`a refused value that cannot be kept aside (.rejected write ${mode}) stays in place and saving is suspended`,async()=>{
    const value='{"format":"datapass.run-history",';
    const {runtime,journal}=fixture(),store=asideFailStore({[KEY]:value},mode);const {c,notices}=bind(runtime,journal,store);
    assert.equal(store.data.get(KEY),value,'refused bytes left under the main key');assert.equal(store.data.has(KEY+'.rejected'),false);
    assert.match(c.notice,/was not restored/);assert.match(c.notice,/saving is suspended for this session/);
    await runtime.runTask('compute');await runtime.runTask('compute');
    assert.equal(journal.getSnapshot().records.length,2,'live history still works');
    assert.equal(store.data.get(KEY),value,'no save overwrote the refused bytes');
    assert.equal(store.calls.filter(([op,k])=>op==='set'&&k===KEY).length,0,'main key never written');
    assert.equal(store.calls.filter(([op,k])=>op==='remove'&&k===KEY).length,0,'main key never removed');
    assert.equal(notices.length,1,'the suspension notice stays');
    const again=bindRunHistory(journal,{store},{manifest:runtime.manifest,resource:'experiments',specs:[runSpec()]});
    assert.match(again.notice,/suspended/,'a remount of the same journal stays suspended');
    await runtime.runTask('compute');assert.equal(store.data.get(KEY),value);
    again.dispose();
    c.reset();assert.match(c.notice,/was reset, including the refused value/);assert.equal(store.data.has(KEY),false,'explicit reset clears it');
    await runtime.runTask('compute');assert.equal(JSON.parse(store.data.get(KEY)).refs.length,1,'saving resumes for runs after the reset');
  });
}
test('an existing .rejected value is never overwritten by a second refusal',async()=>{
  const first='{"format":"datapass.run-history","version":9}',second='not json at all';
  const {runtime,journal}=fixture(),store=spyStore({[KEY+'.rejected']:first,[KEY]:second});const {c}=bind(runtime,journal,store);
  assert.equal(store.data.get(KEY+'.rejected'),first,'first refused value kept');assert.equal(store.data.get(KEY),second,'second refused value kept in place');
  assert.match(c.notice,/earlier refused value already occupies/);assert.match(c.notice,/saving is suspended/);
  assert.equal(store.calls.some(([op,k])=>op!=='get'&&k===KEY+'.rejected'),false,'.rejected never written or removed');
  await runtime.runTask('compute');assert.equal(store.data.get(KEY),second,'no save overwrote it');
  c.reset();assert.equal(store.data.has(KEY),false);assert.equal(store.data.get(KEY+'.rejected'),first,'reset leaves .rejected alone');
  await runtime.runTask('compute');assert.equal(JSON.parse(store.data.get(KEY)).refs.length,1);
});
test('pure load reports suspension when the kept-aside slot cannot be read',()=>{
  const {runtime}=fixture(),store=spyStore({[KEY]:'bad'});const get=store.getItem;
  store.getItem=k=>{if(k===KEY+'.rejected')throw new Error('blocked');return get(k);};
  const r=loadRunHistory(store,scope(runtime));assert.equal(r.suspended,true);assert.deepEqual(r.refs,[]);assert.equal(store.data.get(KEY),'bad');
});
test('reset removes saved references and leaves the kept-aside value alone',async()=>{
  const {runtime,journal}=fixture(),store=spyStore({[KEY+'.rejected']:'old'});const {c}=bind(runtime,journal,store);
  await runtime.runTask('compute');assert.ok(store.data.has(KEY));
  c.reset();assert.equal(store.data.has(KEY),false);assert.equal(store.data.get(KEY+'.rejected'),'old');
  assert.equal(journal.getSnapshot().records.length,1,'live records stay visible');
  const next=fixture();bind(next.runtime,next.journal,store);assert.equal(next.journal.getSnapshot().restored.length,0);
  await runtime.runTask('compute');assert.equal(JSON.parse(store.data.get(KEY)).refs.length,1,'only runs after the reset are saved');
});
test('without a runHistory binding storage is never touched',async()=>{
  const {runtime,journal}=fixture(),store=spyStore();
  assert.equal(bindRunHistory(journal,undefined,{manifest:runtime.manifest,resource:'experiments',specs:[runSpec()]}),null);
  journal.attach();await runtime.runTask('compute');assert.deepEqual(store.calls,[]);
});
test('unavailable storage keeps history in memory with a notice',async()=>{
  const {runtime,journal}=fixture(),broken={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  const {c}=bind(runtime,journal,broken);assert.match(c.notice,/in memory/);
  assert.equal((await runtime.runTask('compute')).status,'ready');assert.equal(journal.getSnapshot().records.length,1);
  assert.match(c.notice,/could not be saved/);
});
test('pure helpers: save validates, load is all-or-nothing, reset is idempotent',async()=>{
  const {runtime,journal}=fixture();journal.attach();await runtime.runTask('compute');
  const store=spyStore(),ref=toReference(journal.getSnapshot().records[0]);
  assert.equal(saveRunHistory(store,scope(runtime),[ref]),null);
  assert.equal(loadRunHistory(store,scope(runtime)).refs.length,1);
  assert.match(saveRunHistory(store,scope(runtime),[{...ref,outcome:'running'}]),/could not be saved/);
  assert.throws(()=>validateRunHistory({...JSON.parse(store.data.get(KEY)),resource:'other'},scope(runtime)));
  resetRunHistory(store,scope(runtime));resetRunHistory(store,scope(runtime));assert.equal(store.data.has(KEY),false);
});
test('definition validation accepts only a trusted store on a used run resource',()=>{
  const d=definition();d.resources={runs:{experiments:{specs:[runSpec()]}}};
  d.manifest.pages[0].sections[0].blocks.push({id:'runs',type:'runs',resource:'experiments'});
  const store=spyStore();
  assert.doesNotThrow(()=>validateDefinition({...d,runHistory:{experiments:{store,maxRefs:5}}}));
  assert.throws(()=>validateDefinition({...d,runHistory:{other:{store}}}),/unused run resource/);
  assert.throws(()=>validateDefinition({...d,runHistory:{experiments:{store:{getItem:'x'}}}}),/trusted/);
  assert.throws(()=>validateDefinition({...d,runHistory:{experiments:{store,maxRefs:500}}}));
  assert.deepEqual(store.calls,[],'validation never touches storage');
});
test('only foundation-reference opts in among the reference clients',async()=>{
  const opted=[];
  for(const id of await readdir('clients')){
    let source='';try{source=await readFile(`clients/${id}/app.ts`,'utf8');}catch{continue;}
    if(/runHistory\s*:/.test(source))opted.push(id);
  }
  assert.deepEqual(opted,['foundation-reference']);
  for(const file of ['src/store.ts','src/workspace/persist.ts'])assert.equal((await readFile(file,'utf8')).includes('run-history'),false,file);
});
test('SiteRuntime keeps the trusted binding (delegating, without freezing the client store)',()=>{
  const d=definition();d.resources={runs:{experiments:{specs:[runSpec()]}}};
  d.manifest.pages[0].sections[0].blocks.push({id:'runs',type:'runs',resource:'experiments'});
  const store=spyStore(),runtime=new SiteRuntime({...d,runHistory:{experiments:{store,maxRefs:4}}});
  const kept=runtime.definition.runHistory.experiments;assert.equal(kept.maxRefs,4);
  kept.store.setItem('k','v');assert.equal(store.data.get('k'),'v');assert.equal(Object.isFrozen(store),false);
  assert.equal(new SiteRuntime(definition()).definition.runHistory,undefined);
});

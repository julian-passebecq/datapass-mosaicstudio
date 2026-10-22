// F202: one capability descriptor over the five existing compute paths. Fakes only; nothing here starts a
// process, opens a socket or schedules work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {COMPUTE_CAPABILITIES,COMPUTE_PATHS,describeCapabilities,supported,unsupported,capabilityReason,missingCapabilities,UnsupportedCapabilityError,
  createSiteTaskAdapter,createRuntimeRunAdapter,createHttpSourceAdapter,createLiveFileAdapter,
  SITE_TASK_CAPABILITIES,RUNTIME_RUN_CAPABILITIES,HTTP_SOURCE_CAPABILITIES,LIVE_FILE_CAPABILITIES,isRunState} from '../src/framework/compute/index.ts';
import {RuntimeClient} from '../src/framework/compute/runtime-client.ts';
import * as legacyRuntime from '../src/workspace/runtime.ts';
import {createJupyterAdapter,JUPYTER_KERNEL_CAPABILITIES} from '../src/workspace/compute-jupyter.ts';
import {definition} from './foundation-fixture.mjs';

const ALL={site:SITE_TASK_CAPABILITIES,runtime:RUNTIME_RUN_CAPABILITIES,jupyter:JUPYTER_KERNEL_CAPABILITIES,http:HTTP_SOURCE_CAPABILITIES,file:LIVE_FILE_CAPABILITIES};
const TOKEN='abcdefghijklmnopqrstu',BASE='http://127.0.0.1:21130/client/';
const src=p=>readFile(new URL(p,import.meta.url),'utf8');
const reply=(status,json)=>{const text=typeof json==='string'?json:JSON.stringify(json);return {ok:status<300,status,headers:{get:()=>null},text:async()=>text};};
function artifactFor(id,runId){return {format:'datapass.artifact',version:1,id,title:'Synthetic run',provenance:{kind:'synthetic',source:'test fixture',...(runId?{runId}:{})},payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'Id',type:'string'},{id:'v',label:'V',type:'number'}],rows:[{id:'a',v:1}]},representations:[{id:'table',title:'Rows',kind:'table'}]};}
const unsupportedCall=(capability,path)=>error=>error instanceof UnsupportedCapabilityError&&error.capability===capability&&error.path===path&&error.reason.length>0;

test('every path declares all eight capabilities, and every unsupported one has a reason',()=>{
  assert.deepEqual([...COMPUTE_CAPABILITIES],['submit','progress','cancel','interrupt','result','history','durableResult','inputs']);
  assert.deepEqual([...COMPUTE_PATHS],['site-task','runtime-run','jupyter-kernel','http-source','live-file']);
  for(const [name,d] of Object.entries(ALL)){
    assert.deepEqual(Object.keys(d),[...COMPUTE_CAPABILITIES],name);
    assert.ok(Object.isFrozen(d),name);
    for(const key of COMPUTE_CAPABILITIES){const c=d[key];assert.equal(typeof c.supported,'boolean');if(!c.supported)assert.ok(c.reason.trim().length>10,`${name}.${key} reason`);}
  }
  assert.throws(()=>describeCapabilities({...SITE_TASK_CAPABILITIES,progress:undefined}),/not declared/);
  assert.throws(()=>describeCapabilities({...SITE_TASK_CAPABILITIES,queue:supported()}),/Unknown compute capability: queue/);
  assert.throws(()=>unsupported(''),/reason/);
  assert.throws(()=>describeCapabilities({...SITE_TASK_CAPABILITIES,cancel:{supported:false}}),/reason/);
});

test('the descriptors state the real limits of each path (no progress fraction, no fake cancel)',()=>{
  assert.equal(RUNTIME_RUN_CAPABILITIES.progress.supported,false);assert.match(capabilityReason(RUNTIME_RUN_CAPABILITIES,'progress'),/no progress fraction/);
  assert.equal(HTTP_SOURCE_CAPABILITIES.cancel.supported,false);assert.match(capabilityReason(HTTP_SOURCE_CAPABILITIES,'cancel'),/may keep computing/);
  assert.equal(LIVE_FILE_CAPABILITIES.cancel.supported,false);assert.equal(LIVE_FILE_CAPABILITIES.submit.supported,false);
  assert.equal(JUPYTER_KERNEL_CAPABILITIES.cancel.supported,false);assert.equal(JUPYTER_KERNEL_CAPABILITIES.interrupt.supported,true);
  assert.equal(SITE_TASK_CAPABILITIES.cancel.supported,true);assert.equal(SITE_TASK_CAPABILITIES.interrupt.supported,false);
  // Owner default (PLAN §4): durable browser-task results need an ADR; only the file path is durable by itself.
  assert.deepEqual(Object.entries(ALL).filter(([,d])=>d.durableResult.supported).map(([n])=>n),['file']);
  assert.deepEqual(missingCapabilities(HTTP_SOURCE_CAPABILITIES).map(m=>m.capability),['progress','cancel','interrupt','result','history','durableResult','inputs']);
  assert.equal(capabilityReason(SITE_TASK_CAPABILITIES,'cancel'),null);
});

test('site task: submit wraps runTask, maps outcomes onto F203 states and reads the result',async()=>{
  const runtime=new SiteRuntime(definition()),adapter=createSiteTaskAdapter(runtime,'compute');
  assert.deepEqual(adapter.inputs().map(i=>[i.id,i.min,i.max,i.default]),[['gain',0,10,1]]);
  const updates=[];
  const ok=await adapter.submit({gain:3},{onUpdate:o=>updates.push(o)});
  assert.equal(ok.state,'succeeded');assert.equal(ok.result[0].value,6);assert.match(ok.runId,/^compute:\d+$/);
  assert.equal(runtime.getSnapshot().values.gain,3);
  assert.ok(updates.every(u=>u.state==='running'&&u.progress===null),'no progress invented when the handler reports none');
  assert.equal((await adapter.result(ok.runId))[0].value,6);
  runtime.set('gain',4);
  await assert.rejects(adapter.result(ok.runId),/no longer current/);
  await assert.rejects(adapter.submit({camera:1}),/does not declare input camera/);
  await assert.rejects(adapter.interrupt(ok.runId),unsupportedCall('interrupt','site-task'));
  await assert.rejects(adapter.history(),unsupportedCall('history','site-task'));
});

test('site task: cancel and abort go through SiteRuntime.cancelTask; failures and timeouts stay distinct',async()=>{
  const d=definition();let release;
  d.bindings.tasks.compute=({signal,report})=>new Promise((resolve,reject)=>{report(.5);release=resolve;signal.addEventListener('abort',()=>reject(new Error('aborted')));});
  const runtime=new SiteRuntime(d),adapter=createSiteTaskAdapter(runtime,'compute');
  const updates=[];const pending=adapter.submit({},{onUpdate:o=>updates.push(o)});
  await new Promise(r=>setTimeout(r,5));
  const runId=updates.at(-1).runId;assert.equal(updates.at(-1).progress,.5,'a reported fraction is passed through');
  await adapter.cancel(runId);
  const cancelled=await pending;assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.result,null);
  await assert.rejects(adapter.cancel(runId),/not running/);
  const abort=new AbortController();const second=adapter.submit({},{signal:abort.signal});abort.abort();
  assert.equal((await second).state,'cancelled');
  release?.([]);
  const failing=definition();failing.bindings.tasks.compute=async()=>{throw new Error('synthetic failure');};
  const failed=await createSiteTaskAdapter(new SiteRuntime(failing),'compute').submit();
  assert.equal(failed.state,'failed');assert.match(failed.message,/synthetic failure/);
  const slow=definition();slow.manifest.tasks[0].timeoutMs=100;slow.bindings.tasks.compute=()=>new Promise(()=>{});
  assert.equal((await createSiteTaskAdapter(new SiteRuntime(slow),'compute').submit()).state,'timed-out');
});

function fakeRuntime(){
  const calls=[];let polls=0;
  const record=(over={})=>({runId:'run-00000000000000aa',model:'wind-reference',modelVersion:'v1',status:'queued',inputs:{k:2},inputHash:'c'.repeat(64),submittedAt:'2026-10-16T01:00:00.000Z',startedAt:null,finishedAt:null,error:null,artifactId:null,artifactSha256:null,...over});
  const body=JSON.stringify(artifactFor('wind-reference-run','run-00000000000000aa')),sha=createHash('sha256').update(body).digest('hex');
  const routes={
    'POST /api/runtime/v1/runs':()=>reply(202,record()),
    'GET /api/runtime/v1/runs':()=>reply(200,{runs:[record({status:'succeeded',artifactSha256:sha}),record({runId:'run-00000000000000bb',model:'other-model',status:'failed',error:'x'})]}),
    'GET /api/runtime/v1/runs/run-00000000000000aa':()=>reply(200,++polls<2?record({status:'running'}):record({status:'succeeded',artifactId:'wind-reference-run',artifactSha256:sha})),
    'GET /api/runtime/v1/runs/run-00000000000000aa/artifact':()=>reply(200,body),
    'POST /api/runtime/v1/runs/run-00000000000000aa/cancel':()=>reply(200,record({status:'cancelled'})),
  };
  const fetch=async(url,init)=>{calls.push(init.method+' '+new URL(url).pathname);const h=routes[init.method+' '+new URL(url).pathname];return h?h(init):reply(404,{detail:'Not Found'});};
  return {fetch,calls};
}
const MODEL={id:'wind-reference',version:'v1',title:'Wind reference (synthetic)',description:'d',illustrative:true,artifactId:'wind-reference-run',inputs:[{id:'k',label:'Shape k',unit:null,type:'number',min:1,max:4,default:2,step:null}]};

test('runtime run: submit polls the runtime state only, verifies the artifact, lists retained runs and cancels there',async()=>{
  const {fetch,calls}=fakeRuntime(),client=new RuntimeClient({origin:'http://127.0.0.1:24330',token:TOKEN},{fetch});
  const adapter=createRuntimeRunAdapter(client,MODEL,{intervalMs:1});
  assert.deepEqual(adapter.inputs(),[{id:'k',label:'Shape k',unit:null,type:'number',min:1,max:4,default:2}]);
  await assert.rejects(adapter.submit({k:9}),/between 1 and 4/);
  assert.equal(calls.length,0,'out-of-bounds inputs are refused before anything is sent');
  const updates=[];const done=await adapter.submit({k:2},{onUpdate:o=>updates.push(o)});
  assert.equal(done.state,'succeeded');assert.equal(done.result.provenance.runId,'run-00000000000000aa');
  assert.deepEqual(updates.map(u=>u.state),['queued','running','succeeded']);
  assert.ok(updates.every(u=>u.progress===null),'the runtime reports state only');
  assert.equal((await adapter.result('run-00000000000000aa')).id,'wind-reference-run');
  const history=await adapter.history();assert.deepEqual(history.map(h=>[h.runId,h.state]),[['run-00000000000000aa','succeeded']]);
  await adapter.cancel('run-00000000000000aa');assert.ok(calls.includes('POST /api/runtime/v1/runs/run-00000000000000aa/cancel'));
  await assert.rejects(adapter.interrupt('run-00000000000000aa'),unsupportedCall('interrupt','runtime-run'));
  assert.equal(calls.filter(c=>c==='POST /api/runtime/v1/runs').length,1,'no retry, no second submission');
});

test('runtime run: every submit carries its own Idempotency-Key; cancelRequested is read additively',async()=>{
  const keys=[];let cancelRequested;
  const base={runId:'run-00000000000000dd',model:'wind-reference',modelVersion:'v1',inputs:{k:2},inputHash:'d'.repeat(64),submittedAt:'2026-10-22T00:00:00.000Z',startedAt:null,finishedAt:'2026-10-22T00:00:00.002Z',error:'stopped',artifactId:null,artifactSha256:null};
  const fetch=async(url,init)=>{if(init.method==='POST'){keys.push(init.headers['Idempotency-Key']);return reply(202,{...base,status:'cancelled',...(cancelRequested===undefined?{}:{cancelRequested})});}return reply(404,{detail:'Not Found'});};
  const client=new RuntimeClient({origin:'http://127.0.0.1:24330',token:TOKEN},{fetch});
  const adapter=createRuntimeRunAdapter(client,MODEL,{intervalMs:1});
  assert.equal((await adapter.submit({k:2})).state,'cancelled');
  cancelRequested=true;
  assert.equal((await adapter.submit({k:2})).state,'cancelled');
  assert.equal(keys.length,2);assert.ok(keys.every(k=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)));
  assert.notEqual(keys[0],keys[1],'a new user submit gets a new key');
  assert.equal((await client.cancel('run-00000000000000dd')).cancelRequested,true);
  cancelRequested=undefined;assert.equal((await client.cancel('run-00000000000000dd')).cancelRequested,false,'an older runtime without the field');
  cancelRequested='yes';await assert.rejects(client.cancel('run-00000000000000dd'),/malformed cancelRequested/);
});

test('runtime run: stopping the poll is reported as not observed, never as cancelled',async()=>{
  const fetch=async(url,init)=>new URL(url).pathname.endsWith('/runs')&&init.method==='POST'
    ?reply(202,{runId:'run-00000000000000cc',model:'wind-reference',modelVersion:'v1',status:'running',inputs:{k:2},inputHash:'d'.repeat(64),submittedAt:'t',startedAt:'t',finishedAt:null,error:null,artifactId:null,artifactSha256:null})
    :reply(200,{runId:'run-00000000000000cc',model:'wind-reference',modelVersion:'v1',status:'running',inputs:{k:2},inputHash:'d'.repeat(64),submittedAt:'t',startedAt:'t',finishedAt:null,error:null,artifactId:null,artifactSha256:null});
  const adapter=createRuntimeRunAdapter(new RuntimeClient({origin:'http://127.0.0.1:24330',token:TOKEN},{fetch}),MODEL,{intervalMs:50});
  const abort=new AbortController();const pending=adapter.submit({k:2},{signal:abort.signal});
  setTimeout(()=>abort.abort(),5);
  const outcome=await pending;assert.equal(outcome.state,'not-observed');assert.match(outcome.message,/may still finish/);
});

test('jupyter kernel: execute and interrupt only; cancel, result and history are refused with reasons',async()=>{
  const interrupts=[];let finish;
  const client={execute:code=>({id:'exec-'+code.length,done:new Promise(r=>{finish=r;})}),interrupt:async id=>{interrupts.push(id);finish({status:'interrupted',executionCount:3,outputs:[],truncated:false,error:{ename:'KeyboardInterrupt',evalue:''}});}};
  const adapter=createJupyterAdapter(client);
  const updates=[];const pending=adapter.submit('long',{onUpdate:o=>updates.push(o)});
  assert.deepEqual(updates.map(u=>[u.state,u.progress]),[['running',null]]);
  await adapter.interrupt('exec-4');
  const outcome=await pending;assert.equal(outcome.state,'interrupted');assert.deepEqual(interrupts,['exec-4']);
  await assert.rejects(adapter.interrupt('exec-4'),/not running/);
  const ok=adapter.submit('x=1');finish({status:'ok',executionCount:4,outputs:[],truncated:false});assert.equal((await ok).state,'succeeded');
  const lost=adapter.submit('y');finish({status:'disconnected',executionCount:null,outputs:[],truncated:false,detail:'closed'});
  assert.equal((await lost).state,'not-observed');
  await assert.rejects(adapter.cancel('exec-1'),unsupportedCall('cancel','jupyter-kernel'));
  await assert.rejects(adapter.result('exec-1'),unsupportedCall('result','jupyter-kernel'));
  await assert.rejects(adapter.history(),unsupportedCall('history','jupyter-kernel'));
  assert.throws(()=>adapter.inputs(),unsupportedCall('inputs','jupyter-kernel'));
});

test('http source: one validated request; abort is not observed and cancel is refused with the reason',async()=>{
  const seen=[];
  const fetch=async(url,init)=>{seen.push({url,method:init.method,credentials:init.credentials});if(init.signal?.aborted){const e=new Error('aborted');e.name='AbortError';throw e;}return reply(200,artifactFor('wind-live'));};
  const adapter=createHttpSourceAdapter({url:'http://127.0.0.1:24330/compute/wind-reference',id:'wind-live',base:BASE,fetch});
  const ok=await adapter.submit({k:2});
  assert.equal(ok.state,'succeeded');assert.equal(ok.result.id,'wind-live');assert.deepEqual(seen[0],{url:'http://127.0.0.1:24330/compute/wind-reference',method:'POST',credentials:'omit'});
  const abort=new AbortController();abort.abort();
  const stopped=await adapter.submit({k:2},{signal:abort.signal});assert.equal(stopped.state,'not-observed');assert.match(stopped.message,/may still have computed/);
  const bad=await createHttpSourceAdapter({url:'http://example.com/x',base:BASE,fetch}).submit(undefined);
  assert.equal(bad.state,'failed');assert.match(bad.message,/loopback or same-origin/);
  await assert.rejects(adapter.cancel(ok.runId),e=>unsupportedCall('cancel','http-source')(e)&&/may keep computing/.test(e.message));
  for(const cap of ['interrupt','result','history'])await assert.rejects(adapter[cap](ok.runId),unsupportedCall(cap,'http-source'));
});

test('live file: result reads the file, watch is inert without the dev server, submit and cancel are refused',async()=>{
  const fetch=async url=>{assert.equal(url,'http://127.0.0.1:21130/client/artifacts/wind-aep.json');return reply(200,artifactFor('wind-aep'));};
  const adapter=createLiveFileAdapter({id:'wind-aep',base:BASE,fetch});
  assert.equal((await adapter.result('current')).id,'wind-aep');
  assert.equal(adapter.watchable,false,'built pages have no file watcher');assert.equal(typeof adapter.watch(()=>{}),'function');
  const changes=[];let registered;
  const watched=createLiveFileAdapter({id:'wind-aep',base:BASE,fetch,watch:(id,l)=>{registered=id;l({id,sha256:'e'.repeat(64)});return()=>{};}});
  watched.watch(c=>changes.push(c));assert.equal(registered,'wind-aep');assert.equal(changes.length,1);
  await assert.rejects(adapter.submit(),unsupportedCall('submit','live-file'));
  await assert.rejects(adapter.cancel('current'),unsupportedCall('cancel','live-file'));
  await assert.rejects(adapter.interrupt('current'),unsupportedCall('interrupt','live-file'));
});

test('no queue, scheduler, process or timer is added; the old runtime path still re-exports the client',async()=>{
  assert.equal(legacyRuntime.RuntimeClient,RuntimeClient);
  for(const file of ['adapter.ts','site-task.ts','runtime-run.ts','http-source.ts','live-file.ts','../../workspace/compute-jupyter.ts']){
    const text=(await src('../src/framework/compute/'+file)).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'');
    assert.doesNotMatch(text,/setTimeout|setInterval|new Worker|child_process|spawn\(|pyodide|queueMicrotask|retry/i,file);
  }
  for(const state of ['succeeded','not-observed','cancelled','interrupted','timed-out'])assert.ok(isRunState(state));
});

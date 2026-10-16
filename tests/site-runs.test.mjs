// F206 durable site runs: a client site saves a runtime-produced run to the ResultStore on request and reopens it
// "Not recomputed" after a browser and a service restart. Fake fetch only; no process, socket or timer of its own.
// All data synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {createRuntimeLink,createRuntimeTask,RUNTIME_TASK_CAPABILITIES,RUNTIME_LINK_KEY,NOT_PAIRED,SITE_TASK_CAPABILITIES,capabilityReason} from '../src/framework/compute/index.ts';
import {SiteRunStore,SiteRunError,siteCellId,siteRunItem,siteSourceSha256,relinkCandidates,validateDurableRunsBindings} from '../src/framework/storage/index.ts';
import {artifactOutputs} from '../src/workspace/results.ts';
import {definition,runSpec,tick} from './foundation-fixture.mjs';

const ORIGIN='http://127.0.0.1:24361';
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const MODEL={id:'synthetic-gain',version:'synthetic-gain-1',title:'SYNTHETIC gain model',description:'Synthetic test model.',illustrative:true,artifactId:'synthetic-gain-run',inputs:[{id:'gain',label:'Gain',unit:'',type:'number',min:0,max:10,default:1,step:1}]};

function memorySession(){const data=new Map();return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}

/** A fake local service: the runtime runs API plus the ResultStore routes. `disk` survives a restart; the token does not. */
function fakeService(disk,token,{hold=false}={}){
  const calls=[];let seq=0;const runs=new Map();let release=null;
  const reply=(status,body)=>{const text=typeof body==='string'?body:JSON.stringify(body);return {ok:status<300,status,headers:{get:()=>null},text:async()=>text};};
  const record=(id,over={})=>({runId:id,model:MODEL.id,modelVersion:MODEL.version,status:'queued',inputs:{},inputHash:'0'.repeat(64),submittedAt:'2026-10-16T02:00:00.000Z',startedAt:null,finishedAt:null,error:null,artifactId:null,artifactSha256:null,...over});
  const fetch=async(url,init)=>{
    const path=new URL(url).pathname,key=init.method+' '+path;calls.push(key);
    if(!disk.up)throw new TypeError('Failed to fetch');
    if(init.headers['X-Datapass-Token']!==token)return reply(401,{detail:'missing or invalid X-Datapass-Token'});
    if(key==='GET /api/runtime/v1/models')return reply(200,{models:[MODEL]});
    if(key==='POST /api/runtime/v1/runs'){
      const {inputs}=JSON.parse(init.body);const id='run-'+(++seq).toString(16).padStart(16,'0');
      const rows=[{id:'a',value:2*inputs.gain,time:0},{id:'b',value:3*inputs.gain,time:1}];
      const body=JSON.stringify({format:'datapass.artifact',version:1,id:MODEL.artifactId,title:'SYNTHETIC run',provenance:{kind:'synthetic',source:'Synthetic fake runtime',runId:id},
        payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'ID',type:'string'},{id:'value',label:'Value',type:'number',nullable:true},{id:'time',label:'Time',type:'number'}],rows},
        representations:[{id:'table',title:'Rows',kind:'table'}]});
      runs.set(id,{body,rec:record(id,{inputs,inputHash:sha(JSON.stringify(inputs))})});
      return reply(202,runs.get(id).rec);
    }
    const run=path.match(/^\/api\/runtime\/v1\/runs\/(run-[0-9a-f]{16})(\/artifact|\/cancel)?$/);
    if(run){
      const r=runs.get(run[1]);if(!r)return reply(404,{detail:'unknown run'});
      if(run[2]==='/cancel'){r.rec={...r.rec,status:'cancelled',finishedAt:'2026-10-16T02:00:02.000Z'};return reply(200,r.rec);}
      if(run[2]==='/artifact')return reply(200,r.body);
      if(hold&&r.rec.status==='queued'){r.rec={...r.rec,status:'running'};await new Promise(res=>{release=res;});}
      if(r.rec.status!=='cancelled')r.rec={...r.rec,status:'succeeded',startedAt:'2026-10-16T02:00:00.500Z',finishedAt:'2026-10-16T02:00:01.000Z',artifactId:MODEL.artifactId,artifactSha256:sha(r.body)};
      return reply(200,r.rec);
    }
    if(!disk.store)return reply(404,{detail:'No result store: start the service with --results-dir <folder outside Git>.'});
    if(key==='GET /api/notebook/v1/store/manifest')return reply(200,{format:'datapass.result-store',version:1,workspace:disk.workspace,jobs:[],entries:disk.entries.map(e=>({...e,present:disk.files.has(e.resultSha256)})),store:{name:'store',maxBytes:1e6,usedBytes:0}});
    if(key==='POST /api/notebook/v1/store/results'){
      const {results}=JSON.parse(init.body);
      if(init.body.includes(token))return reply(422,{detail:'Refused: the payload contains the service token. Tokens are never stored.'});
      const out=results.map(item=>{
        const bytes=JSON.stringify(item.result),h=sha(bytes);
        if(!disk.files.has(h))disk.files.set(h,bytes);
        if(!disk.entries.some(e=>e.cellId===item.cellId&&e.resultSha256===h))disk.entries.push({cellId:item.cellId,cellKind:item.cellKind,sourceSha256:item.sourceSha256,resultSha256:h,bytes:bytes.length,run:item.run,savedAt:'2026-10-16T02:01:00.000Z'});
        return {cellId:item.cellId,resultSha256:h};
      });
      return reply(200,{results:out,store:{}});
    }
    const res=path.match(/^\/api\/notebook\/v1\/store\/results\/([0-9a-f]{64})$/);
    if(res&&init.method==='GET'){
      const bytes=disk.files.get(res[1]);if(bytes===undefined)return reply(404,{detail:`Result ${res[1].slice(0,12)} is not in the store.`});
      if(disk.corrupt?.has(res[1]))return reply(409,{detail:`Result ${res[1].slice(0,12)} is corrupt on disk (hash mismatch); it is not shown.`});
      return reply(200,bytes);
    }
    return reply(404,{detail:'Not Found'});
  };
  return {fetch,calls,release:()=>release?.()};
}

/** A synthetic client whose one task runs on the paired runtime, with durable runs opted in. */
function client(service,session,{durable=true,id='example'}={}){
  const link=createRuntimeLink(session);
  const task=createRuntimeTask({taskId:'compute',model:MODEL.id,link,client:{fetch:service.fetch},intervalMs:1});
  const d=definition();d.manifest.id=id;
  d.manifest.pages[0].sections[0].blocks.push({id:'runs',type:'runs',resource:'history'});
  d.resources={runs:{history:{specs:[runSpec()]}}};
  d.bindings.tasks.compute=task.handler;
  if(durable)d.durableRuns={history:{link,tasks:[task]}};
  return {runtime:new SiteRuntime(d),link,task};
}
const app=runtime=>({id:runtime.manifest.id,version:runtime.manifest.version});
const freshDisk=()=>({up:true,store:true,files:new Map(),entries:[],workspace:{notebookSha256:'f'.repeat(64),savedAt:'2026-10-15T00:00:00.000Z'}});

test('durable runs are a trusted, opt-in binding: runtime tasks only, used resources only, never in the manifest',()=>{
  const disk=freshDisk(),service=fakeService(disk,'synthetic-token-0123456789');
  const {runtime}=client(service,memorySession());
  assert.equal(runtime.definition.durableRuns.history.tasks[0].taskId,'compute');
  assert.ok(Object.isFrozen(runtime.definition.durableRuns.history),'wrapped and frozen like runHistory');
  assert.ok(!('durableRuns' in runtime.manifest)&&!JSON.stringify(runtime.manifest).includes('durable'),'not part of the inert manifest');
  assert.equal(client(service,memorySession(),{durable:false}).runtime.definition.durableRuns,undefined,'off when absent');
  // A browser task bound as if durable is refused: only runtime-produced runs are durable.
  const link=createRuntimeLink(memorySession()),task=createRuntimeTask({taskId:'compute',model:MODEL.id,link});
  const browser=definition();browser.manifest.pages[0].sections[0].blocks.push({id:'runs',type:'runs',resource:'history'});browser.resources={runs:{history:{specs:[runSpec()]}}};
  browser.durableRuns={history:{link,tasks:[task]}};
  assert.throws(()=>new SiteRuntime(browser),/not bound to its runtime task handler; only runtime-produced runs are durable/);
  const unused={...browser,bindings:{tasks:{compute:task.handler}},durableRuns:{other:{link,tasks:[task]}}};
  assert.throws(()=>new SiteRuntime(unused),/unused run resource: other/);
  assert.throws(()=>validateDurableRunsBindings({history:{link:{},tasks:[task]}},{appId:'example',runResources:{history:['compute']},taskBindings:{compute:task.handler}}),/trusted runtime link/);
  assert.equal(siteCellId('example','compute'),'site-example-compute');
  assert.throws(()=>siteCellId('a'.repeat(60),'b'.repeat(20)),/80-character cell id/);
  assert.equal(RUNTIME_TASK_CAPABILITIES.durableResult.supported,true);
  assert.equal(SITE_TASK_CAPABILITIES.durableResult.supported,false);
  assert.match(capabilityReason(SITE_TASK_CAPABILITIES,'durableResult'),/ADR/);
});

test('pairing: the fragment is parsed, nothing connects without consent, and the token stays in session storage',async()=>{
  const disk=freshDisk(),token='synthetic-token-0123456789',service=fakeService(disk,token);
  const session=memorySession(),{runtime,link}=client(service,session);
  assert.equal(link.get(),null);
  const state=await runtime.runTask('compute');
  assert.equal(state.status,'error');assert.equal(state.message,NOT_PAIRED,'no fallback when unpaired');
  assert.deepEqual(service.calls,[],'nothing was sent');
  const pending=link.pending(`#runtime=${encodeURIComponent(ORIGIN)}&token=${token}`);
  assert.deepEqual(pending,{origin:ORIGIN,token});assert.equal(link.get(),null,'parsing is not consent');
  assert.throws(()=>link.pending('#runtime=http%3A%2F%2Fexample.com%3A80&token='+token),/loopback/);
  assert.equal(link.pending('#page=home'),null);
  link.connect(pending);
  assert.deepEqual(JSON.parse(session.data.get(RUNTIME_LINK_KEY)),{origin:ORIGIN,token});
  assert.ok(!JSON.stringify(runtime.save('home')).includes(token),'never in saved UI state');
  session.data.set(RUNTIME_LINK_KEY,'{"origin":"http://evil.example:1","token":"x"}');
  assert.equal(link.get(),null);assert.equal(session.data.has(RUNTIME_LINK_KEY),false,'a tampered link is dropped');
});

test('a runtime task runs through SiteRuntime; Cancel sends an explicit runtime cancel and keeps no result',async()=>{
  const disk=freshDisk(),token='synthetic-token-0123456789',service=fakeService(disk,token);
  const {runtime,link,task}=client(service,memorySession());link.connect({origin:ORIGIN,token});
  runtime.set('gain',3);
  const ok=await runtime.runTask('compute');
  assert.equal(ok.status,'ready',ok.message);
  assert.deepEqual(runtime.dataset('result').map(r=>r.value),[6,9]);
  const latest=task.latest();
  assert.equal(latest.record.status,'succeeded');assert.deepEqual(latest.values,{gain:3});assert.deepEqual(latest.inputs,{gain:3});
  assert.equal(latest.artifact.provenance.runId,latest.record.runId);
  assert.equal(service.calls.filter(c=>c==='POST /api/runtime/v1/runs').length,1,'one submission, no retry');
  // Cancel while the runtime holds the run: SiteRuntime aborts, the handler sends POST .../cancel.
  const held=fakeService(disk,token,{hold:true});
  const c2=client(held,memorySession());c2.link.connect({origin:ORIGIN,token});
  const pending=c2.runtime.runTask('compute');
  for(let i=0;i<50&&!held.calls.some(c=>/^GET \/api\/runtime\/v1\/runs\/run-/.test(c));i++)await tick();
  c2.runtime.cancelTask('compute');held.release();
  assert.equal((await pending).status,'cancelled');
  for(let i=0;i<20&&!held.calls.some(c=>c.endsWith('/cancel'));i++)await tick();
  assert.ok(held.calls.includes('POST /api/runtime/v1/runs/run-0000000000000001/cancel'),'explicit cancel on the runtime');
  assert.equal(c2.task.latest(),null,'a cancelled run is never offered for saving');
});

test('save is explicit; reopen after a browser and service restart is by hash and not recomputed',async()=>{
  const disk=freshDisk(),token1='synthetic-token-first-0123456';
  const s1=fakeService(disk,token1),{runtime,link,task}=client(s1,memorySession());link.connect({origin:ORIGIN,token:token1});
  runtime.set('gain',2);await runtime.runTask('compute');
  assert.equal(disk.entries.length,0,'nothing is saved by running');
  const store1=new SiteRunStore({origin:ORIGIN,token:token1},{fetch:s1.fetch});
  const receipt=await store1.save(app(runtime),task.latest());
  assert.equal(receipt.cellId,'site-example-compute');
  const r=task.latest().record;
  assert.equal(receipt.sourceSha256,await siteSourceSha256({appId:'example',appVersion:'1',taskId:'compute',model:r.model,modelVersion:r.modelVersion,inputHash:r.inputHash}));
  assert.equal(receipt.sourceSha256,sha(JSON.stringify(['site','example','1','compute',r.model,r.modelVersion,r.inputHash])),'documented source hash');
  const entry=disk.entries[0];
  assert.deepEqual(Object.keys(entry).sort(),['bytes','cellId','cellKind','resultSha256','run','savedAt','sourceSha256'],'entry keeps the store shape');
  assert.deepEqual(entry.run.site,{appId:'example',appVersion:'1',taskId:'compute',values:{gain:2}});
  assert.deepEqual(disk.workspace,freshDisk().workspace,'the notebook workspace is untouched');
  const doc=JSON.parse(disk.files.get(receipt.resultSha256));
  assert.deepEqual([doc.format,doc.version,doc.cellKind,doc.origin,doc.table,doc.executionCount],['datapass.cell-result',1,'python','datapass.runtime/1',null,null]);
  assert.deepEqual(doc.outputs,artifactOutputs(task.latest().artifact,{runId:r.runId,model:r.model,modelVersion:r.modelVersion,inputHash:r.inputHash,artifactSha256:r.artifactSha256}),'same output shape as the notebook');
  assert.ok(!disk.files.get(receipt.resultSha256).includes(token1)&&!JSON.stringify(entry).includes(token1),'no token stored');

  // Restart: new service process (new token), new browser (new session, new SiteRuntime). Same disk.
  const token2='synthetic-token-second-012345',s2=fakeService(disk,token2);
  const fresh=client(s2,memorySession());fresh.link.connect({origin:ORIGIN,token:token2});
  await assert.rejects(new SiteRunStore({origin:ORIGIN,token:token1},{fetch:s2.fetch}).list(app(fresh.runtime)),e=>e instanceof SiteRunError&&e.kind==='denied');
  const store2=new SiteRunStore({origin:ORIGIN,token:token2},{fetch:s2.fetch});
  const {runs,otherVersions}=await store2.list(app(fresh.runtime));
  assert.equal(otherVersions,0);assert.equal(runs.length,1);
  assert.deepEqual([runs[0].taskId,runs[0].present,runs[0].resultSha256],['compute',true,receipt.resultSha256]);
  const before=s2.calls.length;
  const reopened=await store2.open(app(fresh.runtime),runs[0]);
  assert.equal(reopened.resultSha256,receipt.resultSha256);
  assert.deepEqual(reopened.artifact,task.latest().artifact,'the same validated artifact');
  assert.equal(reopened.run.runId,r.runId);
  assert.deepEqual(s2.calls.slice(before),['GET /api/notebook/v1/store/results/'+receipt.resultSha256],'one read by hash, no runtime call: not recomputed');
  assert.equal(fresh.runtime.getSnapshot().tasks.compute.status,'idle','reopening never runs the task');
});

test('missing, corrupt, foreign and unreachable results are reported, never replaced; Relink candidates are explicit',async()=>{
  const disk=freshDisk(),token='synthetic-token-0123456789',service=fakeService(disk,token);
  const {runtime,link,task}=client(service,memorySession());link.connect({origin:ORIGIN,token});
  const store=new SiteRunStore({origin:ORIGIN,token},{fetch:service.fetch});
  const shas=[];
  for(const gain of [2,2,5]){runtime.set('gain',gain);await runtime.runTask('compute');shas.push((await store.save(app(runtime),task.latest())).resultSha256);}
  assert.equal(new Set(shas).size,3,'each run is its own immutable result');
  let {runs}=await store.list(app(runtime));
  const [newest,,oldest]=runs;assert.equal(oldest.resultSha256,shas[0]);
  // Missing file.
  disk.files.delete(shas[0]);
  ({runs}=await store.list(app(runtime)));
  const missing=runs.find(r=>r.resultSha256===shas[0]);assert.equal(missing.present,false);
  await assert.rejects(store.open(app(runtime),missing),e=>e instanceof SiteRunError&&e.kind==='missing');
  const choices=relinkCandidates(runs,missing);
  assert.deepEqual(choices.map(c=>[c.run.resultSha256,c.sameInputs]),[[shas[1],true],[shas[2],false]],'same inputs first, never the missing one');
  // Corrupt on disk (the service reports 409) and bytes that do not match their name.
  disk.corrupt=new Set([shas[1]]);
  await assert.rejects(store.open(app(runtime),runs.find(r=>r.resultSha256===shas[1])),e=>e.kind==='corrupt');
  disk.corrupt=null;disk.files.set(shas[2],disk.files.get(shas[2]).replace('SYNTHETIC run','SYNTHETIC edit'));
  await assert.rejects(store.open(app(runtime),newest),e=>e.kind==='corrupt'&&/does not match its hash/.test(e.message));
  // A reference rewritten to another source is refused.
  const tampered={...runs.find(r=>r.resultSha256===shas[1]),run:{...runs.find(r=>r.resultSha256===shas[1]).run,inputHash:'e'.repeat(64)}};
  await assert.rejects(store.open(app(runtime),tampered),e=>e.kind==='mismatch');
  // Another version of the same app: counted, not listed, not opened.
  const v2={id:'example',version:'2'};
  const other=await store.list(v2);assert.equal(other.runs.length,0);assert.equal(other.otherVersions,3);
  await assert.rejects(store.open(v2,runs.find(r=>r.resultSha256===shas[1])),e=>e.kind==='mismatch'&&/version 1/.test(e.message));
  // Another app sharing the store does not see these runs.
  assert.equal((await store.list({id:'other-app',version:'1'})).runs.length,0);
  // Service down or without a store: said so, nothing shown.
  disk.up=false;
  await assert.rejects(store.list(app(runtime)),e=>e.kind==='unavailable'&&/unreachable/.test(e.message));
  disk.up=true;disk.store=false;
  await assert.rejects(store.list(app(runtime)),e=>e.kind==='no-store'&&/--results-dir/.test(e.message));
});

test('only a completed runtime run can be saved; the stored item never carries the token',async()=>{
  const disk=freshDisk(),token='synthetic-token-0123456789',service=fakeService(disk,token);
  const {runtime,link,task}=client(service,memorySession());link.connect({origin:ORIGIN,token});
  await runtime.runTask('compute');
  const run=task.latest();
  await assert.rejects(siteRunItem(app(runtime),{...run,record:{...run.record,status:'failed'}}),/only a completed runtime run/);
  const item=await siteRunItem(app(runtime),run);
  assert.equal(item.cellId,'site-example-compute');assert.equal(item.result.cellId,item.cellId);assert.equal(item.result.sourceSha256,item.sourceSha256);
  assert.ok(!JSON.stringify(item).includes(token));
});

// S03 run lifecycle (lane 01 part C). Two clearly separated halves:
//  1. GENUINE: the real TypeScript RuntimeClient / adapter / task against a spawned TEST FIXTURE producer
//     (tests/fixtures/runtime-lifecycle/fixture_producer.py = the unchanged py/service create_app, safe profile, with a
//     slow cooperative model and a deterministic failing model). Needs python with fastapi + uvicorn; without them the
//     half is skipped as NOT_QUALIFIED unless DATAPASS_REQUIRE_RUNTIME=1 (then it fails).
//  2. FAULT INJECTION: an in-memory stub (tests/fixtures/runtime-lifecycle/fault-injection-runtime.mjs) for late,
//     out-of-order and dropped responses. It is not the runtime and proves only the client-side rules.
// Every value is SYNTHETIC. No token is written anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {RuntimeClient,RuntimeError,connectionFromHash,SUBMIT_ATTEMPTS,POLL_TRANSIENT_FAILURES} from '../src/framework/compute/runtime-client.ts';
import {createRuntimeRunAdapter,CANCEL_REQUESTED_MESSAGE} from '../src/framework/compute/runtime-run.ts';
import {createRuntimeLink,createRuntimeTask,createOutcomeGate,inputKey,LATE_RESULT} from '../src/framework/compute/runtime-task.ts';
import {CANCEL_REQUESTED,runtimeDisplayState,runtimeDisplayLabel} from '../src/framework/compute/run-state.ts';
import {receiptFromRunRecord,validateEngineering,digest} from '../src/framework/engineering/index.ts';
import {faultInjectionRuntime} from './fixtures/runtime-lifecycle/fault-injection-runtime.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const PYTHON=process.env.PYTHON||'python';
const PRODUCER='tests/fixtures/runtime-lifecycle/fixture_producer.py';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(check,ms=10000,step=20)=>{const end=Date.now()+ms;for(;;){const v=await check();if(v)return v;if(Date.now()>end)throw new Error('condition not reached in '+ms+' ms');await sleep(step);}};
const context=(values,signal=new AbortController().signal)=>({values,datasets:{},signal,report(){}});

// ------------------------------------------------------------------------------------------------- 1. GENUINE producer
const hasRuntime=spawnSync(PYTHON,['-c','import fastapi, uvicorn, pydantic'],{cwd:ROOT,encoding:'utf8'}).status===0;
const required=process.env.DATAPASS_REQUIRE_RUNTIME==='1';
const skip=!hasRuntime&&!required?'NOT_QUALIFIED: python with fastapi, uvicorn and pydantic is not installed (pip install -r py/service/requirements.txt)':false;

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});}
class Producer{
  child=null;
  constructor(port){this.port=port;this.origin=`http://127.0.0.1:${port}`;}
  async start(){
    const env={...process.env};delete env.DATAPASS_RUNTIME_TOKEN;delete env.DATAPASS_SERVICE_PROFILE;
    this.child=spawn(PYTHON,[PRODUCER,'--port',String(this.port)],{cwd:ROOT,env,stdio:['ignore','ignore','pipe']});
    let log='';
    const line=await new Promise((resolve,reject)=>{
      this.child.stderr.on('data',d=>{log+=String(d);const m=/#runtime=\S+/.exec(log);if(m)resolve(m[0]);});
      this.child.on('exit',code=>reject(new Error(`fixture producer exited (${code}): ${log.replace(/token=[^\s&]+/g,'token=<redacted>').slice(-600)}`)));
    });
    const connection=connectionFromHash(line);
    await until(async()=>{try{return (await fetch(this.origin+'/health')).ok;}catch{return false;}},20000,100);
    return connection;
  }
  async stop(){
    const child=this.child;this.child=null;if(!child||child.exitCode!==null)return;
    const exited=new Promise(r=>child.once('exit',r));
    if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F']);else child.kill('SIGKILL');
    await exited;
    await until(async()=>{try{await fetch(this.origin+'/health');return false;}catch{return true;}},10000,100);
  }
}

test('GENUINE fixture producer: submit, progress, cancel, failure, idempotency, late result, restart',{skip,timeout:120000},async t=>{
  const producer=new Producer(await freePort());
  try{
    let connection=await producer.start();
    const health=await (await fetch(producer.origin+'/health')).json();
    assert.equal(health.profile,'safe','the fixture producer runs the default safe profile');
    const client=new RuntimeClient(connection,{fetch:globalThis.fetch});
    const models=await client.models();
    const slow=models.find(m=>m.id==='fixture-slow'),failing=models.find(m=>m.id==='fixture-fail');
    assert.ok(slow&&failing,'both fixture models are allowlisted');
    const service=await client.health();

    await t.test('submit and progress: queued/running/succeeded observed; receipt validates under datapass.engineering/1',async()=>{
      const updates=[];
      const adapter=createRuntimeRunAdapter(client,slow,{intervalMs:25});
      const outcome=await adapter.submit({steps:6,stepMs:40},{onUpdate:o=>updates.push(o.state)});
      assert.equal(outcome.state,'succeeded');assert.equal(outcome.result.provenance.runId,outcome.runId);
      assert.ok(['queued','running'].includes(updates[0]));assert.ok(updates.includes('running'),'a running state was observed');assert.equal(updates.at(-1),'succeeded');
      const record=await client.status(outcome.runId);
      assert.equal(record.cancelRequested,false);
      const raw=await (await fetch(`${producer.origin}/api/runtime/v1/runs/${record.runId}/artifact`,{headers:{'X-Datapass-Token':connection.token}})).arrayBuffer();
      const bytes=Buffer.from(raw);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.artifactSha256);
      const receipt=receiptFromRunRecord(record,{code:{version:service.version},declaredInputs:slow.inputs.map(i=>i.id),sentInputs:['steps','stepMs'],artifactBytes:bytes.length,checks:{performed:['artifact-sha256','artifact-schema']}});
      assert.deepEqual(validateEngineering(JSON.parse(JSON.stringify(receipt))),receipt);
      assert.deepEqual(receipt.coverage,{consumed:['stepMs','steps'],ignored:[],fixed:['scale']});
      assert.deepEqual(receipt.inputDigest,digest({model:'fixture-slow',inputs:record.inputs}));
      assert.deepEqual(receipt.artifacts.map(a=>[a.id,a.sha256,a.bytes]),[['fixture-slow-run',record.artifactSha256,bytes.length]]);
      assert.equal(receipt.status,'succeeded');assert.equal(receipt.cancelRequested,false);
    });

    await t.test('cancel: running -> cancel requested (status stays running) -> cancelled confirmed by the worker',async()=>{
      const adapter=createRuntimeRunAdapter(client,slow,{intervalMs:25});
      const messages=[];let cancelResponse=null,runId=null;
      const outcome=await adapter.submit({steps:300,stepMs:20},{onUpdate:o=>{messages.push(o.message);runId=o.runId;
        if(o.state==='running'&&!cancelResponse){cancelResponse=client.cancel(o.runId);}}});
      const accepted=await cancelResponse;
      assert.equal(accepted.status,'running','the runtime keeps running until the worker confirms');
      assert.equal(accepted.cancelRequested,true);
      assert.equal(runtimeDisplayState(accepted.status,accepted.cancelRequested),CANCEL_REQUESTED);
      assert.equal(runtimeDisplayLabel(CANCEL_REQUESTED),'cancel requested');
      assert.equal(outcome.state,'cancelled');assert.equal(outcome.runId,runId);
      const final=await client.status(runId);
      assert.equal(final.status,'cancelled');assert.equal(final.cancelRequested,true);
      const receipt=receiptFromRunRecord(final,{code:{version:service.version}});
      assert.equal(receipt.status,'cancelled');assert.equal(receipt.cancelRequested,true);
      assert.ok(messages.every(m=>m===''||m===CANCEL_REQUESTED_MESSAGE),'only the cancel-requested message, no invented progress');
    });

    await t.test('failure: the deterministic failing model ends failed with its message; the receipt carries the diagnostic',async()=>{
      const outcome=await createRuntimeRunAdapter(client,failing,{intervalMs:25}).submit({seed:3});
      assert.equal(outcome.state,'failed');assert.match(outcome.message,/fixture-fail always fails/);assert.equal(outcome.result,null);
      const record=await client.status(outcome.runId);
      const receipt=receiptFromRunRecord(record,{code:{version:service.version}});
      assert.equal(receipt.status,'failed');assert.deepEqual(receipt.diagnostics.map(d=>[d.code,d.severity]),[['DP-RT-RUN-FAILED','error']]);
      assert.deepEqual(receipt.checks.notPerformed,[]);assert.deepEqual(receipt.artifacts,[]);
    });

    await t.test('idempotency: same key and payload -> same runId (no second run); changed payload -> 409 surfaced as an error',async()=>{
      const key=crypto.randomUUID();
      const before=(await client.runs()).length;
      const first=await client.submit('fixture-slow',{steps:2,stepMs:0},undefined,{idempotencyKey:key});
      const again=await client.submit('fixture-slow',{steps:2,stepMs:0},undefined,{idempotencyKey:key});
      assert.equal(again.runId,first.runId);
      assert.equal((await client.runs()).length,before+1,'one run for two submissions');
      await assert.rejects(client.submit('fixture-slow',{steps:3,stepMs:0},undefined,{idempotencyKey:key}),e=>e instanceof RuntimeError&&e.kind==='conflict'&&e.status===409&&/another payload/.test(e.message));
      await assert.rejects(client.submit('fixture-slow',{steps:2},undefined,{idempotencyKey:'bad key'}),/malformed/);
    });

    await t.test('late result: a slower earlier submit finishes last and is NOT published; a cancelled task never publishes',async()=>{
      const link=createRuntimeLink(null);link.connect(connection);
      const task=createRuntimeTask({taskId:'fixture',model:'fixture-slow',link,intervalMs:25});
      const early=task.handler(context({steps:40,stepMs:20}));
      await until(()=>task.active()?.state==='running');
      const late=task.handler(context({steps:2,stepMs:0}));
      assert.equal((await late).length,2);
      await assert.rejects(early,new RegExp(LATE_RESULT.slice(0,30)));
      assert.equal(task.latest().inputs.steps,2,'the earlier run, arriving last, did not win');
      const published=task.latest();
      const abort=new AbortController();
      const stopped=task.handler(context({steps:300,stepMs:20},abort.signal));
      await until(()=>task.active()?.state==='running'&&task.active().runId);
      const runId=task.active().runId;abort.abort();
      await assert.rejects(stopped,/Task stopped/);
      await until(()=>['cancel-requested','cancelled'].includes(task.active()?.state));
      await until(async()=>(await client.status(runId)).status==='cancelled');
      assert.equal(task.latest(),published,'a cancelled run publishes nothing');
    });

    await t.test('producer restart: the run in flight ends not observed (never cancelled or failed)',async()=>{
      const adapter=createRuntimeRunAdapter(client,slow,{intervalMs:150});
      let running;const seen=new Promise(r=>{running=r;});
      const pending=adapter.submit({steps:400,stepMs:50},{onUpdate:o=>{if(o.state==='running')running(o.runId);}});
      const runId=await seen;
      await producer.stop();
      connection=await producer.start();
      const outcome=await pending;
      assert.equal(outcome.state,'not-observed');assert.equal(outcome.runId,runId);
      const fresh=new RuntimeClient(connection,{fetch:globalThis.fetch});
      await assert.rejects(fresh.status(runId),e=>e instanceof RuntimeError&&e.status===404,'the restarted runtime does not know the run');
    });
  }finally{await producer.stop();}
});

// --------------------------------------------------------------------------- 2. FAULT INJECTION (stub, not the runtime)
const ORIGIN='http://127.0.0.1:24999',TOKEN='fault-injection-token-0001';
const STUB_MODEL={id:'stub-model',version:'stub-1',title:'FAULT-INJECTION STUB model',description:'stub',illustrative:true,artifactId:'stub-run',inputs:[{id:'k',label:'k',unit:'',type:'number',min:0,max:100,default:1,step:1}]};
const stubClient=(stub,options={})=>new RuntimeClient({origin:ORIGIN,token:TOKEN},{fetch:stub.fetch,resubmitDelayMs:1,...options});
const posts=stub=>stub.calls.filter(c=>c.method==='POST'&&c.path==='/api/runtime/v1/runs');

test('FAULT INJECTION: a dropped submit answer is sent once more with the SAME key and yields the same single run',async()=>{
  const stub=faultInjectionRuntime({plan:e=>e.method==='POST'&&e.path==='/api/runtime/v1/runs'&&e.attempt===1?{dropResponse:true}:undefined});
  const outcome=await createRuntimeRunAdapter(stubClient(stub,{timeoutMs:80}),STUB_MODEL,{intervalMs:1}).submit({k:4});
  assert.equal(outcome.state,'succeeded');
  assert.equal(posts(stub).length,2);
  assert.match(posts(stub)[0].key,/^[0-9a-f-]{36}$/);assert.equal(posts(stub)[1].key,posts(stub)[0].key,'the same Idempotency-Key');
  assert.equal(stub.runs.size,1,'one run, not two');
});

test('FAULT INJECTION: submit is bounded to two attempts, only for an unavailable runtime',async()=>{
  const down=faultInjectionRuntime({plan:e=>e.method==='POST'?{status:503,json:{detail:'down'}}:undefined});
  await assert.rejects(stubClient(down).submit('stub-model',{k:1}),e=>e.kind==='unavailable');
  assert.equal(posts(down).length,SUBMIT_ATTEMPTS);assert.equal(new Set(posts(down).map(p=>p.key)).size,1);
  const network=faultInjectionRuntime({plan:e=>e.method==='POST'&&e.attempt===1?{fail:'network'}:undefined});
  assert.equal((await stubClient(network).submit('stub-model',{k:1})).status,'queued');assert.equal(posts(network).length,2);
  for(const [status,kind] of [[409,'conflict'],[422,'rejected'],[401,'denied'],[429,'rejected']]){
    const stub=faultInjectionRuntime({plan:e=>e.method==='POST'?{status}:undefined});
    await assert.rejects(stubClient(stub).submit('stub-model',{k:1}),e=>e.kind===kind&&e.status===status);
    assert.equal(posts(stub).length,1,`HTTP ${status} is not sent again`);
  }
  const aborted=new AbortController();aborted.abort();
  const never=faultInjectionRuntime();
  await assert.rejects(stubClient(never).submit('stub-model',{k:1},aborted.signal),e=>e.kind==='aborted');
});

test(`FAULT INJECTION: polling tolerates ${POLL_TRANSIENT_FAILURES} consecutive dropped status answers, then reports not observed`,async()=>{
  const isPoll=e=>e.method==='GET'&&/\/runs\/run-[0-9a-f]{16}$/.test(e.path);
  let polls=0;
  const flaky=faultInjectionRuntime({plan:e=>isPoll(e)&&++polls<=POLL_TRANSIENT_FAILURES?{drop:true}:undefined});
  const ok=await createRuntimeRunAdapter(stubClient(flaky,{timeoutMs:30}),STUB_MODEL,{intervalMs:1}).submit({k:2});
  assert.equal(ok.state,'succeeded');
  let n=0;
  const lost=faultInjectionRuntime({plan:e=>isPoll(e)&&++n<=POLL_TRANSIENT_FAILURES+1?{fail:'network'}:undefined});
  const gone=await createRuntimeRunAdapter(stubClient(lost),STUB_MODEL,{intervalMs:1}).submit({k:2});
  assert.equal(gone.state,'not-observed');assert.match(gone.message,/Lost contact with the runtime after 4 failed status requests/);
  const denied=faultInjectionRuntime({plan:e=>isPoll(e)?{status:401}:undefined});
  assert.equal((await createRuntimeRunAdapter(stubClient(denied),STUB_MODEL,{intervalMs:1}).submit({k:2})).state,'not-observed','a refused token is not retried');
});

test('FAULT INJECTION: out-of-order answers: the first submit finishes last and does not win',async()=>{
  // Every status answer of the first run (run-...01) is held 120 ms, so it completes after the second run.
  const stub=faultInjectionRuntime({plan:e=>e.method==='GET'&&e.path.endsWith('run-0000000000000001')?{delayMs:120}:undefined});
  const link=createRuntimeLink(null);link.connect({origin:ORIGIN,token:TOKEN});
  const task=createRuntimeTask({taskId:'stub',model:'stub-model',link,intervalMs:1,client:{fetch:stub.fetch}});
  const order=[];
  const first=task.handler(context({k:1})).then(()=>order.push('first ok'),e=>{order.push('first refused');throw e;});
  await until(()=>stub.runs.size===1);
  const second=task.handler(context({k:2})).then(r=>{order.push('second ok');return r;});
  assert.deepEqual((await second).map(r=>r.value),[2]);
  await assert.rejects(first,new RegExp(LATE_RESULT.slice(0,30)));
  assert.deepEqual(order,['second ok','first refused'],'the late answer arrived last and was refused');
  assert.equal(task.latest().inputs.k,2);assert.equal(task.latest().record.runId,'run-0000000000000002');
});

test('FAULT INJECTION: a cancel the runtime accepts but never confirms shows cancel requested and publishes nothing',async()=>{
  // The stub accepts the cancel (cancelRequested true) but keeps the run running; the task must not wait for it or publish.
  const stub=faultInjectionRuntime({steps:1000,plan:e=>e.path.endsWith('/cancel')?{status:200,json:{runId:'run-0000000000000001',model:'stub-model',modelVersion:'stub-1',status:'running',inputs:{k:5},inputHash:'a'.repeat(64),submittedAt:'2026-10-22T00:00:00.000Z',startedAt:'2026-10-22T00:00:00.001Z',finishedAt:null,error:null,artifactId:null,artifactSha256:null,cancelRequested:true}}:undefined});
  const link=createRuntimeLink(null);link.connect({origin:ORIGIN,token:TOKEN});
  const task=createRuntimeTask({taskId:'stub',model:'stub-model',link,intervalMs:1,client:{fetch:stub.fetch}});
  const abort=new AbortController();
  const run=task.handler(context({k:5},abort.signal));
  await until(()=>task.active()?.runId);abort.abort();
  await assert.rejects(run,/Task stopped/);
  await until(()=>task.active()?.state===CANCEL_REQUESTED);
  assert.match(task.active().message,/accepted the cancel and has not confirmed/);
  assert.equal(task.latest(),null,'nothing published for a cancelled task');
});

test('FAULT INJECTION: a runtime without cancelRequested still works; the display never invents cancel-requested',async()=>{
  const stub=faultInjectionRuntime({withCancelRequested:false,steps:50});
  const client=stubClient(stub);
  const queued=await client.submit('stub-model',{k:1});
  assert.equal(queued.cancelRequested,false);
  const running=await client.status(queued.runId);
  const answer=await client.cancel(running.runId);
  assert.equal(answer.status,'running');assert.equal(answer.cancelRequested,false);
  assert.equal(runtimeDisplayState(answer.status,answer.cancelRequested),'running');
  const cancelled={...answer,status:'cancelled',finishedAt:new Date(Date.parse(answer.startedAt)+5).toISOString()};
  assert.equal(receiptFromRunRecord(cancelled,{code:{version:'stub'}}).cancelRequested,true,'an old runtime only cancels on request');
  assert.throws(()=>receiptFromRunRecord({...answer,submittedAt:'t'},{code:{version:'stub'}}),e=>e.code==='DP-ENG-007');
});

test('outcome gate: newest ticket only, same input key, never after cancel',()=>{
  const gate=createOutcomeGate();
  const a=gate.open(inputKey('m',{x:1,y:2}));
  assert.equal(a.inputKey,inputKey('m',{y:2,x:1}),'key order does not matter');
  assert.ok(gate.accepts(a));assert.ok(!gate.accepts(a,inputKey('m',{x:9,y:2})),'inputs changed since');
  const b=gate.open(inputKey('m',{x:2,y:2}));
  assert.ok(!gate.accepts(a),'superseded');assert.ok(gate.accepts(b));
  gate.cancel(b);assert.ok(!gate.accepts(b),'cancelled');assert.equal(gate.current(),b);
});

// ------------------------------------------------------------------- 3. presentation of S5 (engineering blocks)
const E={format:'datapass.engineering',version:1};
const SYN='SYNTHETIC';
const base=digest({design:'base-r1'});
const diffRecord=(changes)=>({...E,kind:'parameter-diff',baseRevision:base,changes});
const XSS='<img src=x onerror=alert(1)>';

test('parameter diff: units shown, mixed units refused with the reason, unconsumed changes flagged not calculated',async()=>{
  const {parameterDiffView}=await import('../src/framework/engineering/receipt.ts');
  const diff=diffRecord([{id:'rotor.radius',unit:'m',from:40,to:42.5,consumedBy:['aero']},{id:'tip.speed',unit:'',from:7,to:8,consumedBy:[]}]);
  const shown=parameterDiffView(diff,{'rotor.radius':'m','tip.speed':''});
  assert.equal(shown.ok,true);
  assert.deepEqual(shown.rows.map(r=>[r.id,r.unit,r.from,r.to,r.calculated]),[['rotor.radius','m','40','42.5',true],['tip.speed','','7','8',false]]);
  assert.equal(parameterDiffView(diff,{},['tip.speed']).rows[0].calculated,false,'consumedBy alone is not enough when the run did not consume it');
  const mixed=parameterDiffView(diff,{'rotor.radius':'mm'});
  assert.equal(mixed.ok,false);assert.match(mixed.reasons[0],/Unit mismatch for rotor\.radius: the diff is in m, the model declares mm\. Values are not converted/);
  assert.throws(()=>parameterDiffView(diffRecord([{id:'a',unit:'m',from:1,to:1,consumedBy:[]}])),e=>e.code==='DP-ENG-015');
});

test('coverage badges and incompatible comparison name their specific reason',async()=>{
  const {coverageBadges,comparisonIncompatibility}=await import('../src/framework/engineering/receipt.ts');
  const badges=coverageBadges({consumed:['k','c'],ignored:['note'],fixed:['hub']},['c','hub','pitch']);
  assert.deepEqual(badges.map(b=>[b.id,b.kind]),[['k','consumed'],['c','consumed'],['note','ignored'],['hub','not-calculated'],['pitch','not-calculated']]);
  assert.equal(badges.find(b=>b.id==='pitch').label,'changed but not calculated');
  const side={modelId:'m',modelVersion:'1',units:{aep:'MWh/yr'},timeBase:'hourly'};
  assert.equal(comparisonIncompatibility(side,{...side}),null);
  assert.match(comparisonIncompatibility(side,{...side,modelId:'n'}),/Different models: A ran m, B ran n/);
  assert.match(comparisonIncompatibility(side,{...side,modelVersion:'2'}),/Model version differs: A ran m 1, B ran m 2/);
  assert.match(comparisonIncompatibility(side,{...side,units:{aep:'GWh/yr'}}),/Unit differs for aep: A is in MWh\/yr, B is in GWh\/yr\. Values are not converted/);
  assert.match(comparisonIncompatibility(side,{...side,timeBase:'10-min'}),/Time base differs: A uses hourly, B uses 10-min/);
  assert.match(comparisonIncompatibility(side,{...side,timeBase:undefined}),/an undeclared time base/);
});

test('engineering blocks render as escaped text, reuse ArtifactView, and the approval button only calls the callback',async()=>{
  const {build}=await import('esbuild');
  const {mkdir}=await import('node:fs/promises');const {pathToFileURL}=await import('node:url');
  await mkdir(path.join(ROOT,'.generated'),{recursive:true});
  const out=path.join(ROOT,'.generated','engineering-blocks.test.mjs');
  await build({stdin:{contents:"export * from './src/framework/engineering/EngineeringBlocks.tsx';export {renderToStaticMarkup} from 'react-dom/server';export {createElement} from 'react';",resolveDir:ROOT,loader:'ts'},
    outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',
    plugins:[{name:'no-css',setup(b){b.onResolve({filter:/\.css$/},a=>({path:a.path,namespace:'no-css'}));b.onLoad({filter:/.*/,namespace:'no-css'},()=>({contents:'',loader:'js'}));}},
      // ArtifactView itself needs the pinned upstream engines (vite aliases); here a probe stands in for it and records
      // the artifact it receives, which must pass the real validateArtifact. Its own rendering is tested in the browser.
      {name:'artifact-view-probe',setup(b){b.onResolve({filter:/\/ArtifactView$/},()=>({path:'probe',namespace:'artifact-view-probe'}));
        b.onLoad({filter:/.*/,namespace:'artifact-view-probe'},()=>({resolveDir:ROOT,loader:'tsx',contents:"import {validateArtifact} from './src/framework/foundation/artifact.ts';export const received=[];export function ArtifactView({artifact}){const a=validateArtifact(artifact);received.push(a);return <section data-testid=\"artifact\" data-artifact-id={a.id}>{a.payload.rows.map((r,i)=><p key={i}>{Object.values(r).join(' | ')}</p>)}</section>;}"}));}}]});
  const ui=await import(pathToFileURL(out).href);
  const html=el=>ui.renderToStaticMarkup(el);
  const approval={...E,kind:'approval-request',purpose:`${SYN}: ${XSS} review the revised geometry`,baseRevision:base,proposalDigest:digest({proposal:1}),requester:'studio-user',endpointHint:'/api/domain/v1/approvals',presentationOnly:true};
  const calls=[];
  const element=ui.ApprovalRequest({request:approval,onRequest:r=>calls.push(r)});
  const markup=html(element);
  assert.ok(!markup.includes('<img'),'no markup from record text');assert.match(markup,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup,new RegExp(base.value.slice(0,12)));assert.match(markup,/Studio does not approve anything/);
  assert.doesNotMatch(markup,/approved|Approved/,'no approved state is shown');
  assert.equal(calls.length,0,'rendering never triggers the request');
  const find=(node,pred)=>{if(!node||typeof node!=='object')return null;if(pred(node))return node;const kids=[].concat(node.props?.children??[]);for(const k of kids){const f=find(k,pred);if(f)return f;}return null;};
  const button=find(element,n=>n.type==='button');
  button.props.onClick();assert.deepEqual(calls,[approval],'the click only hands the record to the supplied callback');
  assert.match(html(ui.ApprovalRequest({request:{...approval,approved:true},onRequest:()=>{}})),/data-state="refused"[\s\S]*not a valid presentation-only approval request/);
  const diff=diffRecord([{id:'rotor.radius',unit:'m',from:XSS,to:'b',consumedBy:['aero']},{id:'tip.speed',unit:'',from:7,to:8,consumedBy:[]}]);
  const shown=html(ui.createElement(ui.ParameterDiff,{diff,declaredUnits:{'rotor.radius':'m'}}));
  assert.match(shown,/data-state="shown"/);assert.match(shown,/rotor\.radius: &lt;img/);assert.match(shown,/Not calculated: tip\.speed/);
  assert.match(shown,/data-testid="artifact"/,'the table goes through the existing ArtifactView');
  assert.ok(!shown.includes('<img'));
  assert.match(html(ui.createElement(ui.ParameterDiff,{diff,declaredUnits:{'rotor.radius':'ft'}})),/data-state="refused"[\s\S]*Unit mismatch for rotor\.radius/);
  const cov=html(ui.createElement(ui.CoverageBadges,{coverage:{consumed:['k'],ignored:[],fixed:['hub']},changed:['hub']}));
  assert.match(cov,/data-kind="not-calculated" data-parameter="hub"/);
  assert.match(html(ui.createElement(ui.IncompatibleComparison,{a:{modelId:'m',modelVersion:'1',units:{x:'m'}},b:{modelId:'m',modelVersion:'1',units:{x:XSS}}})),/Unit differs for x: A is in m, B is in &lt;img/);
  assert.equal(html(ui.createElement(ui.IncompatibleComparison,{a:{modelId:'m',modelVersion:'1'},b:{modelId:'m',modelVersion:'1'}})),'');
  assert.doesNotMatch(readFileSync(path.join(ROOT,'src/framework/engineering/EngineeringBlocks.tsx'),'utf8'),/dangerouslySetInnerHTML|innerHTML|useState|localStorage|sessionStorage|fetch\(/,'no HTML injection, no stored state, no request of its own');
});

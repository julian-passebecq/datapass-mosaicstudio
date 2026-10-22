// FAULT-INJECTION STUB. NOT the DataPass runtime and not evidence that the runtime behaves this way: an in-memory fetch
// that speaks just enough datapass.runtime/1 to deliver LATE, OUT-OF-ORDER and DROPPED responses on purpose, which a real
// producer cannot be made to do reliably. The genuine wire is exercised against tests/fixtures/runtime-lifecycle/
// fixture_producer.py in tests/runtime-lifecycle.test.mjs. Every value is SYNTHETIC.
import {createHash} from 'node:crypto';

export const FAULT_INJECTION=true;
const reply=(status,json)=>{const text=typeof json==='string'?json:JSON.stringify(json);return {ok:status<300,status,headers:{get:()=>null},text:async()=>text};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dropped=signal=>new Promise((_,reject)=>{const stop=()=>{const e=new Error('dropped response (fault injection)');e.name='AbortError';reject(e);};if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});});
const now=()=>new Date().toISOString();

/** A SYNTHETIC table artifact for one run. */
export function stubArtifact(runId,value){
  return {format:'datapass.artifact',version:1,id:'stub-run',title:'FAULT-INJECTION STUB result (SYNTHETIC)',provenance:{kind:'synthetic',source:'fault-injection stub, not a runtime',runId},
    payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'Id',type:'string'},{id:'value',label:'Value',type:'number',unit:'m/s'}],rows:[{id:'a',value}]},
    representations:[{id:'table',title:'Rows',kind:'table'}]};
}
/**
 * plan(event) decides each request: return {drop:true} (never answers; the client times out), {dropResponse:true}
 * (processed, then the answer is lost), {delayMs}, {fail:'network'}
 * (fetch rejects), {status, json} (a fixed answer), or nothing (normal behaviour). `event` = {method, path, body, key,
 * attempt, call}. `withCancelRequested:false` imitates a runtime that predates the field.
 */
export function faultInjectionRuntime({plan=()=>undefined,steps=2,withCancelRequested=true}={}){
  const runs=new Map(),keys=new Map(),calls=[];let seq=0;
  const record=r=>{const {polls,artifact,...rest}=r;void polls;void artifact;if(!withCancelRequested)delete rest.cancelRequested;return rest;};
  async function fetch(url,init){
    const decided={};
    const response=await answer(url,init,decided);
    // dropResponse: the request WAS processed (e.g. the run was created) but the answer never arrives.
    return decided.dropResponse?dropped(init.signal):response;
  }
  async function answer(url,init,decided){
    const path=new URL(url).pathname,method=init.method,key=init.headers?.['Idempotency-Key']??null,body=init.body?JSON.parse(init.body):null;
    const event={method,path,body,key,call:calls.length+1,attempt:calls.filter(c=>c.method===method&&c.path===path&&c.key===key).length+1};
    calls.push(event);
    const decision=plan(event)??{};
    decided.dropResponse=decision.dropResponse===true;
    if(decision.drop)return dropped(init.signal);
    if(decision.fail==='network')throw new TypeError('fetch failed (fault injection)');
    if(decision.delayMs)await sleep(decision.delayMs);
    if(decision.status)return reply(decision.status,decision.json??{detail:'fault injection'});
    if(method==='POST'&&path==='/api/runtime/v1/runs'){
      const digest=createHash('sha256').update(JSON.stringify(body)).digest('hex');
      if(key&&keys.has(key)){const k=keys.get(key);if(k.digest!==digest)return reply(409,{detail:'Idempotency-Key already used with another payload',code:'DP-RT-IDEMPOTENCY-CONFLICT'});return reply(200,record(runs.get(k.runId)));}
      const runId='run-'+(++seq).toString(16).padStart(16,'0');
      const value=Number(body.inputs.k??0);
      const run={runId,model:body.model,modelVersion:'stub-1',status:'queued',inputs:body.inputs,inputHash:createHash('sha256').update(runId).digest('hex'),submittedAt:now(),startedAt:null,finishedAt:null,error:null,artifactId:null,artifactSha256:null,cancelRequested:false,polls:0,artifact:JSON.stringify(stubArtifact(runId,value))};
      runs.set(runId,run);if(key)keys.set(key,{digest,runId});
      return reply(202,record(run));
    }
    const m=/^\/api\/runtime\/v1\/runs\/(run-[0-9a-f]{16})(\/cancel|\/artifact)?$/.exec(path);
    const run=m&&runs.get(m[1]);
    if(!run)return reply(path==='/api/runtime/v1/models'?200:404,path==='/api/runtime/v1/models'?{models:[{id:'stub-model',version:'stub-1',title:'FAULT-INJECTION STUB model',description:'stub',illustrative:true,artifactId:'stub-run',inputs:[{id:'k',label:'k',unit:'',type:'number',min:0,max:100,default:1,step:1}]}]}:{detail:'run not found'});
    if(m[2]==='/cancel'){
      if(run.status==='queued')Object.assign(run,{status:'cancelled',cancelRequested:true,finishedAt:now()});
      else if(run.status==='running')run.cancelRequested=true;
      return reply(200,record(run));
    }
    if(m[2]==='/artifact')return run.status==='succeeded'?reply(200,run.artifact):reply(409,{detail:'run is '+run.status});
    // Status poll: queued -> running -> (cancelled if requested | succeeded) after `steps` polls.
    run.polls++;
    if(run.status==='queued')Object.assign(run,{status:'running',startedAt:now()});
    else if(run.status==='running'&&run.polls>=steps){
      if(run.cancelRequested)Object.assign(run,{status:'cancelled',finishedAt:now()});
      else Object.assign(run,{status:'succeeded',finishedAt:now(),artifactId:'stub-run',artifactSha256:createHash('sha256').update(run.artifact).digest('hex')});
    }
    return reply(200,record(run));
  }
  return {fetch,calls,runs};
}

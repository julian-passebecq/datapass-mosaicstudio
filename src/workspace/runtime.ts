/** Explicit adapter from the browser workbench to a trusted local runtime speaking `datapass.runtime/1`
 * (py/service/app.py). The runtime only runs allowlisted models; the browser never sends code.
 * Trust is explicit: the user consents to one exact loopback origin and supplies the per-launch token. */
import {ARTIFACT_BYTES,validateArtifact,type Artifact} from '../framework/foundation/artifact.ts';
import {identifier} from '../framework/guards.ts';

export const RUNTIME_PROTOCOL='datapass.runtime/1';
export const RUNTIME_REQUEST_BYTES=2048;
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
export type RunStatus='queued'|'running'|'succeeded'|'failed'|'cancelled';
export type RuntimeInput={id:string;label:string;unit?:string|null;type:'number';min:number;max:number;default:number;step?:number|null};
export type RuntimeModel={id:string;version:string;title:string;description:string;illustrative:boolean;artifactId:string;inputs:RuntimeInput[]};
export type RunRecord={runId:string;model:string;modelVersion:string;status:RunStatus;inputs:Record<string,number|string|boolean>;inputHash:string;submittedAt:string;startedAt:string|null;finishedAt:string|null;error:string|null;artifactId:string|null;artifactSha256:string|null};
export type RuntimeConnection={origin:string;token:string};
type FetchLike=(url:string,init:{method:'GET'|'POST';headers:Record<string,string>;body?:string;signal?:AbortSignal;credentials:'omit';cache:'no-store';mode:'cors'})=>Promise<{ok:boolean;status:number;headers:{get(name:string):string|null};text():Promise<string>}>;

/** Only an exact http loopback origin with an explicit port is accepted: no path, credentials or remote host. */
export function runtimeOrigin(value:string):string{
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('The runtime address is not a URL.');}
  if(url.protocol!=='http:')throw new Error('The local runtime must use http on the loopback interface.');
  if(!LOOPBACK.has(url.hostname))throw new Error(`The runtime must be loopback (127.0.0.1, localhost or [::1]), not ${url.hostname}.`);
  if(url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw new Error('Give only the runtime origin, for example http://127.0.0.1:8765.');
  if(!url.port)throw new Error('The runtime origin needs an explicit port.');
  return url.origin;
}
export function validToken(token:string):boolean{return typeof token==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(token);}

/** Read `#runtime=…&token=…` written by the runtime's start-up line. The caller removes the fragment from the address bar. */
export function connectionFromHash(hash:string):{origin:string;token:string}|null{
  if(!hash||hash.length>600)return null;
  const params=new URLSearchParams(hash.replace(/^#/,''));
  const runtime=params.get('runtime'),token=params.get('token');
  if(!runtime||!token)return null;
  return {origin:runtimeOrigin(runtime),token:validToken(token)?token:(()=>{throw new Error('The runtime token in the link is malformed.');})()};
}

export type RuntimeErrorKind='unavailable'|'denied'|'rejected'|'conflict'|'malformed'|'aborted';
export class RuntimeError extends Error{
  readonly kind:RuntimeErrorKind;readonly status?:number;
  constructor(message:string,kind:RuntimeErrorKind,status?:number){super(message);this.name='RuntimeError';this.kind=kind;this.status=status;}
}
const RUN_ID=/^run-[0-9a-f]{16}$/,HASH=/^[0-9a-f]{64}$/,STATUSES=new Set(['queued','running','succeeded','failed','cancelled']);
function isObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function str(v:unknown,label:string,max=400,nullable=false):string|null{
  if(nullable&&(v===null||v===undefined))return null;
  if(typeof v!=='string'||v.length>max)throw new RuntimeError(`The runtime returned an invalid ${label}.`,'malformed');
  return v;
}
export function validateRunRecord(v:unknown):RunRecord{
  if(!isObject(v))throw new RuntimeError('The runtime returned a malformed run record.','malformed');
  const runId=str(v.runId,'run id')!;if(!RUN_ID.test(runId))throw new RuntimeError('The runtime returned a malformed run id.','malformed');
  const status=str(v.status,'status')!;if(!STATUSES.has(status))throw new RuntimeError('The runtime returned an unknown run status.','malformed');
  const inputHash=str(v.inputHash,'input hash')!;if(!HASH.test(inputHash))throw new RuntimeError('The runtime returned a malformed input hash.','malformed');
  const sha=str(v.artifactSha256,'artifact hash',64,true);if(sha!==null&&!HASH.test(sha))throw new RuntimeError('The runtime returned a malformed artifact hash.','malformed');
  if(!isObject(v.inputs)||Object.keys(v.inputs).length>24)throw new RuntimeError('The runtime returned malformed inputs.','malformed');
  const inputs:Record<string,number|string|boolean>={};
  for(const [k,value] of Object.entries(v.inputs)){if(!(typeof value==='boolean'||typeof value==='string'&&value.length<=400||typeof value==='number'&&Number.isFinite(value)))throw new RuntimeError('The runtime returned a malformed input value.','malformed');inputs[k]=value;}
  const model=str(v.model,'model',80)!;identifier(model,'runtime model');
  return {runId,model,modelVersion:str(v.modelVersion,'model version',80)!,status:status as RunStatus,inputs,inputHash,submittedAt:str(v.submittedAt,'time',40)!,startedAt:str(v.startedAt,'time',40,true),finishedAt:str(v.finishedAt,'time',40,true),error:str(v.error,'error',500,true),artifactId:str(v.artifactId,'artifact id',80,true),artifactSha256:sha};
}
function validateModels(v:unknown):RuntimeModel[]{
  if(!isObject(v)||!Array.isArray(v.models)||v.models.length>32)throw new RuntimeError('The runtime returned a malformed model list.','malformed');
  return v.models.map(m=>{
    if(!isObject(m)||!Array.isArray(m.inputs)||m.inputs.length>24)throw new RuntimeError('The runtime returned a malformed model.','malformed');
    const id=str(m.id,'model id',80)!;identifier(id,'runtime model');
    const inputs=m.inputs.map(i=>{
      if(!isObject(i))throw new RuntimeError('The runtime returned a malformed model input.','malformed');
      const nums=[i.min,i.max,i.default];
      if(i.type!=='number'||nums.some(n=>typeof n!=='number'||!Number.isFinite(n))||(i.min as number)>(i.max as number))throw new RuntimeError('The runtime returned a malformed numeric input.','malformed');
      const inputId=str(i.id,'input id',80)!;identifier(inputId,'runtime input');
      return {id:inputId,label:str(i.label,'input label',160)!,unit:str(i.unit,'unit',40,true),type:'number' as const,min:i.min as number,max:i.max as number,default:i.default as number,step:typeof i.step==='number'&&Number.isFinite(i.step)&&i.step>0?i.step:null};
    });
    return {id,version:str(m.version,'model version',80)!,title:str(m.title,'model title',160)!,description:str(m.description,'model description',1000)!,illustrative:m.illustrative===true,artifactId:str(m.artifactId,'artifact id',80)!,inputs};
  });
}

/** Validate inputs against the model's declared bounds before anything is sent. */
export function checkInputs(model:RuntimeModel,inputs:Record<string,unknown>):Record<string,number>{
  const out:Record<string,number>={};
  for(const key of Object.keys(inputs))if(!model.inputs.some(i=>i.id===key))throw new Error(`Unknown input ${key} for ${model.id}.`);
  for(const i of model.inputs){
    const value=inputs[i.id]===undefined?i.default:inputs[i.id];
    if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${i.label} must be a finite number.`);
    if(value<i.min||value>i.max)throw new Error(`${i.label} must be between ${i.min} and ${i.max}${i.unit?' '+i.unit:''}.`);
    out[i.id]=value;
  }
  return out;
}

async function sha256Hex(text:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export class RuntimeClient{
  readonly origin:string;readonly #token:string;readonly #fetch:FetchLike;readonly #timeoutMs:number;
  constructor(connection:RuntimeConnection,options:{fetch?:FetchLike;timeoutMs?:number}={}){
    this.origin=runtimeOrigin(connection.origin);
    if(!validToken(connection.token))throw new Error('The runtime token is malformed.');
    this.#token=connection.token;this.#fetch=options.fetch??(globalThis.fetch.bind(globalThis) as unknown as FetchLike);this.#timeoutMs=options.timeoutMs??15000;
  }
  async #request(path:string,options:{method?:'GET'|'POST';body?:unknown;signal?:AbortSignal}={}):Promise<{json:unknown;text:string}>{
    let body:string|undefined;
    if(options.body!==undefined){body=JSON.stringify(options.body);if(new TextEncoder().encode(body).byteLength>RUNTIME_REQUEST_BYTES)throw new RuntimeError(`The request is above ${RUNTIME_REQUEST_BYTES} bytes.`,'rejected');}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('timeout','TimeoutError')),this.#timeoutMs);
    const relay=()=>controller.abort(options.signal?.reason);options.signal?.addEventListener('abort',relay,{once:true});
    let response;
    try{
      response=await this.#fetch(this.origin+path,{method:options.method??'GET',headers:{'X-Datapass-Token':this.#token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body}),signal:controller.signal,credentials:'omit',cache:'no-store',mode:'cors'});
    }catch(error){
      if(options.signal?.aborted)throw new RuntimeError('The request was aborted.','aborted');
      if(controller.signal.aborted)throw new RuntimeError(`The local runtime at ${this.origin} did not answer within ${Math.round(this.#timeoutMs/1000)} s.`,'unavailable');
      throw new RuntimeError(`The local runtime at ${this.origin} is unreachable. Start it with "npm run service:python" and reconnect.`,'unavailable');
    }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',relay);}
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>ARTIFACT_BYTES*2)throw new RuntimeError('The runtime response exceeds the artifact budget.','malformed');
    const text=await response.text();
    if(new TextEncoder().encode(text).byteLength>ARTIFACT_BYTES*2)throw new RuntimeError('The runtime response exceeds the artifact budget.','malformed');
    let json:unknown=null;try{json=text?JSON.parse(text):null;}catch{if(response.ok)throw new RuntimeError('The runtime answered with invalid JSON.','malformed');}
    if(!response.ok){
      const detail=isObject(json)?typeof json.detail==='string'?json.detail:Array.isArray(json.detail)?json.detail.slice(0,3).map(d=>isObject(d)?`${Array.isArray(d.loc)?d.loc.slice(1).join('.'):''} ${typeof d.msg==='string'?d.msg:''}`.trim():'').join('; '):'':'';
      const kind=response.status===401||response.status===403?'denied':response.status===409?'conflict':response.status>=500?'unavailable':'rejected';
      const prefix=response.status===401?'The runtime refused the token (it changes at every start; reconnect with the new link)':response.status===403?'The runtime refused this page origin':`The runtime answered HTTP ${response.status}`;
      throw new RuntimeError(prefix+(detail?': '+detail.slice(0,300):'.'),kind,response.status);
    }
    return {json,text};
  }
  async health(signal?:AbortSignal):Promise<{models:string[];version:string}>{
    const {json}=await this.#request('/api/runtime/v1/health',{signal});
    if(!isObject(json)||json.runtime!==RUNTIME_PROTOCOL||!Array.isArray(json.models))throw new RuntimeError(`The service at ${this.origin} does not speak ${RUNTIME_PROTOCOL}.`,'malformed');
    return {models:json.models.filter((m):m is string=>typeof m==='string').slice(0,32),version:String(json.version??'').slice(0,80)};
  }
  async models(signal?:AbortSignal):Promise<RuntimeModel[]>{return validateModels((await this.#request('/api/runtime/v1/models',{signal})).json);}
  async submit(model:string,inputs:Record<string,number>,signal?:AbortSignal):Promise<RunRecord>{
    identifier(model,'runtime model');
    return validateRunRecord((await this.#request('/api/runtime/v1/runs',{method:'POST',body:{model,inputs},signal})).json);
  }
  async status(runId:string,signal?:AbortSignal):Promise<RunRecord>{
    if(!RUN_ID.test(runId))throw new Error('Invalid run id.');
    return validateRunRecord((await this.#request('/api/runtime/v1/runs/'+runId,{signal})).json);
  }
  async cancel(runId:string):Promise<RunRecord>{
    if(!RUN_ID.test(runId))throw new Error('Invalid run id.');
    return validateRunRecord((await this.#request('/api/runtime/v1/runs/'+runId+'/cancel',{method:'POST',body:{}})).json);
  }
  /** The artifact is re-validated here and its bytes are checked against the hash the runtime recorded. */
  async artifact(run:RunRecord,signal?:AbortSignal):Promise<Artifact>{
    const {json,text}=await this.#request('/api/runtime/v1/runs/'+run.runId+'/artifact',{signal});
    if(run.artifactSha256){const actual=await sha256Hex(text);if(actual!==run.artifactSha256)throw new RuntimeError('The artifact bytes do not match the hash recorded for this run.','malformed');}
    let artifact:Artifact;
    try{artifact=validateArtifact(json);}catch(error){throw new RuntimeError('The run output failed datapass.artifact v1 validation: '+(error as Error).message,'malformed');}
    if(artifact.provenance.runId!==undefined&&artifact.provenance.runId!==run.runId)throw new RuntimeError(`The artifact belongs to ${artifact.provenance.runId}, not ${run.runId}.`,'malformed');
    return artifact;
  }
}

/** Poll one run to a terminal state. Abort stops polling only; cancelling the run is a separate explicit request. */
export async function waitForRun(client:RuntimeClient,run:RunRecord,options:{signal?:AbortSignal;onUpdate?:(r:RunRecord)=>void;intervalMs?:number;maxPolls?:number}={}):Promise<RunRecord>{
  let current=run,polls=0;const interval=options.intervalMs??250,max=options.maxPolls??2400;
  while(current.status==='queued'||current.status==='running'){
    if(++polls>max)throw new RuntimeError('The run did not finish within the polling budget; it may still be running on the runtime.','unavailable');
    await new Promise<void>((resolve,reject)=>{const t=setTimeout(resolve,interval);options.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new RuntimeError('Stopped following the run.','aborted'));},{once:true});});
    current=await client.status(current.runId,options.signal);options.onUpdate?.(current);
  }
  return current;
}

/** Tier 2: a read-only framework client for the local ResultStore (`/api/notebook/v1/store/*`, py/service).
 * It reads allowlisted-model results only (`cellKind: "python"`, `origin: "datapass.runtime/1"`), checks every
 * result's bytes against the hash it is stored under, then validates the one `datapass.artifact` output it holds.
 * The ResultStore stays authoritative: nothing is written, cached or recomputed here. Notebook import/export,
 * saving and jobs stay in the workbench client (src/workspace/results.ts). */
import {validateArtifact,type Artifact} from '../foundation/artifact.ts';

export const RESULT_FORMAT='datapass.cell-result';
export const RESULT_STORE_FORMAT='datapass.result-store';
export const RESULT_STORE_PREFIX='/api/notebook/v1/store';
/** An allowlisted-model result is ONE display_data output carrying a validated datapass.artifact v1 document. */
export const ARTIFACT_MIME='application/vnd.datapass.artifact+json';
export const RUNTIME_RESULT_ORIGIN='datapass.runtime/1';
const SHA=/^[0-9a-f]{64}$/;
const LOOPBACK=new Set(['127.0.0.1','localhost']);

export async function sha256Hex(text:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function isObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}

/** Exact loopback origin with an explicit port (same rule as the workbench runtime pairing). */
export function resultStoreOrigin(value:string):string{
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('The result store address is not a URL.');}
  if(url.protocol!=='http:'||!LOOPBACK.has(url.hostname))throw new Error('The result store must be served over http on the loopback interface.');
  if(url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw new Error('Give only the result store origin, for example http://127.0.0.1:8765.');
  if(!url.port)throw new Error('The result store origin needs an explicit port.');
  return url.origin;
}

export type StoredRunRef={runId:string;model:string;modelVersion:string;inputHash:string;artifactSha256:string|null};
export type StoredArtifactResult={resultSha256:string;cellId:string;sourceSha256:string;finishedAt:string;artifact:Artifact;run:StoredRunRef|null};
export type ResultStoreEntry={cellId:string;sourceSha256:string;resultSha256:string;bytes:number;savedAt:string;present:boolean};

/** Minimal validator over `datapass.cell-result` v1 for model results; refuses every other kind or origin. */
export function readArtifactResult(input:unknown,resultSha256:string):StoredArtifactResult{
  if(!isObject(input)||input.format!==RESULT_FORMAT||input.version!==1)throw new Error('The stored result is not a datapass.cell-result v1 document.');
  if(input.cellKind!=='python'||input.origin!==RUNTIME_RESULT_ORIGIN)throw new Error('The stored result is not an allowlisted-model result.');
  if(typeof input.cellId!=='string'||!input.cellId||input.cellId.length>120)throw new Error('The stored result has no valid cell id.');
  if(typeof input.sourceSha256!=='string'||!SHA.test(input.sourceSha256))throw new Error('The stored result has no valid source hash.');
  if(typeof input.finishedAt!=='string'||Number.isNaN(Date.parse(input.finishedAt)))throw new Error('The stored result time is malformed.');
  const outputs=Array.isArray(input.outputs)?input.outputs:[];
  const out=outputs.length===1&&isObject(outputs[0])?outputs[0]:null,data=out&&isObject(out.data)?out.data:null;
  if(!out||out.output_type!=='display_data'||!data||!(ARTIFACT_MIME in data))throw new Error('The stored model result holds no datapass.artifact output.');
  const artifact=validateArtifact(data[ARTIFACT_MIME]);
  const meta=isObject(out.metadata)&&isObject(out.metadata.datapass)&&isObject(out.metadata.datapass.run)?out.metadata.datapass.run:null;
  const run=meta&&typeof meta.runId==='string'&&/^run-[0-9a-f]{16}$/.test(meta.runId)?{runId:meta.runId,model:String(meta.model??'').slice(0,80),modelVersion:String(meta.modelVersion??'').slice(0,80),inputHash:typeof meta.inputHash==='string'&&SHA.test(meta.inputHash)?meta.inputHash:'',artifactSha256:typeof meta.artifactSha256==='string'&&SHA.test(meta.artifactSha256)?meta.artifactSha256:null}:null;
  return {resultSha256,cellId:input.cellId,sourceSha256:input.sourceSha256,finishedAt:input.finishedAt,artifact,run};
}

type FetchLike=(url:string,init:{method:'GET';headers:Record<string,string>;credentials:'omit';cache:'no-store';mode:'cors'})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;
export class ResultStoreError extends Error{readonly status?:number;constructor(message:string,status?:number){super(message);this.name='ResultStoreError';this.status=status;}}

export class ResultStoreClient{
  readonly origin:string;readonly #token:string;readonly #fetch:FetchLike;
  constructor(connection:{origin:string;token:string},options:{fetch?:FetchLike}={}){
    this.origin=resultStoreOrigin(connection.origin);
    if(typeof connection.token!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(connection.token))throw new Error('The runtime token is malformed.');
    this.#token=connection.token;this.#fetch=options.fetch??(globalThis.fetch.bind(globalThis) as unknown as FetchLike);
  }
  async #get(path:string):Promise<{json:unknown;text:string}>{
    let response;
    try{response=await this.#fetch(this.origin+RESULT_STORE_PREFIX+path,{method:'GET',headers:{'X-Datapass-Token':this.#token},credentials:'omit',cache:'no-store',mode:'cors'});}
    catch{throw new ResultStoreError(`The local result store at ${this.origin} is unreachable.`);}
    const text=await response.text();
    let json:unknown=null;try{json=text?JSON.parse(text):null;}catch{if(response.ok)throw new ResultStoreError('The local result store answered with invalid JSON.');}
    if(!response.ok){
      const detail=isObject(json)&&typeof json.detail==='string'?json.detail:`HTTP ${response.status}`;
      throw new ResultStoreError(response.status===401?'The local result store refused the token; reconnect the runtime.':detail.slice(0,600),response.status);
    }
    return {json,text};
  }
  /** Model-result entries listed by the store (other cell kinds are left to the workbench). */
  async entries():Promise<ResultStoreEntry[]>{
    const {json}=await this.#get('/manifest');
    if(!isObject(json)||json.format!==RESULT_STORE_FORMAT||!Array.isArray(json.entries))throw new ResultStoreError('The service returned a malformed store manifest.');
    return json.entries.filter(isObject).filter(e=>e.cellKind==='python'&&typeof e.cellId==='string'&&typeof e.resultSha256==='string'&&SHA.test(e.resultSha256)).slice(0,500)
      .map(e=>({cellId:String(e.cellId),sourceSha256:String(e.sourceSha256),resultSha256:String(e.resultSha256),bytes:Number(e.bytes)||0,savedAt:String(e.savedAt),present:e.present===true}));
  }
  /** Read one immutable result: its bytes must hash to `sha`, then the artifact is re-validated. */
  async artifactResult(sha:string):Promise<StoredArtifactResult>{
    if(typeof sha!=='string'||!SHA.test(sha))throw new ResultStoreError('Invalid result hash.');
    const {json,text}=await this.#get('/results/'+sha);
    if(await sha256Hex(text)!==sha)throw new ResultStoreError(`Result ${sha.slice(0,12)} does not match its hash; it is not shown.`);
    try{return readArtifactResult(json,sha);}catch(error){throw new ResultStoreError((error as Error).message);}
  }
}

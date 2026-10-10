/** Client for the optional notebook routes of the trusted local service (`/api/notebook/v1`, py/service):
 * .ipynb import/export through the pinned nbformat, and the user-selected durable result store (FR-03).
 * Uses the same explicit runtime pairing (exact loopback origin + X-Datapass-Token header, no cookies).
 * Every result read back is checked against its content hash before it is shown; nothing is recomputed. */
import {runtimeOrigin,validToken} from './runtime.ts';
import {validateCell,validateNotebook,type Cell} from './notebook.ts';
import {validateTable,type NbOutput,type TablePayload} from './jupyter.ts';

export const NOTEBOOK_PREFIX='/api/notebook/v1';
export const RESULT_FORMAT='datapass.cell-result';
const SHA=/^[0-9a-f]{64}$/;
type FetchLike=(url:string,init:{method:'GET'|'POST';headers:Record<string,string>;body?:string;credentials:'omit';cache:'no-store';mode:'cors'})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;
function isObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}

export async function sha256Hex(text:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Deterministic JSON like the service's canonical form (sorted keys, ASCII escapes) for hashing a cell source key. */
export async function sourceSha256(sourceKey:string):Promise<string>{return sha256Hex(sourceKey);}

/** A table as stored: the same shape a kernel publishes (column names + row arrays), re-validated on read. */
export type StoredTable={columns:string[];rows:TablePayload['rows'];total:number;truncated:boolean};
export function storedTable(t:TablePayload):StoredTable{return {columns:t.columns.map(c=>c.name),rows:t.rows,total:t.total,truncated:t.truncated};}
export function resultTable(doc:CellResultDoc):TablePayload|null{return doc.table?validateTable(doc.table):null;}
export type CellResultDoc={format:typeof RESULT_FORMAT;version:1;cellId:string;cellKind:'sql'|'jupyter'|'python';sourceSha256:string;
  outputs:NbOutput[];table:StoredTable|null;executionCount:number|null;finishedAt:string;origin:'jupyter'|'duckdb'|'datapass.runtime/1'};
export function validateResultDoc(input:unknown,expect:{cellId?:string}={}):CellResultDoc{
  if(!isObject(input)||input.format!==RESULT_FORMAT||input.version!==1)throw new Error('The stored result is not a datapass.cell-result v1 document.');
  if(typeof input.cellId!=='string'||(expect.cellId&&input.cellId!==expect.cellId))throw new Error('The stored result belongs to another cell.');
  if(!['sql','jupyter','python'].includes(input.cellKind as string))throw new Error('The stored result has an unknown cell kind.');
  if(typeof input.sourceSha256!=='string'||!SHA.test(input.sourceSha256))throw new Error('The stored result has no valid source hash.');
  if(!Array.isArray(input.outputs)||input.outputs.length>500||input.outputs.some(o=>!isObject(o)||typeof o.output_type!=='string'))throw new Error('The stored result outputs are malformed.');
  const table=input.table===null?null:(()=>{const t=validateTable(input.table);return storedTable(t);})();
  if(input.executionCount!==null&&!Number.isSafeInteger(input.executionCount))throw new Error('The stored result execution count is malformed.');
  if(typeof input.finishedAt!=='string'||Number.isNaN(Date.parse(input.finishedAt)))throw new Error('The stored result time is malformed.');
  if(!['jupyter','duckdb','datapass.runtime/1'].includes(input.origin as string))throw new Error('The stored result origin is unknown.');
  return {format:RESULT_FORMAT,version:1,cellId:input.cellId,cellKind:input.cellKind as CellResultDoc['cellKind'],sourceSha256:input.sourceSha256,outputs:input.outputs as NbOutput[],table,executionCount:input.executionCount as number|null,finishedAt:input.finishedAt,origin:input.origin as CellResultDoc['origin']};
}

export type LossItem={cellId:string|null;item:string;detail:string};
export type ImportedNotebook={cells:Cell[];outputs:Record<string,NbOutput[]>;executionCounts:Record<string,number>;results:Record<string,string>;loss:LossItem[];nbformat:string;language:string};
/** Validate what the service mapped. The notebook is validated as a whole; any problem refuses the import. */
export function validateImport(input:unknown):ImportedNotebook{
  if(!isObject(input)||input.format!=='datapass.ipynb-import'||input.version!==1||!Array.isArray(input.cells))throw new Error('The service returned a malformed notebook import.');
  const cells=validateNotebook({cells:input.cells.map(c=>validateCell(c))}).cells;
  const ids=new Set(cells.map(c=>c.id));
  const outputs:Record<string,NbOutput[]>={},counts:Record<string,number>={},results:Record<string,string>={};
  for(const [k,v] of Object.entries(isObject(input.outputs)?input.outputs:{}))if(ids.has(k)&&Array.isArray(v))outputs[k]=v.filter(o=>isObject(o)&&typeof o.output_type==='string') as NbOutput[];
  for(const [k,v] of Object.entries(isObject(input.executionCounts)?input.executionCounts:{}))if(ids.has(k)&&Number.isSafeInteger(v))counts[k]=v as number;
  for(const [k,v] of Object.entries(isObject(input.results)?input.results:{}))if(ids.has(k)&&typeof v==='string'&&SHA.test(v))results[k]=v;
  const loss=(Array.isArray(input.loss)?input.loss:[]).slice(0,200).map(l=>isObject(l)?{cellId:typeof l.cellId==='string'?l.cellId:null,item:String(l.item??'').slice(0,80),detail:String(l.detail??'').slice(0,400)}:{cellId:null,item:'?',detail:'?'});
  return {cells,outputs,executionCounts:counts,results,loss,nbformat:String(input.nbformat??'').slice(0,10),language:String(input.language??'').slice(0,40)};
}

export type StoreEntry={cellId:string;cellKind:string;sourceSha256:string;resultSha256:string;bytes:number;savedAt:string;present:boolean;run:Record<string,unknown>};
export type StoreJob={jobId:string;cellId:string;sourceSha256:string;runtime:string;status:string;startedAt:string;finishedAt:string|null;detail?:string};
export type StoreManifest={entries:StoreEntry[];jobs:StoreJob[];workspace:{notebookSha256:string;savedAt:string}|null;store:{name:string;maxBytes:number;usedBytes:number}};
function validateManifest(v:unknown):StoreManifest{
  if(!isObject(v)||v.format!=='datapass.result-store'||!Array.isArray(v.entries)||!Array.isArray(v.jobs)||!isObject(v.store))throw new Error('The service returned a malformed store manifest.');
  const entries=v.entries.filter(isObject).filter(e=>typeof e.resultSha256==='string'&&SHA.test(e.resultSha256)&&typeof e.cellId==='string').slice(0,500).map(e=>({cellId:String(e.cellId),cellKind:String(e.cellKind),sourceSha256:String(e.sourceSha256),resultSha256:String(e.resultSha256),bytes:Number(e.bytes)||0,savedAt:String(e.savedAt),present:e.present===true,run:isObject(e.run)?e.run:{}}));
  const jobs=v.jobs.filter(isObject).slice(-200).map(j=>({jobId:String(j.jobId),cellId:String(j.cellId),sourceSha256:String(j.sourceSha256),runtime:String(j.runtime),status:String(j.status),startedAt:String(j.startedAt),finishedAt:typeof j.finishedAt==='string'?j.finishedAt:null,...(typeof j.detail==='string'?{detail:j.detail}:{})}));
  const ws=isObject(v.workspace)&&typeof v.workspace.notebookSha256==='string'?{notebookSha256:v.workspace.notebookSha256,savedAt:String(v.workspace.savedAt)}:null;
  const s=v.store as Record<string,unknown>;
  return {entries,jobs,workspace:ws,store:{name:String(s.name).slice(0,120),maxBytes:Number(s.maxBytes)||0,usedBytes:Number(s.usedBytes)||0}};
}

export class NotebookServiceError extends Error{readonly status?:number;constructor(message:string,status?:number){super(message);this.name='NotebookServiceError';this.status=status;}}
export type ExportPayload={cells:Cell[];outputs:Record<string,NbOutput[]>;executionCounts:Record<string,number>;results:Record<string,string>};
export type SaveItem={cellId:string;cellKind:'sql'|'jupyter'|'python';sourceSha256:string;result:CellResultDoc;run:Record<string,unknown>};

export class NotebookService{
  readonly origin:string;readonly #token:string;readonly #fetch:FetchLike;
  constructor(connection:{origin:string;token:string},options:{fetch?:FetchLike}={}){
    this.origin=runtimeOrigin(connection.origin);
    if(!validToken(connection.token))throw new Error('The runtime token is malformed.');
    this.#token=connection.token;this.#fetch=options.fetch??(globalThis.fetch.bind(globalThis) as unknown as FetchLike);
  }
  async #request(path:string,body?:unknown):Promise<{json:unknown;text:string}>{
    let response;
    try{response=await this.#fetch(this.origin+NOTEBOOK_PREFIX+path,{method:body===undefined?'GET':'POST',headers:{'X-Datapass-Token':this.#token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',mode:'cors'});}
    catch{throw new NotebookServiceError(`The local service at ${this.origin} is unreachable.`);}
    const text=await response.text();
    let json:unknown=null;try{json=text?JSON.parse(text):null;}catch{if(response.ok)throw new NotebookServiceError('The local service answered with invalid JSON.');}
    if(!response.ok){
      const detail=isObject(json)&&typeof json.detail==='string'?json.detail:`HTTP ${response.status}`;
      throw new NotebookServiceError(response.status===401?'The local service refused the token; reconnect the runtime.':response.status===404&&/not found/i.test(detail)?'This local service has no notebook routes (install py/service/requirements-jupyter.txt).':detail.slice(0,600),response.status);
    }
    return {json,text};
  }
  async status():Promise<{nbformat:string;store:{name:string;maxBytes:number;usedBytes:number}|null}>{
    const {json}=await this.#request('/status');
    if(!isObject(json)||json.service!=='datapass.notebook-service/1')throw new NotebookServiceError('The service does not offer datapass.notebook-service/1.');
    const s=isObject(json.store)?{name:String(json.store.name).slice(0,120),maxBytes:Number(json.store.maxBytes)||0,usedBytes:Number(json.store.usedBytes)||0}:null;
    return {nbformat:String(json.nbformat??'').slice(0,20),store:s};
  }
  async importIpynb(name:string,text:string):Promise<ImportedNotebook>{
    if(text.length>4*1024*1024)throw new NotebookServiceError('The notebook is above 4 MB.');
    return validateImport((await this.#request('/ipynb/import',{name:name.slice(0,200),text})).json);
  }
  async exportIpynb(payload:ExportPayload):Promise<{text:string;sha256:string}>{
    const {json}=await this.#request('/ipynb/export',payload);
    if(!isObject(json)||typeof json.text!=='string')throw new NotebookServiceError('The service returned a malformed export.');
    return {text:json.text,sha256:await sha256Hex(json.text)};
  }
  async manifest():Promise<StoreManifest>{return validateManifest((await this.#request('/store/manifest')).json);}
  async save(notebook:ExportPayload,results:SaveItem[]):Promise<{notebookSha256:string;results:{cellId:string;resultSha256:string}[]}>{
    const {json}=await this.#request('/store/save',{notebook,results});
    if(!isObject(json)||typeof json.notebookSha256!=='string'||!Array.isArray(json.results))throw new NotebookServiceError('The service returned a malformed save receipt.');
    return {notebookSha256:json.notebookSha256,results:json.results.filter(isObject).map(r=>({cellId:String(r.cellId),resultSha256:String(r.resultSha256)}))};
  }
  /** Read one immutable result and check its bytes against the name it is stored under. */
  async result(sha:string,cellId?:string):Promise<CellResultDoc>{
    if(!SHA.test(sha))throw new NotebookServiceError('Invalid result hash.');
    const {json,text}=await this.#request('/store/results/'+sha);
    if(await sha256Hex(text)!==sha)throw new NotebookServiceError(`Result ${sha.slice(0,12)} does not match its hash; it is not shown.`);
    return validateResultDoc(json,{cellId});
  }
  async deleteResult(sha:string):Promise<StoreManifest>{return validateManifest((await this.#request(`/store/results/${sha}/delete`,{})).json);}
  async notebook():Promise<{sha256:string;imported:ImportedNotebook;manifest:StoreManifest}>{
    const {json}=await this.#request('/store/notebook');
    if(!isObject(json)||typeof json.sha256!=='string')throw new NotebookServiceError('The service returned a malformed saved notebook.');
    return {sha256:json.sha256,imported:validateImport(json.import),manifest:validateManifest(json.manifest)};
  }
  async startJob(cellId:string,source:string,runtime:'jupyter'|'duckdb'|'datapass.runtime/1'):Promise<string>{
    const {json}=await this.#request('/store/jobs',{cellId,sourceSha256:source,runtime});
    if(!isObject(json)||typeof json.jobId!=='string')throw new NotebookServiceError('Malformed job receipt.');
    return json.jobId;
  }
  async finishJob(jobId:string,status:'succeeded'|'failed'|'interrupted'|'cancelled'|'disconnected'|'unknown'):Promise<void>{await this.#request(`/store/jobs/${jobId}/finish`,{status});}
}

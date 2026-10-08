/** Persistent browser workspace (`datapass.workspace` v1). Pure validation + a small storage port.
 * Saved: the user's authored inputs (SQL text, notebook cells, model inputs), layout choices, source *references*
 * and run *references*. Never saved: dataset bytes, query rows, artifact payloads, runtime tokens or secrets.
 * A document that does not validate is never half-applied: the caller keeps the current workspace. */
import {identifier,strict,text} from '../framework/guards.ts';
import {validateNotebook,type Notebook} from './notebook.ts';
import {validatePipeline,type Pipeline} from '../core/pipeline.ts';

export const WORKSPACE_FORMAT='datapass.workspace';
export const WORKSPACE_VERSION=1;
export const WORKSPACE_KEY='datapass.workspace';
export const WORKSPACE_BACKUP_KEY='datapass.workspace.rejected';
export const WORKSPACE_BYTES=512*1024;
export const LANES=['Backlog','In progress','Review','Done'] as const;
export type SavedQuery={id:string;name:string;query:string};
export type SourceRef={table:string;name:string;kind:'sample'|'user-file';bytes?:number};
export type RunRef={runId:string;cellId:string;origin:string;model:string;modelVersion:string;status:'queued'|'running'|'succeeded'|'failed'|'cancelled';inputHash:string;inputs:Record<string,number|string|boolean>;submittedAt:string;finishedAt:string|null;artifactId:string|null;artifactSha256:string|null};
export type BoardCard={id:string;title:string;lane:typeof LANES[number]};
export type WorkspaceDoc={
  format:typeof WORKSPACE_FORMAT;version:1;savedAt:string;
  samples:boolean;module:string;catalogCollapsed:boolean;
  queries:SavedQuery[];selectedQueryId:string|null;
  notebook:Notebook;runs:RunRef[];sources:SourceRef[];
  runtimeOrigin:string|null;pipeline:Pipeline|null;cards:BoardCard[]|null;
};
export const WORKSPACE_LIMITS=Object.freeze({queries:50,query:20000,runs:50,sources:50});

function list<T>(v:unknown,max:number,label:string,each:(x:unknown)=>T):T[]{
  if(!Array.isArray(v)||v.length>max)throw new Error(label+': list budget');
  return v.map(each);
}
function iso(v:unknown,label:string,nullable=false):string|null{
  if(nullable&&v===null)return null;
  if(typeof v!=='string'||v.length>40||Number.isNaN(Date.parse(v)))throw new Error(label+': invalid time');
  return v;
}
function validateRunRef(v:unknown):RunRef{
  strict(v,['runId','cellId','origin','model','modelVersion','status','inputHash','inputs','submittedAt','finishedAt','artifactId','artifactSha256'],'run reference');
  if(typeof v.runId!=='string'||!/^run-[0-9a-f]{16}$/.test(v.runId))throw new Error('run reference: invalid run id');
  identifier(v.cellId,'run cell');identifier(v.model,'run model');text(v.modelVersion,'model version',80);
  if(typeof v.origin!=='string'||!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(v.origin))throw new Error('run reference: origin must be a loopback origin');
  if(!['queued','running','succeeded','failed','cancelled'].includes(v.status as string))throw new Error('run reference: unknown status');
  if(typeof v.inputHash!=='string'||!/^[0-9a-f]{64}$/.test(v.inputHash))throw new Error('run reference: invalid input hash');
  if(v.artifactSha256!==null&&(typeof v.artifactSha256!=='string'||!/^[0-9a-f]{64}$/.test(v.artifactSha256)))throw new Error('run reference: invalid artifact hash');
  if(v.artifactId!==null)identifier(v.artifactId,'run artifact');
  if(!v.inputs||typeof v.inputs!=='object'||Array.isArray(v.inputs)||Object.keys(v.inputs).length>24)throw new Error('run reference: inputs');
  for(const [k,x] of Object.entries(v.inputs as Record<string,unknown>)){identifier(k,'run input');if(!(typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)||typeof x==='string'&&x.length<=400))throw new Error('run reference: input value');}
  iso(v.submittedAt,'run submitted');iso(v.finishedAt,'run finished',true);
  return structuredClone(v) as RunRef;
}

/** Joint validation of a complete document. Returns a fresh clone or throws before anything changes. */
export function validateWorkspace(input:unknown,knownModules:readonly string[]):WorkspaceDoc{
  if(typeof input!=='object'||input===null)throw new Error('workspace: not an object');
  const raw=input as Record<string,unknown>;
  if(raw.format!==WORKSPACE_FORMAT)throw new Error('This is not a datapass.workspace document.');
  if(typeof raw.version!=='number'||raw.version>WORKSPACE_VERSION)throw new Error(`This workspace was saved by a newer studio (version ${String(raw.version)}); it was not loaded.`);
  if(raw.version!==WORKSPACE_VERSION)throw new Error(`Unsupported workspace version ${String(raw.version)}.`);
  strict(input,['format','version','savedAt','samples','module','catalogCollapsed','queries','selectedQueryId','notebook','runs','sources','runtimeOrigin','pipeline','cards'],'workspace');
  iso(raw.savedAt,'workspace saved');
  if(typeof raw.samples!=='boolean'||typeof raw.catalogCollapsed!=='boolean')throw new Error('workspace: flags');
  if(typeof raw.module!=='string'||!knownModules.includes(raw.module))throw new Error('workspace: unknown module');
  const queries=list(raw.queries,WORKSPACE_LIMITS.queries,'saved queries',q=>{
    strict(q,['id','name','query'],'saved query');
    if(typeof q.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(q.id))throw new Error('saved query: invalid id');
    text(q.name,'saved query name',120);text(q.query,'saved query text',WORKSPACE_LIMITS.query,false);
    return {id:q.id,name:q.name,query:q.query};
  });
  if(new Set(queries.map(q=>q.id)).size!==queries.length)throw new Error('saved queries: duplicate id');
  if(raw.selectedQueryId!==null&&!queries.some(q=>q.id===raw.selectedQueryId))throw new Error('workspace: selected query is not saved');
  const notebook=validateNotebook(raw.notebook);
  const runs=list(raw.runs,WORKSPACE_LIMITS.runs,'run references',validateRunRef);
  const sources=list(raw.sources,WORKSPACE_LIMITS.sources,'source references',s=>{
    strict(s,['table','name','kind','bytes'],'source reference');
    if(typeof s.table!=='string'||!/^[A-Za-z0-9_]{1,80}$/.test(s.table))throw new Error('source reference: table');
    text(s.name,'source name',260);
    if(s.kind!=='sample'&&s.kind!=='user-file')throw new Error('source reference: kind');
    if(s.bytes!==undefined&&(!Number.isSafeInteger(s.bytes)||(s.bytes as number)<0))throw new Error('source reference: bytes');
    return structuredClone(s) as SourceRef;
  });
  if(raw.runtimeOrigin!==null&&(typeof raw.runtimeOrigin!=='string'||!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(raw.runtimeOrigin)))throw new Error('workspace: runtime origin must be loopback');
  const pipeline=raw.pipeline===null?null:validatePipeline(raw.pipeline);
  const cards=raw.cards===null?null:list(raw.cards,100,'board',c=>{
    strict(c,['id','title','lane'],'board card');if(typeof c.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(c.id))throw new Error('board card: invalid id');text(c.title,'card title',160);
    if(!LANES.includes(c.lane as BoardCard['lane']))throw new Error('board card: lane');
    return structuredClone(c) as BoardCard;
  });
  const doc:WorkspaceDoc={format:WORKSPACE_FORMAT,version:1,savedAt:raw.savedAt as string,samples:raw.samples,module:raw.module,catalogCollapsed:raw.catalogCollapsed,queries,selectedQueryId:raw.selectedQueryId as string|null,notebook,runs,sources,runtimeOrigin:raw.runtimeOrigin as string|null,pipeline,cards};
  if(new TextEncoder().encode(JSON.stringify(doc)).byteLength>WORKSPACE_BYTES)throw new Error(`workspace: above ${WORKSPACE_BYTES} bytes`);
  return doc;
}

export function blankWorkspace(module='notebook'):WorkspaceDoc{
  return {format:WORKSPACE_FORMAT,version:1,savedAt:new Date(0).toISOString(),samples:false,module,catalogCollapsed:false,queries:[],selectedQueryId:null,notebook:{cells:[]},runs:[],sources:[],runtimeOrigin:null,pipeline:null,cards:null};
}

/** Accept a workspace file, or migrate the older explicit draft export (`datapass.studio2.draft` v1). Nothing runs. */
export function importWorkspace(textValue:string,knownModules:readonly string[]):{doc:WorkspaceDoc;migratedFrom:string|null}{
  if(textValue.length>WORKSPACE_BYTES*2)throw new Error('The file is too large to be a workspace.');
  let json:unknown;try{json=JSON.parse(textValue);}catch{throw new Error('The file is not valid JSON.');}
  const raw=json as Record<string,unknown>|null;
  if(raw&&raw.format==='datapass.studio2.draft'&&raw.version===1){
    strict(raw,['format','version','module','layout','pipeline','board','note'],'draft');
    const doc=blankWorkspace(typeof raw.module==='string'&&knownModules.includes(raw.module)?raw.module:knownModules[0]);
    return {doc:validateWorkspace({...doc,savedAt:new Date().toISOString(),pipeline:raw.pipeline??null,cards:raw.board??null},knownModules),migratedFrom:'datapass.studio2.draft v1'};
  }
  return {doc:validateWorkspace(json,knownModules),migratedFrom:null};
}

export type StoragePort={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
export type LoadResult={doc:WorkspaceDoc|null;notice:string|null};
/** Load the saved workspace. A rejected document is moved aside (never silently deleted) and the caller starts blank. */
export function loadWorkspace(storage:StoragePort|null,knownModules:readonly string[]):LoadResult{
  if(!storage)return {doc:null,notice:'Browser storage is unavailable; this workspace will not survive a reload.'};
  let value:string|null;
  try{value=storage.getItem(WORKSPACE_KEY);}catch{return {doc:null,notice:'Browser storage is unavailable; this workspace will not survive a reload.'};}
  if(value===null)return {doc:null,notice:null};
  try{
    let json:unknown;try{json=JSON.parse(value);}catch{throw new Error('The saved workspace is not valid JSON.');}
    return {doc:validateWorkspace(json,knownModules),notice:null};
  }catch(error){
    try{storage.setItem(WORKSPACE_BACKUP_KEY,value);storage.removeItem(WORKSPACE_KEY);}catch{/* storage became unavailable */}
    return {doc:null,notice:`The saved workspace was not restored: ${(error as Error).message} It was kept aside under "${WORKSPACE_BACKUP_KEY}"; a blank workspace is open.`};
  }
}
export function saveWorkspace(storage:StoragePort|null,doc:WorkspaceDoc,knownModules:readonly string[]):string|null{
  if(!storage)return 'Browser storage is unavailable; changes are not saved.';
  try{const valid=validateWorkspace({...doc,savedAt:new Date().toISOString()},knownModules);storage.setItem(WORKSPACE_KEY,JSON.stringify(valid));return null;}
  catch(error){return 'The workspace could not be saved: '+(error as Error).message;}
}
export function resetWorkspace(storage:StoragePort|null):void{
  try{storage?.removeItem(WORKSPACE_KEY);}catch{/* nothing to reset */}
}
export function browserStorage():StoragePort|null{
  try{const s=globalThis.localStorage;const probe='datapass.workspace.probe';s.setItem(probe,'1');s.removeItem(probe);return s;}catch{return null;}
}

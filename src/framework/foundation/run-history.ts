/** Optional, client-supplied persistence of run REFERENCES (`datapass.run-history` v1).
 * A reference records what was observed (ids, declared metadata, captured inputs, outcome, timestamps,
 * artifact id) and never the artifact payload, rows, task messages, source functions or secrets.
 * Restored references are labelled restored: they were not rerun and their results were not kept.
 * Without `AppDefinition.runHistory` nothing here runs and no storage is touched (AGENTS.md rule 31). */
import type {Manifest,Scalar} from '../types.ts';
import {identifier,strict,text,object} from '../guards.ts';
import {boundedJson,freezeValue,integerRange} from './safety.ts';
import type {RunRecord,RunSpec} from './journal.ts';

export const RUN_REF_FORMAT='datapass.run-ref';
export const RUN_HISTORY_FORMAT='datapass.run-history';
export const RUN_HISTORY_VERSION=1;
export const RUN_HISTORY_BYTES=262144;
export const RUN_HISTORY_DEFAULT_REFS=20;
export type RunOutcome='succeeded'|'failed'|'cancelled'|'superseded'|'timed-out'|'unobserved';
export type RunReference={
  format:typeof RUN_REF_FORMAT;version:1;id:string;taskId:string;
  appId:string;appVersion:string;modelId:string;modelVersion:string;providerId:string;
  parameters:Record<string,Scalar>;dependencies:Record<string,number>;
  outcome:RunOutcome;startedAt:string;finishedAt:string|null;durationMs:number;
  artifactRef:{id:string;representationIds:string[]}|null;restored:true;
};
export type RunHistoryDoc={format:typeof RUN_HISTORY_FORMAT;version:1;appId:string;appVersion:string;resource:string;savedAt:string;refs:RunReference[]};
/** Same shape as the workspace StoragePort (localStorage satisfies it). Trusted source, never imported JSON. */
export type RunHistoryStore={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
export type RunHistoryBinding={store:RunHistoryStore;maxRefs?:number};
export type RunHistoryScope={manifest:Pick<Manifest,'id'|'version'>;resource:string;specs:readonly RunSpec[];maxRefs:number};
const OUTCOMES:readonly RunOutcome[]=['succeeded','failed','cancelled','superseded','timed-out','unobserved'];
const REF_KEYS=['format','version','id','taskId','appId','appVersion','modelId','modelVersion','providerId','parameters','dependencies','outcome','startedAt','finishedAt','durationMs','artifactRef','restored'];

export const runHistoryKey=(appId:string,resource:string)=>`${RUN_HISTORY_FORMAT}.${appId}.${resource}`;
export const rejectedKey=(key:string)=>key+'.rejected';

function timestamp(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||new Date(value).toISOString()!==value)throw new Error('Invalid '+label);
}
/** Validate one reference against the current app identity and the resource's declared run profiles. */
export function validateRunReference(value:unknown,scope:Pick<RunHistoryScope,'manifest'|'specs'>):RunReference{
  strict(value,REF_KEYS,'run reference');
  if(value.format!==RUN_REF_FORMAT||value.version!==1)throw new Error('Unsupported run reference');
  for(const key of ['id','taskId','appId','modelId','providerId'])identifier(value[key],'run reference '+key);
  for(const key of ['appVersion','modelVersion'])text(value[key],key,80);
  if(value.appId!==scope.manifest.id||value.appVersion!==scope.manifest.version)throw new Error('Run reference belongs to another app or app version');
  const spec=scope.specs.find(s=>s.taskId===value.taskId);
  if(!spec)throw new Error('Run reference names a task this app no longer observes: '+String(value.taskId));
  if(spec.modelId!==value.modelId||spec.modelVersion!==value.modelVersion||spec.providerId!==value.providerId)throw new Error('Run reference was declared with a different model/provider profile');
  if(!object(value.parameters)||Object.keys(value.parameters).length>100)throw new Error('Invalid parameter set');
  for(const [key,entry] of Object.entries(value.parameters)){
    identifier(key,'parameter');
    if(!(entry===null||typeof entry==='boolean'||typeof entry==='number'&&Number.isFinite(entry)||typeof entry==='string'&&entry.length<=4000))throw new Error('Invalid parameter value');
  }
  if(!object(value.dependencies)||Object.keys(value.dependencies).length>50)throw new Error('Invalid dependency record');
  for(const [key,revision] of Object.entries(value.dependencies)){identifier(key,'dependency');integerRange(revision,1,Number.MAX_SAFE_INTEGER,'dataset revision');}
  if(typeof value.outcome!=='string'||!OUTCOMES.includes(value.outcome as RunOutcome))throw new Error('Invalid run outcome');
  timestamp(value.startedAt,'run start');
  if(value.outcome==='unobserved'){if(value.finishedAt!==null)throw new Error('An unobserved run has no observed finish');}
  else timestamp(value.finishedAt,'run finish');
  if(typeof value.durationMs!=='number'||!Number.isFinite(value.durationMs)||value.durationMs<0)throw new Error('Invalid run duration');
  if(value.artifactRef!==null){
    if(value.outcome!=='succeeded')throw new Error('Only a successful run can reference an artifact');
    strict(value.artifactRef,['id','representationIds'],'artifact reference');identifier(value.artifactRef.id,'artifact id');
    const ids=value.artifactRef.representationIds;
    if(!Array.isArray(ids)||ids.length>12)throw new Error('Invalid representation references');
    for(const id of ids)identifier(id,'representation id');
    if(new Set(ids).size!==ids.length)throw new Error('Duplicate representation reference');
  }
  if(value.restored!==true)throw new Error('A stored run reference must be marked restored');
  return freezeValue(structuredClone(value) as RunReference);
}
/** Joint validation of a complete stored snapshot. Any bad entry refuses the whole document (no partial load). */
export function validateRunHistory(input:unknown,scope:RunHistoryScope):RunHistoryDoc{
  if(!object(input))throw new Error('Saved run history is not an object');
  if(input.format!==RUN_HISTORY_FORMAT)throw new Error('This is not a datapass.run-history document');
  if(typeof input.version!=='number'||input.version>RUN_HISTORY_VERSION)throw new Error(`Saved run history uses a newer format (version ${String(input.version)}); no migrator is available`);
  if(input.version!==RUN_HISTORY_VERSION)throw new Error(`Unsupported run history version ${String(input.version)}`);
  boundedJson(input,RUN_HISTORY_BYTES);
  strict(input,['format','version','appId','appVersion','resource','savedAt','refs'],'run history');
  if(input.appId!==scope.manifest.id||input.appVersion!==scope.manifest.version)throw new Error('Saved run history belongs to another app or app version');
  if(input.resource!==scope.resource)throw new Error('Saved run history belongs to another run resource');
  timestamp(input.savedAt,'save time');
  if(!Array.isArray(input.refs)||input.refs.length>scope.maxRefs)throw new Error('Saved run history exceeds its reference budget');
  const refs=input.refs.map(r=>validateRunReference(r,scope));
  if(new Set(refs.map(r=>r.id)).size!==refs.length)throw new Error('Duplicate saved run reference');
  return freezeValue({format:RUN_HISTORY_FORMAT,version:1,appId:input.appId as string,appVersion:input.appVersion as string,resource:scope.resource,savedAt:input.savedAt as string,refs});
}
/** Reduce a journal record to a reference. A record still running is written as unobserved: its outcome
 * was not seen before this snapshot, and a reload must never present it as completed. */
export function toReference(record:RunRecord):RunReference{
  const outcome:RunOutcome=record.status==='running'?'unobserved':record.status;
  const artifactRef=outcome==='succeeded'&&record.retention==='retained'&&record.artifact?{id:record.artifact.id,representationIds:record.artifact.representations.map(r=>r.id)}:null;
  return {format:RUN_REF_FORMAT,version:1,id:record.id,taskId:record.taskId,appId:record.appId,appVersion:record.appVersion,modelId:record.modelId,modelVersion:record.modelVersion,providerId:record.providerId,
    parameters:{...record.parameters},dependencies:{...record.dependencies},outcome,startedAt:record.startedAt,finishedAt:outcome==='unobserved'?null:record.finishedAt,durationMs:outcome==='unobserved'?0:record.durationMs,artifactRef,restored:true};
}
const UNAVAILABLE='Browser storage is unavailable; run history stays in memory for this tab only.';
/** Load and validate before anything changes. A refused value is kept aside under `<key>.rejected`, never deleted. */
export function loadRunHistory(store:RunHistoryStore,scope:RunHistoryScope):{refs:RunReference[];notice:string|null}{
  const key=runHistoryKey(scope.manifest.id,scope.resource);
  let raw:string|null;
  try{raw=store.getItem(key);}catch{return {refs:[],notice:UNAVAILABLE};}
  if(raw===null)return {refs:[],notice:null};
  try{
    if(raw.length>RUN_HISTORY_BYTES)throw new Error('Saved run history exceeds its byte budget');
    let json:unknown;try{json=JSON.parse(raw);}catch{throw new Error('Saved run history is not valid JSON');}
    return {refs:[...validateRunHistory(json,scope).refs],notice:null};
  }catch(error){
    let kept=true;try{store.setItem(rejectedKey(key),raw);store.removeItem(key);}catch{kept=false;}
    const message=(error as Error).message.replace(/\.?$/,'.');
    return {refs:[],notice:`Saved run history was not restored: ${message} `+(kept?`It was kept aside under "${rejectedKey(key)}". Live history still works.`:'Storage could not keep it aside; it was left in place. Live history still works.')};
  }
}
/** Persist references only (newest kept within the budget). Returns a notice on failure, null on success. */
export function saveRunHistory(store:RunHistoryStore,scope:RunHistoryScope,refs:readonly RunReference[]):string|null{
  try{
    const doc={format:RUN_HISTORY_FORMAT,version:1,appId:scope.manifest.id,appVersion:scope.manifest.version,resource:scope.resource,savedAt:new Date().toISOString(),refs:refs.slice(-scope.maxRefs)};
    const valid=validateRunHistory(JSON.parse(JSON.stringify(doc)),scope);
    store.setItem(runHistoryKey(scope.manifest.id,scope.resource),JSON.stringify(valid));return null;
  }catch(error){return 'Run history could not be saved: '+(error as Error).message;}
}
/** Explicit reset: removes the saved references only. A kept-aside `.rejected` value is left alone. */
export function resetRunHistory(store:RunHistoryStore,scope:Pick<RunHistoryScope,'manifest'|'resource'>):string|null{
  try{store.removeItem(runHistoryKey(scope.manifest.id,scope.resource));return null;}catch{return UNAVAILABLE;}
}
/** Source-only check of `AppDefinition.runHistory`: functions are trusted bindings, never imported JSON. */
export function validateRunHistoryBindings(bindings:unknown,runResources:readonly string[]):void{
  if(bindings===undefined)return;
  if(!object(bindings)||Object.keys(bindings).length>10)throw new Error('Invalid run history bindings');
  for(const [id,binding] of Object.entries(bindings)){
    if(!runResources.includes(id))throw new Error('Run history names an unused run resource: '+id);
    strict(binding,['store','maxRefs'],'run history binding');
    const store=binding.store as Record<string,unknown>|null;
    if(!store||typeof store!=='object'||['getItem','setItem','removeItem'].some(k=>typeof store[k]!=='function'))throw new Error('Run history requires a trusted getItem/setItem/removeItem store');
    if(binding.maxRefs!==undefined)integerRange(binding.maxRefs,1,100,'run history reference limit');
  }
}

type Journalish={
  getSnapshot():{records:readonly RunRecord[];restored:readonly RunReference[]};
  subscribe(fn:()=>void):()=>void;
  restoreReferences(refs:readonly RunReference[]):void;
  clearRestored():void;
};
export type RunHistoryController={notice:string|null;reset():void;dispose():void};
const loaded=new WeakSet<object>();
/** Glue used by RunScope: load once per journal, restore, then save references on every journal change.
 * Observes the journal only; it never calls runTask, cancelTask or subscribeTaskRuns. Returns null (and
 * touches no storage) when the client supplied no binding. */
export function bindRunHistory(journal:Journalish,binding:RunHistoryBinding|undefined,scope:Omit<RunHistoryScope,'maxRefs'>,onNotice:(notice:string|null)=>void=()=>{}):RunHistoryController|null{
  if(!binding)return null;
  const full:RunHistoryScope={...scope,maxRefs:binding.maxRefs??RUN_HISTORY_DEFAULT_REFS};
  const controller:RunHistoryController={notice:null,reset:()=>{},dispose:()=>{}};
  const setNotice=(notice:string|null)=>{if(notice!==controller.notice){controller.notice=notice;onNotice(notice);}};
  if(!loaded.has(journal)){
    loaded.add(journal);
    const result=loadRunHistory(binding.store,full);
    if(result.refs.length){
      try{journal.restoreReferences(result.refs);}
      catch(error){setNotice('Saved run history was not restored: '+(error as Error).message);}
    }
    if(result.notice)setNotice(result.notice);
  }
  const excluded=new Set<string>();let last='';
  const save=()=>{
    const s=journal.getSnapshot(),refs=[...s.restored,...s.records.filter(r=>!excluded.has(r.id)).map(toReference)];
    const key=JSON.stringify(refs);if(key===last)return;last=key;
    const problem=saveRunHistory(binding.store,full,refs);if(problem)setNotice(problem);
  };
  const off=journal.subscribe(save);
  controller.reset=()=>{
    for(const r of journal.getSnapshot().records)excluded.add(r.id);
    journal.clearRestored();
    const problem=resetRunHistory(binding.store,full);last=JSON.stringify([]);
    setNotice(problem??'Saved run history was reset. Runs already shown in this tab stay until reload but are no longer saved.');
  };
  controller.dispose=off;
  return controller;
}

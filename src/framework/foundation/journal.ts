import type {SiteRuntime} from '../runtime.ts';
import type {TaskRunEvent} from '../task-events.ts';
import type {Dataset,Scalar} from '../types.ts';
import {identifier,strict,text,object} from '../guards.ts';
import {tableArtifact,validateArtifactViews,validateArtifact,type Artifact,type Representation} from './artifact.ts';
import {boundedJson,freezeValue,integerRange,jsonBytes} from './safety.ts';

export type RunSpec={
  format:'datapass.run-spec';version:1;taskId:string;modelId:string;modelVersion:string;
  providerId:string;source:string;provenance:Artifact['provenance']['kind'];representations:Representation[];
};
export type RunRecord={
  format:'datapass.run';version:1;id:string;taskId:string;
  appId:string;appVersion:string;modelId:string;modelVersion:string;providerId:string;
  parameters:Record<string,Scalar>;dependencies:Record<string,number>;
  status:'running'|'succeeded'|'failed'|'cancelled'|'superseded'|'timed-out'|'unobserved';
  startedAt:string;finishedAt:string|null;durationMs:number;
  artifact:Artifact|null;retention:'pending'|'retained'|'none'|'omitted-budget'|'invalid-output';message:string;
};
export type JournalSnapshot={records:readonly RunRecord[];evicted:number;notCaptured:number;revision:number;selectedId:string|null;followingLatest:boolean};
export type JournalOptions={maxRecords?:number;maxBytes?:number};
const STATUSES=['running','succeeded','failed','cancelled','superseded','timed-out','unobserved'];
function timestamp(value:unknown):asserts value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new Error('Invalid run timestamp');
}
export function validateRunRecord(value:unknown):RunRecord{
  boundedJson(value,2097152);
  strict(value,['format','version','id','taskId','appId','appVersion','modelId','modelVersion','providerId','parameters','dependencies','status','startedAt','finishedAt','durationMs','artifact','retention','message'],'run record');
  if(value.format!=='datapass.run'||value.version!==1)throw new Error('Unsupported run record');
  for(const key of ['id','taskId','appId','modelId','providerId'])identifier(value[key],'run '+key);
  for(const key of ['appVersion','modelVersion'])text(value[key],key,80);
  if(!object(value.parameters)||Object.keys(value.parameters).length>100)throw new Error('Invalid parameter set');
  for(const [key,entry] of Object.entries(value.parameters)){
    identifier(key,'parameter');
    if(!(entry===null||typeof entry==='boolean'||typeof entry==='number'&&Number.isFinite(entry)||typeof entry==='string'&&entry.length<=4000))throw new Error('Invalid parameter value');
  }
  if(!object(value.dependencies)||Object.keys(value.dependencies).length>50)throw new Error('Invalid dependency record');
  for(const [key,revision] of Object.entries(value.dependencies)){identifier(key,'dependency');integerRange(revision,1,Number.MAX_SAFE_INTEGER,'dataset revision');}
  if(typeof value.status!=='string'||!STATUSES.includes(value.status))throw new Error('Invalid run status');
  timestamp(value.startedAt);
  if(typeof value.durationMs!=='number'||!Number.isFinite(value.durationMs)||value.durationMs<0)throw new Error('Invalid run duration');
  if(typeof value.retention!=='string'||!['pending','retained','none','omitted-budget','invalid-output'].includes(value.retention))throw new Error('Invalid retention state');
  if(value.status==='unobserved'){if(value.finishedAt!==null||value.retention!=='none'||value.artifact!==null)throw new Error('Unobserved run cannot claim a terminal result');}
  else if(value.status==='running'){if(value.finishedAt!==null||value.retention!=='pending'||value.artifact!==null)throw new Error('Running record has terminal data');}
  else timestamp(value.finishedAt);
  text(value.message,'run message',2000,false);
  if(value.status==='succeeded'){
    if(!['retained','omitted-budget','invalid-output'].includes(String(value.retention)))throw new Error('Missing artifact retention status');
    if(value.retention==='retained'){
      const artifact=validateArtifact(value.artifact);
      if(artifact.provenance.runId!==value.id)throw new Error('Artifact belongs to another run');
    }else if(value.artifact!==null)throw new Error('Omitted artifact must be null');
  }else if(value.status!=='running'&&(value.artifact!==null||value.retention!=='none'))throw new Error('Unsuccessful run cannot carry a result');
  return freezeValue(structuredClone(value) as RunRecord);
}
export function validateRunSpec(value:unknown,runtime:Pick<SiteRuntime,'manifest'>):RunSpec{
  boundedJson(value,32000);
  strict(value,['format','version','taskId','modelId','modelVersion','providerId','source','provenance','representations'],'run spec');
  if(value.format!=='datapass.run-spec'||value.version!==1)throw new Error('Unsupported run spec');
  for(const key of ['taskId','modelId','providerId'])identifier(value[key],key);
  text(value.modelVersion,'model version',80);text(value.source,'run source',2000);
  if(typeof value.provenance!=='string'||!['synthetic','computed','provided'].includes(value.provenance))throw new Error('Invalid run provenance');
  const task=runtime.manifest.tasks.find(task=>task.id===value.taskId);
  if(!task)throw new Error('Run spec references an unknown task');
  validateArtifactViews(runtime.manifest.datasets.find(d=>d.id===task.output)!,value.representations);
  return freezeValue(structuredClone(value) as RunSpec);
}
/** Optional bounded in-memory history over the one existing SiteRuntime scheduler.
 * attach/detach controls observation only; never starts, cancels or retries a task.
 * Records are immutable snapshots; it is NOT a durable backend or resume engine.
 */
export class RunJournal{
  private snapshot:JournalSnapshot=freezeValue({records:[],evicted:0,notCaptured:0,revision:0,selectedId:null,followingLatest:true});
  private listeners=new Set<()=>void>();
  private readonly specs:Map<string,RunSpec>;
  private readonly pending=new Map<number,{id:string;output:Dataset}>();
  private detach:(()=>void)|null=null;
  private readonly session='run-'+crypto.randomUUID();
  private readonly maxRecords:number;
  private readonly maxBytes:number;
  private readonly runtime:SiteRuntime;
  constructor(runtime:SiteRuntime,specs:readonly RunSpec[],options:JournalOptions={}){
    this.runtime=runtime;strict(options,['maxRecords','maxBytes'],'journal options');
    this.maxRecords=options.maxRecords??20;this.maxBytes=options.maxBytes??4194304;
    integerRange(this.maxRecords,1,100,'journal record limit');integerRange(this.maxBytes,4096,16777216,'journal byte limit');
    if(!Array.isArray(specs)||specs.length>50)throw new Error('Run spec budget exceeded');
    const normalized=specs.map(s=>validateRunSpec(s,runtime));
    this.specs=new Map(normalized.map(s=>[s.taskId,s]));if(this.specs.size!==normalized.length)throw new Error('Duplicate task run spec');
  }
  getSnapshot=():JournalSnapshot=>this.snapshot;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  attach=()=>{
    if(this.detach)throw new Error('Run journal already attached');
    const off=this.runtime.subscribeTaskRuns(this.observe);this.detach=off;
    return()=>{if(this.detach===off){off();this.detach=null;this.pending.clear();this.publish(this.snapshot.records.map(r=>r.status==='running'?validateRunRecord({...r,status:'unobserved',retention:'none',message:'Observation stopped; task completion was not observed.'}):r));}};
  };
  private publish(records:RunRecord[],evicted=this.snapshot.evicted,notCaptured=this.snapshot.notCaptured){
    while(records.length>this.maxRecords||jsonBytes(records)>this.maxBytes){records.shift();evicted++;}
    const retained=new Set(records.map(r=>r.id));
    for(const [ticket,pending] of this.pending)if(!retained.has(pending.id))this.pending.delete(ticket);
    const followingLatest=this.snapshot.followingLatest||!records.some(r=>r.id===this.snapshot.selectedId);
    const selectedId=followingLatest?(records.at(-1)?.id??null):this.snapshot.selectedId;
    this.snapshot=freezeValue({records,evicted,notCaptured,revision:this.snapshot.revision+1,selectedId,followingLatest});
    for(const fn of [...this.listeners]){try{fn();}catch{/* Presentation subscribers cannot corrupt execution. */}}
  }
  private observe=(event:TaskRunEvent)=>{
    const spec=this.specs.get(event.taskId);if(!spec)return;
    if(event.phase==='started'){
      const id=this.session+'-'+event.execution;
      const record:RunRecord={format:'datapass.run',version:1,id,taskId:event.taskId,appId:this.runtime.manifest.id,appVersion:this.runtime.manifest.version,modelId:spec.modelId,modelVersion:spec.modelVersion,providerId:spec.providerId,parameters:{...event.parameters},dependencies:{...event.dependencies},status:'running',startedAt:event.at,finishedAt:null,durationMs:0,artifact:null,retention:'pending',message:''};
      if(jsonBytes(record)>this.maxBytes){this.publish([...this.snapshot.records],this.snapshot.evicted,this.snapshot.notCaptured+1);return;}
      this.pending.set(event.execution,{id,output:event.output});this.publish([...this.snapshot.records,validateRunRecord(record)]);return;
    }
    const pending=this.pending.get(event.execution);if(!pending)return;
    this.pending.delete(event.execution);
    const previous=this.snapshot.records.find(r=>r.id===pending.id);if(!previous||previous.status!=='running')return;
    let artifact:Artifact|null=null,retention:RunRecord['retention']='none',message='message' in event?event.message:'';
    if(event.phase==='succeeded'){
      try{
        artifact=tableArtifact(pending.output,event.rows,{id:'output-'+event.execution,title:pending.output.title,provenance:{kind:spec.provenance,source:spec.source,runId:previous.id}},spec.representations);retention='retained';
        if(jsonBytes({...previous,artifact})>this.maxBytes){artifact=null;retention='omitted-budget';message='Task succeeded; output exceeds the configured history budget.';}
      }catch(error){retention=String(error).includes('budget')?'omitted-budget':'invalid-output';message='Task succeeded; artifact was not retained: '+String(error).slice(0,1800);}
    }
    const updated=validateRunRecord({...previous,status:event.phase,finishedAt:event.at,durationMs:event.elapsedMs,artifact,retention,message:message.slice(0,2000)});
    this.publish(this.snapshot.records.map(r=>r.id===previous.id?updated:r));
  };
  select(id:string|null){
    if(id!==null&&!this.snapshot.records.some(r=>r.id===id))throw new Error('Unknown selected run');
    this.snapshot=freezeValue({...this.snapshot,followingLatest:id===null,selectedId:id??this.snapshot.records.at(-1)?.id??null});
    this.publish([...this.snapshot.records]);
  }
  clear(){this.pending.clear();this.publish([]);}
  exportRecord(id:string):string{
    const record=this.snapshot.records.find(r=>r.id===id);if(!record)throw new Error('Unknown run');
    if(record.status==='running')throw new Error('Wait for a terminal run before export');
    return JSON.stringify(validateRunRecord(record),null,2);
  }
}
/** Like-for-like comparison only; no conversion or implied physical equivalence. */
export function compareRuns(a:RunRecord,b:RunRecord){
  validateRunRecord(a);validateRunRecord(b);
  if(a.modelId!==b.modelId||a.modelVersion!==b.modelVersion||a.taskId!==b.taskId||a.appId!==b.appId||a.appVersion!==b.appVersion||a.providerId!==b.providerId)throw new Error('Runs do not share the same declared model/task/provider contract');
  if(a.status!=='succeeded'||b.status!=='succeeded')throw new Error('Compare successful runs only');
  const metrics:{id:string;title:string;before:Scalar;after:Scalar;delta:number|null;unit:string}[]=[];
  if(a.artifact?.payload.kind==='table'&&b.artifact?.payload.kind==='table'){
    const left=a.artifact.payload,right=b.artifact.payload;
    if(JSON.stringify(left.columns)===JSON.stringify(right.columns)&&left.rowKey===right.rowKey){
      for(const rep of a.artifact.representations){
        if(rep.kind!=='metric')continue;
        const other=b.artifact.representations.find(r=>r.id===rep.id);
        if(other?.kind!=='metric'||other.row!==rep.row||other.column!==rep.column||other.unit!==rep.unit)continue;
        const before=left.rows.find(r=>String(r[left.rowKey])===rep.row)?.[rep.column]??null;
        const after=right.rows.find(r=>String(r[right.rowKey])===other.row)?.[other.column]??null;
        metrics.push({id:rep.id,title:rep.title,before,after,delta:typeof before==='number'&&typeof after==='number'&&Number.isFinite(after-before)?after-before:null,unit:rep.unit||left.columns.find(c=>c.id===rep.column)?.unit||''});
      }
    }
  }
  return {parameters:[...new Set([...Object.keys(a.parameters),...Object.keys(b.parameters)])].sort().map(id=>({id,before:a.parameters[id]??null,after:b.parameters[id]??null,changed:!Object.is(a.parameters[id],b.parameters[id])})),durationDeltaMs:b.durationMs-a.durationMs,metrics};
}

export type RunResource={specs:RunSpec[];maxRecords?:number;maxBytes?:number};
export function validateRunResource(input:unknown,runtime:Pick<SiteRuntime,'manifest'>):RunResource{
  boundedJson(input,262144);strict(input,['specs','maxRecords','maxBytes'],'run resource');
  if(!Array.isArray(input.specs)||!input.specs.length||input.specs.length>10)throw new Error('Run resource spec budget');
  const specs=input.specs.map(s=>validateRunSpec(s,runtime));
  if(new Set(specs.map(s=>s.taskId)).size!==specs.length)throw new Error('Duplicate task run specification');
  if(input.maxRecords!==undefined)integerRange(input.maxRecords,1,100,'journal record limit');
  if(input.maxBytes!==undefined)integerRange(input.maxBytes,4096,16777216,'journal byte limit');
  return freezeValue({...structuredClone(input),specs} as RunResource);
}

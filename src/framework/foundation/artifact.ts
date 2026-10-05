import type {AppDefinition,Block,Column,Dataset,Rows} from '../types.ts';
import {identifier,strict,text} from '../guards.ts';
import {validateManifest,validateRows} from '../validate.ts';
import {boundedJson,freezeValue} from './safety.ts';
import {safeRelativePath} from '../../core/host.ts';

/** Optional lineage metadata (additive; artifacts without it stay valid). Declared by the producer, not observed by Studio. */
export type EvidenceLink={path:string;start:number;end:number;label:string};
export type ArtifactProducer={kind:'script'|'notebook'|'service';name:string;evidence?:EvidenceLink[]};
export type ArtifactInput={id:string;label:string;value?:string|number|boolean;unit?:string;evidence?:EvidenceLink[]};
export type ArtifactProvenance={kind:'synthetic'|'provided'|'computed';source:string;runId?:string;producer?:ArtifactProducer;inputHash?:string;inputs?:ArtifactInput[];dependsOn?:string[]};
export const LINEAGE_LIMITS=Object.freeze({inputs:24,evidence:8,dependsOn:12,line:100000,path:260});
export type Representation={id:string;title:string;inputs?:string[]}&(
  |{kind:'table'}
  |{kind:'chart';chart:'bar'|'line'|'scatter';x:string;y:string;unit?:string}
  |{kind:'metric';row:string;column:string;unit?:string;digits?:number}
  |{kind:'text'}
  |{kind:'json'}
);
export type Artifact={
  format:'datapass.artifact';version:1;id:string;title:string;
  provenance:ArtifactProvenance;
  payload:{kind:'table';rowKey:string;columns:Column[];rows:Rows}|{kind:'text';text:string};
  representations:Representation[];
};
export const ARTIFACT_BYTES=1048576;
function datasetFor(a:Artifact):Dataset{
  if(a.payload.kind!=='table')throw new Error('A tabular artifact is required');
  return {id:'artifact-data',title:a.title,description:a.provenance.source,layer:'Result',source:'inline',provenance:a.provenance.kind==='synthetic'?'synthetic':a.provenance.kind==='provided'?'user-provided':'derived',rowKey:a.payload.rowKey,columns:a.payload.columns,inputs:[],dependsOn:[]};
}
function definitionFor(a:Artifact,checkMetricRow=true):AppDefinition{
  const dataset=a.payload.kind==='table'?datasetFor(a):null;
  const blocks:Block[]=a.representations.map(rep=>{
    const base={id:rep.id,title:rep.title};
    if(rep.kind==='text'){
      if(a.payload.kind!=='text')throw new Error('Text representation needs text payload');
      return {...base,type:'text',text:a.payload.text};
    }
    if(rep.kind==='json'){
      const json=JSON.stringify(a.payload,null,2);
      return {...base,type:'code',language:'json',text:json.length<=18000?json:json.slice(0,18000)+'\n[Preview truncated; use the explicit artifact export for complete data.]'};
    }
    if(!dataset)throw new Error('This representation requires a table');
    if(rep.kind==='table')return {...base,type:'table',dataset:dataset.id,pageSize:20};
    if(rep.kind==='metric'){
      if(checkMetricRow&&(a.payload.kind!=='table'||!a.payload.rows.some(row=>String(row[dataset.rowKey])===rep.row)))throw new Error('Metric references an absent row');
      return {...base,type:'metric',value:{dataset:dataset.id,row:rep.row,column:rep.column},...(rep.unit===undefined?{}:{unit:rep.unit}),...(rep.digits===undefined?{}:{digits:rep.digits})};
    }
    return {...base,type:'chart',dataset:dataset.id,kind:rep.chart,x:rep.x,y:rep.y,...(rep.unit===undefined?{}:{unit:rep.unit})};
  });
  return {manifest:{format:'datapass.web-app',schemaVersion:1,id:'artifact-view',version:'1',title:a.title,description:a.provenance.source,label:'Result / '+a.provenance.kind,theme:{accent:'#286f89',density:'compact'},fields:[],datasets:dataset?[dataset]:[],tasks:[],pages:[{id:'result',title:'Result',description:'One immutable artifact; several views.',sections:[{id:'views',columns:1,blocks}]}]},bindings:{inline:dataset&&a.payload.kind==='table'?{[dataset.id]:a.payload.rows}:{}}};
}
/** Semantic validation reuses the existing manifest, row and chart contracts. */
export function validateArtifact(input:unknown):Artifact{
  boundedJson(input,ARTIFACT_BYTES);
  strict(input,['format','version','id','title','provenance','payload','representations'],'artifact');
  if(input.format!=='datapass.artifact'||input.version!==1)throw new Error('Unsupported artifact format');
  identifier(input.id,'artifact id');text(input.title,'artifact title',160);
  strict(input.provenance,['kind','source','runId','producer','inputHash','inputs','dependsOn'],'artifact provenance');
  if(!['synthetic','provided','computed'].includes(String(input.provenance.kind))||typeof input.provenance.kind!=='string')throw new Error('Unknown artifact provenance');
  text(input.provenance.source,'artifact source',2000);
  if(input.provenance.runId!==undefined)identifier(input.provenance.runId,'artifact run');
  const inputIds=validateLineage(input.provenance,input.id);
  const payload=input.payload;
  if(!payload||typeof payload!=='object')throw new Error('Missing artifact payload');
  if((payload as {kind?:unknown}).kind==='table')strict(payload,['kind','rowKey','columns','rows'],'table payload');
  else {strict(payload,['kind','text'],'text payload');if(payload.kind!=='text')throw new Error('Unknown payload kind');text(payload.text,'text payload',20000,false);}
  validateRepresentationSchema(input.representations);
  for(const rep of input.representations)for(const used of rep.inputs??[])if(!inputIds.has(used))throw new Error('Representation '+rep.id+' uses an undeclared input '+used);
  const result=structuredClone(input) as Artifact,definition=definitionFor(result);
  validateManifest(definition.manifest);
  if(result.payload.kind==='table')validateRows(datasetFor(result),result.payload.rows);
  return freezeValue(result);
}
export function tableArtifact(dataset:Dataset,rows:Rows,identity:{id:string;title:string;provenance:Artifact['provenance']},representations:Representation[]=[{id:'table',title:'Rows',kind:'table'},{id:'json',title:'JSON',kind:'json'}]):Artifact{
  return validateArtifact({format:'datapass.artifact',version:1,...identity,payload:{kind:'table',rowKey:dataset.rowKey,columns:dataset.columns,rows},representations});
}
/** Adapt an artifact to existing table/chart/metric/code blocks; no new chart renderer. */
export function artifactDefinition(input:unknown):AppDefinition{return definitionFor(validateArtifact(input));}
export function artifactExport(input:unknown):string{return JSON.stringify(validateArtifact(input),null,2);}
export type ViewProfile={id:string;title:string;representations:string[]};
/** Presentation filtering only. It does NOT remove hidden data or implement access control. */
export function artifactViewProfile(input:unknown,profile:ViewProfile):Artifact{
  const artifact=validateArtifact(input);strict(profile,['id','title','representations'],'view profile');identifier(profile.id,'profile id');text(profile.title,'profile title',160);
  if(!Array.isArray(profile.representations)||!profile.representations.length||new Set(profile.representations).size!==profile.representations.length||profile.representations.some(id=>!artifact.representations.some(r=>r.id===id)))throw new Error('Unknown or duplicate profile representation');
  return validateArtifact({...artifact,representations:profile.representations.map(id=>artifact.representations.find(r=>r.id===id)!)});
}

function validateRepresentationSchema(representations:unknown):asserts representations is Representation[]{
  if(!Array.isArray(representations)||!representations.length||representations.length>12)throw new Error('Artifact representation budget');
  for(const rep of representations){
    if(!rep||typeof rep!=='object')throw new Error('Invalid representation');
    const kind=(rep as {kind?:unknown}).kind;
    const extra=kind==='chart'?['chart','x','y','unit']:kind==='metric'?['row','column','unit','digits']:[];
    strict(rep,['id','title','kind','inputs',...extra],'representation');
    if(typeof kind!=='string'||!['table','chart','metric','text','json'].includes(kind))throw new Error('Unsupported representation');
    identifier(rep.id,'representation id');text(rep.title,'representation title',160);
    if(rep.inputs!==undefined)idList(rep.inputs,LINEAGE_LIMITS.inputs,'representation inputs');
  }
}

/** Check source-owned view declarations before a task has produced its rows. */
export function validateArtifactViews(dataset:Dataset,representations:unknown):Representation[]{
  boundedJson(representations,32000);validateRepresentationSchema(representations);
  const a:Artifact={format:'datapass.artifact',version:1,id:'pending-output',title:dataset.title,provenance:{kind:'computed',source:'Pending validated result.'},payload:{kind:'table',rowKey:dataset.rowKey,columns:dataset.columns,rows:[]},representations};
  validateManifest(definitionFor(a,false).manifest);
  return freezeValue(structuredClone(representations));
}

function idList(value:unknown,max:number,label:string):asserts value is string[]{
  if(!Array.isArray(value)||value.length>max)throw new Error(label+': list budget');
  for(const id of value)identifier(id,label);
  if(new Set(value).size!==value.length)throw new Error(label+': duplicate id');
}
function evidenceLinks(value:unknown,label:string):void{
  if(value===undefined)return;
  if(!Array.isArray(value)||value.length>LINEAGE_LIMITS.evidence)throw new Error(label+': evidence budget');
  const seen=new Set<string>();
  for(const ref of value){
    strict(ref,['path','start','end','label'],label+' evidence');
    if(typeof ref.path!=='string'||ref.path.length>LINEAGE_LIMITS.path||!safeRelativePath(ref.path)||/[\u0000-\u001f\u007f]/.test(ref.path))throw new Error(label+' evidence: path must be a safe relative path');
    if(!Number.isSafeInteger(ref.start)||!Number.isSafeInteger(ref.end)||(ref.start as number)<1||(ref.end as number)<(ref.start as number)||(ref.end as number)>LINEAGE_LIMITS.line)throw new Error(label+' evidence: invalid line range');
    text(ref.label,label+' evidence label',160);
    const key=ref.path+':'+ref.start+':'+ref.end;if(seen.has(key))throw new Error(label+' evidence: duplicate range');seen.add(key);
  }
}
/** Optional provenance lineage: producer, inputs (with evidence), input hash, upstream artifact ids. Returns the declared input ids. */
function validateLineage(p:Record<string,unknown>,artifactId:string):Set<string>{
  if(p.producer!==undefined){
    strict(p.producer,['kind','name','evidence'],'artifact producer');
    if(!['script','notebook','service'].includes(p.producer.kind as string))throw new Error('Unknown artifact producer kind');
    text(p.producer.name,'artifact producer name',160);evidenceLinks(p.producer.evidence,'producer');
  }
  if(p.inputHash!==undefined&&(typeof p.inputHash!=='string'||!/^[0-9a-f]{64}$/.test(p.inputHash)))throw new Error('artifact inputHash must be 64 lowercase hex characters (sha256)');
  const ids=new Set<string>();
  if(p.inputs!==undefined){
    if(!Array.isArray(p.inputs)||p.inputs.length>LINEAGE_LIMITS.inputs)throw new Error('artifact inputs: list budget');
    for(const input of p.inputs){
      strict(input,['id','label','value','unit','evidence'],'artifact input');
      identifier(input.id,'artifact input id');if(ids.has(input.id))throw new Error('artifact inputs: duplicate id');ids.add(input.id);
      text(input.label,'artifact input label',160);
      const v=input.value;
      if(v!==undefined&&!(typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))||(typeof v==='string'&&v.length<=400)))throw new Error('artifact input value must be a finite number, boolean or short string');
      if(input.unit!==undefined)text(input.unit,'artifact input unit',40,false);
      evidenceLinks(input.evidence,'input '+input.id);
    }
  }
  if(p.dependsOn!==undefined){
    idList(p.dependsOn,LINEAGE_LIMITS.dependsOn,'artifact dependsOn');
    if(p.dependsOn.includes(artifactId))throw new Error('artifact dependsOn: an artifact cannot depend on itself');
  }
  return ids;
}

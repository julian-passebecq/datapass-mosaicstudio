import type {AppDefinition,Block,Column,Dataset,Rows} from '../types.ts';
import {charLength,identifier,object,strict,text} from '../guards.ts';
import {validateManifest,validateRows} from '../validate.ts';
import {boundedJson,freezeValue} from './safety.ts';
import {ARTIFACT_LIMITS,NON_BLANK,SAFE_EVIDENCE_PATH} from './artifact-limits.ts';

/** Optional lineage metadata (additive; artifacts without it stay valid). Declared by the producer, not observed by Studio. */
export type EvidenceLink={path:string;start:number;end:number;label:string};
export type ArtifactProducer={kind:'script'|'notebook'|'service';name:string;evidence?:EvidenceLink[]};
export type ArtifactInput={id:string;label:string;value?:string|number|boolean;unit?:string;evidence?:EvidenceLink[]};
export type ArtifactProvenance={kind:'synthetic'|'provided'|'computed';source:string;runId?:string;producer?:ArtifactProducer;inputHash?:string;inputs?:ArtifactInput[];dependsOn?:string[]};
export const LINEAGE_LIMITS=Object.freeze({inputs:ARTIFACT_LIMITS.inputs,evidence:ARTIFACT_LIMITS.evidence,dependsOn:ARTIFACT_LIMITS.dependsOn,line:ARTIFACT_LIMITS.line,path:ARTIFACT_LIMITS.path});
export {ARTIFACT_LIMITS};
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
export const ARTIFACT_BYTES=ARTIFACT_LIMITS.bytes;
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
/** Three explicit gates, in order: envelope (inert finite JSON, depth, 1 MiB compact UTF-8), structure
 *  (exactly docs/contracts/artifact.schema.json) and semantic (references, duplicate ids, self-reference, row typing).
 *  The derived manifest is then re-checked by the existing app contracts as defence in depth. */
export function validateArtifact(input:unknown):Artifact{
  checkArtifactEnvelope(input);checkArtifactStructure(input);checkArtifactSemantics(input);
  const result=structuredClone(input) as Artifact;
  try{const definition=definitionFor(result);validateManifest(definition.manifest);if(result.payload.kind==='table')validateRows(datasetFor(result),result.payload.rows);}
  catch(error){if(error instanceof ArtifactValidationError)throw error;fail('semantic','',(error as Error).message);}
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
  checkRepresentations(representations,'/representations');
  duplicateIds(representations as Representation[],'/representations');
}
/** Check source-owned view declarations before a task has produced its rows. */
export function validateArtifactViews(dataset:Dataset,representations:unknown):Representation[]{
  boundedJson(representations,32000);validateRepresentationSchema(representations);
  const a:Artifact={format:'datapass.artifact',version:1,id:'pending-output',title:dataset.title,provenance:{kind:'computed',source:'Pending validated result.'},payload:{kind:'table',rowKey:dataset.rowKey,columns:dataset.columns,rows:[]},representations};
  validateManifest(definitionFor(a,false).manifest);
  return freezeValue(structuredClone(representations));
}

export type ArtifactGate='envelope'|'structure'|'semantic';
/** A rejected artifact: which gate refused it and the JSON Pointer of the offending field ('' = whole document). */
export class ArtifactValidationError extends Error{
  readonly gate:ArtifactGate;readonly path:string;
  constructor(gate:ArtifactGate,path:string,detail:string){super((path||'/')+': '+detail);this.name='ArtifactValidationError';this.gate=gate;this.path=path;}
}
export type ArtifactDecision={ok:true}|{ok:false;gate:ArtifactGate;path:string;message:string};
/** Non-throwing decision for tools, tests and import dialogs. */
export function artifactDecision(input:unknown):ArtifactDecision{
  try{validateArtifact(input);return {ok:true};}
  catch(error){if(error instanceof ArtifactValidationError)return {ok:false,gate:error.gate,path:error.path,message:error.message};throw error;}
}
function fail(gate:ArtifactGate,path:string,detail:string):never{throw new ArtifactValidationError(gate,path,detail);}
const pointer=(base:string,key:string|number)=>base+'/'+String(key).replace(/~/g,'~0').replace(/\//g,'~1');
const RESERVED=['constructor','prototype','__proto__'];
const ID=/^[a-z][a-zA-Z0-9_-]{0,79}$/;
/** JSON Schema maxLength counts Unicode code points, not UTF-16 units. */
const chars=charLength;
function isId(v:unknown):v is string{return typeof v==='string'&&ID.test(v)&&!RESERVED.includes(v);}

/** Gate 1: inert finite JSON, bounded depth/nodes and the 1 MiB compact UTF-8 budget. */
export function checkArtifactEnvelope(input:unknown):void{
  try{boundedJson(input,ARTIFACT_LIMITS.bytes);}catch(error){fail('envelope','',(error as Error).message.replace('JSON byte budget exceeded','artifact byte budget exceeded ('+ARTIFACT_LIMITS.bytes+' bytes, compact UTF-8)'));}
}

// ---- Gate 2: structure. Each rule below has an exact counterpart in docs/contracts/artifact.schema.json.
function shape(v:unknown,path:string,label:string,allowed:readonly string[],required:readonly string[]=allowed):asserts v is Record<string,unknown>{
  if(!object(v))fail('structure',path,label+': expected an object');
  for(const key of Object.keys(v))if(!allowed.includes(key))fail('structure',pointer(path,key),label+': unexpected fields ('+key+')');
  for(const key of required)if(!Object.hasOwn(v,key))fail('structure',pointer(path,key),label+': missing required field '+key);
}
function sId(v:unknown,path:string,label:string):void{if(!isId(v))fail('structure',path,label+': invalid id (^[a-z][a-zA-Z0-9_-]{0,79}$, not reserved)');}
function sText(v:unknown,path:string,label:string,max:number,filled:boolean):void{
  if(typeof v!=='string'||chars(v)>max||(filled&&!NON_BLANK.test(v)))fail('structure',path,label+': invalid text (string, at most '+max+' characters'+(filled?', not blank':'')+')');
}
function sInt(v:unknown,path:string,label:string,min:number,max:number):void{
  if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)fail('structure',path,label+': integer '+min+'..'+max+' required');
}
function sEnum(v:unknown,path:string,label:string,choices:readonly string[]):void{if(typeof v!=='string'||!choices.includes(v))fail('structure',path,label+': must be one of '+choices.join(', '));}
function sList(v:unknown,path:string,label:string,max:number,min=0):asserts v is unknown[]{
  if(!Array.isArray(v))fail('structure',path,label+': expected an array');
  if(v.length<min||v.length>max)fail('structure',path,label+': list budget ('+min+'..'+max+' items)');
}
function sIdArray(v:unknown,path:string,label:string,max:number):void{
  sList(v,path,label,max);v.forEach((item,i)=>sId(item,pointer(path,i),label));
  if(new Set(v).size!==v.length)fail('structure',path,label+': duplicate id');
}
function sEvidence(v:unknown,path:string,label:string):void{
  if(v===undefined)return;
  sList(v,path,label+' evidence',ARTIFACT_LIMITS.evidence);
  v.forEach((ref,i)=>{
    const at=pointer(path,i);shape(ref,at,label+' evidence',['path','start','end','label']);
    const p=ref.path;
    if(typeof p!=='string'||chars(p)<1||chars(p)>ARTIFACT_LIMITS.path||!SAFE_EVIDENCE_PATH.test(p))fail('structure',pointer(at,'path'),label+' evidence: path must be a safe relative path (forward slashes, no drive, no "..", at most '+ARTIFACT_LIMITS.path+' characters)');
    sInt(ref.start,pointer(at,'start'),label+' evidence: invalid line range start',1,ARTIFACT_LIMITS.line);
    sInt(ref.end,pointer(at,'end'),label+' evidence: invalid line range end',1,ARTIFACT_LIMITS.line);
    sText(ref.label,pointer(at,'label'),label+' evidence label',160,true);
  });
}
function checkProvenance(p:unknown,path:string):void{
  shape(p,path,'artifact provenance',['kind','source','runId','producer','inputHash','inputs','dependsOn'],['kind','source']);
  sEnum(p.kind,pointer(path,'kind'),'Unknown artifact provenance kind',['synthetic','provided','computed']);
  sText(p.source,pointer(path,'source'),'artifact source',2000,true);
  if(p.runId!==undefined)sId(p.runId,pointer(path,'runId'),'artifact run');
  if(p.producer!==undefined){
    const at=pointer(path,'producer');shape(p.producer,at,'artifact producer',['kind','name','evidence'],['kind','name']);
    sEnum(p.producer.kind,pointer(at,'kind'),'Unknown artifact producer kind',['script','notebook','service']);
    sText(p.producer.name,pointer(at,'name'),'artifact producer name',160,true);
    sEvidence(p.producer.evidence,pointer(at,'evidence'),'producer');
  }
  if(p.inputHash!==undefined&&(typeof p.inputHash!=='string'||!/^[0-9a-f]{64}$/.test(p.inputHash)))fail('structure',pointer(path,'inputHash'),'artifact inputHash must be 64 lowercase hex characters (sha256)');
  if(p.inputs!==undefined){
    const at=pointer(path,'inputs');sList(p.inputs,at,'artifact inputs',ARTIFACT_LIMITS.inputs);
    p.inputs.forEach((input,i)=>{
      const ip=pointer(at,i);shape(input,ip,'artifact input',['id','label','value','unit','evidence'],['id','label']);
      sId(input.id,pointer(ip,'id'),'artifact input id');sText(input.label,pointer(ip,'label'),'artifact input label',160,true);
      const v=input.value;
      if(v!==undefined&&!(typeof v==='boolean'||typeof v==='number'||(typeof v==='string'&&chars(v)<=400)))fail('structure',pointer(ip,'value'),'artifact input value must be a finite number, boolean or short string (at most 400 characters)');
      if(input.unit!==undefined)sText(input.unit,pointer(ip,'unit'),'artifact input unit',40,false);
      sEvidence(input.evidence,pointer(ip,'evidence'),'input');
    });
  }
  if(p.dependsOn!==undefined)sIdArray(p.dependsOn,pointer(path,'dependsOn'),'artifact dependsOn',ARTIFACT_LIMITS.dependsOn);
}
function checkPayload(payload:unknown,path:string):void{
  if(!object(payload))fail('structure',path,'artifact payload: expected an object');
  if(payload.kind==='table'){
    shape(payload,path,'table payload',['kind','rowKey','columns','rows']);
    sId(payload.rowKey,pointer(path,'rowKey'),'rowKey');
    const cp=pointer(path,'columns');sList(payload.columns,cp,'columns',ARTIFACT_LIMITS.columns,1);
    payload.columns.forEach((c,i)=>{
      const at=pointer(cp,i);shape(c,at,'column',['id','label','type','unit','nullable'],['id','label','type']);
      sId(c.id,pointer(at,'id'),'column.id');sText(c.label,pointer(at,'label'),'column.label',120,true);
      sEnum(c.type,pointer(at,'type'),'column.type',['string','number','boolean']);
      if(c.unit!==undefined)sText(c.unit,pointer(at,'unit'),'column.unit',40,false);
      if(c.nullable!==undefined&&typeof c.nullable!=='boolean')fail('structure',pointer(at,'nullable'),'column.nullable must be a boolean');
    });
    const rp=pointer(path,'rows');sList(payload.rows,rp,'rows',ARTIFACT_LIMITS.rows);
    payload.rows.forEach((row,i)=>{
      const at=pointer(rp,i);
      if(!object(row))fail('structure',at,'row: expected an object');
      const keys=Object.keys(row);
      if(keys.length>ARTIFACT_LIMITS.columns)fail('structure',at,'row: more than '+ARTIFACT_LIMITS.columns+' cells');
      for(const key of keys){
        if(!isId(key))fail('structure',pointer(at,key),'row: cell name must be a column id');
        const v=row[key];
        if(!(v===null||typeof v==='boolean'||typeof v==='number'||(typeof v==='string'&&chars(v)<=4000)))fail('structure',pointer(at,key),'row: cells are null, boolean, finite number or string (at most 4000 characters)');
      }
    });
    return;
  }
  if(payload.kind==='text'){shape(payload,path,'text payload',['kind','text']);sText(payload.text,pointer(path,'text'),'text payload',20000,false);return;}
  fail('structure',pointer(path,'kind'),'Unknown payload kind (table or text)');
}
const REP_FIELDS:Record<string,readonly string[]>={table:[],text:[],json:[],chart:['chart','x','y','unit'],metric:['row','column','unit','digits']};
const REP_REQUIRED:Record<string,readonly string[]>={table:[],text:[],json:[],chart:['chart','x','y'],metric:['row','column']};
function checkRepresentations(reps:unknown,path:string):void{
  sList(reps,path,'Artifact representation budget',ARTIFACT_LIMITS.representations,1);
  reps.forEach((rep,i)=>{
    const at=pointer(path,i);
    if(!object(rep))fail('structure',at,'representation: expected an object');
    const kind=rep.kind;
    if(typeof kind!=='string'||!Object.hasOwn(REP_FIELDS,kind))fail('structure',pointer(at,'kind'),'Unsupported representation kind');
    shape(rep,at,'representation',['id','title','kind','inputs',...REP_FIELDS[kind]],['id','title','kind',...REP_REQUIRED[kind]]);
    sId(rep.id,pointer(at,'id'),'representation id');sText(rep.title,pointer(at,'title'),'representation title',160,true);
    if(rep.inputs!==undefined)sIdArray(rep.inputs,pointer(at,'inputs'),'representation inputs',ARTIFACT_LIMITS.inputs);
    if(kind==='chart'){
      sEnum(rep.chart,pointer(at,'chart'),'chart',['bar','line','scatter']);sId(rep.x,pointer(at,'x'),'chart x');sId(rep.y,pointer(at,'y'),'chart y');
      if(rep.unit!==undefined)sText(rep.unit,pointer(at,'unit'),'chart unit',30,false);
    }
    if(kind==='metric'){
      sText(rep.row,pointer(at,'row'),'metric row',160,true);sId(rep.column,pointer(at,'column'),'metric column');
      if(rep.unit!==undefined)sText(rep.unit,pointer(at,'unit'),'metric unit',40,false);
      if(rep.digits!==undefined)sInt(rep.digits,pointer(at,'digits'),'metric digits',0,6);
    }
  });
}
/** Gate 2: the exact JSON Schema structure (types, required/unknown fields, enums, lengths, patterns, list bounds, unique id lists). */
export function checkArtifactStructure(input:unknown):asserts input is Artifact{
  shape(input,'','artifact',['format','version','id','title','provenance','payload','representations']);
  if(input.format!=='datapass.artifact')fail('structure','/format','Unsupported artifact format');
  if(input.version!==1)fail('structure','/version','Unsupported artifact version');
  sId(input.id,'/id','artifact id');sText(input.title,'/title','artifact title',160,true);
  checkProvenance(input.provenance,'/provenance');checkPayload(input.payload,'/payload');checkRepresentations(input.representations,'/representations');
}

// ---- Gate 3: semantic rules JSON Schema cannot express.
function semanticEvidence(refs:EvidenceLink[]|undefined,path:string,label:string):void{
  const seen=new Set<string>();
  (refs??[]).forEach((ref,i)=>{
    if(ref.end<ref.start)fail('semantic',pointer(pointer(path,i),'end'),label+' evidence: invalid line range (end before start)');
    const key=ref.path+':'+ref.start+':'+ref.end;if(seen.has(key))fail('semantic',pointer(path,i),label+' evidence: duplicate range');seen.add(key);
  });
}
function duplicateIds(items:{id:string}[],path:string):void{
  const seen=new Set<string>();items.forEach((item,i)=>{if(seen.has(item.id))fail('semantic',pointer(pointer(path,i),'id'),'duplicate id '+item.id);seen.add(item.id);});
}
/** Number-to-text exactly as String(): the key a metric representation uses to find its row. */
const rowKeyText=(v:unknown)=>String(v);
/** Gate 3: references, duplicate identifiers, self-reference, payload/representation compatibility and row typing. Assumes gate 2 passed. */
export function checkArtifactSemantics(input:Artifact):void{
  const p=input.provenance;
  semanticEvidence(p.producer?.evidence,'/provenance/producer/evidence','producer');
  const inputIds=new Set<string>();
  (p.inputs??[]).forEach((item,i)=>{
    const at=pointer('/provenance/inputs',i);
    if(inputIds.has(item.id))fail('semantic',pointer(at,'id'),'artifact inputs: duplicate id '+item.id);inputIds.add(item.id);
    semanticEvidence(item.evidence,pointer(at,'evidence'),'input '+item.id);
  });
  (p.dependsOn??[]).forEach((dep,i)=>{if(dep===input.id)fail('semantic',pointer('/provenance/dependsOn',i),'artifact dependsOn: an artifact cannot depend on itself');});
  const payload=input.payload;
  const columns=new Map<string,Column>();
  if(payload.kind==='table'){
    payload.columns.forEach((c,i)=>{if(columns.has(c.id))fail('semantic',pointer(pointer('/payload/columns',i),'id'),'Duplicate column '+c.id);columns.set(c.id,c);});
    if(!columns.has(payload.rowKey))fail('semantic','/payload/rowKey','rowKey must be a declared column');
    const keys=new Set<unknown>();
    payload.rows.forEach((row,i)=>{
      const at=pointer('/payload/rows',i);
      for(const key of Object.keys(row))if(!columns.has(key))fail('semantic',pointer(at,key),'row: undeclared cell '+key);
      for(const c of columns.values()){
        if(!Object.hasOwn(row,c.id))fail('semantic',pointer(at,c.id),'row: missing cell '+c.id);
        const v=row[c.id];if(v===null&&c.nullable)continue;
        if(typeof v!==c.type)fail('semantic',pointer(at,c.id),'invalid cell: expected '+c.type+(v===null?' (column is not nullable)':''));
      }
      const id=row[payload.rowKey];
      if((typeof id!=='string'&&typeof id!=='number')||keys.has(id))fail('semantic',pointer(at,payload.rowKey),'missing/duplicate row key');keys.add(id);
    });
  }
  duplicateIds(input.representations,'/representations');
  input.representations.forEach((rep,i)=>{
    const at=pointer('/representations',i);
    (rep.inputs??[]).forEach((used,j)=>{if(!inputIds.has(used))fail('semantic',pointer(pointer(at,'inputs'),j),'Representation '+rep.id+' uses an undeclared input '+used);});
    if(rep.kind==='json')return;
    if(rep.kind==='text'){if(payload.kind!=='text')fail('semantic',pointer(at,'kind'),'Text representation needs text payload');return;}
    if(payload.kind!=='table')fail('semantic',pointer(at,'kind'),'This representation requires a table');
    if(rep.kind==='chart'){
      const x=columns.get(rep.x),y=columns.get(rep.y);
      if(!x)fail('semantic',pointer(at,'x'),'Invalid chart encoding: unknown x column');
      if(y?.type!=='number')fail('semantic',pointer(at,'y'),'Invalid chart encoding: y must be a number column');
      if(rep.chart!=='bar'&&x.type!=='number')fail('semantic',pointer(at,'x'),'Invalid chart encoding: line/scatter x must be a number column');
    }
    if(rep.kind==='metric'){
      if(!columns.has(rep.column))fail('semantic',pointer(at,'column'),'Metric references an unknown column');
      if(!payload.rows.some(row=>rowKeyText(row[payload.rowKey])===rep.row))fail('semantic',pointer(at,'row'),'Metric references an absent row');
    }
  });
}
/** Set-level semantics for artifacts published together (a manifest folder): unique ids and no dependsOn cycle
 *  among members. dependsOn may name artifacts outside the set. Paths are /<index>/... into the given list. */
export function validateArtifactSet(inputs:unknown[]):Artifact[]{
  const artifacts=inputs.map((input,i)=>{try{return validateArtifact(input);}catch(error){if(error instanceof ArtifactValidationError)throw new ArtifactValidationError(error.gate,'/'+i+error.path,error.message.replace(/^[^:]*: /,''));throw error;}});
  const index=new Map<string,number>();
  artifacts.forEach((a,i)=>{if(index.has(a.id))fail('semantic','/'+i+'/id','duplicate artifact id '+a.id+' in the set');index.set(a.id,i);});
  const state=new Map<number,1|2>();
  const visit=(i:number):void=>{
    state.set(i,1);
    for(const [k,dep] of (artifacts[i].provenance.dependsOn??[]).entries()){
      const j=index.get(dep);if(j===undefined)continue;
      if(state.get(j)===1)fail('semantic','/'+i+'/provenance/dependsOn/'+k,'artifact dependsOn cycle through '+artifacts[i].id+' -> '+dep);
      if(state.get(j)===undefined)visit(j);
    }
    state.set(i,2);
  };
  artifacts.forEach((_,i)=>{if(state.get(i)===undefined)visit(i);});
  return artifacts;
}

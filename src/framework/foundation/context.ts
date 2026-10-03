import {identifier,strict,text} from '../guards.ts';
import {validateEvidence,type EvidenceRef,type SourceArtifact} from '../evidence/model.ts';
import {validateArtifact,type Artifact} from './artifact.ts';
import {validateRunRecord,type RunRecord} from './journal.ts';
import {boundedJson,freezeValue} from './safety.ts';
export type ContextModel={
  id:string;kind:string;title:string;summary:string;
  facts:{label:string;value:string}[];
  references:EvidenceRef[];
  related:{id:string;label:string}[];
  note:string;
};
export function validateContext(input:unknown,sources:readonly SourceArtifact[]=[]):ContextModel{
  boundedJson(input,32000);strict(input,['id','kind','title','summary','facts','references','related','note'],'context');
  identifier(input.id,'context id');text(input.kind,'context kind',80);text(input.title,'context title',200);text(input.summary,'context summary',3000,false);text(input.note,'context note',2000,false);
  if(!Array.isArray(input.facts)||input.facts.length>24)throw new Error('Context fact budget');
  for(const f of input.facts){strict(f,['label','value'],'context fact');text(f.label,'fact label',100);text(f.value,'fact value',1000,false);}
  if(!Array.isArray(input.related)||input.related.length>24)throw new Error('Context relationship budget');
  const ids=new Set<string>();for(const r of input.related){strict(r,['id','label'],'related context');identifier(r.id,'related entity');text(r.label,'related label',160);if(ids.has(r.id))throw new Error('Duplicate related entity');ids.add(r.id);}
  validateEvidence(input.references,sources);return freezeValue(structuredClone(input) as ContextModel);
}
export function artifactContext(input:Artifact):ContextModel{
  const a=validateArtifact(input);return validateContext({id:a.id,kind:'artifact',title:a.title,summary:a.provenance.source,facts:[{label:'Provenance',value:a.provenance.kind},{label:'Representations',value:String(a.representations.length)},{label:'Data',value:a.payload.kind==='table'?`${a.payload.rows.length} rows / ${a.payload.columns.length} columns`:'Text payload'},...(a.provenance.runId?[{label:'Run',value:a.provenance.runId}]:[])],references:[],related:[],note:'A representation change does not run the model again. A display profile is not an access-control boundary.'});
}
export function runContext(input:RunRecord):ContextModel{
  const run=validateRunRecord(input);return validateContext({id:run.id,kind:'run',title:run.taskId,summary:run.message,facts:[{label:'Last observed status',value:run.status},{label:'Model (declared)',value:run.modelId+' / '+run.modelVersion},{label:'Provider (declared)',value:run.providerId},{label:'Started',value:run.startedAt},{label:'Elapsed',value:run.durationMs.toFixed(1)+' ms'},{label:'Artifact retention',value:run.retention},...Object.entries(run.parameters).map(([key,value])=>({label:key,value:String(value).length>980?String(value).slice(0,960)+' [display truncated]':String(value)})).slice(0,18)],references:[],related:[],note:'This journal observes the existing task runtime. Model/provider identities are client declarations; upstream revisions are local cache versions, not remote execution receipts.'});
}

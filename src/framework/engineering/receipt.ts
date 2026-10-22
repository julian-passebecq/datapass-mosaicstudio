/** `datapass.engineering/1` records built from what Studio actually observed, plus the pure presentation rules behind
 *  EngineeringBlocks.tsx. Nothing here runs a model, schedules work, stores state or loads React.
 *
 *  receiptFromRunRecord() turns a datapass.runtime/1 RunRecord into a run-receipt and validates it with the frozen
 *  contract (contract.ts is not changed). The input digest is over datapass-c14n/1 of {model, inputs} with the inputs
 *  as the runtime RECORDED them (validated, defaults filled in). It is NOT the runtime's `inputHash` (another canonical
 *  form), and a receipt is a record of what was observed, not proof of correctness or an approval. */
import {ENGINEERING_FORMAT,ENGINEERING_VERSION,digest,validateEngineering,type ArtifactRef,type Digest,type ParameterDiff,type RunReceipt,type ScalarValue} from './contract.ts';

/** The RunRecord fields a receipt reads (structurally compatible with compute/runtime-client.ts RunRecord, which a
 *  vendored copy of this file does not need to import). */
export type ObservedRun={runId:string;model:string;modelVersion:string;status:string;inputs:Readonly<Record<string,number|string|boolean>>;
  submittedAt:string;startedAt:string|null;finishedAt:string|null;error:string|null;artifactId:string|null;artifactSha256:string|null;cancelRequested?:boolean};
export type ReceiptOptions={
  /** Version of the code that produced the run (e.g. the producer or app version) and, when known, its commit. */
  code:{version:string;commit?:string};
  /** Declared model inputs (ids). Default: the inputs the runtime recorded. */
  declaredInputs?:readonly string[];
  /** Input ids the page actually sent. Declared but not sent = `fixed` (the runtime used its default); sent but not
   *  declared = `ignored`; sent and declared = `consumed`. Default: the recorded inputs (all consumed). */
  sentInputs?:readonly string[];
  /** Exact byte length of the artifact Studio fetched and hash-checked; without it no artifact-ref is written. */
  artifactBytes?:number;
  artifactScope?:'public'|'private';
  checks?:{performed?:readonly string[];notPerformed?:readonly string[]};
};
const RUNTIME_STATUSES=new Set(['queued','running','succeeded','failed','cancelled']);

/** Build and validate a run-receipt. Throws EngineeringError (stable DP-ENG code) when the record cannot form one. */
export function receiptFromRunRecord(run:ObservedRun,options:ReceiptOptions):RunReceipt{
  if(!RUNTIME_STATUSES.has(run.status))throw new Error(`Run ${run.runId} has status ${run.status}, not a datapass.runtime/1 status.`);
  const recorded=Object.keys(run.inputs).sort();
  const declared=[...new Set(options.declaredInputs??recorded)];
  const sent=[...new Set(options.sentInputs??recorded)].sort();
  const consumed=sent.filter(id=>declared.includes(id));
  const ignored=sent.filter(id=>!declared.includes(id));
  const fixed=declared.filter(id=>!sent.includes(id)).sort();
  const artifacts:ArtifactRef[]=[];
  const performed=new Set(options.checks?.performed??[]),notPerformed=new Set(options.checks?.notPerformed??[]);
  if(run.artifactId&&run.artifactSha256&&options.artifactBytes!==undefined){
    artifacts.push({format:ENGINEERING_FORMAT,version:ENGINEERING_VERSION,kind:'artifact-ref',id:run.artifactId,sha256:run.artifactSha256,
      mediaType:'application/json',bytes:options.artifactBytes,scope:options.artifactScope??'private'});
  }else if(run.status==='succeeded'&&!performed.has('artifact-sha256'))notPerformed.add('artifact-sha256');
  for(const id of performed)notPerformed.delete(id);
  // An older runtime has no cancelRequested; a cancelled run was always requested (the runtime only cancels on request).
  const cancelRequested=run.cancelRequested===true||run.status==='cancelled';
  const receipt:RunReceipt={format:ENGINEERING_FORMAT,version:ENGINEERING_VERSION,kind:'run-receipt',runId:run.runId,
    inputDigest:digest({model:run.model,inputs:{...run.inputs}}),
    code:{version:options.code.version,...(options.code.commit?{commit:options.code.commit}:{})},
    model:{id:run.model,version:run.modelVersion},
    status:run.status as RunReceipt['status'],cancelRequested,
    times:{submittedAt:run.submittedAt,startedAt:run.startedAt,finishedAt:run.finishedAt},
    checks:{performed:[...performed].sort(),notPerformed:[...notPerformed].sort()},
    coverage:{consumed,ignored,fixed},artifacts,
    diagnostics:run.error?[{code:'DP-RT-RUN-FAILED',severity:'error',message:run.error.slice(0,2000)}]:[]};
  return validateEngineering(JSON.parse(JSON.stringify(receipt))) as RunReceipt;
}

// ------------------------------------------------------------------------------------- presentation rules (pure)
const scalarText=(v:ScalarValue)=>v===null?'none':typeof v==='string'?v:String(v);

export type DiffRow={id:string;unit:string;from:string;to:string;consumedBy:string[];calculated:boolean};
export type DiffView={ok:true;rows:DiffRow[]}|{ok:false;reasons:string[]};
/** Rows of a parameter-diff with their units. `declaredUnits` (parameter id -> unit the consumer declares) refuses the
 *  whole diff when a unit differs: values in different units are never shown side by side and never converted. */
export function parameterDiffView(diff:ParameterDiff,declaredUnits:Readonly<Record<string,string>>={},consumed?:readonly string[]):DiffView{
  const valid=validateEngineering(diff) as ParameterDiff;
  const reasons:string[]=[];
  for(const c of valid.changes){
    const declared=declaredUnits[c.id];
    if(declared!==undefined&&declared!==c.unit)reasons.push(`Unit mismatch for ${c.id}: the diff is in ${c.unit===''?'no unit (dimensionless)':c.unit}, the model declares ${declared===''?'no unit (dimensionless)':declared}. Values are not converted, so the diff is not shown.`);
  }
  if(reasons.length)return {ok:false,reasons};
  return {ok:true,rows:valid.changes.map(c=>({id:c.id,unit:c.unit,from:scalarText(c.from),to:scalarText(c.to),consumedBy:[...c.consumedBy],
    calculated:c.consumedBy.length>0&&(consumed===undefined||consumed.includes(c.id))}))};
}

export type CoverageBadge={id:string;kind:'consumed'|'ignored'|'fixed'|'not-calculated';label:string};
const COVERAGE_LABELS={consumed:'consumed by the model',ignored:'ignored by the model',fixed:'fixed (model default)','not-calculated':'changed but not calculated'} as const;
/** One badge per parameter. A changed parameter that no model consumed is flagged `not-calculated`: its new value
 *  did not reach any calculation, whatever the result shows. */
export function coverageBadges(coverage:RunReceipt['coverage'],changed:readonly string[]=[]):CoverageBadge[]{
  const badges:CoverageBadge[]=[];
  for(const kind of ['consumed','ignored','fixed'] as const)for(const id of coverage[kind])
    badges.push({id,kind:kind!=='consumed'&&changed.includes(id)?'not-calculated':kind,label:COVERAGE_LABELS[kind!=='consumed'&&changed.includes(id)?'not-calculated':kind]});
  const listed=new Set(badges.map(b=>b.id));
  for(const id of changed)if(!listed.has(id))badges.push({id,kind:'not-calculated',label:COVERAGE_LABELS['not-calculated']});
  return badges;
}

/** What makes two results comparable. A time base declared on one side only is a mismatch, never assumed equal. */
export type ComparableSide={label?:string;modelId:string;modelVersion:string;units?:Readonly<Record<string,string>>;timeBase?:string|null};
/** The specific reason two results cannot be compared, or null. Checked in order: model, model version, units of the
 *  shared quantities, time base. No conversion or alignment is attempted. */
export function comparisonIncompatibility(a:ComparableSide,b:ComparableSide):string|null{
  const A=a.label??'A',B=b.label??'B';
  if(a.modelId!==b.modelId)return `Different models: ${A} ran ${a.modelId}, ${B} ran ${b.modelId}.`;
  if(a.modelVersion!==b.modelVersion)return `Model version differs: ${A} ran ${a.modelId} ${a.modelVersion}, ${B} ran ${b.modelId} ${b.modelVersion}.`;
  const ua=a.units??{},ub=b.units??{};
  for(const id of Object.keys(ua).sort())if(Object.prototype.hasOwnProperty.call(ub,id)&&ua[id]!==ub[id])
    return `Unit differs for ${id}: ${A} is in ${ua[id]||'no unit'}, ${B} is in ${ub[id]||'no unit'}. Values are not converted.`;
  if((a.timeBase??null)!==(b.timeBase??null))return `Time base differs: ${A} uses ${a.timeBase??'an undeclared time base'}, ${B} uses ${b.timeBase??'an undeclared time base'}.`;
  return null;
}

/** Short display of a digest: algorithm, what it covers and the first 12 hex characters. */
export const digestText=(d:Digest)=>`${d.alg}/${d.over} ${d.value.slice(0,12)}`;

/** Presentation blocks for `datapass.engineering/1` records (S05/S06 presentation). They show records; they never
 *  compute, convert, approve or store anything. Text is rendered by React as text (no HTML injection path), tables
 *  reuse the existing artifact renderers through ArtifactView, and an approval request only calls the callback the
 *  page supplies (the domain service decides; Studio keeps no approval state). */
import {useMemo} from 'react';
import {validateArtifact,type Artifact} from '../foundation/artifact';
import {ArtifactView} from '../foundation/ArtifactView';
import {validateEngineering,type ApprovalRequest as ApprovalRecord,type ParameterDiff as DiffRecord,type RunReceipt} from './contract';
import {comparisonIncompatibility,coverageBadges,digestText,parameterDiffView,type ComparableSide} from './receipt';
import './engineering.css';

const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const refused=(title:string,reasons:string[],testId:string)=><section className="engineering-block engineering-refused" role="alert" data-testid={testId} data-state="refused">
  <h4>{title}</h4><ul>{reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></section>;

function diffArtifact(rows:{id:string;unit:string;from:string;to:string;consumedBy:string[];calculated:boolean}[],base:string):Artifact{
  return validateArtifact({format:'datapass.artifact',version:1,id:'parameter-diff',title:'Parameter changes',
    provenance:{kind:'provided',source:`Parameter diff record (datapass.engineering/1) against base revision ${base}. Shown as recorded: no unit conversion, no calculation.`},
    payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'Parameter',type:'string'},{id:'unit',label:'Unit',type:'string'},{id:'from',label:'From',type:'string'},
      {id:'to',label:'To',type:'string'},{id:'consumedBy',label:'Consumed by',type:'string'},{id:'calculated',label:'Calculated',type:'string'}],
      rows:rows.map(r=>({id:r.id,unit:r.unit||'(dimensionless)',from:r.from,to:r.to,consumedBy:r.consumedBy.join(', ')||'none',calculated:r.calculated?'yes':'no: not calculated'}))},
    representations:[{id:'table',title:'Changes',kind:'table'},{id:'json',title:'JSON',kind:'json'}]});
}

/** A parameter-diff with its units. With `declaredUnits`, a unit that differs refuses the diff with the reason. */
export function ParameterDiff({diff,declaredUnits,consumed}:{diff:DiffRecord;declaredUnits?:Readonly<Record<string,string>>;consumed?:readonly string[]}){
  const view=useMemo(()=>{try{const v=parameterDiffView(diff,declaredUnits,consumed);return v.ok?{ok:true as const,artifact:diffArtifact(v.rows,digestText(diff.baseRevision)),rows:v.rows}:v;}catch(error){return {ok:false as const,reasons:['The parameter diff is not a valid datapass.engineering/1 record: '+message(error)]};}},[diff,declaredUnits,consumed]);
  if(!view.ok)return refused('Parameter changes not shown',view.reasons,'engineering-parameter-diff');
  const skipped=view.rows.filter(r=>!r.calculated);
  return <section className="engineering-block" data-testid="engineering-parameter-diff" data-state="shown">
    <h4>Parameter changes</h4>
    <p className="engineering-units">{view.rows.map(r=><span key={r.id} className="engineering-unit" data-parameter={r.id}>{r.id}: {r.from} → {r.to} {r.unit||'(dimensionless)'}</span>)}</p>
    {skipped.length>0&&<p className="engineering-warning" role="status" data-testid="engineering-not-calculated">Not calculated: {skipped.map(r=>r.id).join(', ')}. No model consumed {skipped.length===1?'this change':'these changes'}.</p>}
    <ArtifactView artifact={view.artifact}/>
  </section>;
}

/** Coverage of a run receipt: consumed, ignored and fixed parameters; a changed one no model consumed is flagged. */
export function CoverageBadges({coverage,changed=[]}:{coverage:RunReceipt['coverage'];changed?:readonly string[]}){
  const badges=coverageBadges(coverage,changed);
  return <section className="engineering-block" data-testid="engineering-coverage">
    <h4>Parameter coverage</h4>
    {badges.length?<ul className="engineering-badges">{badges.map(b=><li key={b.kind+b.id} className={'engineering-badge '+b.kind} data-kind={b.kind} data-parameter={b.id}><strong>{b.id}</strong> <span>{b.label}</span></li>)}</ul>
      :<p className="engineering-note">The run declares no parameter.</p>}
    <p className="engineering-note">Coverage is what the producer declared for this run, not a proof that the model is correct.</p>
  </section>;
}

/** A presentation-only approval request. The button only calls `onRequest`, which sends it to the domain service;
 *  Studio never decides, records or shows an approved state, and nothing is sent without a click. */
export function ApprovalRequest({request,onRequest}:{request:ApprovalRecord;onRequest:(request:ApprovalRecord)=>void}){
  let valid:ApprovalRecord;
  try{valid=validateEngineering(request) as ApprovalRecord;if(valid.kind!=='approval-request')throw new Error('expected an approval-request record');}
  catch(error){return refused('Approval request not shown',['The record is not a valid presentation-only approval request: '+message(error)],'engineering-approval');}
  return <section className="engineering-block" data-testid="engineering-approval" data-state="presentation-only">
    <h4>Approval request</h4>
    <dl className="engineering-facts">
      <div><dt>Purpose</dt><dd data-field="purpose">{valid.purpose}</dd></div>
      <div><dt>Base revision</dt><dd data-field="base-revision">{digestText(valid.baseRevision)}</dd></div>
      <div><dt>Proposal digest</dt><dd data-field="proposal-digest">{digestText(valid.proposalDigest)}</dd></div>
      <div><dt>Requested by</dt><dd>{valid.requester}</dd></div>
      <div><dt>Domain service</dt><dd>{valid.endpointHint}</dd></div>
    </dl>
    <p className="engineering-note">Studio does not approve anything. The domain service decides; this page keeps no approval state.</p>
    <button type="button" data-testid="engineering-approval-request" onClick={()=>onRequest(valid)}>Send this request to the domain service</button>
  </section>;
}

/** Why two results are not compared (model, model version, unit, time base), or nothing when they are comparable. */
export function IncompatibleComparison({a,b}:{a:ComparableSide;b:ComparableSide}){
  const reason=comparisonIncompatibility(a,b);
  if(!reason)return null;
  return <section className="engineering-block engineering-refused" role="status" data-testid="engineering-incompatible" data-state="incompatible">
    <h4>Not compared</h4><p>{reason}</p></section>;
}

/** F207 A/B comparison that survives reopen.
 *
 * A comparison is saved in the browser as a pair of REFERENCES (`datapass.ab-pair` v1): the result hash, run id,
 * model and model version of each side, the app id and the save time. No result rows, artifact, input value or token
 * is stored. Reopening reads both results back from the paired ResultStore by hash (`SiteRunStore.open`: hash,
 * artifact, app version and run reference are checked) and compares them with the same like-for-like rules as
 * `compareRuns` (same task, app version, model and model version; no unit conversion). Nothing is recomputed.
 *
 * Saved runs are not rebuilt into `RunRecord`s: that would need invented timings and dataset revisions. Their
 * artifacts are compared directly with the pure helpers shared with `compareRuns` (`artifactMetricDeltas`,
 * `artifactRowDeltas`, `parameterDeltas`). This is not a scenario engine or sweep (AD-06). */
import type {Artifact,Representation} from '../foundation/artifact.ts';
import {validateArtifact} from '../foundation/artifact.ts';
import {artifactMetricDeltas,artifactRowDeltas,parameterDeltas,type MetricDelta,type ParameterDelta,type RowDeltas} from '../foundation/journal.ts';
import {boundedJson} from '../foundation/safety.ts';
import {identifier,strict,text} from '../guards.ts';
import type {KeyValuePort} from './ports.ts';
import {SiteRunError,type ReopenedSiteRun,type SavedSiteRun,type SiteApp,type SiteRunStore} from './site-runs.ts';

export const AB_PAIR_FORMAT='datapass.ab-pair';
export const AB_PAIR_VERSION=1;
const SHA=/^[0-9a-f]{64}$/,RUN_ID=/^run-[0-9a-f]{16}$/;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type AbSide={resultSha256:string;runId:string;model:string;modelVersion:string};
export type AbPair={format:typeof AB_PAIR_FORMAT;version:1;appId:string;a:AbSide;b:AbSide;savedAt:string};
export type AbPairErrorKind='invalid'|'incompatible'|'missing'|'mismatch'|'unreadable'|'storage';
export class AbPairError extends Error{
  readonly kind:AbPairErrorKind;readonly side:'a'|'b'|null;
  constructor(message:string,kind:AbPairErrorKind,side:'a'|'b'|null=null){super(message);this.name='AbPairError';this.kind=kind;this.side=side;}
}
const short=(sha:string)=>sha.slice(0,12);

/** Browser key of the one saved comparison of an app. */
export function abPairKey(appId:string):string{identifier(appId,'app id');return AB_PAIR_FORMAT+'.'+appId;}

function side(value:unknown,label:string):AbSide{
  strict(value,['resultSha256','runId','model','modelVersion'],label);
  if(typeof value.resultSha256!=='string'||!SHA.test(value.resultSha256))throw new Error(label+': invalid result hash');
  if(typeof value.runId!=='string'||!RUN_ID.test(value.runId))throw new Error(label+': invalid run id');
  text(value.model,label+' model',80);text(value.modelVersion,label+' model version',80);
  return {resultSha256:value.resultSha256,runId:value.runId,model:value.model,modelVersion:value.modelVersion};
}
/** Strict, complete validation; a bad value never becomes a pair. With `appId`, the pair must belong to that app. */
export function validateAbPair(value:unknown,appId?:string):AbPair{
  boundedJson(value,4096);
  strict(value,['format','version','appId','a','b','savedAt'],'ab-pair');
  if(value.format!==AB_PAIR_FORMAT||value.version!==AB_PAIR_VERSION)throw new Error('Unsupported ab-pair format or version');
  identifier(value.appId,'ab-pair app id');
  if(appId!==undefined&&value.appId!==appId)throw new Error(`The saved comparison belongs to ${value.appId}, not ${appId}`);
  const a=side(value.a,'ab-pair side A'),b=side(value.b,'ab-pair side B');
  if(a.resultSha256===b.resultSha256)throw new Error('An A/B pair needs two different results');
  if(typeof value.savedAt!=='string'||!TIME.test(value.savedAt)||new Date(value.savedAt).toISOString()!==value.savedAt)throw new Error('Invalid ab-pair save time');
  return Object.freeze({format:AB_PAIR_FORMAT,version:1,appId:value.appId,a:Object.freeze(a),b:Object.freeze(b),savedAt:value.savedAt});
}

export type AbCompatibility={ok:true}|{ok:false;reason:string};
/** The compareRuns contract applied to two saved runs of a site: same task, app version, model and model version. */
export function abCompatibility(a:SavedSiteRun,b:SavedSiteRun):AbCompatibility{
  const no=(reason:string):AbCompatibility=>({ok:false,reason});
  if(a.resultSha256===b.resultSha256)return no('Choose two different saved results.');
  for(const [name,run] of [['A',a],['B',b]] as const)if(!run.run)return no(`Result ${name} (${short(run.resultSha256)}) has no run reference: its model version is unknown, so it is not compared.`);
  const ra=a.run!,rb=b.run!;
  if(a.taskId!==b.taskId)return no(`The results belong to different tasks (${a.taskId}, ${b.taskId}); only runs of the same task are compared.`);
  if(ra.site.appVersion!==rb.site.appVersion)return no(`The results were saved by different versions of this site (${ra.site.appVersion}, ${rb.site.appVersion}).`);
  if(ra.model!==rb.model)return no(`The results come from different models (${ra.model}, ${rb.model}); only runs of the same declared model are compared.`);
  if(ra.modelVersion!==rb.modelVersion)return no(`Model versions differ: A ran ${ra.model} ${ra.modelVersion}, B ran ${rb.model} ${rb.modelVersion}. Runs of different model versions are not compared.`);
  return {ok:true};
}

/** Build the reference pair for two compatible saved runs. Throws AbPairError('incompatible') with the reason. */
export function createAbPair(app:SiteApp,a:SavedSiteRun,b:SavedSiteRun,now:Date=new Date()):AbPair{
  const ok=abCompatibility(a,b);
  if(!ok.ok)throw new AbPairError(ok.reason,'incompatible');
  const ref=(r:SavedSiteRun):AbSide=>({resultSha256:r.resultSha256,runId:r.run!.runId,model:r.run!.model,modelVersion:r.run!.modelVersion});
  return validateAbPair({format:AB_PAIR_FORMAT,version:AB_PAIR_VERSION,appId:app.id,a:ref(a),b:ref(b),savedAt:now.toISOString()},app.id);
}

/** Read the saved comparison of an app. A missing value is null; an unreadable or invalid one is ignored with a
 * notice and left in place (the caller may clear it); nothing else changes. */
export function loadAbPair(port:KeyValuePort|null,appId:string):{pair:AbPair|null;notice:string|null}{
  if(!port)return {pair:null,notice:null};
  let raw:string|null;
  try{raw=port.getItem(abPairKey(appId));}catch{return {pair:null,notice:'Browser storage is unavailable; the saved comparison cannot be read.'};}
  if(raw===null)return {pair:null,notice:null};
  try{return {pair:validateAbPair(JSON.parse(raw),appId),notice:null};}
  catch(error){return {pair:null,notice:'The saved comparison in this browser is invalid and was ignored: '+(error instanceof Error?error.message:String(error)).slice(0,300)};}
}
/** Save the pair (references only). Validated first; a refused pair leaves the stored value unchanged. */
export function saveAbPair(port:KeyValuePort|null,pair:AbPair):void{
  const valid=validateAbPair(pair);
  if(!port)throw new AbPairError('Browser storage is unavailable; the comparison cannot be kept after a reload.','storage');
  try{port.setItem(abPairKey(valid.appId),JSON.stringify(valid));}
  catch{throw new AbPairError('Browser storage refused the comparison; it will not survive a reload.','storage');}
}
export function clearAbPair(port:KeyValuePort|null,appId:string):void{
  if(port)try{port.removeItem(abPairKey(appId));}catch{/* unavailable */}
}

export type SavedComparison={
  parameters:ParameterDelta[];metrics:MetricDelta[];rows:RowDeltas;
  /** Table and bar chart of B - A over the existing artifact renderers; null when the rows are not comparable. */
  deltaArtifact:Artifact|null;
};
const deltaId=(column:string,suffix:string)=>`${column}_${suffix}`;
/** Build an artifact of the per-row differences, labelled with its source results; computed in the page, not a model run. */
export function deltaArtifact(a:ReopenedSiteRun,b:ReopenedSiteRun,rows:RowDeltas):Artifact|null{
  if(!rows.comparable||!rows.columns.length||a.artifact.payload.kind!=='table')return null;
  const cols=rows.columns.filter(c=>c.id.length<=72);
  if(!cols.length)return null;
  const key=a.artifact.payload.columns.find(c=>c.id===rows.rowKey)!;
  const columns=[{id:key.id,label:key.label,type:'string' as const},...cols.flatMap(c=>[
    {id:deltaId(c.id,'a'),label:`${c.label} (A)`,type:'number' as const,nullable:true,...(c.unit?{unit:c.unit}:{})},
    {id:deltaId(c.id,'b'),label:`${c.label} (B)`,type:'number' as const,nullable:true,...(c.unit?{unit:c.unit}:{})},
    {id:deltaId(c.id,'delta'),label:`${c.label} difference (B - A)`,type:'number' as const,nullable:true,...(c.unit?{unit:c.unit}:{})},
  ])];
  const index=new Map(rows.columns.map((c,i)=>[c.id,i]));
  const data=rows.rows.map(r=>Object.fromEntries([[key.id,r.key],...cols.flatMap(c=>{const cell=r.cells[index.get(c.id)!];return [[deltaId(c.id,'a'),cell.before],[deltaId(c.id,'b'),cell.after],[deltaId(c.id,'delta'),cell.delta]];})]));
  const first=cols[0];
  const representations:Representation[]=[{id:'deltas',title:'Differences by row (B - A)',kind:'table'},
    {id:'delta-chart',title:`${first.label} difference (B - A)`,kind:'chart',chart:'bar',x:key.id,y:deltaId(first.id,'delta'),...(first.unit?{unit:first.unit}:{})}];
  const synthetic=a.artifact.provenance.kind==='synthetic'||b.artifact.provenance.kind==='synthetic';
  return validateArtifact({format:'datapass.artifact',version:1,id:'ab-delta',title:'A/B differences (B - A)',
    provenance:{kind:synthetic?'synthetic':'computed',source:`${synthetic?'SYNTHETIC. ':''}Difference of saved results A ${short(a.resultSha256)} and B ${short(b.resultSha256)}, computed in this page from the stored rows; not a model run.`},
    payload:{kind:'table',rowKey:key.id,columns,rows:data},representations});
}
/** Compare two reopened saved runs under the compareRuns contract. Throws AbPairError('incompatible') with the reason. */
export function compareSavedRuns(a:ReopenedSiteRun,b:ReopenedSiteRun):SavedComparison{
  const ok=abCompatibility(a.entry,b.entry);
  if(!ok.ok)throw new AbPairError(ok.reason,'incompatible');
  if(a.run.model!==b.run.model||a.run.modelVersion!==b.run.modelVersion)throw new AbPairError(`Model versions differ in the stored results: A ${a.run.model} ${a.run.modelVersion}, B ${b.run.model} ${b.run.modelVersion}.`,'incompatible');
  const rows=artifactRowDeltas(a.artifact,b.artifact);
  return {parameters:parameterDeltas(a.entry.run!.site.values,b.entry.run!.site.values),metrics:artifactMetricDeltas(a.artifact,b.artifact),rows,deltaArtifact:deltaArtifact(a,b,rows)};
}

export type ReopenedAbPair={pair:AbPair;a:ReopenedSiteRun;b:ReopenedSiteRun;comparison:SavedComparison};
/** Reopen a saved comparison: find both results in this site's saved runs, read each back by hash, check that each
 * still matches its reference, then compare. Never recomputes and never substitutes another result. */
export async function openAbPair(store:Pick<SiteRunStore,'open'>,app:SiteApp,pair:AbPair,runs:readonly SavedSiteRun[]):Promise<ReopenedAbPair>{
  const valid=validateAbPair(pair,app.id);
  const entries={} as Record<'a'|'b',SavedSiteRun>;
  for(const name of ['a','b'] as const){
    const ref=valid[name],label=name.toUpperCase();
    const entry=runs.find(r=>r.resultSha256===ref.resultSha256);
    if(!entry)throw new AbPairError(`Result ${label} (${short(ref.resultSha256)}) is not among this site's saved runs (removed, or saved by another version of the site). The comparison is not shown.`,'missing',name);
    if(!entry.run||entry.run.runId!==ref.runId||entry.run.model!==ref.model||entry.run.modelVersion!==ref.modelVersion)throw new AbPairError(`Result ${label} (${short(ref.resultSha256)}) no longer matches the saved reference (run, model or model version).`,'mismatch',name);
    entries[name]=entry;
  }
  const ok=abCompatibility(entries.a,entries.b);
  if(!ok.ok)throw new AbPairError(ok.reason,'incompatible');
  const opened={} as Record<'a'|'b',ReopenedSiteRun>;
  for(const name of ['a','b'] as const){
    try{opened[name]=await store.open(app,entries[name]);}
    catch(error){
      const label=name.toUpperCase(),reason=error instanceof Error?error.message:String(error);
      // Missing, corrupt, foreign or unreachable: reported for that side; never replaced by another result.
      throw new AbPairError(`Result ${label} cannot be reopened${error instanceof SiteRunError?` (${error.kind})`:''}: ${reason}`,'unreadable',name);
    }
    if(opened[name].run.runId!==valid[name].runId)throw new AbPairError(`Result ${name.toUpperCase()} carries run ${opened[name].run.runId}, not ${valid[name].runId}.`,'mismatch',name);
  }
  return {pair:valid,a:opened.a,b:opened.b,comparison:compareSavedRuns(opened.a,opened.b)};
}

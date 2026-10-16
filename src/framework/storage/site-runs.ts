/** F206 durable site runs: save a runtime-produced run of a client site to the local ResultStore on request, and
 * reopen it later by hash ("Not recomputed"), after a browser and a service restart.
 *
 * Every saved run is an existing `datapass.cell-result` v1 document (`cellKind: "python"`, `origin:
 * "datapass.runtime/1"`, ONE display_data output carrying the validated `datapass.artifact`), stored under the cell id
 * `site-<appId>-<taskId>` through the results-only route `POST /api/notebook/v1/store/results` (the notebook
 * workspace is untouched). `sourceSha256` = SHA-256 of JSON.stringify(["site", appId, appVersion, taskId, model,
 * modelVersion, inputHash]) as UTF-8. No new stored format, origin or version.
 *
 * Reopening reads the bytes back, checks them against their hash, re-validates the artifact and checks that the
 * document belongs to this app version, task and run reference. A missing or corrupt result is reported as such
 * (the caller offers Relink or Run again); there is no fallback and nothing is recomputed here. */
import type {Artifact} from '../foundation/artifact.ts';
import type {Scalar} from '../types.ts';
import type {RuntimeTaskRun} from '../compute/runtime-task.ts';
import {ARTIFACT_MIME,RESULT_FORMAT,RESULT_STORE_FORMAT,RESULT_STORE_PREFIX,RUNTIME_RESULT_ORIGIN,readArtifactResult,resultStoreOrigin,sha256Hex,type StoredRunRef} from './result-store-client.ts';
import {SITE_CELL_PREFIX,siteCellId} from './site-runs-binding.ts';

export {SITE_CELL_PREFIX,siteCellId};
const SHA=/^[0-9a-f]{64}$/,RUN_ID=/^run-[0-9a-f]{16}$/;
function isObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}

export type SiteApp={readonly id:string;readonly version:string};
export type SiteRunIdentity={appId:string;appVersion:string;taskId:string;model:string;modelVersion:string;inputHash:string};
export async function siteSourceSha256(id:SiteRunIdentity):Promise<string>{
  return sha256Hex(JSON.stringify(['site',id.appId,id.appVersion,id.taskId,id.model,id.modelVersion,id.inputHash]));
}
/** The run reference kept in the manifest entry: what ran, never the result or a secret. `values` are the
 * declared field values the task ran with (user input; review before sharing a store). */
export type SiteRunRef=StoredRunRef&{site:{appId:string;appVersion:string;taskId:string;values:Record<string,Scalar>}};
export type SiteRunDocument={format:typeof RESULT_FORMAT;version:1;cellId:string;cellKind:'python';sourceSha256:string;
  outputs:[{output_type:'display_data';data:{[ARTIFACT_MIME]:Artifact};metadata:{datapass:{run:StoredRunRef}}}];
  table:null;executionCount:null;finishedAt:string;origin:typeof RUNTIME_RESULT_ORIGIN};
export type SiteRunItem={cellId:string;cellKind:'python';sourceSha256:string;result:SiteRunDocument;run:SiteRunRef};

/** Build the stored item for one completed runtime run (same output shape as the notebook's artifactOutputs). */
export async function siteRunItem(app:SiteApp,run:RuntimeTaskRun):Promise<SiteRunItem>{
  const r=run.record;
  if(r.status!=='succeeded')throw new Error(`Run ${r.runId} did not succeed; only a completed runtime run can be saved.`);
  const cellId=siteCellId(app.id,run.taskId);
  const sourceSha256=await siteSourceSha256({appId:app.id,appVersion:app.version,taskId:run.taskId,model:r.model,modelVersion:r.modelVersion,inputHash:r.inputHash});
  const ref:StoredRunRef={runId:r.runId,model:r.model,modelVersion:r.modelVersion,inputHash:r.inputHash,artifactSha256:r.artifactSha256};
  const values=Object.fromEntries(Object.entries(run.values).filter(([,v])=>v===null||['string','number','boolean'].includes(typeof v))) as Record<string,Scalar>;
  return {cellId,cellKind:'python',sourceSha256,run:{...ref,site:{appId:app.id,appVersion:app.version,taskId:run.taskId,values}},
    result:{format:RESULT_FORMAT,version:1,cellId,cellKind:'python',sourceSha256,
      outputs:[{output_type:'display_data',data:{[ARTIFACT_MIME]:JSON.parse(JSON.stringify(run.artifact))},metadata:{datapass:{run:ref}}}],
      table:null,executionCount:null,finishedAt:r.finishedAt??new Date().toISOString(),origin:RUNTIME_RESULT_ORIGIN}};
}

export type SavedSiteRun={cellId:string;taskId:string;sourceSha256:string;resultSha256:string;bytes:number;savedAt:string;present:boolean;
  /** Null when the manifest entry carries no readable site reference (it can still be opened, not run again). */
  run:SiteRunRef|null};
export type ReopenedSiteRun={entry:SavedSiteRun;resultSha256:string;artifact:Artifact;run:StoredRunRef;finishedAt:string};
export type SiteRunErrorKind='unavailable'|'no-store'|'denied'|'missing'|'corrupt'|'mismatch'|'refused';
export class SiteRunError extends Error{
  readonly kind:SiteRunErrorKind;readonly status?:number;
  constructor(message:string,kind:SiteRunErrorKind,status?:number){super(message);this.name='SiteRunError';this.kind=kind;this.status=status;}
}

function siteRef(v:unknown,app:SiteApp):SiteRunRef|null{
  if(!isObject(v)||!isObject(v.site))return null;
  const s=v.site;
  if(typeof v.runId!=='string'||!RUN_ID.test(v.runId)||typeof v.inputHash!=='string'||!SHA.test(v.inputHash))return null;
  if(typeof v.model!=='string'||typeof v.modelVersion!=='string'||s.appId!==app.id||typeof s.appVersion!=='string'||typeof s.taskId!=='string'||!isObject(s.values))return null;
  const values:Record<string,Scalar>={};
  for(const [k,x] of Object.entries(s.values).slice(0,100))if(x===null||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)||typeof x==='string'&&x.length<=4000)values[k]=x;
  return {runId:v.runId,model:v.model.slice(0,80),modelVersion:v.modelVersion.slice(0,80),inputHash:v.inputHash,artifactSha256:typeof v.artifactSha256==='string'&&SHA.test(v.artifactSha256)?v.artifactSha256:null,
    site:{appId:app.id,appVersion:s.appVersion.slice(0,80),taskId:s.taskId.slice(0,80),values}};
}

/** Relink choices for a missing or corrupt saved run: other present results of the same task, the ones saved for the
 * same model, version and inputs first. Choosing one is an explicit user act; nothing is substituted silently. */
export function relinkCandidates(runs:readonly SavedSiteRun[],entry:SavedSiteRun):{run:SavedSiteRun;sameInputs:boolean}[]{
  return runs.filter(r=>r.taskId===entry.taskId&&r.present&&r.resultSha256!==entry.resultSha256)
    .map(run=>({run,sameInputs:run.sourceSha256===entry.sourceSha256}))
    .sort((a,b)=>Number(b.sameInputs)-Number(a.sameInputs));
}

type FetchLike=(url:string,init:{method:'GET'|'POST';headers:Record<string,string>;body?:string;credentials:'omit';cache:'no-store';mode:'cors'})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;

/** Writer and reader of one app's saved site runs in the paired ResultStore. Opt-in: nothing is saved unless `save` is called. */
export class SiteRunStore{
  readonly origin:string;readonly #token:string;readonly #fetch:FetchLike;
  constructor(connection:{origin:string;token:string},options:{fetch?:FetchLike}={}){
    this.origin=resultStoreOrigin(connection.origin);
    if(typeof connection.token!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(connection.token))throw new Error('The runtime token is malformed.');
    this.#token=connection.token;this.#fetch=options.fetch??(globalThis.fetch.bind(globalThis) as unknown as FetchLike);
  }
  async #request(path:string,body?:unknown,what:'result'|'store'='store'):Promise<{json:unknown;text:string}>{
    let response;
    try{response=await this.#fetch(this.origin+RESULT_STORE_PREFIX+path,{method:body===undefined?'GET':'POST',headers:{'X-Datapass-Token':this.#token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',mode:'cors'});}
    catch{throw new SiteRunError(`The local service at ${this.origin} is unreachable. Start it and reconnect with its new link; nothing was saved or reopened.`,'unavailable');}
    const text=await response.text();
    let json:unknown=null;try{json=text?JSON.parse(text):null;}catch{if(response.ok)throw new SiteRunError('The local service answered with invalid JSON.','refused');}
    if(!response.ok){
      const detail=isObject(json)&&typeof json.detail==='string'?json.detail.slice(0,600):`HTTP ${response.status}`;
      const s=response.status;
      if(s===401)throw new SiteRunError('The local service refused the token (it changes at every start); reconnect with the new link.','denied',s);
      if(s===403)throw new SiteRunError('The local service refused this page origin; start it with DATAPASS_SERVICE_ORIGINS naming this site.','denied',s);
      if(s===404&&/No result store/i.test(detail))throw new SiteRunError('The local service has no result store: start it with --results-dir <folder outside Git>.','no-store',s);
      if(s===404&&what==='result')throw new SiteRunError(detail,'missing',s);
      if(s===409)throw new SiteRunError(detail,'corrupt',s);
      throw new SiteRunError(detail,s>=500&&s!==507?'unavailable':'refused',s);
    }
    return {json,text};
  }
  /** This app's saved runs (newest first). Runs saved by another version of the app are counted, not listed. */
  async list(app:SiteApp):Promise<{runs:SavedSiteRun[];otherVersions:number}>{
    const {json}=await this.#request('/manifest');
    if(!isObject(json)||json.format!==RESULT_STORE_FORMAT||!Array.isArray(json.entries))throw new SiteRunError('The service returned a malformed store manifest.','refused');
    const prefix=SITE_CELL_PREFIX+app.id+'-';let otherVersions=0;
    const runs:SavedSiteRun[]=[];
    for(const e of json.entries.slice(0,500)){
      if(!isObject(e)||typeof e.cellId!=='string'||!e.cellId.startsWith(prefix)||e.cellKind!=='python'||typeof e.resultSha256!=='string'||!SHA.test(e.resultSha256))continue;
      const run=siteRef(e.run,app);
      if(run&&run.site.appVersion!==app.version){otherVersions++;continue;}
      const taskId=run?.site.taskId??e.cellId.slice(prefix.length);
      if(e.cellId!==prefix+taskId)continue;
      runs.push({cellId:e.cellId,taskId,sourceSha256:String(e.sourceSha256),resultSha256:e.resultSha256,bytes:Number(e.bytes)||0,savedAt:String(e.savedAt),present:e.present===true,run});
    }
    return {runs:runs.reverse(),otherVersions};
  }
  /** Save one completed runtime run. Explicit and per run; the receipt names the immutable result hash. */
  async save(app:SiteApp,run:RuntimeTaskRun):Promise<{cellId:string;sourceSha256:string;resultSha256:string}>{
    const item=await siteRunItem(app,run);
    const {json}=await this.#request('/results',{results:[item]});
    const r=isObject(json)&&Array.isArray(json.results)&&isObject(json.results[0])?json.results[0]:null;
    if(!r||r.cellId!==item.cellId||typeof r.resultSha256!=='string'||!SHA.test(r.resultSha256))throw new SiteRunError('The service returned a malformed save receipt.','refused');
    return {cellId:item.cellId,sourceSha256:item.sourceSha256,resultSha256:r.resultSha256};
  }
  /** Reopen one saved run by hash. Never recomputes; throws SiteRunError (missing, corrupt, mismatch, unavailable). */
  async open(app:SiteApp,entry:SavedSiteRun):Promise<ReopenedSiteRun>{
    if(!SHA.test(entry.resultSha256))throw new SiteRunError('Invalid result hash.','refused');
    const {json,text}=await this.#request('/results/'+entry.resultSha256,undefined,'result');
    const short=entry.resultSha256.slice(0,12);
    if(await sha256Hex(text)!==entry.resultSha256)throw new SiteRunError(`Result ${short} does not match its hash; it is not shown.`,'corrupt');
    let stored;
    try{stored=readArtifactResult(json,entry.resultSha256);}catch(error){throw new SiteRunError(`Result ${short} is not a valid saved run: ${(error as Error).message}`,'corrupt');}
    if(stored.cellId!==siteCellId(app.id,entry.taskId)||stored.cellId!==entry.cellId)throw new SiteRunError(`Result ${short} belongs to ${stored.cellId}, not to task ${entry.taskId} of this site.`,'mismatch');
    const ref=entry.run;
    if(ref){
      if(ref.site.appVersion!==app.version)throw new SiteRunError(`Result ${short} was saved by version ${ref.site.appVersion} of this site; this is version ${app.version}.`,'mismatch');
      const expected=await siteSourceSha256({appId:app.id,appVersion:app.version,taskId:entry.taskId,model:ref.model,modelVersion:ref.modelVersion,inputHash:ref.inputHash});
      if(stored.sourceSha256!==expected||entry.sourceSha256!==expected)throw new SiteRunError(`Result ${short} does not match its run reference (model, version or inputs); it is not shown.`,'mismatch');
    }
    const run=stored.run;
    if(!run||(ref&&(run.runId!==ref.runId||run.inputHash!==ref.inputHash)))throw new SiteRunError(`Result ${short} carries no matching run reference.`,'mismatch');
    if(stored.artifact.provenance.runId!==undefined&&stored.artifact.provenance.runId!==run.runId)throw new SiteRunError(`The artifact in ${short} belongs to ${stored.artifact.provenance.runId}, not ${run.runId}.`,'mismatch');
    return {entry,resultSha256:entry.resultSha256,artifact:stored.artifact,run,finishedAt:stored.finishedAt};
  }
}

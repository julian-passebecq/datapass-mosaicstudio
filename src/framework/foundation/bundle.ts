/** Provenance export bundle `datapass.bundle` v1 (status `candidate`, F208).
 *
 * One JSON document that carries a file set as exact strings: `artifacts/<id>.json`, `runs.json` (run references),
 * `inputs.json` (captured input values), `lineage.json` (lineage as the producers declared it) and `SHA256SUMS`.
 * Every hash is the SHA-256 of a file's exact UTF-8 text as embedded; nothing is re-serialized to hash, so the
 * TypeScript validator here and py/datapass_bundle.py report identical hashes for the same bundle.
 *
 * A bundle is data only: importing one validates it completely and runs nothing. It is not a release, a signature,
 * verified cloud lineage or access control, and it never carries tokens or workspace secrets: token-shaped keys are
 * refused, and an export refuses any file containing the in-memory runtime token. Captured inputs and result data may
 * be sensitive; the caller shows a sharing notice before export. Pure module: no React, renderer or task execution. */
import {sha256Hex} from '../storage/result-store-client.ts';
import {validateArtifact,ArtifactValidationError,type Artifact} from './artifact.ts';
import type {RunRecord} from './journal.ts';
import type {Scalar} from '../types.ts';

export const BUNDLE_FORMAT='datapass.bundle';
export const BUNDLE_VERSION=1;
export const BUNDLE_STATUS='candidate';
export const BUNDLE_MIME='application/vnd.datapass.bundle+json';
export const BUNDLE_LIMITS=Object.freeze({files:64,fileBytes:2097152,totalBytes:8388608,textBytes:12582912,runs:200,values:100,valueText:4000,title:160,notice:2000});
export const SUMS_PATH='SHA256SUMS';
const JSON_MEDIA='application/json',TEXT_MEDIA='text/plain; charset=utf-8';
const ENVELOPE_KEYS=['format','version','status','title','createdAt','notice','files'];
const FILE_KEYS=['path','mediaType','bytes','sha256','text'];
const PATH=/^(SHA256SUMS|runs\.json|inputs\.json|lineage\.json|artifacts\/[a-z][a-zA-Z0-9_-]{0,79}\.json)$/;
const SHA=/^[0-9a-f]{64}$/;
const ID=/^[a-z][a-zA-Z0-9_-]{0,79}$/;
const RUN_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const VALUE_KEY=/^[A-Za-z_][A-Za-z0-9_-]{0,79}$/;
const TIME=/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LONE_SURROGATE=/\p{Cs}/u;
/** Keys that name a credential: the key, lowercased with `-`/`_` removed, ends with one of these words
 *  (`token`, `accessToken`, `runtime_token`, `apiKey` are refused; `tokenCount` is not). */
const SECRET_KEY=/(token|secret|password|passwd|apikey|authorization|cookie|credential|credentials|privatekey)$/;
export const OUTCOMES=['succeeded','failed','cancelled','superseded','timed-out','unobserved'] as const;
export type BundleOutcome=typeof OUTCOMES[number];
export const BUNDLE_NOTE_INPUTS='Captured input values as the run recorded them. They may be sensitive; review before sharing.';
export const BUNDLE_NOTE_LINEAGE='Declared by the producers; MosaicStudio did not observe or rerun these computations.';
export const BUNDLE_NOTICE='Contains captured inputs and result data. Exported deliberately after a sharing review. Not a signature, release or verified lineage.';

export type BundleCode='DP-BUN-001'|'DP-BUN-002'|'DP-BUN-003'|'DP-BUN-004'|'DP-BUN-005'|'DP-BUN-006'|'DP-BUN-007'|'DP-BUN-008'|'DP-BUN-009'|'DP-BUN-010';
export type BundleGate='envelope'|'files'|'hashes'|'members'|'secrets';
/** `where` is the bundle file the rule refused ('' for the envelope, `/files/<i>` when the path itself is invalid). */
export class BundleError extends Error{
  readonly code:BundleCode;readonly gate:BundleGate;readonly where:string;readonly artifactCode?:string;
  constructor(code:BundleCode,gate:BundleGate,where:string,message:string,artifactCode?:string){
    super(message);this.name='BundleError';this.code=code;this.gate=gate;this.where=where;if(artifactCode)this.artifactCode=artifactCode;
  }
}
const fail=(code:BundleCode,gate:BundleGate,where:string,message:string,artifactCode?:string):never=>{throw new BundleError(code,gate,where,message,artifactCode);};

export type BundleFile={path:string;mediaType:string;bytes:number;sha256:string;text:string};
export type BundleDocument={format:typeof BUNDLE_FORMAT;version:1;status:typeof BUNDLE_STATUS;title:string;createdAt:string;notice:string;files:BundleFile[]};
export type BundleRun={runId:string;taskId:string;appId:string;appVersion:string;model:{id:string;version:string;provider:string};
  outcome:BundleOutcome;startedAt:string|null;finishedAt:string|null;artifact:{id:string;path:string;sha256:string}|null;resultSha256:string|null};
export type BundleLineage={id:string;path:string;sha256:string;kind:Artifact['provenance']['kind'];source:string;runId:string|null;inputHash:string|null;dependsOn:string[]};
export type ValidatedBundle={bundleSha256:string;title:string;createdAt:string;files:{path:string;sha256:string;bytes:number}[];
  artifacts:{path:string;sha256:string;artifact:Artifact}[];runs:BundleRun[];inputs:{runId:string;values:Record<string,Scalar>}[];lineage:BundleLineage[]};
export type BundleDecision=({ok:true}&Pick<ValidatedBundle,'bundleSha256'|'files'>)|{ok:false;code:BundleCode;gate:BundleGate;where:string;message:string;artifactCode?:string};

const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const utf8Bytes=(text:string)=>new TextEncoder().encode(text).byteLength;
const exactKeys=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const validTime=(v:unknown):v is string=>typeof v==='string'&&TIME.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString()===v;
const shortText=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&[...v].length<=max&&!LONE_SURROGATE.test(v);
const sumsText=(files:readonly {path:string;sha256:string}[])=>files.filter(f=>f.path!==SUMS_PATH).map(f=>f.path).sort().map(path=>files.find(f=>f.path===path)!.sha256+'  '+path+'\n').join('');
const mediaFor=(path:string)=>path===SUMS_PATH?TEXT_MEDIA:JSON_MEDIA;

/** Every key of every object, recursively (arrays included). */
function* keysOf(value:unknown):Generator<string>{
  if(Array.isArray(value)){for(const item of value)yield* keysOf(item);return;}
  if(!isObject(value))return;
  for(const [key,item] of Object.entries(value)){yield key;yield* keysOf(item);}
}
export function isSecretKey(key:string){return SECRET_KEY.test(key.toLowerCase().replace(/[-_]/g,''));}
function scalar(v:unknown){return v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&[...v].length<=BUNDLE_LIMITS.valueText;}
function nullableTime(v:unknown){return v===null||validTime(v);}

function checkRuns(doc:unknown):BundleRun[]{
  const bad=(m:string)=>fail('DP-BUN-006','members','runs.json','runs.json: '+m);
  if(!isObject(doc)||!exactKeys(doc,['format','version','runs'])||doc.format!=='datapass.bundle-runs'||doc.version!==1||!Array.isArray(doc.runs)||doc.runs.length>BUNDLE_LIMITS.runs)return bad('expected {format:"datapass.bundle-runs",version:1,runs:[...]}');
  for(const run of doc.runs){
    if(!isObject(run)||!exactKeys(run,['runId','taskId','appId','appVersion','model','outcome','startedAt','finishedAt','artifact','resultSha256']))bad('invalid run entry');
    const r=run as Record<string,unknown>;
    if(typeof r.runId!=='string'||!RUN_ID.test(r.runId)||typeof r.taskId!=='string'||!ID.test(r.taskId)||typeof r.appId!=='string'||!ID.test(r.appId)||!shortText(r.appVersion,80))bad('invalid run identity');
    const m=r.model;if(!isObject(m)||!exactKeys(m,['id','version','provider'])||typeof m.id!=='string'||!ID.test(m.id)||!shortText(m.version,80)||typeof m.provider!=='string'||!ID.test(m.provider))bad('invalid declared model');
    if(typeof r.outcome!=='string'||!(OUTCOMES as readonly string[]).includes(r.outcome)||!nullableTime(r.startedAt)||!nullableTime(r.finishedAt))bad('invalid outcome or time');
    if(r.outcome==='unobserved'&&r.finishedAt!==null)bad('an unobserved run has no observed finish');
    const a=r.artifact;if(a!==null&&(!isObject(a)||!exactKeys(a,['id','path','sha256'])||typeof a.id!=='string'||!ID.test(a.id)||typeof a.path!=='string'||typeof a.sha256!=='string'||!SHA.test(a.sha256)))bad('invalid artifact reference');
    if(r.resultSha256!==null&&(typeof r.resultSha256!=='string'||!SHA.test(r.resultSha256)))bad('invalid result hash');
  }
  return doc.runs as BundleRun[];
}
function checkInputs(doc:unknown){
  const bad=(m:string)=>fail('DP-BUN-006','members','inputs.json','inputs.json: '+m);
  if(!isObject(doc)||!exactKeys(doc,['format','version','note','runs'])||doc.format!=='datapass.bundle-inputs'||doc.version!==1||!shortText(doc.note,BUNDLE_LIMITS.notice)||!Array.isArray(doc.runs)||doc.runs.length>BUNDLE_LIMITS.runs)return bad('expected {format:"datapass.bundle-inputs",version:1,note,runs:[...]}');
  for(const entry of doc.runs){
    if(!isObject(entry)||!exactKeys(entry,['runId','values'])||typeof entry.runId!=='string'||!RUN_ID.test(entry.runId)||!isObject(entry.values))bad('invalid input set');
    const values=(entry as {values:Record<string,unknown>}).values;
    if(Object.keys(values).length>BUNDLE_LIMITS.values||Object.entries(values).some(([k,v])=>!VALUE_KEY.test(k)||!scalar(v)))bad('invalid input value');
  }
  return doc.runs as {runId:string;values:Record<string,Scalar>}[];
}
function checkLineage(doc:unknown):BundleLineage[]{
  const bad=(m:string)=>fail('DP-BUN-006','members','lineage.json','lineage.json: '+m);
  if(!isObject(doc)||!exactKeys(doc,['format','version','note','artifacts'])||doc.format!=='datapass.bundle-lineage'||doc.version!==1||!shortText(doc.note,BUNDLE_LIMITS.notice)||!Array.isArray(doc.artifacts))return bad('expected {format:"datapass.bundle-lineage",version:1,note,artifacts:[...]}');
  for(const e of doc.artifacts){
    if(!isObject(e)||!exactKeys(e,['id','path','sha256','kind','source','runId','inputHash','dependsOn']))bad('invalid lineage entry');
    const l=e as Record<string,unknown>;
    if(typeof l.id!=='string'||!ID.test(l.id)||typeof l.path!=='string'||typeof l.sha256!=='string'||!SHA.test(l.sha256)||typeof l.kind!=='string'||!['synthetic','provided','computed'].includes(l.kind)||typeof l.source!=='string')bad('invalid lineage identity');
    if(!(l.runId===null||typeof l.runId==='string')||!(l.inputHash===null||typeof l.inputHash==='string')||!Array.isArray(l.dependsOn)||l.dependsOn.some(d=>typeof d!=='string'))bad('invalid declared lineage');
  }
  return doc.artifacts as BundleLineage[];
}

/** Validate a parsed bundle completely, in a fixed rule order shared with py/datapass_bundle.py. Throws BundleError. */
export async function validateBundle(value:unknown):Promise<ValidatedBundle>{
  // 1. Envelope.
  if(!isObject(value)||!exactKeys(value,ENVELOPE_KEYS))fail('DP-BUN-001','envelope','','bundle: expected exactly '+ENVELOPE_KEYS.join(', '));
  const doc=value as Record<string,unknown>;
  if(doc.format!==BUNDLE_FORMAT||doc.version!==BUNDLE_VERSION||doc.status!==BUNDLE_STATUS)fail('DP-BUN-001','envelope','','bundle: unsupported format, version or status (datapass.bundle v1, candidate)');
  if(!shortText(doc.title,BUNDLE_LIMITS.title)||!validTime(doc.createdAt)||!shortText(doc.notice,BUNDLE_LIMITS.notice))fail('DP-BUN-001','envelope','','bundle: invalid title, createdAt or notice');
  if(!Array.isArray(doc.files)||doc.files.length<2||doc.files.length>BUNDLE_LIMITS.files)fail('DP-BUN-001','envelope','','bundle: files must hold 2 to '+BUNDLE_LIMITS.files+' entries');
  // 2. File entries.
  const files=doc.files as unknown[],seen=new Set<string>();let total=0;
  files.forEach((f,i)=>{
    const at='/files/'+i;
    if(!isObject(f)||!exactKeys(f,FILE_KEYS))fail('DP-BUN-002','files',at,at+': expected exactly '+FILE_KEYS.join(', '));
    const e=f as Record<string,unknown>;
    if(typeof e.path!=='string'||!PATH.test(e.path))fail('DP-BUN-002','files',at,at+': unknown file path');
    const path=e.path as string;
    if(seen.has(path))fail('DP-BUN-002','files',path,path+': duplicate path');
    seen.add(path);
    if(e.mediaType!==mediaFor(path))fail('DP-BUN-002','files',path,path+': media type must be '+mediaFor(path));
    if(typeof e.text!=='string'||LONE_SURROGATE.test(e.text))fail('DP-BUN-002','files',path,path+': text must be a well-formed UTF-8 string');
    if(typeof e.bytes!=='number'||!Number.isInteger(e.bytes)||e.bytes<0||typeof e.sha256!=='string'||!SHA.test(e.sha256))fail('DP-BUN-002','files',path,path+': bytes must be an integer and sha256 64 lowercase hex digits');
    const bytes=utf8Bytes(e.text as string);total+=bytes;
    if(bytes>BUNDLE_LIMITS.fileBytes||total>BUNDLE_LIMITS.totalBytes)fail('DP-BUN-002','files',path,path+': file or bundle byte budget exceeded');
  });
  const entries=files as BundleFile[];
  // 3. Hashes over the exact embedded text.
  for(const f of entries){
    const sha=await sha256Hex(f.text);
    if(sha!==f.sha256||utf8Bytes(f.text)!==f.bytes)fail('DP-BUN-003','hashes',f.path,f.path+': declared sha256/bytes do not match the embedded text');
  }
  const sums=entries.find(f=>f.path===SUMS_PATH);
  if(!sums||sums.text!==sumsText(entries))fail('DP-BUN-004','hashes',SUMS_PATH,'SHA256SUMS is missing or does not list exactly the other files');
  // 4. Members.
  const byPath=new Map(entries.map(f=>[f.path,f]));
  for(const name of ['runs.json','inputs.json','lineage.json'])if(!byPath.has(name))fail('DP-BUN-005','members',name,name+' is missing');
  const artifactFiles=entries.filter(f=>f.path.startsWith('artifacts/')).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  if(!artifactFiles.length)fail('DP-BUN-005','members','artifacts/','a bundle carries at least one artifact');
  const parsed=new Map<string,unknown>();
  for(const name of ['runs.json','inputs.json','lineage.json']){
    try{parsed.set(name,JSON.parse(byPath.get(name)!.text));}catch{fail('DP-BUN-006','members',name,name+': not JSON');}
  }
  for(const f of artifactFiles){
    try{parsed.set(f.path,JSON.parse(f.text));}catch{fail('DP-BUN-007','members',f.path,f.path+': not JSON','DP-ART-001');}
  }
  // 5. Secret-shaped keys anywhere in a JSON member.
  for(const [name,json] of [...parsed.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    for(const key of keysOf(json))if(isSecretKey(key))fail('DP-BUN-009','secrets',name,name+': token-shaped key "'+key+'" is not allowed in a bundle');
  }
  const runs=checkRuns(parsed.get('runs.json')),inputs=checkInputs(parsed.get('inputs.json')),lineage=checkLineage(parsed.get('lineage.json'));
  const artifacts:ValidatedBundle['artifacts']=[];
  for(const f of artifactFiles){
    let artifact:Artifact;
    try{artifact=validateArtifact(parsed.get(f.path));}
    catch(error){fail('DP-BUN-007','members',f.path,f.path+': '+(error as Error).message,error instanceof ArtifactValidationError?error.code:undefined);}
    if('artifacts/'+artifact!.id+'.json'!==f.path)fail('DP-BUN-007','members',f.path,f.path+': file name must be the artifact id');
    artifacts.push({path:f.path,sha256:f.sha256,artifact:artifact!});
  }
  // 6. References.
  const broken=(where:string,m:string)=>fail('DP-BUN-008','members',where,where+': '+m);
  const runIds=new Set<string>();
  for(const r of runs){
    if(runIds.has(r.runId))broken('runs.json','duplicate run '+r.runId);
    runIds.add(r.runId);
    if(r.artifact){const f=artifacts.find(a=>a.path===r.artifact!.path);if(!f||f.artifact.id!==r.artifact.id||f.sha256!==r.artifact.sha256)broken('runs.json','run '+r.runId+' names an artifact the bundle does not hold');}
  }
  const inputIds=new Set<string>();
  for(const i of inputs){if(!runIds.has(i.runId)||inputIds.has(i.runId))broken('inputs.json','input set for unknown or repeated run '+i.runId);inputIds.add(i.runId);}
  if(inputIds.size!==runIds.size)broken('inputs.json','every run needs exactly one captured input set');
  if(lineage.length!==artifacts.length)broken('lineage.json','every artifact needs exactly one lineage entry');
  for(const l of lineage){
    const f=artifacts.find(a=>a.path===l.path);
    if(!f||f.artifact.id!==l.id||f.sha256!==l.sha256)broken('lineage.json','lineage names an artifact the bundle does not hold: '+l.path);
    const p=f!.artifact.provenance;
    if(l.kind!==p.kind||l.source!==p.source||l.runId!==(p.runId??null)||l.inputHash!==(p.inputHash??null)||JSON.stringify(l.dependsOn)!==JSON.stringify(p.dependsOn??[]))broken('lineage.json','lineage of '+l.id+' differs from what the artifact declares');
  }
  if(new Set(lineage.map(l=>l.path)).size!==lineage.length)broken('lineage.json','repeated lineage entry');
  return {bundleSha256:await sha256Hex(sums!.text),title:doc.title as string,createdAt:doc.createdAt as string,
    files:entries.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),artifacts,runs,inputs,lineage};
}

/** Bounded parse of a bundle file's text, then validateBundle. */
export async function readBundleText(text:string):Promise<ValidatedBundle>{
  if(typeof text!=='string'||utf8Bytes(text)>BUNDLE_LIMITS.textBytes)fail('DP-BUN-001','envelope','','bundle: the file exceeds '+BUNDLE_LIMITS.textBytes+' bytes');
  let value:unknown;
  try{value=JSON.parse(text);}catch{return fail('DP-BUN-001','envelope','','bundle: not JSON');}
  return validateBundle(value);
}
/** Non-throwing decision (mirror of datapass_bundle.decide). */
export async function bundleDecision(text:string):Promise<BundleDecision>{
  try{const b=await readBundleText(text);return {ok:true,bundleSha256:b.bundleSha256,files:b.files};}
  catch(error){
    if(!(error instanceof BundleError))throw error;
    return {ok:false,code:error.code,gate:error.gate,where:error.where,message:error.message,...(error.artifactCode?{artifactCode:error.artifactCode}:{})};
  }
}
/** Cheap sniff used by file viewers to route a document to the bundle validator. */
export function looksLikeBundle(value:unknown){return isObject(value)&&value.format===BUNDLE_FORMAT;}

export type BundleRunInput={runId:string;taskId:string;appId:string;appVersion:string;model:{id:string;version:string;provider:string};
  outcome:BundleOutcome;startedAt:string|null;finishedAt:string|null;values:Readonly<Record<string,Scalar>>;
  /** Id of the artifact (among `artifacts`) this run produced, or null. */
  artifactId:string|null;
  /** ResultStore hash when the run's result was saved durably (F206), else null. */
  resultSha256?:string|null};
export type BundleInput={title:string;createdAt?:string;notice?:string;
  /** Exact artifact texts. Each is embedded and hashed byte for byte; it is validated, never re-serialized. */
  artifacts:readonly {text:string}[];runs?:readonly BundleRunInput[];
  /** In-memory secrets (e.g. the runtime token). No file may contain any of them. Never written anywhere. */
  secrets?:readonly (string|null|undefined)[]};
export type ExportedBundle={text:string;fileName:string;bundleSha256:string;files:{path:string;sha256:string;bytes:number}[]};

const pretty=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
async function fileOf(path:string,text:string):Promise<BundleFile>{return {path,mediaType:mediaFor(path),bytes:utf8Bytes(text),sha256:await sha256Hex(text),text};}

/** Build one bundle. Refuses (BundleError) rather than redacting: a secret or invalid member stops the whole export. */
export async function exportBundle(input:BundleInput):Promise<ExportedBundle>{
  const secrets=(input.secrets??[]).filter((s):s is string=>typeof s==='string'&&s.length>0);
  const artifactFiles:BundleFile[]=[],byId=new Map<string,BundleFile>(),artifacts:Artifact[]=[];
  for(const {text} of input.artifacts){
    let artifact:Artifact;
    try{artifact=validateArtifact(JSON.parse(text));}
    catch(error){return fail('DP-BUN-007','members','artifacts/','artifact not exportable: '+(error as Error).message,error instanceof ArtifactValidationError?error.code:undefined);}
    if(byId.has(artifact.id))fail('DP-BUN-007','members','artifacts/'+artifact.id+'.json','two artifacts share the id '+artifact.id);
    const file=await fileOf('artifacts/'+artifact.id+'.json',text);artifactFiles.push(file);byId.set(artifact.id,file);artifacts.push(artifact);
  }
  const runs=input.runs??[];
  const runsDoc={format:'datapass.bundle-runs',version:1,runs:runs.map(r=>{
    const file=r.artifactId===null?null:byId.get(r.artifactId);
    if(file===undefined)fail('DP-BUN-008','members','runs.json','run '+r.runId+' names an artifact that is not exported');
    return {runId:r.runId,taskId:r.taskId,appId:r.appId,appVersion:r.appVersion,model:{id:r.model.id,version:r.model.version,provider:r.model.provider},outcome:r.outcome,startedAt:r.startedAt,finishedAt:r.finishedAt,
      artifact:file?{id:r.artifactId!,path:file.path,sha256:file.sha256}:null,resultSha256:r.resultSha256??null};
  })};
  const inputsDoc={format:'datapass.bundle-inputs',version:1,note:BUNDLE_NOTE_INPUTS,runs:runs.map(r=>({runId:r.runId,values:{...r.values}}))};
  const lineageDoc={format:'datapass.bundle-lineage',version:1,note:BUNDLE_NOTE_LINEAGE,artifacts:artifacts.map(a=>{const f=byId.get(a.id)!,p=a.provenance;
    return {id:a.id,path:f.path,sha256:f.sha256,kind:p.kind,source:p.source,runId:p.runId??null,inputHash:p.inputHash??null,dependsOn:[...(p.dependsOn??[])]};})};
  const members=[...artifactFiles,await fileOf('runs.json',pretty(runsDoc)),await fileOf('inputs.json',pretty(inputsDoc)),await fileOf('lineage.json',pretty(lineageDoc))].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const files=[...members,await fileOf(SUMS_PATH,sumsText(members))];
  const doc:BundleDocument={format:BUNDLE_FORMAT,version:1,status:BUNDLE_STATUS,title:input.title,createdAt:input.createdAt??new Date().toISOString(),notice:input.notice??BUNDLE_NOTICE,files};
  const text=pretty(doc);
  // The runtime token must never leave memory: refuse the export when any byte sequence of the bundle equals it.
  for(const secret of secrets)if(text.includes(secret)||files.some(f=>f.text.includes(secret)))fail('DP-BUN-010','secrets',files.find(f=>f.text.includes(secret))?.path??'','the bundle would contain the in-memory runtime token; nothing was exported');
  const checked=await readBundleText(text);
  const slug=input.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'bundle';
  return {text,fileName:slug+'.datapass-bundle.json',bundleSha256:checked.bundleSha256,files:checked.files};
}

/** Run inputs for the bundle from retained journal records (succeeded runs with a kept artifact). */
export function bundleFromRecords(records:readonly RunRecord[]):{artifacts:{text:string}[];runs:BundleRunInput[]}{
  const kept=records.filter(r=>r.status==='succeeded'&&r.retention==='retained'&&r.artifact);
  return {artifacts:kept.map(r=>({text:JSON.stringify(r.artifact,null,2)})),
    runs:kept.map(r=>({runId:r.id,taskId:r.taskId,appId:r.appId,appVersion:r.appVersion,model:{id:r.modelId,version:r.modelVersion,provider:r.providerId},
      outcome:r.status as BundleOutcome,startedAt:r.startedAt,finishedAt:r.finishedAt,values:r.parameters,artifactId:r.artifact!.id}))};
}

/** StorageAdapter tier 3 (F204 BundlePort): a bundle exported as its file set (each file's exact UTF-8 bytes). */
export function bundlePort(){
  const decoder=new TextDecoder('utf-8',{fatal:true}),encoder=new TextEncoder();
  return Object.freeze({format:BUNDLE_FORMAT,version:BUNDLE_VERSION,
    async exportBundle(input:unknown){
      const exported=await exportBundle(input as BundleInput),doc=JSON.parse(exported.text) as BundleDocument;
      return doc.files.map(f=>({path:f.path,bytes:encoder.encode(f.text),sha256:f.sha256}));
    },
    async importBundle(entries:readonly {path:string;bytes:Uint8Array;sha256:string}[]){
      const files=entries.map(e=>{let text:string;try{text=decoder.decode(e.bytes);}catch{return fail('DP-BUN-002','files',e.path,e.path+': not UTF-8');}
        return {path:e.path,mediaType:mediaFor(e.path),bytes:e.bytes.byteLength,sha256:e.sha256,text};});
      return validateBundle({format:BUNDLE_FORMAT,version:BUNDLE_VERSION,status:BUNDLE_STATUS,title:'Imported file set',createdAt:new Date().toISOString(),notice:BUNDLE_NOTICE,files});
    }});
}

const SHA_SCHEMA={type:'string',pattern:'^[0-9a-f]{64}$'};
const TIME_SCHEMA={type:'string',pattern:TIME.source};
const NULLABLE=(schema:object)=>({anyOf:[schema,{type:'null'}]});
/** Published as spec/bundle/v1/bundle.schema.json (npm run contracts). Structure only: hashes, SHA256SUMS, member
 *  parsing and cross-references are checked by validateBundle and py/datapass_bundle.py (docs/DIAGNOSTIC_CODES.md, DP-BUN). */
export const bundleSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/bundle/v1/bundle.schema.json',
  title:'datapass.bundle v1 (candidate)',
  description:'One JSON document carrying a provenance file set as exact strings. sha256 is the SHA-256 of the exact UTF-8 text; SHA256SUMS lists every other file as "<sha256>  <path>" sorted by path, and its own SHA-256 identifies the bundle. Members runs.json, inputs.json and lineage.json follow $defs. Not a signature, release or verified lineage; never carries tokens.',
  type:'object',additionalProperties:false,required:[...ENVELOPE_KEYS],
  properties:{
    format:{const:BUNDLE_FORMAT},version:{const:BUNDLE_VERSION},status:{const:BUNDLE_STATUS},
    title:{type:'string',minLength:1,maxLength:BUNDLE_LIMITS.title},createdAt:TIME_SCHEMA,notice:{type:'string',minLength:1,maxLength:BUNDLE_LIMITS.notice},
    files:{type:'array',minItems:2,maxItems:BUNDLE_LIMITS.files,items:{type:'object',additionalProperties:false,required:[...FILE_KEYS],properties:{
      path:{type:'string',pattern:PATH.source},mediaType:{enum:[JSON_MEDIA,TEXT_MEDIA]},bytes:{type:'integer',minimum:0,maximum:BUNDLE_LIMITS.fileBytes},sha256:SHA_SCHEMA,text:{type:'string'}}}},
  },
  $defs:{
    runs:{type:'object',additionalProperties:false,required:['format','version','runs'],properties:{format:{const:'datapass.bundle-runs'},version:{const:1},runs:{type:'array',maxItems:BUNDLE_LIMITS.runs,items:{
      type:'object',additionalProperties:false,required:['runId','taskId','appId','appVersion','model','outcome','startedAt','finishedAt','artifact','resultSha256'],properties:{
        runId:{type:'string',pattern:RUN_ID.source},taskId:{type:'string',pattern:ID.source},appId:{type:'string',pattern:ID.source},appVersion:{type:'string',minLength:1,maxLength:80},
        model:{type:'object',additionalProperties:false,required:['id','version','provider'],properties:{id:{type:'string',pattern:ID.source},version:{type:'string',minLength:1,maxLength:80},provider:{type:'string',pattern:ID.source}}},
        outcome:{enum:[...OUTCOMES]},startedAt:NULLABLE(TIME_SCHEMA),finishedAt:NULLABLE(TIME_SCHEMA),
        artifact:NULLABLE({type:'object',additionalProperties:false,required:['id','path','sha256'],properties:{id:{type:'string',pattern:ID.source},path:{type:'string'},sha256:SHA_SCHEMA}}),
        resultSha256:NULLABLE(SHA_SCHEMA)}}}}},
    inputs:{type:'object',additionalProperties:false,required:['format','version','note','runs'],properties:{format:{const:'datapass.bundle-inputs'},version:{const:1},note:{type:'string',minLength:1},runs:{type:'array',maxItems:BUNDLE_LIMITS.runs,items:{
      type:'object',additionalProperties:false,required:['runId','values'],properties:{runId:{type:'string',pattern:RUN_ID.source},values:{type:'object',maxProperties:BUNDLE_LIMITS.values,propertyNames:{pattern:VALUE_KEY.source},
        additionalProperties:{anyOf:[{type:'null'},{type:'boolean'},{type:'number'},{type:'string',maxLength:BUNDLE_LIMITS.valueText}]}}}}}}},
    lineage:{type:'object',additionalProperties:false,required:['format','version','note','artifacts'],properties:{format:{const:'datapass.bundle-lineage'},version:{const:1},note:{type:'string',minLength:1},artifacts:{type:'array',items:{
      type:'object',additionalProperties:false,required:['id','path','sha256','kind','source','runId','inputHash','dependsOn'],properties:{
        id:{type:'string',pattern:ID.source},path:{type:'string'},sha256:SHA_SCHEMA,kind:{enum:['synthetic','provided','computed']},source:{type:'string'},
        runId:NULLABLE({type:'string'}),inputHash:NULLABLE({type:'string'}),dependsOn:{type:'array',items:{type:'string'}}}}}}},
  },
};

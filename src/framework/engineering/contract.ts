/** `datapass.engineering/1`: the frozen sidecar contract for engineering records (artifact references, run receipts,
 *  selection bindings, presentation-only approval requests and parameter diffs). It REFERENCES the existing
 *  `datapass.artifact/1`, `datapass.runtime/1` and `datapass.bundle` records; it never changes them.
 *
 *  This file is SELF-CONTAINED on purpose (no imports, no zod, no React): consumers on an older framework snapshot copy
 *  it verbatim with spec/engineering/v1/engineering.schema.json and the corpus tests/fixtures/engineering at a pinned
 *  commit (spec/engineering/v1/README.md, "Vendoring"). py/datapass_engineering.py mirrors every decision and code.
 *
 *  Canonical JSON `datapass-c14n/1` = RFC 8785 JCS: object keys sorted by UTF-16 code units, UTF-8 output, numbers in
 *  ECMAScript Number-to-String form (-0 is written 0), NaN/Infinity and non-plain values refused. A digest is SHA-256
 *  over either the exact bytes or those canonical bytes, and always names which. */

export const ENGINEERING_FORMAT='datapass.engineering';
export const ENGINEERING_VERSION=1;
export const ENGINEERING_CONTRACT='datapass.engineering/1';
export const C14N='datapass-c14n/1';
export const ENGINEERING_KINDS=Object.freeze(['artifact-ref','run-receipt','selection-binding','approval-request','parameter-diff'] as const);
export const RUN_STATUSES=Object.freeze(['queued','running','succeeded','failed','cancelled'] as const);
export const BINDING_STATUSES=Object.freeze(['sourced','inferred','unmapped'] as const);
export const ENGINEERING_LIMITS=Object.freeze({textBytes:1048576,depth:32,list:1000,checks:200,artifacts:200,diagnostics:200,bindings:500,consumedBy:100});
/** Keys that would turn an approval request into an approval record. Studio never issues or stores approvals. */
export const APPROVAL_STATE_KEYS=Object.freeze(['approval','approvalStatus','approval_status','approved','approvedAt','approvedBy','authorization','decidedAt','decision','grant','granted','signature','status','token']);

export type EngineeringKind=typeof ENGINEERING_KINDS[number];
export type RunStatus=typeof RUN_STATUSES[number];
export type BindingStatus=typeof BINDING_STATUSES[number];
export type Digest={alg:'sha256';over:'bytes'|'datapass-c14n/1';value:string};
type Envelope<K extends EngineeringKind>={format:'datapass.engineering';version:1;kind:K};
export type ArtifactRef=Envelope<'artifact-ref'>&{id:string;sha256:string;mediaType:string;bytes:number;scope:'public'|'private';locator?:string};
export type RunReceipt=Envelope<'run-receipt'>&{runId:string;inputDigest:Digest;code:{version:string;commit?:string};
  model:{id:string;version:string;resolved?:string|null;reason?:string};status:RunStatus;cancelRequested:boolean;
  times:{submittedAt:string;startedAt:string|null;finishedAt:string|null};checks:{performed:string[];notPerformed:string[]};
  coverage:{consumed:string[];ignored:string[];fixed:string[]};artifacts:ArtifactRef[];diagnostics:{code:string;severity:'info'|'warning'|'error';message:string}[]};
export type Binding={signal:string;entityId:string|null;status:BindingStatus;source?:string};
export type SelectionBinding=Envelope<'selection-binding'>&{entityId:string;geometryRevision:Digest;viewToken:string;bindings:Binding[];timeCursor?:number};
export type ApprovalRequest=Envelope<'approval-request'>&{purpose:string;baseRevision:Digest;proposalDigest:Digest;requester:string;endpointHint:string;presentationOnly:true};
export type ScalarValue=string|number|boolean|null;
export type ParameterChange={id:string;unit:string;from:ScalarValue;to:ScalarValue;consumedBy:string[]};
export type ParameterDiff=Envelope<'parameter-diff'>&{baseRevision:Digest;changes:ParameterChange[]};
export type EngineeringRecord=ArtifactRef|RunReceipt|SelectionBinding|ApprovalRequest|ParameterDiff;

/** rule -> [code, gate]. Stable: a code is never renumbered or reused. Mirrored by ENGINEERING_CODES in Python. */
export const ENGINEERING_CODES=Object.freeze({
  'engineering-envelope':['DP-ENG-001','envelope'],
  'format':['DP-ENG-002','envelope'],
  'version':['DP-ENG-003','envelope'],
  'kind':['DP-ENG-004','envelope'],
  'unknown-key':['DP-ENG-005','structure'],
  'missing-key':['DP-ENG-006','structure'],
  'field-invalid':['DP-ENG-007','structure'],
  'digest':['DP-ENG-008','structure'],
  'duplicate-id':['DP-ENG-009','semantic'],
  'run-status':['DP-ENG-010','semantic'],
  'model-resolution':['DP-ENG-011','semantic'],
  'disjoint-lists':['DP-ENG-012','semantic'],
  'binding-status':['DP-ENG-013','semantic'],
  'approval-state':['DP-ENG-014','semantic'],
  'diff-change':['DP-ENG-015','semantic'],
  'c14n-value':['DP-ENG-016','c14n'],
} as const);
export type EngineeringRule=keyof typeof ENGINEERING_CODES;
export type EngineeringCode=typeof ENGINEERING_CODES[EngineeringRule][0];
/** One-line meaning per rule (docs/DIAGNOSTIC_CODES.md, docs/contracts/diagnostic-codes.json). */
export const ENGINEERING_SUMMARIES:Readonly<Record<EngineeringRule,string>>=Object.freeze({
  'engineering-envelope':'The record is not one bounded, inert JSON object (not JSON, not an object, over 1 MiB or 32 levels, non-finite number, lone surrogate).',
  'format':'format is not datapass.engineering.',
  'version':'version is not 1.',
  'kind':'kind is not one of artifact-ref, run-receipt, selection-binding, approval-request, parameter-diff.',
  'unknown-key':'An object in the record has a key its kind does not define.',
  'missing-key':'An object in the record lacks a required key.',
  'field-invalid':'A field has the wrong JSON type, pattern, range or list length.',
  'digest':'A digest is not {alg: sha256, over: bytes | datapass-c14n/1, value: 64 lowercase hex} or an artifact sha256 is not 64 lowercase hex.',
  'duplicate-id':'An id, signal, check or parameter appears twice in the same list.',
  'run-status':'Run status, timestamps and cancelRequested contradict each other (order, missing start/finish, cancelled without a request).',
  'model-resolution':'model.resolved is null without a reason, or a reason is given while the resolved model is known or absent.',
  'disjoint-lists':'A check is both performed and not performed, or a parameter is in more than one coverage list.',
  'binding-status':'A binding status contradicts its fields (unmapped with an entity or source, sourced without both, inferred without an entity).',
  'approval-state':'An approval request carries approval state or presentationOnly is not true: Studio never issues or stores approvals.',
  'diff-change':'A parameter change is a no-op (from equals to, or both null) or changes the value type.',
  'c14n-value':'datapass-c14n/1 refused a value: NaN, Infinity, a lone surrogate, undefined, a function or a non-plain object.',
});

export class EngineeringError extends Error{
  readonly code:EngineeringCode;readonly rule:EngineeringRule;readonly gate:string;readonly where:string;
  constructor(rule:EngineeringRule,where:string,message:string){
    super((where||'/')+': '+message);this.name='EngineeringError';this.rule=rule;this.code=ENGINEERING_CODES[rule][0];this.gate=ENGINEERING_CODES[rule][1];this.where=where;
  }
}
const fail=(rule:EngineeringRule,where:string,message:string):never=>{throw new EngineeringError(rule,where,message);};

// ---------------------------------------------------------------------------------------------------------------- c14n
const LONE_SURROGATE=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function isPlainObject(v:unknown):v is Record<string,unknown>{
  if(v===null||typeof v!=='object'||Array.isArray(v))return false;
  const proto=Object.getPrototypeOf(v);return proto===Object.prototype||proto===null;
}
function c14nString(s:string,where:string):string{
  if(LONE_SURROGATE.test(s))fail('c14n-value',where,'a string holds a lone surrogate');
  let out='"';
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c===0x22)out+='\\"';else if(c===0x5c)out+='\\\\';
    else if(c<0x20)out+=c===8?'\\b':c===9?'\\t':c===10?'\\n':c===12?'\\f':c===13?'\\r':'\\u'+c.toString(16).padStart(4,'0');
    else out+=s[i];
  }
  return out+'"';
}
function c14nValue(v:unknown,where:string,depth:number):string{
  if(depth>ENGINEERING_LIMITS.depth)fail('c14n-value',where,'nesting exceeds '+ENGINEERING_LIMITS.depth+' levels');
  if(v===null)return 'null';
  if(v===true)return 'true';
  if(v===false)return 'false';
  if(typeof v==='number'){if(!Number.isFinite(v))fail('c14n-value',where,'non-finite number');return String(v);} // String(-0) === '0'
  if(typeof v==='string')return c14nString(v,where);
  if(Array.isArray(v)){
    if(Object.getPrototypeOf(v)!==Array.prototype)fail('c14n-value',where,'not a plain array');
    let out='[';for(let i=0;i<v.length;i++){if(!(i in v))fail('c14n-value',where+'/'+i,'sparse array');out+=(i?',':'')+c14nValue(v[i],where+'/'+i,depth+1);}return out+']';
  }
  if(isPlainObject(v)){
    if(Object.getOwnPropertySymbols(v).length)fail('c14n-value',where,'symbol keys');
    const keys=Object.keys(v).sort(); // default sort compares UTF-16 code units, as RFC 8785 requires
    let out='{';
    keys.forEach((k,i)=>{const p=where+'/'+pointer(k);if(v[k]===undefined)fail('c14n-value',p,'undefined value');out+=(i?',':'')+c14nString(k,p)+':'+c14nValue(v[k],p,depth+1);});
    return out+'}';
  }
  return fail('c14n-value',where,'not a JSON value ('+(typeof v==='object'?Object.prototype.toString.call(v):typeof v)+')');
}
/** `datapass-c14n/1` (RFC 8785 JCS) text of a JSON value. Throws EngineeringError DP-ENG-016 on a value it refuses. */
export function canonicalJson(value:unknown):string{return c14nValue(value,'',1);}
/** UTF-8 bytes of the canonical text. */
export function canonicalBytes(value:unknown):Uint8Array{return utf8(canonicalJson(value));}
function utf8(text:string):Uint8Array{return new TextEncoder().encode(text);}

// -------------------------------------------------------------------------------------------- sha256 (pure, synchronous)
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
/** SHA-256 hex of bytes (or of a string's UTF-8). Pure TypeScript so a vendored copy needs no WebCrypto or node:crypto. */
export function sha256Hex(input:Uint8Array|string):string{
  const bytes=typeof input==='string'?utf8(input):input;
  const bitLength=bytes.length*8,padded=new Uint8Array(((bytes.length+9+63)>>6)<<6);
  padded.set(bytes);padded[bytes.length]=0x80;
  const view=new DataView(padded.buffer);view.setUint32(padded.length-8,Math.floor(bitLength/0x100000000));view.setUint32(padded.length-4,bitLength>>>0);
  const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
  const rotr=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<padded.length;off+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(off+i*4);
    for(let i=16;i<64;i++){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
    let [a,b,c,d,e,f,g,hh]=h;
    for(let i=0;i<64;i++){
      const t1=(hh+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+hh)>>>0;
  }
  return Array.from(h,x=>x.toString(16).padStart(8,'0')).join('');
}
/** Digest of a JSON value over its `datapass-c14n/1` bytes. */
export function digest(value:unknown):Digest{return {alg:'sha256',over:'datapass-c14n/1',value:sha256Hex(canonicalBytes(value))};}
/** Digest of exact bytes (files, artifacts as written): never re-serialized. */
export function bytesDigest(bytes:Uint8Array|string):Digest{return {alg:'sha256',over:'bytes',value:sha256Hex(bytes)};}
/** Same as digest(), through WebCrypto when it is available (large values); falls back to the pure implementation. */
export async function digestAsync(value:unknown):Promise<Digest>{
  const bytes=canonicalBytes(value),subtle=(globalThis as {crypto?:{subtle?:{digest(alg:string,data:ArrayBuffer):Promise<ArrayBuffer>}}}).crypto?.subtle;
  if(!subtle)return {alg:'sha256',over:'datapass-c14n/1',value:sha256Hex(bytes)};
  const out=new Uint8Array(await subtle.digest('SHA-256',bytes.slice().buffer));
  return {alg:'sha256',over:'datapass-c14n/1',value:Array.from(out,b=>b.toString(16).padStart(2,'0')).join('')};
}

// ---------------------------------------------------------------------------------------------------------- validation
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const ARTIFACT_ID=/^[a-z][a-zA-Z0-9_-]{0,79}$/;
const HEX64=/^[0-9a-f]{64}$/;
const COMMIT=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MEDIA_TYPE=/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}(?:; ?[a-z0-9-]{1,32}=[A-Za-z0-9._-]{1,64})?$/;
const VIEW_TOKEN=/^[A-Za-z0-9._~-]{1,128}$/;
const ENDPOINT_HINT=/^\/[A-Za-z0-9._~\/-]{0,255}$/;
const DIAG_CODE=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const TIME=/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const CONTROL=/[\u0000-\u001f\u007f]/;
const MAX_INT=9007199254740991;

function pointer(key:string):string{return key.replace(/~/g,'~0').replace(/\//g,'~1');}
function byteLength(s:string):number{return utf8(s).length;}
function inert(v:unknown,where:string,depth:number):void{
  if(depth>ENGINEERING_LIMITS.depth)fail('engineering-envelope',where,'nesting exceeds '+ENGINEERING_LIMITS.depth+' levels');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){if(!Number.isFinite(v))fail('engineering-envelope',where,'non-finite number');return;}
  if(typeof v==='string'){if(LONE_SURROGATE.test(v))fail('engineering-envelope',where,'lone surrogate');return;}
  if(Array.isArray(v)){v.forEach((x,i)=>inert(x,where+'/'+i,depth+1));return;}
  if(isPlainObject(v)){for(const k of Object.keys(v).sort()){const p=where+'/'+pointer(k);if(LONE_SURROGATE.test(k))fail('engineering-envelope',p,'lone surrogate in a key');inert(v[k],p,depth+1);}return;}
  fail('engineering-envelope',where,'not an inert JSON value');
}
function object(v:unknown,where:string,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!isPlainObject(v))return fail('field-invalid',where,'expected an object');
  const allowed=new Set([...required,...optional]);
  for(const k of Object.keys(v).sort())if(!allowed.has(k))fail('unknown-key',where+'/'+pointer(k),'unknown key');
  for(const k of required)if(!Object.prototype.hasOwnProperty.call(v,k))fail('missing-key',where+'/'+pointer(k),'missing key');
  return v;
}
const has=(o:Record<string,unknown>,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
function id(v:unknown,where:string,pattern:RegExp=ID):string{if(typeof v!=='string'||!pattern.test(v))fail('field-invalid',where,'not a valid identifier');return v as string;}
function text(v:unknown,where:string,max:number):string{if(typeof v!=='string'||v.length===0||byteLength(v)>max)fail('field-invalid',where,'expected text of 1 to '+max+' UTF-8 bytes');return v as string;}
function oneOf<T extends string>(v:unknown,where:string,values:readonly T[]):T{if(typeof v!=='string'||!values.includes(v as T))fail('field-invalid',where,'expected one of '+values.join(', '));return v as T;}
function time(v:unknown,where:string):string{
  if(typeof v!=='string'||!TIME.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString()!==v)fail('field-invalid',where,'expected a UTC time YYYY-MM-DDTHH:MM:SS.sssZ');
  return v as string;
}
function list(v:unknown,where:string,max:number,min=0):unknown[]{if(!Array.isArray(v)||v.length<min||v.length>max)fail('field-invalid',where,'expected a list of '+min+' to '+max+' items');return v as unknown[];}
function idList(v:unknown,where:string,max:number):string[]{
  const items=list(v,where,max).map((x,i)=>id(x,where+'/'+i));
  unique(items,where,'');return items;
}
function unique(values:readonly string[],where:string,suffix:string):void{
  const seen=new Set<string>();values.forEach((x,i)=>{if(seen.has(x))fail('duplicate-id',where+'/'+i+suffix,'duplicate '+JSON.stringify(x));seen.add(x);});
}
function digestField(v:unknown,where:string):Digest{
  const d=object(v,where,['alg','over','value']);
  if(d.alg!=='sha256')fail('digest',where+'/alg','alg must be sha256');
  if(d.over!=='bytes'&&d.over!==C14N)fail('digest',where+'/over','over must be bytes or '+C14N);
  if(typeof d.value!=='string'||!HEX64.test(d.value))fail('digest',where+'/value','value must be 64 lowercase hex characters');
  return d as Digest;
}
function scalar(v:unknown,where:string):ScalarValue{
  if(v===null||typeof v==='boolean'||typeof v==='number')return v as ScalarValue;
  if(typeof v==='string'&&byteLength(v)<=4000)return v;
  return fail('field-invalid',where,'expected null, a boolean, a finite number or text up to 4000 bytes');
}
const typeName=(v:ScalarValue)=>v===null?'null':typeof v;

function artifactRef(v:Record<string,unknown>,w:string):void{
  object(v,w,['format','version','kind','id','sha256','mediaType','bytes','scope'],['locator']);
  id(v.id,w+'/id',ARTIFACT_ID);
  if(typeof v.sha256!=='string'||!HEX64.test(v.sha256))fail('digest',w+'/sha256','sha256 must be 64 lowercase hex characters of the exact bytes');
  if(typeof v.mediaType!=='string'||!MEDIA_TYPE.test(v.mediaType))fail('field-invalid',w+'/mediaType','expected a lowercase media type');
  if(typeof v.bytes!=='number'||!Number.isInteger(v.bytes)||v.bytes<0||v.bytes>MAX_INT)fail('field-invalid',w+'/bytes','expected a byte count');
  oneOf(v.scope,w+'/scope',['public','private'] as const);
  if(has(v,'locator'))text(v.locator,w+'/locator',1024);
}
function runReceipt(v:Record<string,unknown>):void{
  object(v,'',['format','version','kind','runId','inputDigest','code','model','status','cancelRequested','times','checks','coverage','artifacts','diagnostics']);
  id(v.runId,'/runId');
  digestField(v.inputDigest,'/inputDigest');
  const code=object(v.code,'/code',['version'],['commit']);text(code.version,'/code/version',64);
  if(has(code,'commit')&&(typeof code.commit!=='string'||!COMMIT.test(code.commit)))fail('field-invalid','/code/commit','expected a 40 or 64 hex commit id');
  const model=object(v.model,'/model',['id','version'],['resolved','reason']);
  id(model.id,'/model/id');text(model.version,'/model/version',128);
  if(has(model,'resolved')&&model.resolved!==null)text(model.resolved,'/model/resolved',256);
  if(has(model,'reason'))text(model.reason,'/model/reason',400);
  const status=oneOf(v.status,'/status',RUN_STATUSES);
  if(typeof v.cancelRequested!=='boolean')fail('field-invalid','/cancelRequested','expected a boolean');
  const times=object(v.times,'/times',['submittedAt','startedAt','finishedAt']);
  const submitted=time(times.submittedAt,'/times/submittedAt'),started=times.startedAt===null?null:time(times.startedAt,'/times/startedAt'),finished=times.finishedAt===null?null:time(times.finishedAt,'/times/finishedAt');
  const checks=object(v.checks,'/checks',['performed','notPerformed']);
  const performed=idList(checks.performed,'/checks/performed',ENGINEERING_LIMITS.checks),notPerformed=idList(checks.notPerformed,'/checks/notPerformed',ENGINEERING_LIMITS.checks);
  const coverage=object(v.coverage,'/coverage',['consumed','ignored','fixed']);
  const lists:[string,string[]][]=(['consumed','ignored','fixed'] as const).map(k=>[k,idList(coverage[k],'/coverage/'+k,ENGINEERING_LIMITS.list)]);
  const artifacts=list(v.artifacts,'/artifacts',ENGINEERING_LIMITS.artifacts);
  artifacts.forEach((a,i)=>{const w='/artifacts/'+i;if(!isPlainObject(a))fail('field-invalid',w,'expected an artifact-ref record');const o=a as Record<string,unknown>;
    if(o.format!==ENGINEERING_FORMAT)fail('format',w+'/format','unsupported format');if(o.version!==ENGINEERING_VERSION)fail('version',w+'/version','unsupported version');
    if(o.kind!=='artifact-ref')fail('field-invalid',w+'/kind','expected an artifact-ref record');artifactRef(o,w);});
  unique(artifacts.map(a=>(a as {id:string}).id),'/artifacts','/id');
  list(v.diagnostics,'/diagnostics',ENGINEERING_LIMITS.diagnostics).forEach((d,i)=>{const w='/diagnostics/'+i;const o=object(d,w,['code','severity','message']);
    if(typeof o.code!=='string'||o.code.length>32||!DIAG_CODE.test(o.code))fail('field-invalid',w+'/code','expected an upper-case diagnostic code');
    oneOf(o.severity,w+'/severity',['info','warning','error'] as const);text(o.message,w+'/message',2000);});
  // semantic rules, in this order
  if(status==='queued'&&(started!==null||finished!==null))fail('run-status','/times','a queued run has neither started nor finished');
  if(status==='running'&&(started===null||finished!==null))fail('run-status','/times','a running run has started and not finished');
  if((status==='succeeded'||status==='failed')&&(started===null||finished===null))fail('run-status','/times','a '+status+' run has started and finished');
  if(status==='cancelled'&&finished===null)fail('run-status','/times','a cancelled run has finished');
  if(started!==null&&started<submitted||finished!==null&&finished<(started??submitted))fail('run-status','/times','times go backwards');
  if(status==='cancelled'&&v.cancelRequested!==true)fail('run-status','/cancelRequested','a cancelled run records cancelRequested true');
  if(has(model,'resolved')&&model.resolved===null&&!has(model,'reason'))fail('model-resolution','/model/resolved','an unresolved model needs a reason');
  if(has(model,'reason')&&!(has(model,'resolved')&&model.resolved===null))fail('model-resolution','/model/reason','a reason is only given when resolved is null');
  const done=new Set(performed);notPerformed.forEach((c,i)=>{if(done.has(c))fail('disjoint-lists','/checks/notPerformed/'+i,'check '+JSON.stringify(c)+' is also performed');});
  const placed=new Set<string>();for(const [k,ids] of lists){ids.forEach((p,i)=>{if(placed.has(p))fail('disjoint-lists','/coverage/'+k+'/'+i,'parameter '+JSON.stringify(p)+' is in two coverage lists');});ids.forEach(p=>placed.add(p));}
}
function selectionBinding(v:Record<string,unknown>):void{
  object(v,'',['format','version','kind','entityId','geometryRevision','viewToken','bindings'],['timeCursor']);
  id(v.entityId,'/entityId');
  digestField(v.geometryRevision,'/geometryRevision');
  if(typeof v.viewToken!=='string'||!VIEW_TOKEN.test(v.viewToken))fail('field-invalid','/viewToken','expected an opaque view token');
  const bindings=list(v.bindings,'/bindings',ENGINEERING_LIMITS.bindings).map((b,i)=>{const w='/bindings/'+i;const o=object(b,w,['signal','entityId','status'],['source']);
    id(o.signal,w+'/signal');if(o.entityId!==null)id(o.entityId,w+'/entityId');oneOf(o.status,w+'/status',BINDING_STATUSES);if(has(o,'source'))text(o.source,w+'/source',400);return o;});
  if(has(v,'timeCursor')&&(typeof v.timeCursor!=='number'||v.timeCursor<0))fail('field-invalid','/timeCursor','expected seconds >= 0');
  unique(bindings.map(b=>b.signal as string),'/bindings','/signal');
  bindings.forEach((b,i)=>{const w='/bindings/'+i;
    if(b.status==='unmapped'&&(b.entityId!==null||has(b,'source')))fail('binding-status',w,'an unmapped signal has no entity and no source');
    if(b.status==='sourced'&&(b.entityId===null||!has(b,'source')))fail('binding-status',w,'a sourced binding names its entity and its source');
    if(b.status==='inferred'&&b.entityId===null)fail('binding-status',w,'an inferred binding names its entity');});
}
function approvalRequest(v:Record<string,unknown>):void{
  for(const k of Object.keys(v).sort())if(APPROVAL_STATE_KEYS.includes(k))fail('approval-state','/'+pointer(k),'an approval request carries no approval state');
  object(v,'',['format','version','kind','purpose','baseRevision','proposalDigest','requester','endpointHint','presentationOnly']);
  text(v.purpose,'/purpose',400);
  digestField(v.baseRevision,'/baseRevision');digestField(v.proposalDigest,'/proposalDigest');
  id(v.requester,'/requester');
  if(typeof v.endpointHint!=='string'||!ENDPOINT_HINT.test(v.endpointHint)||v.endpointHint.includes('//')||v.endpointHint.split('/').some(s=>s==='..'||s==='.'))fail('field-invalid','/endpointHint','expected an absolute path without host, query or dot segments');
  if(v.presentationOnly!==true)fail('approval-state','/presentationOnly','presentationOnly must be true');
}
function parameterDiff(v:Record<string,unknown>):void{
  object(v,'',['format','version','kind','baseRevision','changes']);
  digestField(v.baseRevision,'/baseRevision');
  const changes=list(v.changes,'/changes',ENGINEERING_LIMITS.list,1).map((c,i)=>{const w='/changes/'+i;const o=object(c,w,['id','unit','from','to','consumedBy']);
    id(o.id,w+'/id');
    if(typeof o.unit!=='string'||byteLength(o.unit)>32||CONTROL.test(o.unit))fail('field-invalid',w+'/unit','expected a unit string ("" when dimensionless)');
    scalar(o.from,w+'/from');scalar(o.to,w+'/to');idList(o.consumedBy,w+'/consumedBy',ENGINEERING_LIMITS.consumedBy);return o;});
  unique(changes.map(c=>c.id as string),'/changes','/id');
  changes.forEach((c,i)=>{const from=c.from as ScalarValue,to=c.to as ScalarValue,w='/changes/'+i;
    if(from===null&&to===null||canonicalJson(from)===canonicalJson(to))fail('diff-change',w,'the change does not change the value');
    if(from!==null&&to!==null&&typeName(from)!==typeName(to))fail('diff-change',w,'the change switches the value type');});
}

/** Validate one parsed record. Rules run in a fixed order; the first refusal throws EngineeringError with a stable code. */
export function validateEngineering(input:unknown):EngineeringRecord{
  if(!isPlainObject(input))return fail('engineering-envelope','','expected one JSON object');
  inert(input,'',1);
  if(input.format!==ENGINEERING_FORMAT)fail('format','/format','unsupported format');
  if(input.version!==ENGINEERING_VERSION)fail('version','/version','unsupported version');
  if(typeof input.kind!=='string'||!(ENGINEERING_KINDS as readonly string[]).includes(input.kind))fail('kind','/kind','unknown kind');
  switch(input.kind as EngineeringKind){
    case 'artifact-ref':artifactRef(input,'');break;
    case 'run-receipt':runReceipt(input);break;
    case 'selection-binding':selectionBinding(input);break;
    case 'approval-request':approvalRequest(input);break;
    case 'parameter-diff':parameterDiff(input);break;
  }
  return input as EngineeringRecord;
}
export type EngineeringDecision={ok:true;kind:EngineeringKind;digest:Digest}|{ok:false;code:EngineeringCode;rule:EngineeringRule;gate:string;where:string;message:string};
/** Decide one record given as JSON text (bounded to 1 MiB of UTF-8). Never throws. */
export function engineeringDecision(text:string):EngineeringDecision{
  try{
    if(typeof text!=='string'||byteLength(text)>ENGINEERING_LIMITS.textBytes)fail('engineering-envelope','','the record exceeds '+ENGINEERING_LIMITS.textBytes+' bytes');
    let value:unknown;try{value=JSON.parse(text);}catch{return fail('engineering-envelope','','not JSON');}
    const record=validateEngineering(value);
    return {ok:true,kind:record.kind,digest:digest(record)};
  }catch(error){
    if(error instanceof EngineeringError)return {ok:false,code:error.code,rule:error.rule,gate:error.gate,where:error.where,message:error.message};
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------------------ schema
const S={type:'string'} as const;
const idSchema={type:'string',pattern:ID.source};
const digestSchema={type:'object',additionalProperties:false,required:['alg','over','value'],properties:{alg:{const:'sha256'},over:{enum:['bytes',C14N]},value:{type:'string',pattern:HEX64.source}}};
const timeSchema={type:'string',pattern:TIME.source};
const envelope=(kind:EngineeringKind)=>({format:{const:ENGINEERING_FORMAT},version:{const:ENGINEERING_VERSION},kind:{const:kind}});
const ids=(max:number)=>({type:'array',maxItems:max,uniqueItems:true,items:{$ref:'#/$defs/id'}});
const scalarSchema={anyOf:[{type:'null'},{type:'boolean'},{type:'number'},{type:'string',maxLength:4000}]};
/** JSON Schema 2020-12 for the structure. Semantic rules (DP-ENG-009..015) and c14n are validator gates, not schema. */
export const engineeringSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/engineering/v1/engineering.schema.json',
  title:'datapass.engineering/1',
  description:'Frozen sidecar records that reference datapass.artifact/1, datapass.runtime/1 and datapass.bundle records without changing them. Digests name their algorithm and what they cover: exact bytes or datapass-c14n/1 (RFC 8785 JCS). Semantic rules, the 1 MiB / 32-level budget and canonicalization are validator gates (src/framework/engineering/contract.ts, py/datapass_engineering.py), not schema. An approval-request is presentation only; a viewToken is not an authorization token.',
  oneOf:ENGINEERING_KINDS.map(k=>({$ref:'#/$defs/'+k})),
  $defs:{
    id:idSchema,digest:digestSchema,time:timeSchema,scalar:scalarSchema,
    'artifact-ref':{type:'object',additionalProperties:false,required:['format','version','kind','id','sha256','mediaType','bytes','scope'],properties:{...envelope('artifact-ref'),
      id:{type:'string',pattern:ARTIFACT_ID.source},sha256:{type:'string',pattern:HEX64.source,description:'SHA-256 of the exact artifact bytes.'},mediaType:{type:'string',pattern:MEDIA_TYPE.source},
      bytes:{type:'integer',minimum:0,maximum:MAX_INT},scope:{enum:['public','private']},locator:{...S,minLength:1,description:'Opaque and private: never resolved by Studio.'}}},
    'run-receipt':{type:'object',additionalProperties:false,required:['format','version','kind','runId','inputDigest','code','model','status','cancelRequested','times','checks','coverage','artifacts','diagnostics'],properties:{...envelope('run-receipt'),
      runId:{$ref:'#/$defs/id'},inputDigest:{$ref:'#/$defs/digest'},
      code:{type:'object',additionalProperties:false,required:['version'],properties:{version:{...S,minLength:1},commit:{type:'string',pattern:COMMIT.source}}},
      model:{type:'object',additionalProperties:false,required:['id','version'],properties:{id:{$ref:'#/$defs/id'},version:{...S,minLength:1},resolved:{type:['string','null'],minLength:1},reason:{...S,minLength:1}}},
      status:{enum:[...RUN_STATUSES],description:'datapass.runtime/1 RunStatus values.'},cancelRequested:{type:'boolean'},
      times:{type:'object',additionalProperties:false,required:['submittedAt','startedAt','finishedAt'],properties:{submittedAt:{$ref:'#/$defs/time'},startedAt:{anyOf:[{$ref:'#/$defs/time'},{type:'null'}]},finishedAt:{anyOf:[{$ref:'#/$defs/time'},{type:'null'}]}}},
      checks:{type:'object',additionalProperties:false,required:['performed','notPerformed'],properties:{performed:ids(ENGINEERING_LIMITS.checks),notPerformed:ids(ENGINEERING_LIMITS.checks)}},
      coverage:{type:'object',additionalProperties:false,required:['consumed','ignored','fixed'],properties:{consumed:ids(ENGINEERING_LIMITS.list),ignored:ids(ENGINEERING_LIMITS.list),fixed:ids(ENGINEERING_LIMITS.list)}},
      artifacts:{type:'array',maxItems:ENGINEERING_LIMITS.artifacts,items:{$ref:'#/$defs/artifact-ref'}},
      diagnostics:{type:'array',maxItems:ENGINEERING_LIMITS.diagnostics,items:{type:'object',additionalProperties:false,required:['code','severity','message'],properties:{code:{type:'string',maxLength:32,pattern:DIAG_CODE.source},severity:{enum:['info','warning','error']},message:{...S,minLength:1}}}}}},
    'selection-binding':{type:'object',additionalProperties:false,required:['format','version','kind','entityId','geometryRevision','viewToken','bindings'],properties:{...envelope('selection-binding'),
      entityId:{$ref:'#/$defs/id'},geometryRevision:{$ref:'#/$defs/digest'},viewToken:{type:'string',pattern:VIEW_TOKEN.source,description:'Opaque view identity; NOT an authorization token.'},
      bindings:{type:'array',maxItems:ENGINEERING_LIMITS.bindings,items:{type:'object',additionalProperties:false,required:['signal','entityId','status'],properties:{signal:{$ref:'#/$defs/id'},entityId:{anyOf:[{$ref:'#/$defs/id'},{type:'null'}]},status:{enum:[...BINDING_STATUSES]},source:{...S,minLength:1}}}},
      timeCursor:{type:'number',minimum:0,description:'Seconds.'}}},
    'approval-request':{type:'object',additionalProperties:false,required:['format','version','kind','purpose','baseRevision','proposalDigest','requester','endpointHint','presentationOnly'],properties:{...envelope('approval-request'),
      purpose:{...S,minLength:1},baseRevision:{$ref:'#/$defs/digest'},proposalDigest:{$ref:'#/$defs/digest'},requester:{$ref:'#/$defs/id'},endpointHint:{type:'string',pattern:ENDPOINT_HINT.source},presentationOnly:{const:true}}},
    'parameter-diff':{type:'object',additionalProperties:false,required:['format','version','kind','baseRevision','changes'],properties:{...envelope('parameter-diff'),
      baseRevision:{$ref:'#/$defs/digest'},
      changes:{type:'array',minItems:1,maxItems:ENGINEERING_LIMITS.list,items:{type:'object',additionalProperties:false,required:['id','unit','from','to','consumedBy'],properties:{id:{$ref:'#/$defs/id'},unit:{type:'string',maxLength:32,description:'Required; "" when dimensionless.'},from:{$ref:'#/$defs/scalar'},to:{$ref:'#/$defs/scalar'},consumedBy:ids(ENGINEERING_LIMITS.consumedBy)}}}}},
  },
} as const;

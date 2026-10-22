// Regenerate tests/fixtures/engineering (every record is SYNTHETIC). node --experimental-strip-types scripts/make-engineering-corpus.mjs [--check]
// Valid records are checked with the real validator (src/framework/engineering/contract.ts) before they are written; each
// invalid record breaks exactly one rule of datapass.engineering/1 so that rule is the first one the validators refuse.
// c14n/ holds datapass-c14n/1 (RFC 8785 JCS) conformance vectors: <id>.json is the exact input text, <id>.c14n the
// expected canonical bytes. legacy-0.8.1/ holds a byte-exact datapass.artifact/1 file from tag studio-v0.8.1, referenced
// by valid/artifact-ref-legacy-0.8.1.json. tests/engineering.test.mjs and py/test_datapass_engineering.py decide every
// vector with TypeScript and Python and compare code, where, canonical bytes and digests with manifest.json.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson,digest,engineeringDecision,validateEngineering} from '../src/framework/engineering/contract.ts';

const root='tests/fixtures/engineering';
const checking=process.argv.includes('--check');
const pretty=value=>JSON.stringify(value,null,2)+'\n';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SYN='SYNTHETIC';
const LEGACY={file:'legacy-0.8.1/wind-aep-weibull.json',tag:'studio-v0.8.1',source:'clients/python-wind-reference/public/artifacts/wind-aep-weibull.json',
  sha256:'edb1de122518f010f48f68ff7ef0b84611bce25475156e5fa00b48b1205fbc62',bytes:6202};

// The legacy file is pinned by hash: an existing copy is kept byte for byte (CI checkouts carry no tags); a missing one is
// read once from the tag.
let legacy=await readFile(path.join(root,LEGACY.file)).catch(()=>null);
if(!legacy&&!checking)legacy=execFileSync('git',['-c','core.autocrlf=false','show',LEGACY.tag+':'+LEGACY.source]);
if(!legacy||sha(legacy)!==LEGACY.sha256||legacy.length!==LEGACY.bytes)throw new Error('Legacy 0.8.1 artifact missing or changed: '+LEGACY.file+' must be the exact bytes of '+LEGACY.tag+':'+LEGACY.source);

const E={format:'datapass.engineering',version:1};
const hex=seed=>sha(Buffer.from('synthetic:'+seed,'utf8'));
const c14nDigest=seed=>({alg:'sha256',over:'datapass-c14n/1',value:hex(seed)});
const ref=(id,extra={})=>({...E,kind:'artifact-ref',id,sha256:hex('artifact:'+id),mediaType:'application/json',bytes:1024,scope:'public',...extra});
const legacyRef={...E,kind:'artifact-ref',id:'wind-aep-weibull',sha256:LEGACY.sha256,mediaType:'application/json',bytes:LEGACY.bytes,scope:'public'};
const T0='2026-10-22T08:00:00.000Z',T1='2026-10-22T08:00:01.250Z',T2='2026-10-22T08:00:04.500Z';
const receipt=(extra={})=>({...E,kind:'run-receipt',runId:'run-0123456789abcdef',inputDigest:c14nDigest('inputs'),
  code:{version:'0.12.0',commit:'6ab0756'.padEnd(40,'0')},model:{id:'wind-reference',version:'1',resolved:'wind-reference@1+weibull-k2'},
  status:'succeeded',cancelRequested:false,times:{submittedAt:T0,startedAt:T1,finishedAt:T2},
  checks:{performed:['input-bounds','artifact-schema'],notPerformed:['field-validation','power-prediction']},
  coverage:{consumed:['meanWindSpeed','k'],ignored:['airDensity'],fixed:['ratedPower']},
  artifacts:[legacyRef,ref('synthetic-aep-table')],diagnostics:[{code:'DP-ART-000',severity:'info',message:SYN+': illustrative model, not a site assessment.'}],...extra});
const binding=(extra={})=>({...E,kind:'selection-binding',entityId:'rotor/blade-1',geometryRevision:c14nDigest('geometry-r3'),viewToken:'view.7f3a-2',
  bindings:[{signal:'blade-1.pitch',entityId:'rotor/blade-1',status:'sourced',source:SYN+' telemetry column pitch_deg_b1'},
    {signal:'blade-1.strain',entityId:'rotor/blade-1',status:'inferred',source:'name match on "blade-1"'},
    {signal:'nacelle.vibration-x',entityId:null,status:'unmapped'}],timeCursor:12.5,...extra});
const diff=(extra={})=>({...E,kind:'parameter-diff',baseRevision:c14nDigest('design-base'),
  changes:[{id:'blade.chord_root',unit:'m',from:1.2,to:1.35,consumedBy:['geometry','power-curve']},
    {id:'foil.count',unit:'',from:3,to:4,consumedBy:['geometry']},
    {id:'foil.profile',unit:'',from:'NACA 0012',to:'NACA 0015 – révisé 風',consumedBy:[]},
    {id:'control.pitch_lock',unit:'',from:false,to:true,consumedBy:['kinematics']},
    {id:'tower.offset',unit:'m',from:null,to:0.5,consumedBy:['geometry']}],...extra});
const approval=(extra={})=>({...E,kind:'approval-request',purpose:SYN+': build the revised rotor geometry for review',baseRevision:c14nDigest('design-base'),
  proposalDigest:digest(diff()),requester:'studio-user',endpointHint:'/api/foil/v1/authorizations',presentationOnly:true,...extra});

const valid=[
  {file:'artifact-ref-public.json',note:'Public artifact reference: exact-byte sha256 and size.',value:ref('synthetic-aep-table')},
  {file:'artifact-ref-private-locator.json',note:'Private artifact with an opaque locator Studio never resolves.',value:ref('private-result',{scope:'private',mediaType:'text/plain; charset=utf-8',bytes:0,locator:'vault:runs/2026-10-22/private-result'})},
  {file:'artifact-ref-legacy-0.8.1.json',note:'References the byte-exact 0.8.1 artifact in legacy-0.8.1/ (sha256 and bytes of the file as stored).',value:legacyRef},
  {file:'run-receipt-succeeded.json',note:'Succeeded run: resolved model, checks performed and not performed, coverage, two artifact refs (one legacy).',value:receipt()},
  {file:'run-receipt-cancel-requested.json',note:'Running run with cancelRequested true (runtime/1 additive flag); provider did not expose a resolved model, so resolved is null with a reason.',
    value:receipt({status:'running',cancelRequested:true,model:{id:'wind-reference',version:'1',resolved:null,reason:'provider does not expose a resolved variant'},times:{submittedAt:T0,startedAt:T1,finishedAt:null},artifacts:[],diagnostics:[]})},
  {file:'run-receipt-cancelled-before-start.json',note:'Cancelled while queued: never started, finished at cancel time.',
    value:receipt({status:'cancelled',cancelRequested:true,model:{id:'wind-reference',version:'1'},code:{version:'0.12.0'},times:{submittedAt:T0,startedAt:null,finishedAt:T1},
      checks:{performed:[],notPerformed:['input-bounds']},coverage:{consumed:[],ignored:[],fixed:[]},artifacts:[],diagnostics:[]})},
  {file:'run-receipt-failed.json',note:'Failed run with an error diagnostic and no artifacts.',
    value:receipt({status:'failed',artifacts:[],diagnostics:[{code:'MODEL-DIVERGED',severity:'error',message:SYN+': solver did not converge'}]})},
  {file:'selection-binding.json',note:'One sourced, one inferred (needs consumer opt-in to animate) and one unmapped signal (never animates).',value:binding()},
  {file:'selection-binding-minimal.json',note:'No bindings and no time cursor.',value:binding({bindings:[],timeCursor:undefined})},
  {file:'parameter-diff.json',note:'Typed changes with units ("" dimensionless), number/string/boolean values, an added value (from null) and non-ASCII text.',value:diff()},
  {file:'approval-request.json',note:'Presentation-only approval request; proposalDigest is the datapass-c14n/1 digest of valid/parameter-diff.json.',value:approval()},
];
for(const f of valid)f.value=JSON.parse(JSON.stringify(f.value)); // drop undefined members

/** Each mutation breaks exactly one rule. `raw` is exact text; `make` edits a fresh copy of `base`. */
const invalid=[
  {file:'e-not-json.json',code:'DP-ENG-001',where:'',note:'Not JSON.',raw:'{"format":"datapass.engineering",'},
  {file:'e-array.json',code:'DP-ENG-001',where:'',note:'A JSON array, not one object.',raw:'[]\n'},
  {file:'e-nan-token.json',code:'DP-ENG-001',where:'',note:'NaN is not a JSON token (Python must not accept it either).',raw:'{"format":"datapass.engineering","version":1,"kind":"parameter-diff","x":NaN}\n'},
  {file:'e-lone-surrogate.json',code:'DP-ENG-001',where:'/purpose',note:'A string with a lone surrogate cannot be written as UTF-8.',base:approval,raw:v=>pretty(v).replace('"purpose": "','"purpose": "\\ud800')},
  {file:'e-too-deep.json',code:'DP-ENG-001',where:'/x'+'/0'.repeat(31),note:'Nesting deeper than 32 levels.',base:diff,make:v=>{let d=[];const top=d;for(let i=0;i<31;i++){const n=[];d.push(n);d=n;}v.x=top;return v;}},
  {file:'e-format.json',code:'DP-ENG-002',where:'/format',note:'Unsupported format name.',base:diff,make:v=>{v.format='datapass.engineering-v1';return v;}},
  {file:'e-version.json',code:'DP-ENG-003',where:'/version',note:'Unknown version.',base:diff,make:v=>{v.version=2;return v;}},
  {file:'e-version-string.json',code:'DP-ENG-003',where:'/version',note:'Version as a string.',base:diff,make:v=>{v.version='1';return v;}},
  {file:'e-kind.json',code:'DP-ENG-004',where:'/kind',note:'Unknown kind (approvals are not a Studio record).',base:approval,make:v=>{v.kind='approval';return v;}},
  {file:'k-unknown-key.json',code:'DP-ENG-005',where:'/url',note:'artifact-ref with an extra key: references never carry a resolvable URL.',base:()=>ref('synthetic-aep-table'),make:v=>{v.url='https://example.invalid/a.json';return v;}},
  {file:'k-nested-unknown-key.json',code:'DP-ENG-005',where:'/bindings/1/confidence',note:'A binding with an undocumented confidence score.',base:binding,make:v=>{v.bindings[1].confidence=0.8;return v;}},
  {file:'k-missing-key.json',code:'DP-ENG-006',where:'/diagnostics',note:'run-receipt without diagnostics.',base:receipt,make:v=>{delete v.diagnostics;return v;}},
  {file:'k-unit-missing.json',code:'DP-ENG-006',where:'/changes/0/unit',note:'A change without a unit: unit is required ("" when dimensionless).',base:diff,make:v=>{delete v.changes[0].unit;return v;}},
  {file:'f-artifact-id.json',code:'DP-ENG-007',where:'/id',note:'Artifact id with upper case first letter.',base:()=>ref('synthetic-aep-table'),make:v=>{v.id='Synthetic';return v;}},
  {file:'f-bytes.json',code:'DP-ENG-007',where:'/bytes',note:'Negative byte count.',base:()=>ref('synthetic-aep-table'),make:v=>{v.bytes=-1;return v;}},
  {file:'f-time.json',code:'DP-ENG-007',where:'/times/startedAt',note:'A date that does not exist (30 February).',base:receipt,make:v=>{v.times.startedAt='2026-02-30T08:00:01.250Z';return v;}},
  {file:'f-view-token.json',code:'DP-ENG-007',where:'/viewToken',note:'viewToken with a space (it is an opaque view id, not a bearer token).',base:binding,make:v=>{v.viewToken='Bearer abc';return v;}},
  {file:'f-endpoint-url.json',code:'DP-ENG-007',where:'/endpointHint',note:'endpointHint with a host: it is a path hint, never a URL Studio calls.',base:approval,make:v=>{v.endpointHint='https://evil.invalid/approve';return v;}},
  {file:'f-endpoint-dots.json',code:'DP-ENG-007',where:'/endpointHint',note:'endpointHint with a dot segment.',base:approval,make:v=>{v.endpointHint='/api/../admin';return v;}},
  {file:'f-changes-empty.json',code:'DP-ENG-007',where:'/changes',note:'A diff without changes.',base:diff,make:v=>{v.changes=[];return v;}},
  {file:'f-unit-type.json',code:'DP-ENG-007',where:'/changes/1/unit',note:'Unit given as a number.',base:diff,make:v=>{v.changes[1].unit=1;return v;}},
  {file:'f-status.json',code:'DP-ENG-007',where:'/status',note:'A status runtime/1 does not define.',base:receipt,make:v=>{v.status='cancel-requested';return v;}},
  {file:'d-alg.json',code:'DP-ENG-008',where:'/inputDigest/alg',note:'Digest algorithm other than sha256.',base:receipt,make:v=>{v.inputDigest.alg='md5';return v;}},
  {file:'d-over.json',code:'DP-ENG-008',where:'/geometryRevision/over',note:'Digest over an unnamed serialization.',base:binding,make:v=>{v.geometryRevision.over='json';return v;}},
  {file:'d-value-upper.json',code:'DP-ENG-008',where:'/baseRevision/value',note:'Digest value in upper-case hex.',base:diff,make:v=>{v.baseRevision.value=v.baseRevision.value.toUpperCase();return v;}},
  {file:'d-artifact-sha.json',code:'DP-ENG-008',where:'/artifacts/1/sha256',note:'Embedded artifact ref with a short sha256.',base:receipt,make:v=>{v.artifacts[1].sha256='abc123';return v;}},
  {file:'n-nested-format.json',code:'DP-ENG-002',where:'/artifacts/0/format',note:'Embedded artifact ref of another format.',base:receipt,make:v=>{v.artifacts[0].format='datapass.artifact';return v;}},
  {file:'u-duplicate-change.json',code:'DP-ENG-009',where:'/changes/1/id',note:'The same parameter changed twice.',base:diff,make:v=>{v.changes[1].id=v.changes[0].id;v.changes[1].unit='m';return v;}},
  {file:'u-duplicate-signal.json',code:'DP-ENG-009',where:'/bindings/1/signal',note:'One signal bound twice.',base:binding,make:v=>{v.bindings[1].signal=v.bindings[0].signal;return v;}},
  {file:'u-duplicate-artifact.json',code:'DP-ENG-009',where:'/artifacts/1/id',note:'Two artifact refs with one id.',base:receipt,make:v=>{v.artifacts[1].id=v.artifacts[0].id;return v;}},
  {file:'u-duplicate-check.json',code:'DP-ENG-009',where:'/checks/performed/1',note:'A check listed twice.',base:receipt,make:v=>{v.checks.performed[1]=v.checks.performed[0];return v;}},
  {file:'r-queued-started.json',code:'DP-ENG-010',where:'/times',note:'A queued run with a start time.',base:receipt,make:v=>{v.status='queued';v.times.finishedAt=null;return v;}},
  {file:'r-succeeded-unfinished.json',code:'DP-ENG-010',where:'/times',note:'A succeeded run without a finish time.',base:receipt,make:v=>{v.times.finishedAt=null;return v;}},
  {file:'r-backwards.json',code:'DP-ENG-010',where:'/times',note:'Finished before it started.',base:receipt,make:v=>{v.times.finishedAt='2026-10-22T08:00:01.000Z';return v;}},
  {file:'r-cancelled-unrequested.json',code:'DP-ENG-010',where:'/cancelRequested',note:'Cancelled without cancelRequested.',base:receipt,make:v=>{v.status='cancelled';return v;}},
  {file:'m-null-no-reason.json',code:'DP-ENG-011',where:'/model/resolved',note:'Unresolved model without a reason: unknown metadata is null WITH a reason, never invented.',base:receipt,make:v=>{v.model.resolved=null;return v;}},
  {file:'m-reason-resolved.json',code:'DP-ENG-011',where:'/model/reason',note:'A reason next to a resolved model.',base:receipt,make:v=>{v.model.reason='cached';return v;}},
  {file:'l-check-both.json',code:'DP-ENG-012',where:'/checks/notPerformed/1',note:'A check both performed and not performed.',base:receipt,make:v=>{v.checks.notPerformed[1]='artifact-schema';return v;}},
  {file:'l-coverage-overlap.json',code:'DP-ENG-012',where:'/coverage/fixed/0',note:'A parameter both consumed and fixed: a computation cannot claim a variable it fixes.',base:receipt,make:v=>{v.coverage.fixed[0]='k';return v;}},
  {file:'b-unmapped-entity.json',code:'DP-ENG-013',where:'/bindings/2',note:'An unmapped signal that names an entity.',base:binding,make:v=>{v.bindings[2].entityId='nacelle';return v;}},
  {file:'b-sourced-no-source.json',code:'DP-ENG-013',where:'/bindings/0',note:'A sourced binding without its source.',base:binding,make:v=>{delete v.bindings[0].source;return v;}},
  {file:'b-inferred-no-entity.json',code:'DP-ENG-013',where:'/bindings/1',note:'An inferred binding without an entity.',base:binding,make:v=>{v.bindings[1].entityId=null;return v;}},
  {file:'a-approval-status.json',code:'DP-ENG-014',where:'/approval_status',note:'Carries approval_status (as foilai.design-change/1 does): Studio never stores approval state.',base:approval,make:v=>{v.approval_status='PENDING';return v;}},
  {file:'a-approved.json',code:'DP-ENG-014',where:'/approved',note:'Carries an approved flag.',base:approval,make:v=>{v.approved=true;return v;}},
  {file:'a-presentation-false.json',code:'DP-ENG-014',where:'/presentationOnly',note:'presentationOnly false.',base:approval,make:v=>{v.presentationOnly=false;return v;}},
  {file:'c-noop.json',code:'DP-ENG-015',where:'/changes/1',note:'from and to are the same number.',base:diff,make:v=>{v.changes[1].to=3;return v;}},
  {file:'c-type-switch.json',code:'DP-ENG-015',where:'/changes/0',note:'A number changed into a string.',base:diff,make:v=>{v.changes[0].to='1.35';return v;}},
  {file:'c-both-null.json',code:'DP-ENG-015',where:'/changes/4',note:'from and to both null.',base:diff,make:v=>{v.changes[4].to=null;return v;}},
];

/** datapass-c14n/1 vectors: input text -> canonical bytes, or a refusal. `special` values cannot be written as JSON text. */
const astral='\u{1F600}';
const c14n=[
  {id:'key-order',note:'Keys sorted at every level; arrays keep their order.',input:'{"b":1,"a":2,"c":{"z":0,"y":[3,2,1]}}'},
  {id:'utf16-key-order',note:'Keys sorted by UTF-16 code units: U+1F600 (D83D DE00) sorts before U+FB01, unlike code-point order.',input:'{"\\ufb01":1,"'+astral+'":2,"\\u20ac":3,"\\u00e9":4,"a":5,"":6}'},
  {id:'rfc8785-sample',note:'RFC 8785 section 3.2.2 sample input.',input:'{\n  "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],\n  "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",\n  "literals": [null, true, false]\n}'},
  {id:'numbers',note:'ECMAScript Number-to-String: 1.0 -> 1, -0 -> 0, 1e21 -> 1e+21, 1e20 stays an integer, 1e-7 -> 1e-7, 1e-6 -> 0.000001, 2^53+1 reads as 2^53.',
    input:'[1.0, 1, -0, -0.0, 0.0, 1e21, 1e20, 1e-7, 1e-6, 123456789012345680000, 9007199254740993, 5e-324, 1.7976931348623157e308, 0.1, 100, 1E2, -1.5e-10, 0.30000000000000004]'},
  {id:'strings',note:'Only " \\ and control characters are escaped (lower-case \\u00xx); DEL, U+2028, non-ASCII and astral characters are written as UTF-8.',
    input:'["\\u0000\\u0007\\b\\t\\n\\u000b\\f\\r\\u001f", "\\u007f\\u2028\\u2029", "</script>", "é 風 '+astral+'", "\\ud83d\\ude00"]'},
  {id:'nested',note:'Nested arrays and objects, empty containers.',input:'[[[]],[{}],[[1,[2,[3]]]],{"a":[{"b":[],"a":{}}]},""]'},
  {id:'whitespace',note:'Insignificant whitespace (CRLF, tabs) disappears.',input:'{\r\n\t"b" : [ 1 , 2 ] ,\r\n\t"a" : null\r\n}\r\n'},
  {id:'scalar',note:'A top-level scalar.',input:'-0.0'},
  {id:'reject-overflow',note:'1e400 is not a finite double.',input:'{"a":[1e400]}',code:'DP-ENG-016',where:'/a/0'},
  {id:'reject-big-integer',note:'A 401-digit integer overflows a double.',input:'{"n":1'+'0'.repeat(400)+'}',code:'DP-ENG-016',where:'/n'},
  {id:'reject-lone-surrogate',note:'A lone surrogate has no UTF-8 form.',input:'{"k":"\\udc00"}',code:'DP-ENG-016',where:'/k'},
  {id:'reject-nan',note:'NaN (a value, not JSON text).',special:'NaN',code:'DP-ENG-016',where:'/x/1'},
  {id:'reject-infinity',note:'Infinity.',special:'Infinity',code:'DP-ENG-016',where:'/x/1'},
  {id:'reject-negative-infinity',note:'-Infinity.',special:'-Infinity',code:'DP-ENG-016',where:'/x/1'},
  {id:'reject-undefined',note:'An undefined member (TypeScript) / a non-JSON object (Python) inside an object.',special:'undefined',code:'DP-ENG-016',where:'/x/1/u'},
  {id:'reject-function',note:'A function.',special:'function',code:'DP-ENG-016',where:'/x/1'},
  {id:'reject-date',note:'A Date / datetime: not a plain JSON value.',special:'date',code:'DP-ENG-016',where:'/x/1'},
];

const files=new Map(),fixtures=[],vectors=[];
const decide=text=>engineeringDecision(text);
for(const f of valid){
  validateEngineering(f.value);
  const text=pretty(f.value),got=decide(text);
  if(!got.ok)throw new Error('valid/'+f.file+' is refused: '+got.message);
  files.set('valid/'+f.file,text);
  fixtures.push({file:'valid/'+f.file,expect:'accept',kind:got.kind,digest:got.digest.value,note:f.note});
}
for(const f of invalid){
  const text=typeof f.raw==='string'?f.raw:typeof f.raw==='function'?f.raw(f.base()):pretty(f.make(JSON.parse(JSON.stringify(f.base()))));
  const got=decide(text);
  if(got.ok||got.code!==f.code||got.where!==f.where)throw new Error('invalid/'+f.file+' is not refused as '+f.code+' at "'+f.where+'": '+JSON.stringify(got));
  files.set('invalid/'+f.file,text);
  fixtures.push({file:'invalid/'+f.file,expect:'reject',code:f.code,where:f.where,note:f.note});
}
for(const v of c14n){
  const entry={id:v.id,note:v.note};
  if(v.input!==undefined){entry.input='c14n/'+v.id+'.json';files.set(entry.input,v.input);}
  if(v.code){
    if(v.input!==undefined){let code=null,where=null;try{canonicalJson(JSON.parse(v.input));}catch(e){code=e.code;where=e.where;}
      if(code!==v.code||where!==v.where)throw new Error('c14n '+v.id+' is not refused as '+v.code+' at '+v.where+': '+code+' '+where);}
    Object.assign(entry,{expect:'reject',...(v.special?{special:v.special}:{}),code:v.code,where:v.where});
  }else{
    const canonical=canonicalJson(JSON.parse(v.input));
    entry.expect='canonical';entry.canonical='c14n/'+v.id+'.c14n';entry.sha256=sha(Buffer.from(canonical,'utf8'));
    files.set(entry.canonical,canonical);
  }
  vectors.push(entry);
}
const manifest={format:'datapass.engineering-corpus',version:1,contract:'datapass.engineering/1',c14n:'datapass-c14n/1',
  note:'Every record is SYNTHETIC (invented values) except legacy-0.8.1/, a byte copy of a public 0.8.1 reference artifact. Decisions, refusal codes, refused locations (JSON pointer), canonical bytes and digests are asserted for src/framework/engineering/contract.ts and py/datapass_engineering.py.',
  generator:'scripts/make-engineering-corpus.mjs',
  legacy:{file:LEGACY.file,from:LEGACY.tag+':'+LEGACY.source,sha256:LEGACY.sha256,bytes:LEGACY.bytes,referencedBy:'valid/artifact-ref-legacy-0.8.1.json',contract:'datapass.artifact/1'},
  fixtures,vectors};
files.set('manifest.json',pretty(manifest));

if(checking){
  const present=new Set((await readdir(root,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(root,path.join(e.parentPath??e.path,e.name)).replace(/\\/g,'/')));
  present.delete(LEGACY.file);
  for(const [name,content] of files){
    const prior=await readFile(path.join(root,name)).catch(()=>null);
    if(!prior||!prior.equals(Buffer.from(content,'utf8')))throw new Error('Engineering corpus drift: '+name+' (run node --experimental-strip-types scripts/make-engineering-corpus.mjs)');
    present.delete(name);
  }
  if(present.size)throw new Error('Unlisted engineering corpus files: '+[...present].join(', '));
  console.log('Engineering corpus matches its generator ('+(files.size+1)+' files).');
}else{
  await rm(root,{recursive:true,force:true});
  for(const [name,content] of [...files,[LEGACY.file,legacy]]){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),content);}
  console.log('Wrote '+(files.size+1)+' engineering corpus files to '+root);
}

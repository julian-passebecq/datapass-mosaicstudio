// Engineering sidecar contract datapass.engineering/1 (frozen). Every record and datapass-c14n/1 vector in
// tests/fixtures/engineering (SYNTHETIC except the byte-exact 0.8.1 artifact) is decided by the TypeScript contract and by
// py/datapass_engineering.py; both must agree with manifest.json: accept/reject, the stable DP-ENG code, the refused
// location, the canonical bytes and every digest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ENGINEERING_CODES,ENGINEERING_KINDS,EngineeringError,bytesDigest,canonicalJson,digest,digestAsync,engineeringDecision,engineeringSchema,sha256Hex,validateEngineering} from '../src/framework/engineering/index.ts';
import {ENG_DIAGNOSTICS} from '../src/framework/diagnostics/index.ts';
import {validateArtifact} from '../src/framework/foundation/artifact.ts';

const root='tests/fixtures/engineering';
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
const bytes=file=>readFileSync(path.join(root,file));
const read=file=>bytes(file).toString('utf8');
const sha=data=>createHash('sha256').update(data).digest('hex');
const SPECIAL={NaN:Number.NaN,Infinity:Number.POSITIVE_INFINITY,'-Infinity':Number.NEGATIVE_INFINITY,undefined:{u:undefined},function:()=>1,date:new Date(0)};

/** Run one Python snippet against py/datapass_engineering.py with the corpus manifest; returns its JSON output. */
function python(script){
  for(const exe of process.platform==='win32'?['python','py']:['python3','python']){
    const out=spawnSync(exe,['-I','-c',script],{encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    if(out.error)continue;
    assert.equal(out.status,0,'python engineering leg crashed: '+out.stderr);
    return JSON.parse(out.stdout);
  }
  throw new Error('A Python 3 interpreter is required for the Python leg of the engineering corpus.');
}
const PY_PRELUDE=`import json,sys,hashlib
sys.path.insert(0,'py')
import datapass_engineering as de
root='${root}/'
m=json.load(open(root+'manifest.json',encoding='utf-8'))
def text(f): return open(root+f,'rb').read().decode('utf-8')
`;

test('the manifest lists every corpus file; every DP-ENG code has a fixture or vector; corpus size',()=>{
  const listed=new Set(['manifest.json',manifest.legacy.file]);
  for(const f of manifest.fixtures)listed.add(f.file);
  for(const v of manifest.vectors){if(v.input)listed.add(v.input);if(v.canonical)listed.add(v.canonical);}
  const present=readdirSync(root,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>path.relative(root,path.join(e.parentPath??e.path,e.name)).replace(/\\/g,'/')).sort();
  assert.deepEqual(present,[...listed].sort());
  const covered=new Set([...manifest.fixtures,...manifest.vectors].filter(f=>f.expect==='reject').map(f=>f.code));
  assert.deepEqual([...covered].sort(),ENG_DIAGNOSTICS.map(row=>row.code));
  assert.ok(manifest.fixtures.filter(f=>f.expect==='accept').length>=8);
  assert.ok(manifest.fixtures.filter(f=>f.expect==='reject').length>=20);
  assert.deepEqual([...new Set(manifest.fixtures.filter(f=>f.expect==='accept').map(f=>f.kind))].sort(),[...ENGINEERING_KINDS].sort());
});

test('TypeScript and Python decide every record identically (code, where, kind, digest)',()=>{
  const py=python(PY_PRELUDE+`print(json.dumps([de.decide(text(f['file'])) for f in m['fixtures']]))`);
  assert.equal(py.length,manifest.fixtures.length);
  for(const [i,f] of manifest.fixtures.entries()){
    const ts=engineeringDecision(read(f.file)),p=py[i];
    if(f.expect==='accept'){
      assert.equal(ts.ok,true,f.file+': '+JSON.stringify(ts));assert.equal(p.ok,true,f.file+': '+JSON.stringify(p));
      assert.deepEqual([ts.kind,ts.digest.value],[f.kind,f.digest],f.file);assert.deepEqual(p.digest,ts.digest,f.file);
    }else{
      assert.equal(ts.ok,false,f.file);assert.equal(p.ok,false,f.file);
      assert.deepEqual([ts.code,ts.where],[f.code,f.where],f.file+' (TypeScript): '+ts.message);
      assert.deepEqual([p.code,p.where],[f.code,f.where],f.file+' (Python): '+p.message);
      assert.equal(p.rule,ts.rule,f.file);
    }
  }
});

test('datapass-c14n/1 vectors: identical canonical bytes and digests in TypeScript and Python, identical refusals',()=>{
  const py=python(PY_PRELUDE+`
SPECIAL={'NaN':float('nan'),'Infinity':float('inf'),'-Infinity':float('-inf'),'undefined':{'u':object()},'function':(lambda:1),'date':__import__('datetime').datetime(2026,1,1)}
out=[]
for v in m['vectors']:
    try:
        value=de.parse_json(text(v['input'])) if 'input' in v else {'x':[1,SPECIAL[v['special']]]}
        b=de.canonical_bytes(value)
        out.append({'ok':True,'hex':b.hex(),'sha256':hashlib.sha256(b).hexdigest()})
    except de.EngineeringError as e:
        out.append({'ok':False,'code':e.code,'where':e.where})
print(json.dumps(out))`);
  for(const [i,v] of manifest.vectors.entries()){
    const p=py[i];
    if(v.expect==='canonical'){
      const expected=bytes(v.canonical),ts=Buffer.from(canonicalJson(JSON.parse(read(v.input))),'utf8');
      assert.ok(ts.equals(expected),v.id+' (TypeScript)');assert.equal(p.hex,expected.toString('hex'),v.id+' (Python)');
      assert.equal(sha(expected),v.sha256,v.id);assert.equal(p.sha256,v.sha256,v.id);
      assert.equal(digest(JSON.parse(read(v.input))).value,v.sha256,v.id);
    }else{
      const value=v.input?JSON.parse(read(v.input)):{x:[1,SPECIAL[v.special]]};
      assert.throws(()=>canonicalJson(value),e=>e instanceof EngineeringError&&e.code===v.code&&e.where===v.where,v.id);
      assert.deepEqual([p.ok,p.code,p.where],[false,v.code,v.where],v.id+' (Python)');
    }
  }
});

test('c14n literals: RFC 8785 sample, UTF-16 key order, ECMAScript numbers, -0',()=>{
  assert.equal(read('c14n/rfc8785-sample.c14n'),'{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}');
  assert.equal(canonicalJson({'ﬁ':1,'\u{1F600}':2,'€':3,a:4}),'{"a":4,"€":3,"\u{1F600}":2,"ﬁ":1}');
  assert.equal(canonicalJson([1.0,-0,1e21,1e-7,1e-6,0.1,2**53+1]),'[1,0,1e+21,1e-7,0.000001,0.1,9007199254740992]');
  assert.equal(canonicalJson({b:[{d:1,c:2}],a:' \u007f'}),'{"a":" \u007f","b":[{"c":2,"d":1}]}');
  for(const bad of [new Map(),[1,,2],Object.create({x:1}),{[Symbol('s')]:1},10n])assert.throws(()=>canonicalJson(bad),e=>e.code==='DP-ENG-016');
});

test('digests: pure sha256 equals node:crypto and WebCrypto; bytes digests hash exact bytes',async()=>{
  for(const sample of ['','abc','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'é 風 \u{1F600}'.repeat(40)])assert.equal(sha256Hex(sample),sha(Buffer.from(sample,'utf8')));
  const value=JSON.parse(read('valid/parameter-diff.json'));
  assert.deepEqual(await digestAsync(value),digest(value));
  const legacy=bytes(manifest.legacy.file);
  assert.deepEqual(bytesDigest(new Uint8Array(legacy)),{alg:'sha256',over:'bytes',value:manifest.legacy.sha256});
  assert.equal(JSON.parse(read('valid/approval-request.json')).proposalDigest.value,digest(value).value,'proposalDigest is the c14n digest of the diff');
});

test('legacy 0.8.1 artifact: byte-exact, referenced by its sha256, still accepted by the current validateArtifact',()=>{
  const legacy=bytes(manifest.legacy.file);
  assert.equal(legacy.length,manifest.legacy.bytes);assert.equal(sha(legacy),manifest.legacy.sha256);
  const ref=validateEngineering(JSON.parse(read(manifest.legacy.referencedBy)));
  assert.deepEqual([ref.kind,ref.sha256,ref.bytes,ref.id],['artifact-ref',sha(legacy),legacy.length,'wind-aep-weibull']);
  const artifact=validateArtifact(JSON.parse(legacy.toString('utf8')));
  assert.equal(artifact.id,ref.id);
  const receipt=JSON.parse(read('valid/run-receipt-succeeded.json'));
  assert.ok(receipt.artifacts.some(a=>a.sha256===manifest.legacy.sha256),'the succeeded receipt references the legacy bytes');
});

test('the contract file is self-contained and the published schema matches its source',()=>{
  const source=readFileSync('src/framework/engineering/contract.ts','utf8');
  assert.doesNotMatch(source,/^\s*import\s/m,'contract.ts must not import anything (it is vendored verbatim)');
  assert.deepEqual(JSON.parse(readFileSync('spec/engineering/v1/engineering.schema.json','utf8')),JSON.parse(JSON.stringify(engineeringSchema)));
  assert.deepEqual(Object.values(ENGINEERING_CODES).map(([code])=>code),Array.from({length:16},(_,i)=>'DP-ENG-'+String(i+1).padStart(3,'0')));
  const readme=readFileSync('spec/engineering/v1/README.md','utf8');
  for(const phrase of ['Idempotency-Key','409','cancelRequested','/api/runtime/v1/ready','presentationOnly','not an authorization token','unmapped','inferred','foilai.design-change/1','Vendoring','datapass-c14n/1'])assert.ok(readme.includes(phrase),phrase);
});

test('validation never changes its input and refuses non-plain values as an envelope error',()=>{
  const value=JSON.parse(read('valid/run-receipt-succeeded.json')),before=JSON.stringify(value);
  validateEngineering(value);assert.equal(JSON.stringify(value),before);
  assert.throws(()=>validateEngineering(new Map()),e=>e.code==='DP-ENG-001');
  assert.throws(()=>validateEngineering({...value,diagnostics:[{code:'X',severity:'info',message:'m',at:new Date(0)}]}),e=>e.code==='DP-ENG-001');
  assert.equal(engineeringDecision('x'.repeat(1048577)).code,'DP-ENG-001');
});

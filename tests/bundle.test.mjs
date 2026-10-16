// Provenance export bundle datapass.bundle v1 (candidate, F208). Every fixture in tests/fixtures/bundle (all SYNTHETIC) is
// decided by the TypeScript validator and by py/datapass_bundle.py; both must agree with manifest.json: accept/reject, the
// stable DP-BUN code, the refused file and, for accepted bundles, the identical file hashes and bundle identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {BUNDLE_LIMITS,BundleError,bundleDecision,bundleFromRecords,bundlePort,exportBundle,isSecretKey,readBundleText} from '../src/framework/foundation/bundle.ts';
import {BUN_DIAGNOSTICS} from '../src/framework/diagnostics/index.ts';
import {createStorageAdapter,memoryPreferences} from '../src/framework/storage/index.ts';

const root='tests/fixtures/bundle';
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
const read=file=>readFileSync(path.join(root,file),'utf8');
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const contoso=readFileSync('tests/fixtures/interop/contoso-shape.synthetic.artifact.json','utf8').replace(/\r\n/g,'\n');
const CREATED='2026-10-16T00:00:00.000Z';
const run=(extra={})=>({runId:'run-1',taskId:'scenario',appId:'bundle-test',appVersion:'1.0.0',model:{id:'synthetic-model',version:'1',provider:'runtime'},
  outcome:'succeeded',startedAt:'2026-10-16T00:00:01.000Z',finishedAt:'2026-10-16T00:00:02.000Z',values:{priceChangePct:5},artifactId:'orchard-monthly-yield',...extra});

function python(args){
  for(const exe of process.platform==='win32'?['python','py']:['python3','python']){
    const out=spawnSync(exe,['-I','py/datapass_bundle.py',...args],{encoding:'utf8',maxBuffer:64*1024*1024});
    if(out.error)continue;
    assert.ok(out.status===0||out.status===1,'python bundle validator crashed: '+out.stderr);
    return {status:out.status,lines:out.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line))};
  }
  throw new Error('A Python 3 interpreter is required for the Python leg of the bundle corpus.');
}

test('the manifest lists every corpus file and every Python-side DP-BUN code has a fixture',()=>{
  const present=readdirSync(root,{recursive:true}).map(f=>String(f).replace(/\\/g,'/')).filter(f=>f.endsWith('.json')&&f!=='manifest.json').sort();
  assert.deepEqual(manifest.fixtures.map(f=>f.file).sort(),present);
  const covered=new Set(manifest.fixtures.filter(f=>f.expect==='reject').map(f=>f.code));
  for(const row of BUN_DIAGNOSTICS)if(row.languages.includes('py'))assert.ok(covered.has(row.code),row.code+' has no fixture');
});

test('TypeScript and Python decide every fixture identically (code, refused file, hashes)',async()=>{
  const py=python(['validate',...manifest.fixtures.map(f=>path.join(root,f.file))]);
  assert.equal(py.lines.length,manifest.fixtures.length);
  for(const [i,f] of manifest.fixtures.entries()){
    const ts=await bundleDecision(read(f.file)),p=py.lines[i];
    if(f.expect==='accept'){
      assert.equal(ts.ok,true,f.file+': '+JSON.stringify(ts));assert.equal(p.ok,true,f.file+': '+JSON.stringify(p));
      assert.equal(ts.bundleSha256,f.bundleSha256,f.file);assert.equal(p.bundleSha256,f.bundleSha256,f.file);
      assert.deepEqual(ts.files,f.files,f.file);assert.deepEqual(p.files,f.files,f.file);
    }else{
      assert.equal(ts.ok,false,f.file);assert.equal(p.ok,false,f.file);
      assert.deepEqual([ts.code,ts.where,ts.artifactCode],[f.code,f.where,f.artifactCode],f.file+' (TypeScript): '+ts.message);
      assert.deepEqual([p.code,p.where,p.artifactCode],[f.code,f.where,f.artifactCode],f.file+' (Python): '+p.message);
    }
  }
  assert.equal(py.status,1,'the CLI exits 1 when any file is refused');
});

test('hashes are over the exact embedded text: SHA256SUMS lists them and identifies the bundle',async()=>{
  const fixture=manifest.fixtures.find(f=>f.file==='valid/exact-bytes.json');
  const doc=JSON.parse(read(fixture.file)),bundle=await readBundleText(read(fixture.file));
  for(const f of doc.files){assert.equal(f.sha256,sha(f.text),f.path);assert.equal(f.bytes,Buffer.byteLength(f.text,'utf8'));}
  const crlf=doc.files.find(f=>f.path==='artifacts/crlf-a.json');
  assert.ok(crlf.text.includes('\r\n\t'),'CRLF and tabs are kept exactly as exported');
  const sums=doc.files.find(f=>f.path==='SHA256SUMS');
  assert.equal(bundle.bundleSha256,sha(sums.text));
  assert.match(sums.text,/^[0-9a-f]{64} {2}artifacts\/crlf-a\.json\n/);
  assert.equal(sums.text.trim().split('\n').length,doc.files.length-1);
  assert.equal(doc.status,'candidate');
  const unobserved=bundle.runs.find(r=>r.runId==='run-c');
  assert.deepEqual([unobserved.outcome,unobserved.finishedAt,unobserved.artifact],['unobserved',null,null]);
});

test('the Contoso artifact is embedded byte for byte and re-imports with the same hashes',async()=>{
  const exported=await exportBundle({title:'Contoso',createdAt:CREATED,artifacts:[{text:contoso}],runs:[run()]});
  const doc=JSON.parse(exported.text),file=doc.files.find(f=>f.path==='artifacts/orchard-monthly-yield.json');
  assert.equal(file.text,contoso);assert.equal(file.sha256,sha(contoso));
  const again=await readBundleText(exported.text);
  assert.equal(again.bundleSha256,exported.bundleSha256);assert.deepEqual(again.files,exported.files);
  assert.deepEqual(again.inputs,[{runId:'run-1',values:{priceChangePct:5}}]);
  assert.equal(again.runs[0].artifact.sha256,sha(contoso));
  assert.equal(again.lineage[0].kind,'synthetic','synthetic stays labelled synthetic');
  assert.match(exported.fileName,/^contoso\.datapass-bundle\.json$/);
});

test('an export refuses the in-memory runtime token anywhere and token-shaped keys, writing nothing',async()=>{
  const token='tok-'+'a'.repeat(40);
  await assert.rejects(exportBundle({title:'Leak',createdAt:CREATED,artifacts:[{text:contoso}],runs:[run({values:{note:'pair with '+token}})],secrets:[token]}),
    e=>e instanceof BundleError&&e.code==='DP-BUN-010');
  await assert.rejects(exportBundle({title:'Leak '+token,createdAt:CREATED,artifacts:[{text:contoso}],secrets:[token]}),e=>e instanceof BundleError&&e.code==='DP-BUN-010');
  await assert.rejects(exportBundle({title:'Key',createdAt:CREATED,artifacts:[{text:contoso}],runs:[run({values:{apiKey:'x'}})]}),e=>e instanceof BundleError&&e.code==='DP-BUN-009');
  // A null/empty secret (no runtime paired) never matches everything.
  const ok=await exportBundle({title:'No token',createdAt:CREATED,artifacts:[{text:contoso}],secrets:[null,'',undefined]});
  assert.ok(ok.bundleSha256);
  for(const key of ['token','runtimeToken','runtime_token','DATAPASS_RUNTIME_TOKEN','apiKey','api-key','Authorization','password','clientSecret','cookie','credentials','privateKey'])assert.ok(isSecretKey(key),key);
  for(const key of ['tokenCount','tokens','priceChangePct','secretary','author','keyId'])assert.equal(isSecretKey(key),false,key);
});

test('an export refuses an invalid artifact, a duplicate id or a run naming an absent artifact',async()=>{
  await assert.rejects(exportBundle({title:'Bad',artifacts:[{text:contoso.replace('"datapass.artifact"','"x"')}]}),e=>e.code==='DP-BUN-007'&&e.artifactCode==='DP-ART-013');
  await assert.rejects(exportBundle({title:'Twice',artifacts:[{text:contoso},{text:contoso}]}),e=>e.code==='DP-BUN-007');
  await assert.rejects(exportBundle({title:'Orphan',artifacts:[{text:contoso}],runs:[run({artifactId:'other'})]}),e=>e.code==='DP-BUN-008');
});

test('journal records map to bundle runs: only retained, succeeded results are exported with their captured inputs',async()=>{
  const artifact=JSON.parse(contoso);artifact.provenance={...artifact.provenance,runId:'run-ok'};
  const base={format:'datapass.run',version:1,taskId:'scenario',appId:'bundle-test',appVersion:'1.0.0',modelId:'synthetic-model',modelVersion:'1',providerId:'browser',
    parameters:{priceChangePct:5},dependencies:{},startedAt:'2026-10-16T00:00:01.000Z',message:''};
  const records=[{...base,id:'run-ok',status:'succeeded',finishedAt:'2026-10-16T00:00:02.000Z',durationMs:1000,artifact,retention:'retained'},
    {...base,id:'run-failed',status:'failed',finishedAt:'2026-10-16T00:00:02.000Z',durationMs:1,artifact:null,retention:'none',message:'boom'}];
  const input=bundleFromRecords(records);
  assert.deepEqual(input.runs.map(r=>r.runId),['run-ok']);
  const exported=await exportBundle({title:'Journal',createdAt:CREATED,...input});
  const bundle=await readBundleText(exported.text);
  assert.equal(bundle.lineage[0].runId,'run-ok');assert.deepEqual(bundle.inputs[0].values,{priceChangePct:5});
});

test('the StorageAdapter bundle tier exports a file set and validates it back without changes',async()=>{
  const port=bundlePort();
  const adapter=createStorageAdapter({preferences:memoryPreferences(),bundles:port});
  assert.deepEqual(adapter.tiers().find(t=>t.tier==='bundles').available,true);
  const entries=await port.exportBundle({title:'Tier',createdAt:CREATED,artifacts:[{text:contoso}],runs:[run()]});
  assert.deepEqual(entries.map(e=>e.path),['artifacts/orchard-monthly-yield.json','inputs.json','lineage.json','runs.json','SHA256SUMS']);
  for(const e of entries)assert.equal(e.sha256,createHash('sha256').update(e.bytes).digest('hex'));
  const back=await port.importBundle(entries);
  assert.equal(back.artifacts[0].sha256,sha(contoso));
  const tampered=entries.map(e=>e.path==='inputs.json'?{...e,bytes:new TextEncoder().encode('{}')}:e);
  await assert.rejects(port.importBundle(tampered),e=>e.code==='DP-BUN-003');
});

test('the published JSON Schema accepts every valid bundle and its members, and matches the source',async()=>{
  const {default:Ajv2020}=await import('ajv/dist/2020.js');
  const {bundleSchema}=await import('../src/framework/foundation/bundle.ts');
  const published=JSON.parse(readFileSync('spec/bundle/v1/bundle.schema.json','utf8'));
  assert.deepEqual(published,JSON.parse(JSON.stringify(bundleSchema)));
  const ajv=new Ajv2020({strict:false}),envelope=ajv.compile(published);
  const member=name=>ajv.compile({$schema:published.$schema,$defs:published.$defs,$ref:'#/$defs/'+name});
  const runs=member('runs'),inputs=member('inputs'),lineage=member('lineage');
  for(const f of manifest.fixtures.filter(f=>f.expect==='accept')){
    const doc=JSON.parse(read(f.file)),text=p=>JSON.parse(doc.files.find(x=>x.path===p).text);
    assert.ok(envelope(doc),f.file+JSON.stringify(envelope.errors));
    assert.ok(runs(text('runs.json'))&&inputs(text('inputs.json'))&&lineage(text('lineage.json')),f.file);
  }
  assert.equal(envelope(JSON.parse(read('invalid/e-status.json'))),false);
});

test('limits: oversize text and too many files are refused at the envelope',async()=>{
  await assert.rejects(readBundleText(' '.repeat(BUNDLE_LIMITS.textBytes+1)),e=>e.code==='DP-BUN-001');
  const doc=JSON.parse(read('valid/one-run.json'));doc.files=Array.from({length:BUNDLE_LIMITS.files+1},()=>doc.files[0]);
  await assert.rejects(readBundleText(JSON.stringify(doc)),e=>e.code==='DP-BUN-001');
});

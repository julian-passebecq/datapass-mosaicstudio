// Regenerate tests/fixtures/bundle (every fixture is SYNTHETIC). node --experimental-strip-types scripts/make-bundle-corpus.mjs [--check]
// Valid bundles are built with the real exporter (src/framework/foundation/bundle.ts); each invalid bundle breaks exactly one
// rule of datapass.bundle v1 so that rule is the first one the validators refuse. tests/bundle.test.mjs and
// py/test_datapass_bundle.py decide every file with the TypeScript and the Python validator and compare code, file and hashes
// with manifest.json.
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {exportBundle} from '../src/framework/foundation/bundle.ts';

const root='tests/fixtures/bundle';
const checking=process.argv.includes('--check');
const CREATED='2026-10-16T00:00:00.000Z';
const SYN='SYNTHETIC fixture for the datapass.bundle corpus. Values are invented; not real data.';
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const pretty=value=>JSON.stringify(value,null,2)+'\n';
// Git may check the interop fixture out with CRLF on Windows; the bundle embeds the LF form on every platform.
const contoso=(await readFile('tests/fixtures/interop/contoso-shape.synthetic.artifact.json','utf8')).replace(/\r\n/g,'\n');

const table=(id,runId,extra={})=>({format:'datapass.artifact',version:1,id,title:'Synthetic bundle table '+id,
  provenance:{kind:'computed',source:SYN,...(runId?{runId}:{}),...extra},
  payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'ID',type:'string'},{id:'value',label:'Value',type:'number',unit:'kW'}],rows:[{id:'a',value:2},{id:'b',value:3.5}]},
  representations:[{id:'table',title:'Rows',kind:'table'},{id:'json',title:'JSON',kind:'json'}]});
const run=(runId,artifactId,values,extra={})=>({runId,taskId:'scenario',appId:'bundle-corpus',appVersion:'1.0.0',model:{id:'synthetic-model',version:'1',provider:'runtime'},
  outcome:'succeeded',startedAt:'2026-10-16T00:00:01.000Z',finishedAt:'2026-10-16T00:00:02.000Z',values,artifactId,...extra});

const valid=[
  {file:'one-run.json',note:'Contoso-shape SYNTHETIC artifact (byte copy of the interop fixture, LF) with one run and its captured inputs.',
    input:()=>({title:'Contoso shape synthetic run',createdAt:CREATED,artifacts:[{text:contoso}],runs:[run('run-contoso-1','orchard-monthly-yield',{priceChangePct:5,costChangePct:-2})]})},
  {file:'artifact-only.json',note:'One artifact, no run: an artifact file exported from the viewer.',
    input:()=>({title:'Artifact only',createdAt:CREATED,artifacts:[{text:JSON.stringify(table('only-table',null),null,2)}]})},
  {file:'exact-bytes.json',note:'Two runs; artifact texts keep CRLF, tabs and non-ASCII exactly as given (é, 風, emoji) to prove hashing of the embedded bytes, not a re-serialization.',
    input:()=>({title:'Exact bytes – é 風 🌬',createdAt:CREATED,
      artifacts:[{text:JSON.stringify(table('crlf-a','run-a',{inputHash:sha('synthetic'),dependsOn:['external-upstream']}),null,'\t').replace(/\n/g,'\r\n')},
        {text:JSON.stringify({...table('crlf-b','run-b'),title:'Synthetic é 風 🌬 table'})}],
      runs:[run('run-a','crlf-a',{gain:2,mode:'fast',enabled:true,note:null}),run('run-b','crlf-b',{gain:3,mode:'slow',enabled:false,note:'é'},{outcome:'succeeded',resultSha256:sha('synthetic result')}),
        run('run-c',null,{gain:4,mode:'fast',enabled:true,note:null},{outcome:'unobserved',finishedAt:null})]})},
];

/** Recompute every file's sha256/bytes and SHA256SUMS after a mutation that must not trip the hash rules. */
function rehash(doc){
  for(const f of doc.files)if(f.path!=='SHA256SUMS'){f.sha256=sha(f.text);f.bytes=Buffer.byteLength(f.text,'utf8');}
  const sums=doc.files.find(f=>f.path==='SHA256SUMS');
  if(sums){sums.text=doc.files.filter(f=>f.path!=='SHA256SUMS').map(f=>f.path).sort().map(p=>doc.files.find(f=>f.path===p).sha256+'  '+p+'\n').join('');sums.sha256=sha(sums.text);sums.bytes=Buffer.byteLength(sums.text,'utf8');}
  return doc;
}
const member=(doc,p)=>doc.files.find(f=>f.path===p);
const editJson=(doc,p,edit)=>{const f=member(doc,p),v=JSON.parse(f.text);edit(v);f.text=pretty(v);return rehash(doc);};
const invalid=[
  {file:'e-format.json',code:'DP-BUN-001',where:'',note:'Unsupported format name.',make:d=>{d.format='datapass.bundles';return d;}},
  {file:'e-status.json',code:'DP-BUN-001',where:'',note:'A bundle must say status candidate (the format is not final).',make:d=>{d.status='final';return d;}},
  {file:'e-extra-key.json',code:'DP-BUN-001',where:'',note:'Unknown top-level key.',make:d=>{d.signature='none';return d;}},
  {file:'e-not-json.json',code:'DP-BUN-001',where:'',note:'Not JSON at all.',raw:'{"format":"datapass.bundle",'},
  {file:'f-path.json',code:'DP-BUN-002',where:'/files/0',note:'A path outside the documented file set (traversal).',make:d=>{d.files[0].path='../escape.json';return d;}},
  {file:'f-duplicate.json',code:'DP-BUN-002',where:'runs.json',note:'The same path twice.',make:d=>{d.files.push({...member(d,'runs.json')});return d;}},
  {file:'f-media.json',code:'DP-BUN-002',where:'SHA256SUMS',note:'SHA256SUMS declared as JSON.',make:d=>{member(d,'SHA256SUMS').mediaType='application/json';return d;}},
  {file:'f-lone-surrogate.json',code:'DP-BUN-002',where:'lineage.json',note:'Text that is not well-formed UTF-8 (a lone surrogate).',raw:d=>{const t=pretty(d),from='{\\n  \\"format\\": \\"datapass.bundle-lineage\\"';if(!t.includes('"text": "'+from))throw new Error('mutation missed');return t.replace('"text": "'+from,'"text": "\\ud800'+from);}},
  {file:'h-file-hash.json',code:'DP-BUN-003',where:'artifacts/orchard-monthly-yield.json',note:'Artifact text edited after hashing (one character of the source note changed).',make:d=>{const f=member(d,'artifacts/orchard-monthly-yield.json');f.text=f.text.replace('SYNTHETIC','SYNTHETlC');if(f.text===contoso)throw new Error('mutation missed');return d;}},
  {file:'h-reserialized.json',code:'DP-BUN-003',where:'artifacts/orchard-monthly-yield.json',note:'Artifact re-serialized compactly but the declared hash is the original text\'s: hashes cover exact bytes.',make:d=>{const f=member(d,'artifacts/orchard-monthly-yield.json');f.text=JSON.stringify(JSON.parse(f.text));return d;}},
  {file:'h-sums.json',code:'DP-BUN-004',where:'SHA256SUMS',note:'SHA256SUMS omits one file (its own hash entry is consistent).',make:d=>{const s=member(d,'SHA256SUMS');s.text=s.text.split('\n').filter(l=>!l.endsWith('inputs.json')).join('\n');s.sha256=sha(s.text);s.bytes=Buffer.byteLength(s.text,'utf8');return d;}},
  {file:'m-missing-runs.json',code:'DP-BUN-005',where:'runs.json',note:'runs.json is absent (SHA256SUMS lists what is present).',make:d=>{d.files=d.files.filter(f=>f.path!=='runs.json');return rehash(d);}},
  {file:'m-runs-shape.json',code:'DP-BUN-006',where:'runs.json',note:'A run with an unknown outcome.',make:d=>editJson(d,'runs.json',v=>{v.runs[0].outcome='done';})},
  {file:'m-inputs-shape.json',code:'DP-BUN-006',where:'inputs.json',note:'A captured input value that is an object.',make:d=>editJson(d,'inputs.json',v=>{v.runs[0].values.priceChangePct={pct:5};})},
  {file:'m-artifact-invalid.json',code:'DP-BUN-007',artifactCode:'DP-ART-013',where:'artifacts/orchard-monthly-yield.json',note:'The artifact itself is refused by the datapass.artifact validators (wrong format).',make:d=>{const f=member(d,'artifacts/orchard-monthly-yield.json');f.text=f.text.replace('"format": "datapass.artifact"','"format": "datapass.artefact"');return rehash(d);}},
  {file:'m-artifact-name.json',code:'DP-BUN-007',where:'artifacts/renamed.json',note:'The file name is not the artifact id.',make:d=>{const f=member(d,'artifacts/orchard-monthly-yield.json');f.path='artifacts/renamed.json';return editJson(rehash(d),'lineage.json',v=>{v.artifacts[0].path='artifacts/renamed.json';});}},
  {file:'m-reference.json',code:'DP-BUN-008',where:'runs.json',note:'A run names an artifact hash the bundle does not hold.',make:d=>editJson(d,'runs.json',v=>{v.runs[0].artifact.sha256='0'.repeat(64);})},
  {file:'m-lineage-drift.json',code:'DP-BUN-008',where:'lineage.json',note:'Lineage claims another provenance kind than the artifact declares.',make:d=>editJson(d,'lineage.json',v=>{v.artifacts[0].kind='computed';})},
  {file:'s-secret-key.json',code:'DP-BUN-009',where:'inputs.json',note:'A token-shaped key in the captured inputs (value is a placeholder, not a credential).',make:d=>editJson(d,'inputs.json',v=>{v.runs[0].values.runtimeToken='placeholder-not-a-secret';})},
];

const files=new Map(),fixtures=[];
for(const f of valid){
  const exported=await exportBundle(f.input());
  files.set('valid/'+f.file,exported.text);
  fixtures.push({file:'valid/'+f.file,expect:'accept',bundleSha256:exported.bundleSha256,files:exported.files,note:f.note});
}
const base=await exportBundle(valid[0].input());
for(const f of invalid){
  const doc=JSON.parse(base.text);
  const text=typeof f.raw==='string'?f.raw:typeof f.raw==='function'?f.raw(doc):pretty(f.make(doc));
  files.set('invalid/'+f.file,text);
  fixtures.push({file:'invalid/'+f.file,expect:'reject',code:f.code,where:f.where,...(f.artifactCode?{artifactCode:f.artifactCode}:{}),note:f.note});
}
const manifest={format:'datapass.bundle-corpus',version:1,
  note:'Every fixture is SYNTHETIC (invented values; the Contoso entry is a byte copy of the synthetic interop fixture). Decisions are asserted for the TypeScript validator and py/datapass_bundle.py: same code, same refused file, same hashes.',
  generator:'scripts/make-bundle-corpus.mjs',fixtures};
files.set('manifest.json',pretty(manifest));

if(checking){
  const present=new Set((await readdir(root,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(root,path.join(e.parentPath??e.path,e.name)).replace(/\\/g,'/')));
  for(const [name,content] of files){if((await readFile(path.join(root,name),'utf8').catch(()=>'')).replace(/\r\n/g,'\n')!==content)throw new Error('Bundle corpus drift: '+name+' (run node --experimental-strip-types scripts/make-bundle-corpus.mjs)');present.delete(name);}
  if(present.size)throw new Error('Unlisted bundle corpus files: '+[...present].join(', '));
  console.log('Bundle corpus matches its generator ('+files.size+' files).');
}else{
  await rm(root,{recursive:true,force:true});
  for(const [name,content] of files){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),content);}
  console.log('Wrote '+files.size+' bundle corpus files to '+root);
}

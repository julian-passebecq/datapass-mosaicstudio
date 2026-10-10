// FR-04: consumer interoperability with independently authored SYNTHETIC fixtures that mirror the shape of the current
// DataPass React 2.1 and Contoso Data Studio exports (real exports stay in private local evidence), and the versioned
// datapass.preview/1 consumer fixture for T3. Producer/consumer SHA vector: handoff/01-mosaicstudio/full-release-2026-10-10/receipts/FR-04.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readConceptJson} from '../src/framework/concept/index.ts';
import {validateArtifact,artifactDefinition} from '../src/framework/foundation/artifact.ts';
import {validatePreview,checkPreviewFiles} from '../scripts/preview-validate.mjs';

const DIR='tests/fixtures/interop/';
const CONCEPTS=['react-shape.synthetic.concept.json','contoso-shape.synthetic.concept.json'];
const ARTIFACT=DIR+'contoso-shape.synthetic.artifact.json';
const PREVIEW_DIR='spec/preview/v1/fixtures/synthetic-client';
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const run=(...args)=>spawnSync(process.execPath,args,{encoding:'utf8'});

test('synthetic concept fixtures pass the strict CLI validator and the viewer reader with no warnings, and say they are synthetic',async()=>{
  const r=run('scripts/concept-validate.mjs','--strict',...CONCEPTS.map(f=>DIR+f));
  assert.equal(r.status,0,r.stdout+r.stderr);
  for(const f of CONCEPTS){
    const text=await readFile(DIR+f,'utf8'),{spec,warnings}=readConceptJson(text),raw=JSON.parse(text);
    assert.deepEqual(warnings,[]);
    assert.equal(spec.provenance,'synthetic');assert.match(raw.note,/^SYNTHETIC\./);assert.match(raw.title,/SYNTHETIC/);
    assert.equal(raw.$schema,'https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/concept/v1/concept-spec.schema.json');
    assert.equal(raw.specVersion,'1.0.0');
  }
});

test('React-shape fixture keeps the exporter features a consumer must not drop: evidence, unresolved links in a side domain, merged items',async()=>{
  const spec=await json(DIR+CONCEPTS[0]);
  const side=spec.domains.filter(d=>d.placement==='side').map(d=>d.id);
  const unresolved=spec.nodes.filter(n=>side.includes(n.domain));
  assert.equal(unresolved.length,1);assert.equal(unresolved[0].status,'external');
  assert.ok(spec.flows.filter(f=>f.to===unresolved[0].id).length>=2,'unresolved links stay as flows');
  assert.ok(spec.annotations.some(a=>a.target===unresolved[0].id));
  assert.ok(spec.flows.some(f=>/inferred/.test(f.label)),'inferred confidence stays in the label');
  for(const item of [...spec.nodes,...spec.flows])for(const e of item.evidence??[])assert.ok(e.kind==='source'&&/^[\w./-]+:\d+$/.test(e.ref),e.ref);
  // A validation error in any of those parts is reported with its path, never silently dropped.
  const bad=structuredClone(spec);bad.flows.at(-1).to='ghost-unresolved';
  assert.throws(()=>readConceptJson(JSON.stringify(bad)),e=>e.issues.some(i=>i.path===`flows[${bad.flows.length-1}].to`));
});

test('Contoso-shape fixture keeps fractional layer heights, a side access domain and source paths on every node',async()=>{
  const spec=await json(DIR+CONCEPTS[1]);
  assert.ok(spec.layers.some(l=>!Number.isInteger(l.height)));
  assert.deepEqual(spec.domains.filter(d=>d.placement==='side').map(d=>d.id),['access']);
  assert.ok(spec.nodes.filter(n=>n.kind!=='user').every(n=>n.sources?.length>=1));
  assert.ok(spec.flows.some(f=>f.kind==='auth'));
});

/** Python mirror rule (py/datapass_artifact.py input_hash): sha256 of compact [{id,value}] sorted by id. */
const inputHash=inputs=>createHash('sha256').update(JSON.stringify(inputs.map(i=>({id:i.id,value:i.value??null})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)),'utf8').digest('hex');

test('Contoso-shape artifact fixture validates (structure and semantics), keeps units and lineage, and its inputHash is reproducible',async()=>{
  const raw=await json(ARTIFACT),a=validateArtifact(raw);
  artifactDefinition(a);
  assert.equal(a.provenance.kind,'synthetic');assert.match(a.provenance.source,/^SYNTHETIC/);assert.match(a.title,/SYNTHETIC/);
  assert.equal(a.provenance.producer.kind,'service');
  assert.equal(a.provenance.inputs.length,13);
  assert.equal(a.provenance.inputHash,inputHash(a.provenance.inputs));
  assert.deepEqual(a.representations.map(r=>r.kind),['table','chart','json']);
  const units=Object.fromEntries(a.payload.columns.map(c=>[c.id,c.unit]));
  assert.equal(units.revenue,'USD');assert.equal(units.margin_rate,'ratio');
  assert.ok(a.provenance.inputs.some(i=>i.evidence?.[0]?.path==='models/curated/monthly_yield.sql'));
});

test('artifact consumer rejects broken lineage and unknown fields with a readable reason',async()=>{
  const base=await json(ARTIFACT);
  const cases={
    'unknown provenance field':a=>{a.provenance.token='x';},
    'inputHash not sha256':a=>{a.provenance.inputHash='ABC';},
    'duplicate input id':a=>{a.provenance.inputs.push({...a.provenance.inputs[0]});},
    'self dependency':a=>{a.provenance.dependsOn=[a.id];},
    'representation input undeclared':a=>{a.representations[1].inputs=['nope'];},
    'unknown producer kind':a=>{a.provenance.producer.kind='kernel';},
    'non-finite value':a=>{a.payload.rows[0].revenue='12';},
    'evidence path escapes':a=>{a.provenance.inputs[7].evidence[0].path='../secret.sql';},
  };
  for(const [name,mutate] of Object.entries(cases)){const a=structuredClone(base);mutate(a);assert.throws(()=>validateArtifact(a),Error,name);}
});

test('datapass.preview/1 consumer fixture validates, re-hashes byte for byte and is labelled synthetic',async()=>{
  const r=run('scripts/preview-validate.mjs',PREVIEW_DIR+'/preview.json','--check-files','--json');
  assert.equal(r.status,0,r.stdout+r.stderr);
  const doc=await json(PREVIEW_DIR+'/preview.json');
  assert.deepEqual(validatePreview(doc),{ok:true,issues:[]});
  assert.equal(doc.sourceCommit,null,'a fixture is not a build of any commit');
  assert.equal(doc.publication.mode,'preview');
  const artifact=validateArtifact(await json(PREVIEW_DIR+'/'+doc.artifacts[0].path));
  assert.equal(artifact.provenance.kind,doc.artifacts[0].provenance);
  assert.match(await readFile(PREVIEW_DIR+'/index.html','utf8'),/SYNTHETIC consumer fixture/);
});

test('a changed, missing or extra file in the preview fixture is reported (exit 1), never served as verified',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'preview-fixture-'));
  try{
    await cp(PREVIEW_DIR,dir,{recursive:true});
    await writeFile(path.join(dir,'index.html'),(await readFile(path.join(dir,'index.html'),'utf8')).replace('Synthetic client','Changed'));
    await writeFile(path.join(dir,'extra.js'),'x');
    const doc=await json(path.join(dir,'preview.json')),issues=await checkPreviewFiles(doc,dir);
    assert.deepEqual(issues.map(i=>i.message).sort(),['content differs: index.html','unlisted file: extra.js']);
    assert.equal(run('scripts/preview-validate.mjs',path.join(dir,'preview.json'),'--check-files').status,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

/**
 * What T3 (t3code-datapass origin/main 3dfcecd, apps/server/src/mosaic/MosaicStudio.ts + mosaicReceipt.ts) reads from a
 * built client folder, re-stated here so a fixture change that would break that host fails in this repository:
 * index.html must exist, studio-build.json capabilities are strings, contract documents (artifacts/ or *.concept.json)
 * have format/version 1/id/title/provenance(kind+source)/payload/representations, and preview.json is not one of them.
 * T3 at that revision does not read preview.json; it hashes it with every other file.
 */
const T3_KINDS=new Set(['synthetic','provided','computed']);
function t3Summary(file,doc){
  if(!doc||typeof doc!=='object'||!['datapass.artifact','datapass.concept-spec'].includes(doc.format))return undefined;
  const problems=[];if(doc.version!==1)problems.push('version is not 1');
  for(const f of ['id','title'])if(typeof doc[f]!=='string'||!doc[f])problems.push('missing '+f);
  const p=doc.provenance&&typeof doc.provenance==='object'?doc.provenance:undefined;
  if(!p)problems.push('missing provenance');else if(doc.format==='datapass.artifact'){if(!T3_KINDS.has(p.kind))problems.push('provenance.kind');if(typeof p.source!=='string')problems.push('missing provenance.source');}
  for(const f of doc.format==='datapass.artifact'?['payload','representations']:['layers','domains','nodes','flows'])if(doc[f]===undefined)problems.push('missing '+f);
  return {file,format:doc.format,problems};
}
test('the preview fixture is compatible with what T3 3dfcecd inspects in a client folder',async()=>{
  const doc=await json(PREVIEW_DIR+'/preview.json');
  assert.ok(existsSync(PREVIEW_DIR+'/index.html'));
  const build=await json(PREVIEW_DIR+'/studio-build.json');
  assert.ok(Array.isArray(build.capabilities)&&build.capabilities.every(c=>typeof c==='string'));
  assert.deepEqual(build.capabilities,doc.capabilities);
  assert.equal(t3Summary('preview.json',doc),undefined,'T3 does not mistake preview.json for a contract document');
  for(const a of doc.artifacts)assert.deepEqual(t3Summary(a.path,await json(PREVIEW_DIR+'/'+a.path)),{file:a.path,format:'datapass.artifact',problems:[]});
  // Known T3-side gap at 3dfcecd (reported, not changed here): its check treats `provenance` as an object for every
  // contract, but datapass.concept-spec v1 provenance is the string "documented" or "synthetic", so T3 lists a false
  // "missing provenance" problem for every valid concept spec. Nothing else is flagged.
  for(const f of CONCEPTS)assert.deepEqual(t3Summary(f,await json(DIR+f)).problems,['missing provenance']);
  assert.ok(doc.artifacts.length<=50,'T3 lists at most 50 contract documents');
  for(const f of doc.files)assert.ok(f.bytes<=1024*1024,'T3 refuses contract documents above 1 MB');
});

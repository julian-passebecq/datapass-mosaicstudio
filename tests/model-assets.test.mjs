import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {syntheticModel,encodeGlb,modelTemplate,modelFixture} from '../scripts/templates/model.mjs';
import {validateModel,validateModelAsset,modelFields,modelBlock,readModelState,MODEL_LIMITS} from '../src/framework/model-assets/model.ts';
import {inspectGlb,validatePartBindings} from '../src/framework/model-assets/glb.ts';
import {verifyModelBytes,fetchModelBytes} from '../src/framework/model-assets/load.ts';
import {modelContext} from '../src/framework/model-assets/context.ts';
import {checkModelAssets} from '../scripts/model-assets.mjs';
import {scaffoldClient} from '../scripts/scaffold-client.mjs';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {planCapabilities} from '../src/framework/capabilities.ts';
import app from '../clients/model-reference/app.ts';
import {model} from '../clients/model-reference/model.ts';
const change=f=>{const fixture=syntheticModel();f(fixture.doc,fixture.binary);return encodeGlb(fixture.doc,fixture.binary);};
const clone=()=>structuredClone(model);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const definition=()=>({...app,manifest:structuredClone(app.manifest),resources:structuredClone(app.resources)});

test('committed fixture is deterministic and passes identity/profile/binding checks',async()=>{
  const bytes=await readFile('clients/model-reference/public/'+model.asset.path);assert.deepEqual(bytes,syntheticModel().bytes);assert.equal(hash(bytes),model.asset.sha256);
  const result=await verifyModelBytes(model.asset,bytes);validatePartBindings(model,result);assert.equal(result.document.nodes.length,12);assert.equal(result.vertices,324);assert.equal(result.triangles,108);
});
test('asset profile is immutable and its pure imports do not initialize graphics',()=>{const source=clone(),valid=validateModel(source);source.parts[0].label='mutated';assert.notEqual(valid.parts[0].label,'mutated');assert.ok(Object.isFrozen(valid.parts[0]));assert.equal(globalThis.document,undefined);});
test('model capability includes only the existing spatial engine and models',()=>{assert.deepEqual(planCapabilities(app).capabilities,['stories','spatial','models']);});
test('one part may own several mesh nodes but duplicate bindings are rejected',()=>{validatePartBindings(model,inspectGlb(syntheticModel().bytes));const s=clone();s.parts[1].node=1;assert.throws(()=>validateModel(s),/two semantic/);});
test('part owners cannot overlap through parent/child bindings',()=>{const s=clone();s.parts[1].node=2;assert.throws(()=>validatePartBindings(s,inspectGlb(syntheticModel().bytes)),/Nested/);});
test('orphan geometry, missing bindings and empty parts are not silently accepted',()=>{
  const asset=inspectGlb(syntheticModel().bytes);const s=clone();s.parts.pop();assert.throws(()=>validatePartBindings(s,asset),/Every mesh/);
  const t=clone();t.parts[0].node=100;assert.throws(()=>validatePartBindings(t,asset));
  const bytes=change(d=>{d.nodes.push({});d.nodes[0].children.push(12);});const u=clone();u.parts[0].node=12;assert.throws(()=>validatePartBindings(u,inspectGlb(bytes)),/no geometry/);
});
test('static profile refuses external buffers, data URLs, texture/decoder extensions and hidden runtime tracks',()=>{
  for(const edit of [d=>d.buffers[0].uri='https://example.com/model.bin',d=>d.buffers[0].uri='data:application/octet-stream;base64,AA==',d=>d.images=[{uri:'https://example.com/image.png'}],d=>d.extensionsUsed=['KHR_draco_mesh_compression'],d=>d.animations=[],d=>d.skins=[],d=>d.nodes[9].weights=[1]])assert.throws(()=>inspectGlb(change(edit)));
});
test('invalid GLB headers, size and chunk structure are rejected before allocation',()=>{
  const bytes=syntheticModel().bytes;for(const offset of [0,4,8,12,16]){const b=Buffer.from(bytes);b.writeUInt32LE(123,offset);assert.throws(()=>inspectGlb(b));}
  assert.throws(()=>inspectGlb(bytes.subarray(0,20)));assert.throws(()=>inspectGlb(Buffer.concat([bytes,Buffer.from([1,2,3,4])])));
});
test('asset identity mismatch and truncated files fail before rendering',async()=>{
  const bytes=syntheticModel().bytes;await assert.rejects(()=>verifyModelBytes({...model.asset,sha256:'0'.repeat(64)},bytes),/SHA-256/);await assert.rejects(()=>verifyModelBytes(model.asset,bytes.subarray(1)),/byte length/);
});
test('asset paths and declared budgets cannot smuggle URLs/traversal',()=>{
  for(const path of ['../a.glb','/a.glb','https://example.com/a.glb','a.glb?token=x','a.glb#x','a/%2e%2e/b.glb','a\\b.glb','a/./b.glb','a/../b.glb','a b.glb','a.gltf'])assert.throws(()=>validateModelAsset({...model.asset,path}));
  for(const byteLength of [0,NaN,MODEL_LIMITS.bytes+1])assert.throws(()=>validateModelAsset({...model.asset,byteLength}));
});
test('binary accessors cannot read beyond declared views or use incompatible indices',()=>{
  for(const edit of [d=>d.accessors[0].byteOffset=1000,d=>d.accessors[0].count=250001,d=>d.bufferViews[0].byteLength=4,d=>d.bufferViews[0].buffer=1,d=>d.accessors[0].componentType=5120,d=>d.accessors[0].sparse={},d=>d.meshes[0].primitives[0].indices=0])assert.throws(()=>inspectGlb(change(edit)));
});
test('nonfinite geometry and misleading min/max bounds fail preflight',()=>{
  assert.throws(()=>inspectGlb(change((_,bytes)=>bytes.writeFloatLE(NaN,0))),/Non-finite/);
  assert.throws(()=>inspectGlb(change(d=>d.accessors[0].max[0]=100)),/disagree/);
});
test('static mesh profile rejects points, morphs, UV textures and transparent material',()=>{
  for(const edit of [d=>d.meshes[0].primitives[0].mode=0,d=>d.meshes[0].primitives[0].targets=[],d=>d.meshes[0].primitives[0].attributes.TEXCOORD_0=0,d=>d.materials[0].alphaMode='BLEND',d=>d.materials[0].pbrMetallicRoughness.baseColorFactor[3]=.5])assert.throws(()=>inspectGlb(change(edit)));
});
test('invalid hierarchy cycles, duplicate roots, detached nodes and matrices fail preflight',()=>{
  for(const edit of [d=>d.nodes[1].children.push(0),d=>d.scenes[0].nodes.push(0),d=>d.nodes.push({}),d=>d.nodes[1].children.push(9),d=>d.nodes[1].matrix=Array(16).fill(0),d=>d.nodes[0].rotation=[0,0,0,0]])assert.throws(()=>inspectGlb(change(edit)));
});
test('huge repeated accessor declarations fail the decoded memory budget',()=>{
  assert.throws(()=>inspectGlb(change(d=>{d.accessors=Array.from({length:1025},()=>d.accessors[0]);})),/budget/);
});
test('model modes, annotation coordinates and evidence are bounded',()=>{
  for(const edit of [s=>s.parts[0].id='none',s=>s.annotations[0].part='unknown',s=>s.annotations.push(s.annotations[0]),s=>s.parts[0].explode=[NaN,0,0],s=>s.annotations[0].position=[100000,0,0],s=>s.parts[2].evidence[0].end=999]){const s=clone();edit(s);assert.throws(()=>validateModel(s));}
});
test('camera contract is the existing validated camera shape',()=>{for(const edit of [s=>s.cameras[0].position=s.cameras[0].target,s=>s.cameras[0].position=[NaN,0,0]]){const s=clone();edit(s);assert.throws(()=>validateModel(s));}});
test('same-origin transport refuses redirection, excessive streams and HTTP errors',async()=>{
  const signal=new AbortController().signal;
  await assert.rejects(()=>fetchModelBytes(model.asset,signal,'file:///tmp/index.html'),/HTTP/);
  await assert.rejects(()=>fetchModelBytes(model.asset,signal,'https://site.example/',async()=>new Response('',{status:404})),/failed/);
  await assert.rejects(()=>fetchModelBytes(model.asset,signal,'https://site.example/',async()=>new Response(new Uint8Array(model.asset.byteLength+1))),/exceeds/);
  await assert.rejects(()=>fetchModelBytes(model.asset,signal,'https://site.example/',async()=>new Response(new Uint8Array(20))),/Truncated/);
});
test('transport uses one credential-free, redirect-refusing request and preserves nested site paths',async()=>{
  let seen;const bytes=syntheticModel().bytes;
  const out=await fetchModelBytes(model.asset,new AbortController().signal,'https://site.example/subsite/?app=test',async(url,options)=>{seen={url,options};return new Response(bytes);});
  assert.deepEqual(Buffer.from(out),bytes);assert.equal(seen.url,'https://site.example/subsite/'+model.asset.path);assert.equal(seen.options.redirect,'error');assert.equal(seen.options.credentials,'omit');
});
test('aborted requests do not fetch or publish content',async()=>{const c=new AbortController();c.abort();let calls=0;await assert.rejects(()=>fetchModelBytes(model.asset,c.signal,'https://site.example/',async()=>{calls++;return new Response('');}));assert.equal(calls,0);});
test('model controls are view-only and invalid restored selection is atomic',()=>{
  const r=new SiteRuntime(app),block=app.manifest.pages[0].sections[0].blocks.find(b=>b.type==='model3d');assert.ok(modelFields(model).every(f=>f.role==='view'));
  r.patch({[block.selection]:'plate',[block.mode]:'exploded'});const saved=r.save('overview');assert.ok(!JSON.stringify(saved).includes('sha256'));assert.ok(!JSON.stringify(saved).includes('Geometry and semantics'));
  const before=r.getSnapshot();saved.values[block.selection]='unknown';assert.throws(()=>r.restore(saved));assert.equal(r.getSnapshot(),before);
});
test('declared field choices and numeric bounds match the model exactly',()=>{
  const d=definition();d.manifest.fields.find(f=>f.id==='model-explode').max=2;assert.throws(()=>new SiteRuntime(d),/bounds/);
  const e=definition();e.manifest.fields.find(f=>f.id==='model-mode').options.push({value:'physics',label:'Physics'});assert.throws(()=>new SiteRuntime(e),/choices/);
});
test('generic inspector keeps model description, exact references and uncertainty',()=>{
  const r=new SiteRuntime(app),b=modelBlock('m','assembly');r.set(b.selection,'plate');const c=modelContext(model,readModelState(b,r.getSnapshot().values));assert.equal(c.id,'plate');assert.equal(c.references[0].start,2);assert.match(c.note,/not engineering validation/);
});
test('client asset check verifies bytes and rejects symbolic paths',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-model-check-'));try{
    const files=modelTemplate({id:'test',title:'Test'});for(const [name,content] of Object.entries(files)){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),content);}
    const spec=modelFixture('test','Test').model,definition={manifest:{pages:[{sections:[{blocks:[{type:'model3d',resource:'test'}]}]}]},resources:{models:{test:spec}}};
    const result=await checkModelAssets(definition,root);assert.equal(result[0].vertices,324);
    const file=path.join(root,'public',spec.asset.path);await rm(file);await symlink('/dev/null',file);await assert.rejects(()=>checkModelAssets(definition,root),/Symbolic/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('fresh model scaffold is source-owned and refuses overwrite/ambiguous flags',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-model-scaffold-'));try{
    const folder=await scaffoldClient({id:'fresh-model',root,family:'spatial',model:true});const source=await readFile(path.join(folder,'app.ts'),'utf8');assert.match(source,/modelFields/);assert.ok(!source.includes('model-reference'));
    await assert.rejects(()=>scaffoldClient({id:'fresh-model',root,family:'spatial',model:true}));await assert.rejects(()=>scaffoldClient({id:'bad',root,family:'content',model:true}));
    assert.ok((await readFile(path.join(folder,'public/models/fresh-model/assembly.glb'))).length>28);
  }finally{await rm(root,{recursive:true,force:true});}
});

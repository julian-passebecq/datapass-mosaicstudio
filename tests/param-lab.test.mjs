/** param-lab prototype: parameter schema + geometry determinism (same params -> same mesh hash). */
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {PARAM_SCHEMA,defaultParams,validateParams,paramFields,nacaCode} from '../clients/param-lab/params.ts';
import {FEATURES,featureIdForCode,bladeFaceCode,HUB_CODE,selectionOptions} from '../clients/param-lab/features.ts';
import {buildModel,nacaRing,bladeMesh,hubMesh,toBinaryStl} from '../clients/param-lab/geometry.ts';
import {selectionDetails} from '../clients/param-lab/details.ts';

let kernelPromise;
const kernel=()=>kernelPromise??=Module().then(wasm=>{wasm.setup();return wasm;});

test('param schema is well formed and generates matching input fields',()=>{
  const ids=new Set();
  for(const p of PARAM_SCHEMA){
    assert.ok(/^p-[a-z-]+$/.test(p.id),p.id);assert.ok(!ids.has(p.id));ids.add(p.id);
    assert.ok(p.min<p.max&&p.step>0&&p.default>=p.min&&p.default<=p.max,p.id);
    const steps=(p.default-p.min)/p.step;assert.ok(Math.abs(steps-Math.round(steps))<1e-9,'default on step grid: '+p.id);
    assert.ok(p.help.length>10);
  }
  const fields=paramFields();
  assert.equal(fields.length,PARAM_SCHEMA.length);
  for(const f of fields){assert.equal(f.role,'input');assert.equal(f.type,'number');}
  assert.deepEqual(validateParams(defaultParams()),defaultParams());
  assert.throws(()=>validateParams({...defaultParams(),'p-span':10_000}),/outside/);
  assert.throws(()=>validateParams({...defaultParams(),'p-blades':2.5}),/integer/);
  assert.throws(()=>validateParams({...defaultParams(),'p-chord':'48'}),/finite number/);
  assert.equal(nacaCode(defaultParams()),'NACA 2412');
  assert.equal(nacaCode({...defaultParams(),'p-camber':0,'p-thickness':9}),'NACA 0009');
});

test('feature ids are stable, unique and round-trip through face codes',()=>{
  const ids=FEATURES.map(f=>f.id);assert.equal(new Set(ids).size,ids.length);
  for(const [key,code] of Object.entries(HUB_CODE))assert.equal(featureIdForCode(code),'hub.'+key);
  assert.equal(featureIdForCode(bladeFaceCode(1,'lower-surface')),'blade-2.lower-surface');
  assert.equal(featureIdForCode(0),null);
  assert.ok(selectionOptions().some(o=>o.value==='blade-4.leading-edge'));
  for(const f of FEATURES)for(const p of f.drivenBy)assert.ok(PARAM_SCHEMA.some(s=>s.id===p),f.id+' -> '+p);
});

test('NACA ring closes at the trailing edge and has the requested thickness',()=>{
  const ring=nacaRing(0,4,12,24);
  assert.equal(ring.length,48);
  assert.deepEqual(ring[24],[0,0]);
  assert.ok(Math.abs(ring[0][0]-1)<1e-12&&Math.abs(ring[0][1])<1e-12);
  const t=Math.max(...ring.map(p=>p[1]))*2;assert.ok(Math.abs(t-0.12)<0.002,'thickness '+t);
});

test('solids are closed and outward oriented; the kernel accepts them',async()=>{
  const wasm=await kernel(),P=defaultParams();
  for(const solid of [hubMesh(P),bladeMesh(P,0),bladeMesh({...P,'p-twist':25,'p-camber':9,'p-camber-pos':2},1)]){
    const edges=new Map();
    for(let i=0;i<solid.triangles.length;i+=3)for(let k=0;k<3;k++){const a=solid.triangles[i+k],b=solid.triangles[i+(k+1)%3];edges.set(a+','+b,(edges.get(a+','+b)||0)+1);}
    for(const [key,count] of edges){assert.equal(count,1,'duplicate directed edge '+key);const [a,b]=key.split(',');assert.ok(edges.has(b+','+a),'open edge '+key);}
    const m=new wasm.Manifold(new wasm.Mesh({numProp:3,vertProperties:new Float32Array(solid.positions),triVerts:new Uint32Array(solid.triangles),faceID:new Uint32Array(solid.codes)}));
    assert.ok(m.volume()>0);m.delete();
  }
});

test('same params -> same mesh hash; a changed param -> a different hash',async()=>{
  const wasm=await kernel(),P=defaultParams();
  const a=await buildModel(P,wasm),b=await buildModel({...P},wasm);
  assert.equal(a.kernel,'manifold-3d');
  assert.equal(a.hash,b.hash);assert.match(a.hash,/^[0-9a-f]{16}$/);
  // Golden value also observed in Chromium (worker, dev server): Node and browser agree.
  // Update deliberately if the generator, the defaults or the pinned manifold-3d change.
  assert.equal(a.hash,'b82f04e28788a35d');
  assert.deepEqual(a.metrics,b.metrics);
  assert.deepEqual([...a.faceCodes],[...b.faceCodes]);
  const c=await buildModel({...P,'p-twist':P['p-twist']+1},wasm);
  assert.notEqual(c.hash,a.hash);
  const d=await buildModel({...P,'p-blades':2},wasm);
  assert.notEqual(d.hash,a.hash);
  assert.ok(!d.features.includes('blade-3.upper-surface')&&a.features.includes('blade-3.upper-surface'));
  // The union buries the root caps and still carries every visible design face.
  for(const id of ['hub.nose','hub.body','hub.tail','blade-1.upper-surface','blade-1.lower-surface','blade-1.tip-face','blade-1.leading-edge'])assert.ok(a.features.includes(id),id);
  assert.ok(!a.features.includes('blade-1.root-face'),'root cap should be inside the hub');
  assert.equal(a.positions.length,a.faceCodes.length*9);assert.equal(a.normals.length,a.positions.length);
  assert.ok(a.metrics.volume>0&&a.metrics.area>0);
});

test('JS preview fallback is deterministic and labelled as a different kernel',async()=>{
  const P=defaultParams(),a=await buildModel(P,null,'test'),b=await buildModel(P,null,'test');
  assert.equal(a.kernel,'js-preview');assert.equal(a.hash,b.hash);
  assert.match(a.kernelNote,/no boolean union/);
  const exact=await buildModel(P,await kernel());assert.notEqual(a.hash,exact.hash);
});

test('STL export and selection details JSON',async()=>{
  const r=await buildModel(defaultParams(),await kernel());
  const stl=new DataView(toBinaryStl(r));assert.equal(stl.getUint32(80,true),r.metrics.triangles);assert.equal(stl.byteLength,84+50*r.metrics.triangles);
  const ctx=selectionDetails({featureId:'blade-2.leading-edge',params:defaultParams(),result:r,hit:[1.23456,2,3]});
  assert.equal(ctx.format,'param-lab.selection-details');assert.equal(ctx.feature.id,'blade-2.leading-edge');assert.equal(ctx.feature.kind,'edge');
  assert.deepEqual(ctx.feature.hitPoint,[1.235,2,3]);
  assert.ok(ctx.drivingParams.every(p=>typeof p.value==='number'&&p.min<p.max));
  assert.match(ctx.disclaimer,/ILLUSTRATIVE/);
  assert.equal(ctx.geometry.meshHash,r.hash);
  assert.equal(JSON.stringify(ctx),JSON.stringify(selectionDetails({featureId:'blade-2.leading-edge',params:defaultParams(),result:r,hit:[1.23456,2,3]})));
  assert.throws(()=>selectionDetails({featureId:'not-a-feature',params:defaultParams(),result:r}),/Unknown feature/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseConceptSpec} from '../src/framework/concept/schema.ts';
import {specs} from '../clients/arch-atlas/specs/index.ts';
import {layerCakeSvg as layeredSvg,flatRoutes} from '../src/framework/concept/flat.ts';
import {isometricSvg,toMotion,isoScreenPaths} from '../src/framework/concept/iso.ts';
import {grid,nodePosition} from '../src/framework/concept/layout.ts';
import {routes3d,countCrossings,front} from '../src/framework/concept/routing.ts';
import {filmFrame,navPose,step,transition,FILM_DURATION,OVERVIEW} from '../src/framework/concept/navigation.ts';
import {validateMotion} from '../src/framework/motion/model.ts';
import {loadClient} from '../scripts/load-client.mjs';
import {SiteRuntime} from '../src/framework/runtime.ts';

const sha=s=>createHash('sha256').update(s).digest('hex');
const clone=v=>structuredClone(v);
const [fabricPlatform,datapassStack]=specs;
const raw=async id=>JSON.parse(await readFile(`clients/arch-atlas/specs/${id}.concept.json`,'utf8'));

test('the atlas reads concept spec v1 files; the DataPass stack cites a source for every node',async()=>{
  assert.deepEqual(specs.map(s=>s.id),['fabric-platform','datapass-stack']);
  for(const s of specs){assert.equal(s.format,'datapass.concept-spec');assert.deepEqual(parseConceptSpec(await raw(s.id)),s);}
  assert.ok(datapassStack.nodes.every(n=>n.sources.length>0));
  assert.equal(fabricPlatform.provenance,'synthetic');
  assert.equal(fabricPlatform.nodes.filter(n=>n.kind==='lake').length,1);
});

test('the concept viewer example of the DataPass stack is the atlas file (one source of truth)',async()=>{
  const viewer=JSON.parse(await readFile('clients/concept-viewer/public/examples/datapass-stack.concept.json','utf8'));
  const atlas=await raw('datapass-stack');delete viewer.$schema;delete atlas.$schema;
  assert.deepEqual(viewer,atlas);
});

test('layout is deterministic: same spec, same SVG bytes, matching the committed diagrams',async()=>{
  for(const s of specs){
    const a=layeredSvg(s),b=layeredSvg(parseConceptSpec(clone(s))),i1=isometricSvg(s),i2=isometricSvg(parseConceptSpec(clone(s)));
    assert.equal(sha(a),sha(b));assert.equal(sha(i1),sha(i2));
    const committed=async kind=>(await readFile(`clients/arch-atlas/qa/diagrams/${s.id}.${kind}.svg`,'utf8')).replace(/\r\n/g,'\n');
    assert.equal(sha(a),sha(await committed('layered')),'Run tools/export-svg.mjs and commit: layered SVG is stale for '+s.id);
    assert.equal(sha(i1),sha(await committed('isometric')),'Run tools/export-svg.mjs and commit: isometric SVG is stale for '+s.id);
  }
});

test('2D and 3D share ids: every node, layer and flow is addressable in each representation',()=>{
  for(const s of specs){
    const flat=layeredSvg(s),iso=isometricSvg(s),g=grid(s);
    for(const n of s.nodes){
      assert.ok(flat.includes(`data-node="${n.id}"`),n.id+' in layered');
      assert.ok(iso.includes(`data-entity="${n.id}"`),n.id+' in isometric');
      assert.ok(nodePosition(g,n.id).every(Number.isFinite));
    }
    for(const l of s.layers){assert.ok(flat.includes(`data-layer="${l.id}"`));assert.ok(iso.includes(`data-layer="${l.id}"`));}
    const routes=flatRoutes(s);
    for(const f of s.flows){
      assert.ok(flat.includes(`data-flow="${f.id}"`));
      const p=routes.get(f.id);assert.ok(p.length>=2&&p.flat().every(Number.isFinite));
      for(let k=1;k<p.length;k++)assert.ok(p[k][0]===p[k-1][0]||p[k][1]===p[k-1][1],'orthogonal flat route '+f.id);
      assert.ok(routes3d(s,g).get(f.id).flat().every(Number.isFinite));
    }
    assert.doesNotThrow(()=>validateMotion(toMotion(s)),'isometric goes through the framework Motion v2 validator');
  }
});

test('navigation and film are pure functions of their inputs',()=>{
  const s=fabricPlatform;
  assert.deepEqual(filmFrame(s,12.34),filmFrame(s,12.34));
  assert.deepEqual(filmFrame(s,-5).pose,filmFrame(s,0).pose);
  assert.deepEqual(filmFrame(s,FILM_DURATION+9).pose,filmFrame(s,FILM_DURATION).pose);
  assert.equal(filmFrame(s,21.5).selection,'sales-model');
  assert.ok(filmFrame(s,27).diagram>.99&&filmFrame(s,10).diagram===0);
  const a=navPose(s,{layer:OVERVIEW,domain:-1,selection:'none'}),b=navPose(s,{layer:3,domain:1,selection:'none'});
  assert.deepEqual(transition(a,b,0),{...a,shift:0});assert.deepEqual(transition(a,b,5000),{...b,shift:0});assert.deepEqual(transition(a,b,10,true),b);
  assert.deepEqual(step(s,{layer:OVERVIEW,domain:-1,selection:'none'},'up'),{layer:0,domain:-1,selection:'none'});
  assert.deepEqual(step(s,{layer:5,domain:-1,selection:'none'},'up'),{layer:5,domain:-1,selection:'none'});
  assert.deepEqual(step(s,{layer:2,domain:-1,selection:'none'},'right'),{layer:2,domain:0,selection:'none'});
  assert.deepEqual(step(s,{layer:2,domain:3,selection:'none'},'right'),{layer:2,domain:3,selection:'none'});
  assert.deepEqual(step(s,{layer:2,domain:1,selection:'sales-model'},'down'),{layer:2,domain:1,selection:'none'});
});

test('the client loads and its view state rejects nodes of another architecture atomically',async()=>{
  const runtime=new SiteRuntime(await loadClient('arch-atlas'));
  runtime.applyCue({'atlas-selection':'sales-model','atlas-layer':3,'atlas-group':1});
  const before=runtime.getSnapshot();
  assert.throws(()=>runtime.set('atlas-selection','compute-service'),/current architecture/);
  assert.strictEqual(runtime.getSnapshot(),before);
  assert.throws(()=>runtime.set('atlas-layer',6),/Layer/);
  runtime.applyCue({'atlas-spec':'datapass-stack','atlas-selection':'compute-service','atlas-layer':-1,'atlas-group':-1});
  assert.equal(runtime.getSnapshot().values['atlas-selection'],'compute-service');
});

const planeLength=paths=>paths.reduce((sum,p)=>sum+p.slice(1).reduce((t,q,i)=>t+(q[2]>-1&&p[i][2]>-1?Math.hypot(q[0]-p[i][0],q[1]-p[i][1],q[2]-p[i][2]):0),0),0);
test('3D pipes are bundled behind the icons and leave the icon plane empty (fabric platform: 10 crossings, as in N2)',()=>{
  const report={};
  for(const s of specs){
    const g=grid(s),r=routes3d(s,g),after=s.flows.map(f=>r.get(f.id));
    report[s.id]=countCrossings(after.map(p=>p.map(front)));
    assert.equal(planeLength(after),0,'no pipe runs through the icon plane');
    for(const p of after)for(let k=1;k<p.length;k++)assert.ok(p[k].filter((v,i)=>Math.abs(v-p[k-1][i])>1e-9).length<=1,'orthogonal 3D segment');
  }
  assert.equal(report['fabric-platform'],10);assert.equal(report['datapass-stack'],0);
});
test('isometric routes are deterministic and keep crossings bounded',()=>{
  for(const s of specs){
    const paths=isoScreenPaths(s);
    assert.deepEqual(isoScreenPaths(parseConceptSpec(clone(s))),paths);
    assert.ok(countCrossings(paths)<=12,s.id+' iso crossings '+countCrossings(paths));
  }
});

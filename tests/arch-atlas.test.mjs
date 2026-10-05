import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateSpec,NODE_KINDS} from '../clients/arch-atlas/spec.ts';
import {specs} from '../clients/arch-atlas/specs/index.ts';
import {fabricPlatform} from '../clients/arch-atlas/specs/fabricPlatform.ts';
import {datapassStack} from '../clients/arch-atlas/specs/datapassStack.ts';
import {layeredSvg,isometricSvg,toMotion,flatRoutes} from '../clients/arch-atlas/svg.ts';
import {grid,route3d,nodePosition} from '../clients/arch-atlas/layout.ts';
import {GLYPH_KINDS} from '../clients/arch-atlas/glyphs.ts';
import {filmFrame,navPose,step,transition,FILM_DURATION,OVERVIEW} from '../clients/arch-atlas/navigation.ts';
import {validateMotion} from '../src/framework/motion/model.ts';
import {loadClient} from '../scripts/load-client.mjs';
import {SiteRuntime} from '../src/framework/runtime.ts';

const sha=s=>createHash('sha256').update(s).digest('hex');
const clone=v=>structuredClone(v);

test('both demo specs validate; the DataPass stack cites a source for every node',()=>{
  assert.deepEqual(specs.map(s=>s.id),['fabric-platform','datapass-stack']);
  for(const s of specs)assert.equal(validateSpec(clone(s)).id,s.id);
  assert.ok(datapassStack.nodes.every(n=>n.sources.length>0));
  assert.equal(fabricPlatform.provenance,'synthetic');
  assert.equal(fabricPlatform.nodes.filter(n=>n.kind==='lake').length,1);
});

test('spec validation fails closed',()=>{
  const bad=[
    [s=>{s.nodes[1].kind='spaceship';},/unknown node kind/],
    [s=>{s.nodes[1].layer='nowhere';},/unknown layer/],
    [s=>{s.nodes[2].id=s.nodes[1].id;},/duplicate id/],
    [s=>{s.edges[0].to='ghost';},/two distinct nodes/],
    [s=>{s.edges.push({...s.edges[0],id:'e-dup'});},/duplicate edge/],
    [s=>{s.nodes[0].layer=s.layers[2].id;},/bottom layer/],
    [s=>{s.provenance='documented';},/needs a source ref/],
    [s=>{s.extra=1;},/unknown field/],
    [s=>{for(let i=0;i<3;i++)s.nodes.push({...s.nodes[1],id:'erp-copy-'+i});},/more than 3 nodes/],
  ];
  for(const [mutate,error] of bad){const s=clone(fabricPlatform);mutate(s);assert.throws(()=>validateSpec(s),error);}
});

test('every node kind has a flat glyph (the same metaphor as its 3D icon)',()=>{
  assert.deepEqual([...GLYPH_KINDS].sort(),[...NODE_KINDS].sort());
});

test('layout is deterministic: same spec, same SVG bytes, matching the committed diagrams',async()=>{
  for(const s of specs){
    const a=layeredSvg(s),b=layeredSvg(clone(s)),i1=isometricSvg(s),i2=isometricSvg(clone(s));
    assert.equal(sha(a),sha(b));assert.equal(sha(i1),sha(i2));
    const committed=async kind=>(await readFile(`clients/arch-atlas/qa/diagrams/${s.id}.${kind}.svg`,'utf8')).replace(/\r\n/g,'\n');
    assert.equal(sha(a),sha(await committed('layered')),'Run tools/export-svg.mjs and commit: layered SVG is stale for '+s.id);
    assert.equal(sha(i1),sha(await committed('isometric')),'Run tools/export-svg.mjs and commit: isometric SVG is stale for '+s.id);
  }
});

test('2D and 3D share ids: every node, layer and edge is addressable in each representation',()=>{
  for(const s of specs){
    const flat=layeredSvg(s),iso=isometricSvg(s),g=grid(s);
    for(const n of s.nodes){
      assert.ok(flat.includes(`data-node="${n.id}"`),n.id+' in layered');
      assert.ok(iso.includes(`data-entity="${n.id}"`)||iso.includes(`data-node="${n.id}"`),n.id+' in isometric');
      assert.ok(nodePosition(g,n.id).every(Number.isFinite));
    }
    for(const l of s.layers){assert.ok(flat.includes(`data-layer="${l.id}"`));assert.ok(iso.includes(`data-layer="${l.id}"`));}
    const routes=flatRoutes(s);
    s.edges.forEach((e,i)=>{
      assert.ok(flat.includes(`data-edge="${e.id}"`));
      const p=routes.get(e.id);assert.ok(p.length>=2&&p.flat().every(Number.isFinite));
      for(let k=1;k<p.length;k++)assert.ok(p[k][0]===p[k-1][0]||p[k][1]===p[k-1][1],'orthogonal flat route '+e.id);
      assert.ok(route3d(s,g,e,i).flat().every(Number.isFinite));
    });
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
  const a=navPose(s,{layer:OVERVIEW,group:-1,selection:'none'}),b=navPose(s,{layer:3,group:1,selection:'none'});
  assert.deepEqual(transition(a,b,0),{...a,shift:0});assert.deepEqual(transition(a,b,5000),{...b,shift:0});assert.deepEqual(transition(a,b,10,true),b);
  assert.deepEqual(step(s,{layer:OVERVIEW,group:-1,selection:'none'},'up'),{layer:0,group:-1,selection:'none'});
  assert.deepEqual(step(s,{layer:5,group:-1,selection:'none'},'up'),{layer:5,group:-1,selection:'none'});
  assert.deepEqual(step(s,{layer:2,group:-1,selection:'none'},'right'),{layer:2,group:0,selection:'none'});
  assert.deepEqual(step(s,{layer:2,group:3,selection:'none'},'right'),{layer:2,group:3,selection:'none'});
  assert.deepEqual(step(s,{layer:2,group:1,selection:'sales-model'},'down'),{layer:2,group:1,selection:'none'});
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

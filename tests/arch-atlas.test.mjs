import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateSpec,NODE_KINDS} from '../clients/arch-atlas/spec.ts';
import {specs} from '../clients/arch-atlas/specs/index.ts';
import {fabricPlatform} from '../clients/arch-atlas/specs/fabricPlatform.ts';
import {datapassStack} from '../clients/arch-atlas/specs/datapassStack.ts';
import {layeredSvg,isometricSvg,toMotion,flatRoutes,isoScreenPaths} from '../clients/arch-atlas/svg.ts';
import {grid,route3dDirect,nodePosition} from '../clients/arch-atlas/layout.ts';
import {routes3d,countCrossings,front} from '../clients/arch-atlas/routing.ts';
import {KIND_GLYPH} from '../clients/arch-atlas/isoGlyphs.ts';
import {hasMotionGlyph} from '../src/framework/motion/glyphs.ts';
import {compileMotion} from '../src/framework/motion/compile.ts';
import {motionSvg} from '../src/framework/motion/export.ts';
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
      assert.ok(routes3d(s,g).get(e.id).flat().every(Number.isFinite));
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

/* ---------- N2: framework isometric features and bundled routing ---------- */
const planeLength=paths=>paths.reduce((sum,p)=>sum+p.slice(1).reduce((t,q,i)=>t+(q[2]>-1&&p[i][2]>-1?Math.hypot(q[0]-p[i][0],q[1]-p[i][1],q[2]-p[i][2]):0),0),0);
test('isometric export is the framework output: layer planes, kind glyphs, domains, attached labels, no client post-processing',()=>{
  for(const s of specs){
    const svg=isometricSvg(s),framework=motionSvg(compileMotion(toMotion(s)),0,'isometric');
    assert.equal(svg,framework.replace('<svg ',`<svg data-atlas="${s.id}" data-representation="isometric" data-renderer="framework-motion-v2" `)+'\n');
    for(const n of s.nodes){assert.ok(hasMotionGlyph(KIND_GLYPH[n.kind]),n.kind);assert.ok(svg.includes(`data-entity="${n.id}" data-glyph="${KIND_GLYPH[n.kind]}">`),n.id+' glyph');}
    assert.ok(!svg.includes('data-glyph-fallback'));
    const m=toMotion(s);
    assert.equal(m.layers.length,s.layers.length);assert.ok(m.groups.length>=s.groups.length);
    for(const g of s.groups)assert.equal(m.groups.filter(x=>x.label===g.label).length,s.nodes.some(n=>n.group===g.id&&n.kind!=='lake')?1:0,'one label per domain');
    for(const e of s.edges)assert.equal(m.links.find(l=>l.id===e.id).style,e.kind==='control'?'dashed':'solid');
  }
});
test('every node kind has an isometric glyph in the registry (framework built-in or atlas extension)',()=>{
  for(const k of NODE_KINDS)assert.ok(hasMotionGlyph(KIND_GLYPH[k]),k);
});
test('3D pipes are bundled behind the icons with no more crossings than N1, and leave the icon plane empty',()=>{
  const report={};
  for(const s of specs){
    const g=grid(s),before=s.edges.map((e,i)=>route3dDirect(s,g,e,i)),r=routes3d(s,g),after=s.edges.map(e=>r.get(e.id));
    const cb=countCrossings(before.map(p=>p.map(front))),ca=countCrossings(after.map(p=>p.map(front)));
    report[s.id]={crossings:[cb,ca],iconPlane:[Math.round(planeLength(before)),Math.round(planeLength(after))]};
    assert.ok(ca<=cb,s.id+' crossings '+cb+' -> '+ca);
    assert.equal(planeLength(after),0,'no pipe runs through the icon plane');
    assert.ok(planeLength(before)>20);
    for(const p of after)for(let k=1;k<p.length;k++)assert.ok(p[k].filter((v,i)=>Math.abs(v-p[k-1][i])>1e-9).length<=1,'orthogonal 3D segment');
    assert.deepEqual(routes3d(clone(s),grid(clone(s))),r,'deterministic');
  }
  assert.deepEqual(report['fabric-platform'].crossings,[11,10]);
});
test('isometric routes are deterministic and keep crossings bounded',()=>{
  for(const s of specs){
    const paths=isoScreenPaths(s);
    assert.deepEqual(isoScreenPaths(clone(s)),paths);
    assert.ok(countCrossings(paths)<=12,s.id+' iso crossings '+countCrossings(paths));
  }
});

test('lake edges rise straight out of the water in 3D and from the lake surface in the isometric scene',()=>{
  const s=clone(fabricPlatform);s.edges.push({id:'e-lake-lh',from:'shared-lake',to:'sales-lakehouse',kind:'data',label:'Files'});
  const r=routes3d(s,grid(s)).get('e-lake-lh');
  for(let k=1;k<r.length;k++)assert.ok(r[k].filter((v,i)=>Math.abs(v-r[k-1][i])>1e-9).length<=1);
  assert.ok(r[0][1]<.1,'starts at the water');
  const m=toMotion(s),link=m.links.find(l=>l.id==='e-lake-lh');
  assert.deepEqual(link.attach,{from:'surface',to:'side'});
  assert.doesNotThrow(()=>validateMotion(m));assert.match(isometricSvg(s),/data-link="e-lake-lh"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REGISTRY} from '../clients/galaxy-navigator/registry.generated.ts';
import {layout,search,neighbours,contractsOf,focusBox,labelSpot,strongest,STATUS_FILTERS} from '../clients/galaxy-navigator/registry.ts';
import {minimise,assertPublicSafe} from '../clients/galaxy-navigator/tools/registry.mjs';

const fixture={generated:'2026-01-01',apps:[
  {id:'alpha',name:'Alpha (A)',path:'C:\\secret\\alpha',repo:'org/alpha',stack:'TS',what:'free text',hub:true},
  {id:'beta',name:'Beta',path:'D:\\x',repo:'org/beta (GitLab, private)',stack:'Py'}],
  contracts:[{id:'alpha.feed/1',name:'Alpha feed',ownerApp:'alpha',consumers:['beta','gamma-repo'],status:'live',where:'C:\\Users\\someone\\x',notes:'n'},
    {id:'beta.self',name:'Beta internal',ownerApp:'beta',consumers:['beta'],status:'planned'}],
  connections:[{from:'beta',to:'alpha',kind:'http',contract:'beta.api',status:'branch'},{from:'alpha',to:'beta',kind:'file',contract:'alpha.feed/1',status:'live'}]};

test('minimise keeps only public-safe fields and derives repo nodes and edges',()=>{
  const r=minimise(fixture);
  assert.deepEqual(r.nodes.map(n=>[n.id,n.kind,n.repo]),[['alpha','app','alpha'],['beta','app','beta'],['gamma-repo','repo','gamma-repo']]);
  assert.ok(!JSON.stringify(r).includes('secret')&&!JSON.stringify(r).includes('free text')&&!JSON.stringify(r).includes('where'));
  assert.deepEqual(r.edges.map(e=>e.id),['alpha>beta:alpha.feed/1','alpha>gamma-repo:alpha.feed/1','beta>alpha:beta.api','beta>beta:beta.self']);
  assert.equal(r.edges.find(e=>e.id==='alpha>beta:alpha.feed/1').kind,'file');
  assert.throws(()=>minimise({...fixture,contracts:[{...fixture.contracts[0],status:'maybe'}]}),/Unknown status/);
  assert.throws(()=>assertPublicSafe({name:'C:\\Users\\x'}),/forbidden/);
});

test('committed snapshot is public-safe and consistent',async()=>{
  const text=await readFile('clients/galaxy-navigator/registry.generated.ts','utf8');
  assert.ok(!/[A-Za-z]:\\\\|\\\\Users\\\\/.test(text),'no local paths');
  const ids=new Set(REGISTRY.nodes.map(n=>n.id));
  assert.equal(ids.size,REGISTRY.nodes.length);
  for(const e of REGISTRY.edges)assert.ok(ids.has(e.from)&&ids.has(e.to),e.id);
  for(const c of REGISTRY.contracts)assert.ok(ids.has(c.owner),c.id);
});

test('layout is deterministic, inside the canvas and filters edges by status',()=>{
  const a=layout(REGISTRY),b=layout(REGISTRY);
  assert.deepEqual(a.nodes.map(n=>[n.id,n.x,n.y]),b.nodes.map(n=>[n.id,n.x,n.y]));
  assert.equal(a.nodes.length,REGISTRY.nodes.length);
  for(const n of a.nodes)assert.ok(n.x-n.r>=0&&n.x+n.r<=a.width&&n.y-n.r>=0&&n.y+n.r<=a.height,n.id);
  for(const c of a.clusters)assert.ok(c.x-c.r>=0&&c.x+c.r<=a.width&&c.y-c.r-20>=0&&c.y+c.r+20<=a.height,c.group.id);
  const live=layout(REGISTRY,{allowed:STATUS_FILTERS.live});
  assert.ok(live.pairs.length<a.pairs.length&&live.pairs.every(p=>p.edges.every(e=>e.status==='live')));
  assert.ok(a.pairs.every(p=>p.from!==p.to));
  assert.equal(strongest(['planned','live']),'live');
});

test('search, neighbours, contracts and focus box',()=>{
  assert.deepEqual(search(REGISTRY,''),[]);
  const hits=search(REGISTRY,'MONGO');
  assert.equal(hits[0].node,'mongoku');
  assert.ok(search(REGISTRY,'projection-envelope').some(h=>h.via==='contract'&&h.node==='mongoku'));
  const near=neighbours(REGISTRY,'atlasnote');assert.ok(near.has('mongoku')&&!near.has('atlasnote'));
  const {provides,consumes}=contractsOf(REGISTRY,'mongoku');
  assert.ok(provides.length>0&&consumes.length>0&&provides.every(c=>c.owner==='mongoku'));
  const g=layout(REGISTRY),box=focusBox(g,['powerops','atlasnote']);
  assert.ok(box.w<g.width&&Math.abs(box.w/box.h-g.width/g.height)<0.01);
  assert.deepEqual(focusBox(g,[]),{x:0,y:0,w:g.width,h:g.height});
  for(const n of g.nodes)assert.ok(['start','middle','end'].includes(labelSpot(n).anchor));
});

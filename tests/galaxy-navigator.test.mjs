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

/* ---------- N2: layered world, isometric export, matrix, board, camera tour ---------- */
const world=await import('../clients/galaxy-navigator/world.ts');
const {isometricSvg,toMotion}=await import('../clients/galaxy-navigator/iso.ts');
const {validateMotion}=await import('../src/framework/motion/index.ts');
const {VIEWS,asView}=await import('../clients/galaxy-navigator/views.ts');

test('layered world: planes at distinct heights, repos on the commons, one pipe per pair, deterministic',()=>{
  const w=world.buildWorld(REGISTRY),again=world.buildWorld(REGISTRY);
  assert.deepEqual(w.stations.map(s=>[s.id,s.position]),again.stations.map(s=>[s.id,s.position]));
  assert.deepEqual(w.pipes.map(p=>p.route),again.pipes.map(p=>p.route));
  assert.equal(w.stations.length,REGISTRY.nodes.length);
  assert.equal(new Set(w.planes.map(p=>p.z)).size,w.planes.length,'each group has its own height');
  assert.ok(w.planes.every(p=>p.z>0));
  assert.deepEqual([...w.commons.members].sort(),REGISTRY.nodes.filter(n=>n.kind==='repo').map(n=>n.id).sort());
  for(const s of w.stations)assert.equal(s.position[2],s.plane===world.COMMONS.id?0:w.planes.find(p=>p.id===s.plane).z,s.id);
  const pairs=new Set(REGISTRY.edges.filter(e=>e.from!==e.to).map(e=>e.from+'>'+e.to));
  assert.equal(w.pipes.length,pairs.size);
  assert.deepEqual(new Set(w.pipes.map(p=>p.lane)).size,w.pipes.length,'one lane per pipe');
  for(const p of w.pipes){
    assert.ok(p.route.length-2<=8,'isometric route budget: '+p.id);
    assert.ok(p.route.every(q=>q[0]>=w.bounds.x0&&q[0]<=w.bounds.x1&&q[1]>=w.bounds.y0&&q[1]<=w.bounds.y1),'route inside the commons: '+p.id);
  }
  const live=world.buildWorld(REGISTRY,'live');
  assert.ok(live.pipes.length<w.pipes.length&&live.pipes.every(p=>p.status==='live'));
  // Natural kinds come from the registry kind and stack text.
  const kinds=Object.fromEntries(w.stations.map(s=>[s.id,s.kind]));
  assert.equal(kinds['datapass-vscode'],'extension');assert.equal(kinds.diagramcloud,'webapp');assert.equal(kinds.powerops,'desktop');
  assert.equal(kinds.foil,'doc');assert.equal(kinds['foil-study'],'cli');assert.equal(kinds['datapass-vscode-common'],'repo');
});

test('isometric view is a valid framework Motion v2 scene and a deterministic standalone SVG',()=>{
  const spec=toMotion(world.buildWorld(REGISTRY));
  validateMotion(spec);
  assert.equal(spec.layers[0].texture,'water');
  assert.ok(spec.entities.every(e=>e.glyph?.startsWith('galaxy-')));
  const a=isometricSvg(),b=isometricSvg();
  assert.equal(a,b);
  assert.ok(a.includes('data-renderer="framework-motion-v2"')&&!a.includes('var(--'));
  for(const n of REGISTRY.nodes)assert.ok(a.includes(`data-entity="${n.id}"`),n.id);
  assert.ok(!/[A-Za-z]:\\|\\Users\\/.test(a),'no local paths in the export');
  assert.notEqual(isometricSvg('all','mongoku'),a,'selection is drawn');
  // Readable at document size: labels scale with the viewBox; plane titles have their own band.
  const w=Number(a.match(/viewBox="[^"]+"/)[0].split(/\s+/)[2]);
  const sizes=[...a.matchAll(/<text[^>]*text-anchor="middle" font-size="([\d.]+)"/g)].map(m=>Number(m[1]));
  assert.ok(sizes.length>=REGISTRY.nodes.length&&sizes.every(s=>s*1440/w>=10.99),'station labels >= 11 px at 1440 wide');
  assert.equal((a.match(/data-plane-title=""/g)||[]).length,world.buildWorld(REGISTRY).planes.length+1);
  // Trunks bundle the pipes per pair of planes, wider for more contracts.
  const wd=world.buildWorld(REGISTRY);
  assert.equal(wd.trunks.reduce((n,t)=>n+t.pipes.length,0),wd.pipes.length);
  assert.ok(wd.trunks.length<wd.pipes.length/2,'far fewer trunks than pipes');
  assert.ok(world.trunkRadius(9)>world.trunkRadius(1));
});

test('contract matrix and status board',()=>{
  const rows=world.matrixRows(REGISTRY);
  assert.equal(rows.length,REGISTRY.contracts.length);
  assert.equal(rows[0].status,'live');
  const byId=world.matrixRows(REGISTRY,'all','id'),desc=world.matrixRows(REGISTRY,'all','id',null,true);
  assert.deepEqual(byId.map(r=>r.id),[...desc.map(r=>r.id)].reverse());
  const focused=world.matrixRows(REGISTRY,'all','focus','mongoku');
  assert.ok(['P','PC'].includes(focused[0].roles.mongoku));
  const self=rows.find(r=>r.id==='control_changesets');assert.equal(self.roles.mongoku,'PC');
  assert.equal(world.matrixColumns(world.buildWorld(REGISTRY)).length,REGISTRY.nodes.length);
  const lanes=world.boardLanes(REGISTRY);
  assert.deepEqual(lanes.map(l=>l.status),world.BOARD_LANES);
  assert.equal(lanes.reduce((n,l)=>n+l.contracts.length,0),REGISTRY.contracts.length);
  assert.deepEqual(world.boardLanes(REGISTRY,'live').map(l=>l.status),['live']);
});

test('camera: fitted overview, focus pose, eased flight and a deterministic tour',()=>{
  const w=world.buildWorld(REGISTRY),home=world.overviewPose(w,16/9),narrow=world.overviewPose(w,.5);
  assert.ok(narrow.distance>home.distance,'narrow viewports pull back');
  const f=world.focusPose(w,'mongoku',home);assert.deepEqual(f.target.slice(0,2),w.byId.get('mongoku').position.slice(0,2));
  assert.deepEqual(world.flight(home,f,0,false),world.mixPose(home,f,0));
  assert.deepEqual(world.flight(home,f,10,true),f,'reduced motion jumps');
  assert.deepEqual(world.flight(home,f,world.CAMERA.flyMs*2,false).target,f.target);
  const keys=world.tourKeys(w);
  assert.equal(keys.at(-1).t,world.TOUR_SECONDS);assert.ok(world.TOUR_SECONDS>=20&&world.TOUR_SECONDS<=30);
  assert.ok(keys.every((k,i)=>i===0||k.t>=keys[i-1].t));
  assert.deepEqual(world.tourFrame(keys,12.3),world.tourFrame(keys,12.3));
  assert.ok(keys.some(k=>k.highlight==='mongoku'),'the tour visits the hub');
  assert.equal(world.clampPose({...home,elevation:9}).elevation,world.CAMERA.maxElevation);
  assert.deepEqual(VIEWS.map(v=>v.id),['galaxy3d','iso','graph','list','matrix','board']);
  assert.equal(asView('nope'),'graph');
});

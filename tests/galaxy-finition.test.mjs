import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SiteRuntime} from '../src/framework/index.ts';
import app from '../clients/galaxy-finition/app.ts';
import {snapshot,architecture,parsePassSnapshot,nodeId} from '../clients/galaxy-finition/pass.ts';

test('galaxy-finition snapshot: 13 retained apps, 5 paused, 24 declared edges',()=>{
  assert.equal(snapshot.apps.length,13);assert.equal(snapshot.paused.length,5);assert.equal(snapshot.edges.length,24);
  assert.ok(snapshot.paused.every(p=>p.status==='PAUSED_BY_OWNER'&&Object.keys(p).length===3));
  assert.deepEqual(snapshot.paused.map(p=>p.key).sort(),['12-datapass','13-agent','15-atlasnote','16-powerops','18-mongoku']);
  assert.equal(snapshot.snapshotTime,'2026-10-14T01:40+02:00');
  const pick=k=>{const a=snapshot.apps.find(x=>x.key===k);return [a.version,a.status,a.destination];};
  assert.deepEqual(pick('09-conceptmotion'),['1.2.0 (after 1.1.1)','PUBLISHED','private GitHub draft release']);
  assert.deepEqual(pick('07-contoso'),['0.3.0','PUBLISHED','private GitLab vault']);
  assert.deepEqual(pick('05-rayfin'),['0.4.1','PUBLISHED','private GitLab package registry']);
  assert.deepEqual(snapshot.apps.filter(a=>a.status.startsWith('STARTED')).map(a=>a.key),[]);
  assert.ok(snapshot.apps.every(a=>/^(DONE|PUBLISHED|RATIFIED|VERIFIED_NO_CHANGE)/.test(a.status)));
});
test('galaxy-finition graph: one node per app, edges follow dependency_keys',()=>{
  const keys=[...snapshot.apps,...snapshot.paused].map(a=>a.key);
  assert.deepEqual(architecture.nodes.map(n=>n.id).sort(),keys.map(nodeId).sort());
  assert.equal(architecture.edges.length,24);
  assert.ok(architecture.edges.some(e=>e.from===nodeId('01-mosaicstudio')&&e.to===nodeId('08-t3')));
  assert.ok(architecture.edges.some(e=>e.from===nodeId('16-powerops')&&e.to===nodeId('18-mongoku')));
  assert.equal(architecture.origin,'user-file');
});
test('galaxy-finition data stays within the public field rules',async()=>{
  const text=await readFile(new URL('../clients/galaxy-finition/data/pass.json',import.meta.url),'utf8');
  for(const bad of [/[A-Za-z]:[\/]/,/https?:\/\//i,/\blocal_[0-9a-f]/i,/\b[0-9a-f]{12,}\b/i,/@/,/vault[-_][a-z]/i,/sha256/i])assert.doesNotMatch(text,bad);
  const doc=JSON.parse(text);
  assert.throws(()=>parsePassSnapshot({...doc,apps:[{...doc.apps[0],receipt:'x'},...doc.apps.slice(1)]}),/fields/);
  assert.throws(()=>parsePassSnapshot({...doc,edges:[{from:'01-mosaicstudio',to:'99-missing'}]}),/Dangling/);
  assert.throws(()=>parsePassSnapshot({...doc,apps:[{...doc.apps[0],destination:'https://example.invalid/x'},...doc.apps.slice(1)]}),/non-public/);
});
test('galaxy-finition runtime: tables and counts resolve without 3D or workbench',()=>{
  const r=new SiteRuntime(app);
  assert.equal(r.dataset('apps').length,13);assert.equal(r.dataset('paused').length,5);assert.equal(r.dataset('dependencies').length,24);
  assert.equal(r.resolve({dataset:'summary',row:'retained',column:'value'}),13);
  assert.equal(r.resolve({dataset:'summary',row:'edges',column:'value'}),24);
  assert.equal(r.resolve({dataset:'summary',row:'published',column:'value'}),9);
  const types=r.manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks.map(b=>b.type)));
  assert.ok(!types.some(t=>['scene3d','model3d','explorer','runs'].includes(t)));
});

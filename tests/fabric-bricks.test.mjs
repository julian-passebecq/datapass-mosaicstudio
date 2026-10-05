import test from 'node:test';
import assert from 'node:assert/strict';
import {bricks,brickIds,fabricSources,SOURCE_STATUS} from '../clients/fabric-bricks/fixture.ts';
import {fabricScene} from '../clients/fabric-bricks/scene.ts';
import {validateScene} from '../src/framework/scene.ts';
import {validateEvidence,validateSources} from '../src/framework/evidence/model.ts';
import {kits,kitScenes,getBOM,kitCost,stepOffsets,pieceIds,collectionScene,pieceIndex,pieceAt} from '../clients/fabric-bricks/kits.ts';
import {pose,validatePoseOffsets} from '../src/framework/scene.ts';
import {loadClient} from '../scripts/load-client.mjs';
import {SiteRuntime} from '../src/framework/runtime.ts';

test('fabric bricks fixture is explicit synthetic provenance with stable semantic IDs',()=>{
  assert.equal(SOURCE_STATUS,'synthetic/provisional');
  assert.deepEqual(brickIds,['brick-alpha','brick-beta','brick-gamma','brick-delta']);
  assert.equal(new Set(brickIds).size,brickIds.length);
  const sources=validateSources(fabricSources);
  assert.ok(sources.every(source=>source.provenance==='synthetic'));
  for(const brick of bricks)assert.doesNotThrow(()=>validateEvidence([brick.evidence],sources));
});

test('reference kits retain semantic ownership, bounded scenes and reconciled synthetic part costs',()=>{
  assert.equal(kits.length,12);assert.ok(pieceIds.length<700);assert.equal(validateScene(collectionScene).entities.length,12);
  assert.equal(new Set(kits.map(k=>k.id)).size,12);assert.ok(kits.find(k=>k.id==='lakehouse').parts.length>=2*58,'Lakehouse keeps its 58 ids and gains detail');
  for(const kit of kits){
    const scene=validateScene(kitScenes[kit.id]),bom=getBOM(kit.id);
    assert.equal(bom.reduce((n,l)=>n+l.quantity,0),kit.parts.length);
    assert.equal(kitCost(kit.id),bom.reduce((n,l)=>n+l.quantity*l.price,0));
    assert.ok(scene.parts.every(p=>scene.entities.some(e=>e.id===p.entity)));
    assert.equal(new Set(scene.parts.map(p=>p.id)).size,kit.parts.length);
    assert.ok(scene.parts.every(p=>p.explode[0]===0&&p.explode[2]===0));
  }
});
test('individual piece identity belongs jointly to its kit and type; invalid restoration stays atomic',async()=>{
  const runtime=new SiteRuntime(await loadClient('fabric-bricks'));
  const roof=pieceIndex('lakehouse','roof-0-0');assert.equal(pieceAt('lakehouse',roof).id,'roof-0-0');
  runtime.applyCue({'fabric-selection':'roof','fabric-piece':roof,'fabric-level':'detail','fabric-camera':'focus-a'});
  const before=runtime.getSnapshot();
  assert.throws(()=>runtime.set('fabric-kit','notebook'),/current kit/);assert.strictEqual(runtime.getSnapshot(),before);
  assert.throws(()=>runtime.set('fabric-piece',pieceIndex('lakehouse','water-0-0')),/current kit/);assert.strictEqual(runtime.getSnapshot(),before);
  assert.throws(()=>runtime.set('fabric-piece',roof+.5),/declared step|whole ordinal/);assert.strictEqual(runtime.getSnapshot(),before);
  runtime.set('fabric-representation','3d');assert.equal(runtime.getSnapshot().values['fabric-piece'],roof);
  runtime.set('fabric-explode',1);assert.equal(runtime.getSnapshot().values['fabric-piece'],roof);
  assert.equal(Object.keys(runtime.getSnapshot().tasks).length,0);
});

test('kit progression and explosion are deterministic presentation offsets, with final assembly reversible',()=>{
  for(const kit of kits){
    const scene=kitScenes[kit.id];
    for(let step=1;step<=6;step++){
      const offsets=validatePoseOffsets(scene,stepOffsets(kit.id,step));
      assert.deepEqual(Object.keys(offsets),kit.parts.filter(p=>p.step>step).map(p=>p.id));
    }
    assert.deepEqual(stepOffsets(kit.id,6),{});
    for(const part of scene.parts){assert.deepEqual(pose(part,0,0).position,part.position);assert.equal(pose(part,1,0).position[1],part.position[1]+part.explode[1]);}
  }
});

test('joint kit state rejects incompatible restored selections and fractional steps atomically',async()=>{
  const runtime=new SiteRuntime(await loadClient('fabric-bricks'));
  runtime.applyCue({'fabric-screen':'detail','fabric-selection':'walls','fabric-level':'detail'});
  const before=runtime.getSnapshot();
  assert.throws(()=>runtime.set('fabric-kit','powerbi'),/current kit/);
  assert.strictEqual(runtime.getSnapshot(),before);
  assert.throws(()=>runtime.set('fabric-step',2.5),/declared step/);
  assert.strictEqual(runtime.getSnapshot(),before);
  runtime.applyCue({'fabric-kit':'powerbi','fabric-selection':'none','fabric-level':'overview','fabric-camera':'overview'});
  assert.equal(runtime.getSnapshot().values['fabric-kit'],'powerbi');
  assert.equal(Object.keys(runtime.getSnapshot().tasks).length,0);
});

test('fabric 3D scene projects exactly the same semantic brick universe',()=>{
  const scene=validateScene(fabricScene);
  assert.deepEqual(scene.entities.map(entity=>entity.id),brickIds);
  assert.deepEqual(scene.cameras.map(camera=>camera.id),['overview',...brickIds]);
  assert.ok(scene.parts.every(part=>part.entity&&brickIds.includes(part.entity)));
  assert.ok(scene.parts.some(part=>part.explode.some(value=>value!==0)),'explode must remain an authored presentation offset');
  assert.match(scene.note,/Synthetic procedural geometry only/);
});

test('autoplay film is a pure, bounded function of time with reduced-motion end states',async()=>{
  const {filmFrame,chapters,settledTime,frameTime,parseFilmParams,FILM_DURATION,FILM_FPS}=await import('../clients/fabric-bricks/timeline.ts');
  assert.equal(FILM_DURATION,25);assert.equal(FILM_FPS,30);
  for(const t of [0,2.5,5,7,10,15,20,25])assert.deepEqual(filmFrame(t),filmFrame(t),'same t must give the same frame');
  assert.deepEqual(filmFrame(-3),filmFrame(0));assert.deepEqual(filmFrame(99),filmFrame(25));
  const lake=kits.find(k=>k.id==='lakehouse');
  // Lakehouse is fully assembled at 5 s, exploded with ghosting at 7 s, and every kit stands in the collection at 10 s.
  const at5=filmFrame(5).kits.lakehouse.parts;assert.ok(lake.parts.every(p=>at5[p.id].visible&&Math.abs(at5[p.id].offset[1])<1e-6&&at5[p.id].ghost===0));
  const at7=filmFrame(7).kits.lakehouse.parts;assert.ok(at7['roof-0-0'].offset[1]>2.5);assert.ok(at7['roof-0-0'].ghost>.9);assert.equal(at7['walk-horizontal'].ghost,0);assert.equal(filmFrame(7).panel.lot,'boardwalk');
  const at10=filmFrame(10);assert.equal(at10.chapter,'collection');assert.ok(kits.every(k=>k.parts.every(p=>at10.kits[k.id].parts[p.id].visible)));
  assert.equal(filmFrame(15).chapter,'onelake');assert.equal(filmFrame(15).caption.title,'OneLake');
  // Build order follows the authored steps.
  const early=filmFrame(1.2).kits.lakehouse.parts;assert.ok(lake.parts.filter(p=>p.step===6).every(p=>early[p.id].ghost===1&&early[p.id].offset[1]===0));assert.equal(filmFrame(1.2).panel.step,2);
  assert.ok(chapters.every((c,i)=>c.start<c.rest&&c.rest<=c.end&&(i===0||chapters[i-1].end===c.start)));
  assert.equal(settledTime(6.1,true),7.4);assert.equal(settledTime(6.1,false),6.1);
  assert.equal(frameTime(7.01),7);assert.deepEqual(parseFilmParams('?app=fabric-bricks&film=1&t=7&paused=1&chrome=0'),{open:true,t:7,paused:true,chrome:false});
  assert.equal(parseFilmParams('?t=abc').open,false);
  // Captions only reuse existing kit copy.
  assert.equal(filmFrame(2).caption.body,lake.description);assert.equal(filmFrame(10).panel.mode,'gallery');
});

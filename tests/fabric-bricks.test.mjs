import test from 'node:test';
import assert from 'node:assert/strict';
import {bricks,brickIds,fabricSources,SOURCE_STATUS} from '../clients/fabric-bricks/fixture.ts';
import {fabricScene} from '../clients/fabric-bricks/scene.ts';
import {validateScene} from '../src/framework/scene.ts';
import {validateEvidence,validateSources} from '../src/framework/evidence/model.ts';
import {kits,kitScenes,getBOM,kitCost,stepOffsets} from '../clients/fabric-bricks/kits.ts';
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
  for(const kit of kits){
    const scene=validateScene(kitScenes[kit.id]),bom=getBOM(kit.id);
    assert.equal(bom.reduce((n,l)=>n+l.quantity,0),kit.parts.length);
    assert.equal(kitCost(kit.id),bom.reduce((n,l)=>n+l.quantity*l.price,0));
    assert.ok(scene.parts.every(p=>scene.entities.some(e=>e.id===p.entity)));
    assert.equal(new Set(scene.parts.map(p=>p.id)).size,kit.parts.length);
    assert.ok(scene.parts.every(p=>p.explode[0]===0&&p.explode[2]===0));
  }
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

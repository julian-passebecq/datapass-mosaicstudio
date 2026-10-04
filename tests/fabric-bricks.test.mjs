import test from 'node:test';
import assert from 'node:assert/strict';
import {bricks,brickIds,fabricSources,SOURCE_STATUS} from '../clients/fabric-bricks/fixture.ts';
import {fabricScene} from '../clients/fabric-bricks/scene.ts';
import {validateScene} from '../src/framework/scene.ts';
import {validateEvidence,validateSources} from '../src/framework/evidence/model.ts';

test('fabric bricks fixture is explicit synthetic provenance with stable semantic IDs',()=>{
  assert.equal(SOURCE_STATUS,'synthetic/provisional');
  assert.deepEqual(brickIds,['brick-alpha','brick-beta','brick-gamma','brick-delta']);
  assert.equal(new Set(brickIds).size,brickIds.length);
  const sources=validateSources(fabricSources);
  assert.ok(sources.every(source=>source.provenance==='synthetic'));
  for(const brick of bricks)assert.doesNotThrow(()=>validateEvidence([brick.evidence],sources));
});

test('fabric 3D scene projects exactly the same semantic brick universe',()=>{
  const scene=validateScene(fabricScene);
  assert.deepEqual(scene.entities.map(entity=>entity.id),brickIds);
  assert.deepEqual(scene.cameras.map(camera=>camera.id),['overview',...brickIds]);
  assert.ok(scene.parts.every(part=>part.entity&&brickIds.includes(part.entity)));
  assert.ok(scene.parts.some(part=>part.explode.some(value=>value!==0)),'explode must remain an authored presentation offset');
  assert.match(scene.note,/Synthetic procedural geometry only/);
});

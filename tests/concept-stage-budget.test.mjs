// FR-05: the 3D concept stage draws on demand. Ambient (settled) frames are budgeted from the measured frame cost so a
// software-WebGL frame cannot saturate the main thread of the viewer (and of its host page when embedded).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ambientInterval,AMBIENT_SHARE,AMBIENT_MAX_FPS,AMBIENT_MAX_INTERVAL_MS} from '../src/framework/concept/navigation.ts';

test('ambient interval: at most 30 fps on a fast GPU, at most a quarter of the main thread on a slow one, bounded',()=>{
  assert.equal(ambientInterval(1),1000/AMBIENT_MAX_FPS);
  assert.equal(ambientInterval(0),1000/AMBIENT_MAX_FPS);
  assert.equal(ambientInterval(40),40*AMBIENT_SHARE);
  assert.equal(ambientInterval(80),320);
  assert.equal(ambientInterval(1500),6000);
  assert.equal(ambientInterval(5000),AMBIENT_MAX_INTERVAL_MS);
  for(const bad of [NaN,-5,Infinity])assert.equal(ambientInterval(bad),1000/AMBIENT_MAX_FPS);
  for(const cost of [5,20,60,100])assert.ok(cost/(ambientInterval(cost))<=1/AMBIENT_SHARE+1e-9);
});

test('the stage loop skips frames when nothing moves and settles only after drawing the final pose',async()=>{
  const src=await readFile('src/framework/concept/react/ConceptStage.tsx','utf8');
  assert.match(src,/const due=moving\|\|wasMoving\|\|dirty\.current\|\|\(!reduced&&now-last>=interval\);\s*if\(!due\)return;/);
  assert.match(src,/interval=ambientInterval\(performance\.now\(\)-started\)/);
  assert.match(src,/if\(drewPrevious\)interval=Math\.max\(interval,ambientInterval\(now-previous-FRAME_SLACK_MS\)\);/);
  assert.match(src,/host\.current!\.dataset\.settled='false';dirty\.current=true;\s*try\{stage\.current=createStage/);
  assert.match(src,/new ResizeObserver\(\(\)=>\{stage\.current\?\.resize\(\);dirty\.current=true;\}\)/);
});

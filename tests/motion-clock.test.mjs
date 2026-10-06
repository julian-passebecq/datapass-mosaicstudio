import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {pipeline} from '../clients/motion-reference/pipeline.ts';
import {choreography} from '../clients/motion-reference/choreography.ts';
await mkdir('.generated', {recursive: true});
const output = path.resolve('.generated/motion-clock-test.mjs');
await build({entryPoints: ['src/framework/motion/controller.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external', alias: {'@vizforge': path.resolve('.upstream/vizforge/src')}, logLevel: 'silent'});
const {createMotionController} = await import(pathToFileURL(output).href);
function scheduler() {let id = 0; const jobs = new Map(); return {jobs, set(fn, delay) {const handle = ++id; jobs.set(handle, {fn, delay}); return handle;}, clear(handle) {jobs.delete(handle);}, tick() {const [key, job] = jobs.entries().next().value || []; if (job) {jobs.delete(key); job.fn();}}};}
test('motion uses the original player with no initial timer and one active timer', () => {const s = scheduler(), c = createMotionController(pipeline, false, s); assert.equal(s.jobs.size, 0); c.play(); assert.equal(s.jobs.size, 1); assert.equal([...s.jobs.values()][0].delay, 2600); s.tick(); assert.equal(c.player.getState().index, 1); assert.equal(s.jobs.size, 1); assert.equal([...s.jobs.values()][0].delay, 2800); c.player.dispose(); assert.equal(s.jobs.size, 0);});
test('seeking never schedules side effects or another playback loop', () => {const s = scheduler(), c = createMotionController(pipeline, false, s); c.play(); c.player.seek(3); assert.equal(s.jobs.size, 0); assert.equal(c.player.getState().playing, false); assert.equal(c.player.getScene().id, 'curate'); c.player.dispose();});
test('reduced motion prevents autoplay but preserves manual steps', () => {const s = scheduler(), c = createMotionController(pipeline, true, s); c.play(); assert.equal(s.jobs.size, 0); c.player.next(); assert.equal(c.player.getState().index, 1); c.player.dispose();});
test('last authored snapshot cannot loop or schedule another advance', () => {const s = scheduler(), c = createMotionController(pipeline, false, s); c.player.seek(3); c.play(); s.tick(); assert.equal(c.player.getState().index, 4); assert.equal(c.player.getState().playing, false); assert.equal(s.jobs.size, 0); c.play(); assert.equal(s.jobs.size, 0); c.player.dispose();});
test('pause supports StrictMode-style effect reattachment without disposing the controller', () => {const s = scheduler(), c = createMotionController(pipeline, false, s); const off = c.player.subscribe(() => {}); c.play(); c.player.pause(); off(); const off2 = c.player.subscribe(() => {}); c.play(); s.tick(); assert.equal(c.player.getState().index, 1); off2(); c.player.dispose();});
test('v2 lanes and annotation windows still use exactly one original player timer', () => {
  const s = scheduler(), c = createMotionController(choreography, false, s);
  assert.equal(s.jobs.size, 0); c.play(); assert.equal(s.jobs.size, 1); assert.equal([...s.jobs.values()][0].delay, 2400);
  s.tick(); assert.equal(c.player.getScene().id, 'stagger'); assert.equal(s.jobs.size, 1); assert.equal([...s.jobs.values()][0].delay, 2600);
  assert.equal(c.compiled.frames[1].timings['record-a'].position.endMs, 600);
  c.player.seek(3); assert.equal(s.jobs.size, 0); c.play(); assert.equal(s.jobs.size, 0); c.player.dispose();
});
test('v2 reduced motion preserves manual navigation without scheduling windows', () => {
  const s = scheduler(), c = createMotionController(choreography, true, s); c.play(); assert.equal(s.jobs.size, 0);
  c.player.next(); assert.equal(c.player.getScene().id, 'stagger'); assert.equal(s.jobs.size, 0); c.player.previous(); assert.equal(c.player.getScene().id, 'ready'); c.player.dispose();
});
test('invalid v2 choreography cannot allocate a partially active player', () => {
  const s = scheduler(), bad = structuredClone(choreography); bad.steps[1].commands[0].timing.endMs = 99999;
  assert.throws(() => createMotionController(bad, false, s)); assert.equal(s.jobs.size, 0);
});

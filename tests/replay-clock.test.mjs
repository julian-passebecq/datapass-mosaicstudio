import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {recording} from '../clients/energy-replay-reference/recording.ts';
// Bundle the small real upstream adapter, not a stand-in playback implementation.
await mkdir('.generated',{recursive:true});
const output=path.resolve('.generated/replay-clock-test.mjs');
await build({entryPoints:['src/framework/replay/controller.ts'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@vizforge':path.resolve('.upstream/vizforge/src')},logLevel:'silent'});
const {createReplayController}=await import(pathToFileURL(output).href);
function clock(){let id=0;const jobs=new Map();return {jobs,set(fn,delay){const n=++id;jobs.set(n,{fn,delay});return n;},clear(n){jobs.delete(n);},advance(){const [n,j]=jobs.entries().next().value||[];if(!j)return; jobs.delete(n);j.fn();}};}
test('real VizForge player does not autoplay and owns one sample timer',()=>{const time=clock(),c=createReplayController(recording,false,time);assert.equal(time.jobs.size,0);c.play();assert.equal(time.jobs.size,1);assert.equal([...time.jobs.values()][0].delay,1000);time.advance();assert.equal(c.getSnapshot().index,1);assert.equal(time.jobs.size,1);c.dispose();assert.equal(time.jobs.size,0);});
test('timestamp gaps and speed change alter the existing scheduler delay',()=>{const time=clock(),c=createReplayController(recording,false,time);c.seek(24);c.play();assert.equal([...time.jobs.values()][0].delay,4000);c.setSpeed('2');assert.equal(time.jobs.size,1);assert.equal([...time.jobs.values()][0].delay,2000);c.dispose();});
test('seek, next and previous stop automatic playback and publish one current sample',()=>{const time=clock(),c=createReplayController(recording,false,time);c.play();c.seek(12);assert.equal(c.getSnapshot().index,12);assert.equal(c.getSnapshot().playing,false);assert.equal(time.jobs.size,0);c.next();assert.equal(c.getSnapshot().index,13);c.previous();assert.equal(c.getSnapshot().index,12);c.dispose();});
test('reduced motion blocks autoplay and cancels a running sample timer',()=>{const time=clock(),c=createReplayController(recording,true,time);c.play();assert.equal(time.jobs.size,0);c.setReducedMotion(false);c.play();assert.equal(time.jobs.size,1);c.setReducedMotion(true);assert.equal(time.jobs.size,0);assert.equal(c.getSnapshot().playing,false);c.dispose();});
test('last sample stops and cannot schedule another tick',()=>{const time=clock(),c=createReplayController(recording,false,time);c.seek(recording.time.length-2);c.play();time.advance();assert.equal(c.getSnapshot().index,48);assert.equal(c.getSnapshot().playing,false);assert.equal(time.jobs.size,0);c.play();assert.equal(time.jobs.size,0);c.dispose();});
test('invalid seeks and speed are rejected without accepting a new frame',()=>{const time=clock(),c=createReplayController(recording,false,time);c.seek(3);assert.throws(()=>c.seek(-1));assert.equal(c.getSnapshot().index,3);assert.throws(()=>c.setSpeed('1000'));c.dispose();});
test('pause and unsubscribe support StrictMode-style effect replay without disposal',()=>{const time=clock(),c=createReplayController(recording,false,time);let changes=0;const off=c.subscribe(()=>changes++);c.play();c.pause();off();const before=changes;c.seek(4);assert.equal(changes,before);const off2=c.subscribe(()=>changes++);c.play();time.advance();assert.equal(c.getSnapshot().index,5);assert.ok(changes>before);off2();c.dispose();});

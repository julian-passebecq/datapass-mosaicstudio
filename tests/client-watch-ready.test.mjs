import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {waitForWatchedFiles} from '../scripts/client-watch-ready.mjs';
const root=path.resolve('clients','watch-contract'),files=['app.ts','publication.json'].map(name=>path.join(root,name));
class Watcher extends EventEmitter{watched={};getWatched(){return this.watched;}}
const empty=watcher=>assert.equal(watcher.eventNames().length,0);
test('watch readiness does not confuse a listening server or partial crawl with owned source coverage',async()=>{
  const w=new Watcher();let ready=false;const task=waitForWatchedFiles(w,files).then(()=>{ready=true;});
  w.watched[root]=['app.ts'];w.emit('ready');await Promise.resolve();assert.equal(ready,false);
  w.watched[root].push('publication.json');w.emit('add',files[1]);await task;assert.equal(ready,true);empty(w);
});
test('a watcher that already completed its crawl requires no second ready event',async()=>{
  const w=new Watcher();w.watched[root]=['app.ts','publication.json'];await waitForWatchedFiles(w,files);empty(w);
});
test('aborting watcher readiness rejects and removes every owned listener',async()=>{
  const w=new Watcher(),abort=new AbortController(),task=waitForWatchedFiles(w,files,{signal:abort.signal});
  abort.abort(new Error('Host stopped'));await assert.rejects(task,/Host stopped/);empty(w);
});
test('watcher errors are surfaced rather than publishing a false ready receipt',async()=>{
  const w=new Watcher(),task=waitForWatchedFiles(w,files);w.emit('error',new Error('Watch unavailable'));await assert.rejects(task,/Watch unavailable/);empty(w);
});
test('missing watched files fail with actionable diagnostics at the readiness deadline',async()=>{
  const w=new Watcher();await assert.rejects(waitForWatchedFiles(w,files,{timeoutMs:5}),/Vite has not armed.*app.ts.*publication.json/);empty(w);
});

test('readiness observes coverage even when the native ready event already passed',async()=>{
  const w=new Watcher(),task=waitForWatchedFiles(w,files);
  await Promise.resolve();w.watched[root]=['app.ts','publication.json'];
  await task;empty(w);
});

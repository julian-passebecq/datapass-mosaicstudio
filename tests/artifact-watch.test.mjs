import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {artifactIdForFile,createArtifactNotifier,artifactWatchPlugin,sha256,ARTIFACT_CHANGED_EVENT} from '../scripts/artifact-watch-plugin.mjs';

const dir=path.resolve('clients','demo','public','artifacts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(files){
  const sent=[];
  const notifier=createArtifactNotifier({send:data=>sent.push(data),read:async file=>{const v=files[path.basename(file)];if(v===undefined)throw new Error('ENOENT');return Buffer.from(v);},debounceMs:50});
  return {sent,notifier};
}

test('only <dir>/<artifact-id>.json files are artifacts (no temp files, manifest or other folders)',()=>{
  assert.equal(artifactIdForFile(path.join(dir,'wind-aep.json'),dir),'wind-aep');
  for(const name of ['manifest.json','.wind-aep.abc.tmp','wind-aep.json.tmp','Wind.json','wind-aep.parquet','__proto__.json'])assert.equal(artifactIdForFile(path.join(dir,name),dir),null,name);
  assert.equal(artifactIdForFile(path.join(dir,'nested','x.json'),dir),null);
});

test('debounce: a burst of writes sends one event with the last content',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const files={'a.json':'v1'},{sent,notifier}=harness(files);
  const file=path.join(dir,'a.json');
  notifier.notify('a',file);t.mock.timers.tick(20);files['a.json']='v2';notifier.notify('a',file);t.mock.timers.tick(20);files['a.json']='v3';notifier.notify('a',file);
  t.mock.timers.tick(49);await tick();assert.equal(sent.length,0);
  t.mock.timers.tick(1);await tick();await tick();
  assert.deepEqual(sent,[{id:'a',sha256:sha256(Buffer.from('v3'))}]);
});

test('sha dedupe: identical bytes, seeded content and duplicate watcher events send nothing; ids debounce separately',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const files={'a.json':'same','b.json':'b1'},{sent,notifier}=harness(files);
  notifier.seed('a',sha256(Buffer.from('same')));
  notifier.notify('a',path.join(dir,'a.json'));notifier.notify('b',path.join(dir,'b.json'));
  t.mock.timers.tick(50);await tick();await tick();
  assert.deepEqual(sent.map(e=>e.id),['b']);
  notifier.notify('b',path.join(dir,'b.json'));t.mock.timers.tick(50);await tick();await tick();
  assert.equal(sent.length,1,'unchanged rewrite must not be resent');
  files['a.json']='changed';notifier.notify('a',path.join(dir,'a.json'));t.mock.timers.tick(50);await tick();await tick();
  assert.deepEqual(sent.map(e=>e.id),['b','a']);
  delete files['a.json'];notifier.notify('a',path.join(dir,'a.json'));t.mock.timers.tick(50);await tick();await tick();
  assert.equal(sent.length,2,'an unreadable file is skipped');
  notifier.close();
});

test('plugin is dev-only and pushes the custom HMR event for watched artifact files',async()=>{
  const plugin=artifactWatchPlugin(dir,{debounceMs:1});
  assert.equal(plugin.apply,'serve');
  const handlers={},sent=[];
  const server={ws:{send:message=>sent.push(message)},watcher:{add(){},on(event,handler){handlers[event]=handler;}},httpServer:null};
  await plugin.configureServer(server);
  assert.ok(handlers.add&&handlers.change);
  handlers.change(path.join(dir,'manifest.json'));handlers.change(path.join(dir,'.x.tmp'));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(sent,[],'missing folder / ignored files send nothing');
  assert.equal(ARTIFACT_CHANGED_EVENT,'datapass:artifact-changed');
});

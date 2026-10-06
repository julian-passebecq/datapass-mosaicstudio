import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestartGate} from '../scripts/client-restart.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
  const log=[];let closing=false,release;
  const gate=createRestartGate({isClosing:()=>closing,
    restart:async()=>{log.push('restart');await new Promise(resolve=>{release=resolve;});log.push('restarted');},
    onReady:async()=>{log.push('ready');},onError:async error=>{log.push('invalid:'+error.message);}});
  return {gate,log,finish:()=>release(),close:()=>{closing=true;}};
}
test('a restart never starts while an HMR hook is still awaiting (Vite hotMap would go stale)',async()=>{
  const {gate,log,finish}=harness();let unblock;
  const hook=gate.hook(async()=>{gate.request();await new Promise(resolve=>{unblock=resolve;});log.push('hook returned');});
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(log,[],'restart must wait for the in-flight hook');
  unblock();await hook;for(let i=0;i<3;i++)await tick();
  assert.deepEqual(log,['hook returned','restart']);
  finish();await gate.settled();assert.deepEqual(log,['hook returned','restart','restarted','ready']);
});
test('a duplicate watcher event during a pending restart sees pending, not ready',async()=>{
  const {gate,log,finish}=harness();
  await gate.hook(async()=>{gate.request();});
  assert.equal(gate.pending,true,'the duplicate event for the same save must report restarting');
  for(let i=0;i<3;i++)await tick();assert.equal(gate.running,true);assert.equal(gate.pending,true);
  finish();await gate.settled();assert.equal(gate.pending,false);assert.deepEqual(log,['restart','restarted','ready']);
});
test('a change requested during a restart restarts once more before ready',async()=>{
  const {gate,log,finish}=harness();
  gate.request();for(let i=0;i<3;i++)await tick();assert.deepEqual(log,['restart']);
  gate.request();finish();for(let i=0;i<5;i++)await tick();
  assert.deepEqual(log,['restart','restarted','restart'],'no ready between the two restarts');
  finish();await gate.settled();assert.deepEqual(log,['restart','restarted','restart','restarted','ready']);
});
test('closing drops a queued restart and reports nothing',async()=>{
  const {gate,log,close}=harness();gate.request();close();await gate.settled();
  assert.deepEqual(log,[]);
});

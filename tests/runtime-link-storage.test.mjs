import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeLink,RUNTIME_LINK_KEY} from '../src/framework/compute/runtime-task.ts';

const first={origin:'http://127.0.0.1:28760',token:'synthetic-first-token-0123456'};
const second={origin:'http://127.0.0.1:28761',token:'synthetic-second-token-0123456'};
function session(initial=null){
  let raw=initial;
  return {failRead:false,failWrite:false,failRemove:false,
    getItem(key){assert.equal(key,RUNTIME_LINK_KEY);if(this.failRead)throw new Error('storage unavailable');return raw;},
    setItem(key,value){assert.equal(key,RUNTIME_LINK_KEY);if(this.failWrite)throw new Error('quota exceeded');raw=value;},
    removeItem(key){assert.equal(key,RUNTIME_LINK_KEY);if(this.failRemove)throw new Error('storage unavailable');raw=null;}};
}

test('pairing survives denied storage writes when storage was empty',()=>{
  const port=session();port.failWrite=true;const link=createRuntimeLink(port);
  link.connect(first);assert.deepEqual(link.get(),first);
  link.clear();assert.equal(link.get(),null);
});
test('explicit new pairing wins over stale storage after a failed write',()=>{
  const port=session(JSON.stringify(first)),link=createRuntimeLink(port);assert.deepEqual(link.get(),first);
  port.failWrite=true;link.connect(second);assert.deepEqual(link.get(),second);
  port.failWrite=false;assert.deepEqual(link.get(),second,'storage recovery never silently selects the old runtime');
});
test('disconnect stays disconnected after a denied removal',()=>{
  const port=session(JSON.stringify(first)),link=createRuntimeLink(port);assert.deepEqual(link.get(),first);
  port.failRemove=true;link.clear();assert.equal(link.get(),null);
  port.failRemove=false;assert.equal(link.get(),null);
});
test('a stored connection remains in page memory if storage later becomes unreadable',()=>{
  const port=session(JSON.stringify(first)),link=createRuntimeLink(port);assert.deepEqual(link.get(),first);
  port.failRead=true;assert.deepEqual(link.get(),first);
  link.clear();assert.equal(link.get(),null);
});
test('invalid pairing and corrupted storage cannot revive an earlier connection',()=>{
  const port=session(),link=createRuntimeLink(port);link.connect(first);
  assert.throws(()=>link.connect({origin:'https://example.invalid',token:first.token}),/malformed/);
  assert.deepEqual(link.get(),first);
  port.setItem(RUNTIME_LINK_KEY,'not JSON');port.failRemove=true;
  assert.equal(link.get(),null);port.failRead=true;assert.equal(link.get(),null);
});

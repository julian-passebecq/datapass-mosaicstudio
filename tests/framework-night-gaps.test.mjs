import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateClientCsp,clientCsp,clientCspFor} from '../scripts/client-csp.mjs';
import {readClientProfile} from '../scripts/client-context.mjs';
import {validateScene,scenePartLimit,SCENE_PART_LIMIT,SCENE_PART_CEILING} from '../src/framework/scene.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';
import operations from '../clients/operations-reference/app.ts';

const DEFAULT_CSP="default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";

test('client CSP default is unchanged without an opt-in',async()=>{
  assert.equal(clientCsp(),DEFAULT_CSP);assert.equal(clientCsp(validateClientCsp(undefined)),DEFAULT_CSP);
  const root=await mkdtemp(path.join(tmpdir(),'studio-csp-'));try{assert.equal(clientCspFor(root),DEFAULT_CSP);
    await writeFile(path.join(root,'client.config.json'),JSON.stringify({format:'datapass.client-profile',version:1,family:'content'}));assert.equal(clientCspFor(root),DEFAULT_CSP);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('client CSP opt-ins add wasm-unsafe-eval and exact connect origins for that client only',async()=>{
  const csp=clientCsp(validateClientCsp({wasm:true,connect:['http://127.0.0.1:8000','https://api.example.org']}));
  assert.match(csp,/script-src 'self' 'wasm-unsafe-eval';/);assert.ok(!csp.includes("'unsafe-eval'"));
  assert.match(csp,/connect-src 'self' http:\/\/127\.0\.0\.1:8000 https:\/\/api\.example\.org;/);
  const root=await mkdtemp(path.join(tmpdir(),'studio-csp-'));try{
    await writeFile(path.join(root,'client.config.json'),JSON.stringify({format:'datapass.client-profile',version:1,family:'content',csp:{wasm:true}}));
    assert.match(clientCspFor(root),/script-src 'self' 'wasm-unsafe-eval';/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('client CSP rejects non-loopback http, paths, wildcards, schemes and unknown keys',()=>{
  for(const bad of [{connect:['http://example.org']},{connect:['http://10.0.0.5:8000']},{connect:['https://api.example.org/path']},{connect:['https://*.example.org']},{connect:['ws://127.0.0.1:8000']},{connect:["'unsafe-inline'"]},{connect:['https://a.org','https://a.org']},{connect:Array.from({length:9},(_,i)=>`https://a${i}.org`)},{wasm:'yes'},{eval:true},[],null])
    assert.throws(()=>validateClientCsp(bad),undefined,JSON.stringify(bad));
  for(const ok of ['http://localhost:5173','http://[::1]:8000','https://127.0.0.1'])assert.deepEqual(validateClientCsp({connect:[ok]}).connect,[ok]);
});
test('client profile accepts a valid csp block and rejects an invalid one',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'studio-profile-csp-'));try{await mkdir(path.join(root,'clients','lab'),{recursive:true});
    const file=path.join(root,'clients','lab','client.config.json');
    await writeFile(file,JSON.stringify({format:'datapass.client-profile',version:1,family:'analytics',csp:{wasm:true,connect:['http://127.0.0.1:8000']}}));
    assert.deepEqual((await readClientProfile('lab',root)).csp,{wasm:true,connect:['http://127.0.0.1:8000']});
    await writeFile(file,JSON.stringify({format:'datapass.client-profile',version:1,family:'analytics',csp:{connect:['http://example.org']}}));
    await assert.rejects(readClientProfile('lab',root),/loopback/);
  }finally{await rm(root,{recursive:true,force:true});}
});

const scene=n=>({format:'datapass.scene3d',version:1,title:'Parts',note:'Synthetic',entities:[{id:'e',label:'E',description:'Entity'}],
  parts:Array.from({length:n},(_,i)=>({id:'p'+i,parent:null,entity:'e',shape:'box',size:[1,1,1],position:[i,0,0],rotation:[0,0,0],explode:[0,0,0],color:'#336699'})),
  cameras:[{id:'c',label:'C',position:[0,0,10],target:[0,0,0]}]});
test('scene part limit defaults to 128 and opts in per client up to the ceiling',()=>{
  assert.equal(SCENE_PART_LIMIT,128);assert.equal(scenePartLimit(undefined),128);assert.equal(scenePartLimit({}),128);
  validateScene(scene(128));assert.throws(()=>validateScene(scene(129)),/Scene size limit/);
  const maxParts=scenePartLimit({limits:{sceneParts:256}});assert.equal(validateScene(scene(200),{maxParts}).parts.length,200);assert.throws(()=>validateScene(scene(257),{maxParts}),/Scene size limit/);
  for(const bad of [{sceneParts:SCENE_PART_CEILING+1},{sceneParts:0},{sceneParts:1.5},{sceneParts:'256'},{other:1},null])assert.throws(()=>scenePartLimit({limits:bad}),undefined,JSON.stringify(bad));
  assert.throws(()=>validateScene(scene(1),{maxParts:SCENE_PART_CEILING+1}),/part limit/);
});
test('runtime keeps the trusted scene limit and refuses an invalid one',()=>{
  const r=new SiteRuntime({...operations,limits:{sceneParts:256}});assert.equal(scenePartLimit(r.definition),256);assert.ok(Object.isFrozen(r.definition.limits));
  assert.equal(scenePartLimit(new SiteRuntime(operations).definition),128);
  assert.throws(()=>new SiteRuntime({...operations,limits:{sceneParts:4096}}),/sceneParts/);
});

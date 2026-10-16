import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {clientProfileSchema} from '../src/framework/json-schema.ts';
import {CLIENT_STATUSES,validateClientStatus,clientStatusFor,clientCspFor} from '../scripts/client-csp.mjs';
import {readClientProfile} from '../scripts/client-context.mjs';
import {scaffoldClient} from '../scripts/scaffold-client.mjs';
import {clientRegistryPlugin,referenceClients} from '../scripts/client-plugin.ts';

const RULE_17=['wind-reference','operations-reference','architecture-reference','experience-reference','energy-replay-reference','motion-reference','foundation-reference','model-reference'];
const profile=extra=>JSON.stringify({format:'datapass.client-profile',version:1,family:'content',...extra});
async function lab(fn){const root=await mkdtemp(path.join(tmpdir(),'studio-status-'));try{await mkdir(path.join(root,'clients','lab'),{recursive:true});await fn(root,path.join(root,'clients','lab'));}finally{await rm(root,{recursive:true,force:true});}}

test('the published profile contract requires one of the four statuses',()=>{
  assert.deepEqual(clientProfileSchema.properties.status.enum,[...CLIENT_STATUSES]);
  assert.deepEqual([...CLIENT_STATUSES],['reference','prototype','draft','frozen']);
  assert.ok(clientProfileSchema.required.includes('status'));
  assert.equal(clientProfileSchema.properties.version.const,1);
});

test('a missing status is refused with DP-CLI-001 and the one-line fix',async()=>{
  assert.throws(()=>validateClientStatus(undefined,'lab'),/DP-CLI-001.*Fix: add "status": "prototype".*clients\/lab\/client\.config\.json/);
  for(const bad of ['released','Reference','',null,1])assert.throws(()=>validateClientStatus(bad,'lab'),/DP-CLI-002/,JSON.stringify(bad));
  for(const ok of CLIENT_STATUSES)assert.equal(validateClientStatus(ok,'lab'),ok);
  await lab(async(root,dir)=>{
    assert.throws(()=>clientStatusFor(dir),/DP-CLI-001/,'no profile file is refused like a missing status');
    await writeFile(path.join(dir,'client.config.json'),profile({}));
    await assert.rejects(readClientProfile('lab',root),/DP-CLI-001/);assert.throws(()=>clientStatusFor(dir),/DP-CLI-001/);
    await writeFile(path.join(dir,'client.config.json'),profile({status:'shipped'}));
    await assert.rejects(readClientProfile('lab',root),/DP-CLI-002/);
    await writeFile(path.join(dir,'client.config.json'),profile({status:'frozen'}));
    assert.equal((await readClientProfile('lab',root)).status,'frozen');assert.equal(clientStatusFor(dir),'frozen');
  });
});

test('status is a label only: it never changes the client CSP',async()=>{await lab(async(_root,dir)=>{
  const csp=[];for(const status of CLIENT_STATUSES){await writeFile(path.join(dir,'client.config.json'),profile({status,csp:{wasm:true}}));csp.push(clientCspFor(dir));}
  assert.equal(new Set(csp).size,1);
});});

test('every in-tree client declares a status; rule 17 references are reference, fabric-bricks is draft',async()=>{
  const ids=(await readdir('clients',{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
  for(const id of ids){const p=await readClientProfile(id);assert.ok(p,'profile for '+id);
    assert.equal(p.status,RULE_17.includes(id)?'reference':id==='fabric-bricks'?'draft':'prototype',id);}
});

test('the review build lists the unchanged rule 17 references with their status',async()=>{
  assert.deepEqual([...referenceClients],RULE_17);
  const source=clientRegistryPlugin(undefined).load('\0studio-clients');
  const map=JSON.parse(source.match(/export const clientStatus=(\{[^}]*\});/)[1]);
  assert.deepEqual(Object.keys(map),RULE_17);assert.ok(Object.values(map).every(s=>s==='reference'));
  const one=JSON.parse(clientRegistryPlugin('fabric-bricks').load('\0studio-clients').match(/export const clientStatus=(\{[^}]*\});/)[1]);
  assert.deepEqual(one,{'fabric-bricks':'draft'});
});

test('client:new writes status prototype',async()=>{const root=await mkdtemp(path.join(tmpdir(),'studio-status-new-'));try{
  const dir=await scaffoldClient({root,id:'fresh',family:'content'});
  assert.equal(JSON.parse(await readFile(path.join(dir,'client.config.json'),'utf8')).status,'prototype');
  assert.equal((await readClientProfile('fresh',root)).status,'prototype');
}finally{await rm(root,{recursive:true,force:true});}});

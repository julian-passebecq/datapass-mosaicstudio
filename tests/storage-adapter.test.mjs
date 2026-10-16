// F204 StorageAdapter facade: three tiers over the existing ports, no new backend. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createStorageAdapter,browserPreferences,memoryPreferences,memoryKeyValue,ResultStoreClient,ResultStoreError,readArtifactResult,resultStoreOrigin,sha256Hex,RESULT_FORMAT,ARTIFACT_MIME} from '../src/framework/storage/index.ts';
import * as results from '../src/workspace/results.ts';
import {saveWorkspace,loadWorkspace,blankWorkspace,WORKSPACE_KEY} from '../src/workspace/persist.ts';
import {tableArtifact} from '../src/framework/foundation/artifact.ts';
import {dataset,rows,reps,identity} from './foundation-fixture.mjs';

const MODULES=['notebook','explore','linked','sql','pipeline','stories','explain','board','architecture'];
const TOKEN='synthetic-runtime-token-0123456789';
const ORIGIN='http://127.0.0.1:24310';
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');

function spyStore(){
  const data=new Map(),calls=[];
  return {data,calls,getItem(k){calls.push(['get',k]);return data.has(k)?data.get(k):null;},setItem(k,v){calls.push(['set',k]);data.set(k,v);},removeItem(k){calls.push(['remove',k]);data.delete(k);}};
}
// Provenance kind "synthetic" (tests/foundation-fixture.mjs).
const syntheticArtifact=()=>tableArtifact(dataset(),rows(),identity(),reps());
function modelResult(artifact,overrides={}){
  return {format:'datapass.cell-result',version:1,cellId:'site-wind-run',cellKind:'python',sourceSha256:'a'.repeat(64),
    outputs:[{output_type:'display_data',data:{[ARTIFACT_MIME]:artifact},metadata:{datapass:{run:{runId:'run-0123456789abcdef',model:'wind',modelVersion:'1',inputHash:'b'.repeat(64),artifactSha256:null}}}}],
    table:null,executionCount:null,finishedAt:'2026-10-16T00:00:00.000Z',origin:'datapass.runtime/1',...overrides};
}
function fakeFetch(routes){
  const seen=[];
  const fetch=async(url,init)=>{seen.push({url,init});const r=routes[url.replace(ORIGIN,'')];if(!r)return {ok:false,status:404,text:async()=>JSON.stringify({detail:'Not Found'})};return {ok:r.status?r.status<400:true,status:r.status??200,text:async()=>r.text};};
  return {fetch,seen};
}

test('facade save writes byte-identical localStorage values to the direct saveWorkspace path',t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-16T01:30:00.000Z')});
  const doc={...blankWorkspace('notebook'),queries:[{id:'q1',name:'Synthetic',query:'SELECT 42 AS answer;'}],selectedQueryId:'q1',cards:[{id:'c',title:'Card',lane:'Done'}]};
  const direct=spyStore(),through=spyStore();
  const adapter=createStorageAdapter({preferences:{port:through,backend:'localStorage',reason:null}});
  assert.equal(adapter.preferences,through,'the tier hands the existing port through unchanged');
  assert.equal(saveWorkspace(direct,doc,MODULES),null);
  assert.equal(saveWorkspace(adapter.preferences,doc,MODULES),null);
  assert.deepEqual([...through.data.keys()],[WORKSPACE_KEY]);
  assert.equal(through.data.get(WORKSPACE_KEY),direct.data.get(WORKSPACE_KEY));
  assert.deepEqual(through.calls,direct.calls);
  const loaded=loadWorkspace(adapter.preferences,MODULES);
  assert.equal(loaded.notice,null);assert.equal(loaded.doc.queries[0].query,'SELECT 42 AS answer;');
});

test('tiers report their backends; nothing claims IndexedDB, remote or sync',()=>{
  const none=createStorageAdapter({preferences:{port:null,backend:'none',reason:'Browser storage is unavailable.'}});
  assert.deepEqual(none.tiers(),[
    {tier:'preferences',backend:'none',available:false,reason:'Browser storage is unavailable.',mutable:true},
    {tier:'results',backend:'none',available:false,reason:'No local runtime is paired; immutable results are not reachable.',mutable:false},
    {tier:'bundles',backend:'none',available:false,reason:'No bundle format is installed in this build.',mutable:false},
  ]);
  const client=new ResultStoreClient({origin:ORIGIN,token:TOKEN},{fetch:async()=>{throw new Error('not called');}});
  const full=createStorageAdapter({preferences:memoryPreferences(),results:client});
  assert.deepEqual(full.tiers().map(t=>[t.tier,t.backend,t.available]),[['preferences','memory',true],['results','local-result-store',true],['bundles','none',false]]);
  const reports=full.tiers();reports[0].backend='x';assert.equal(full.tiers()[0].backend,'memory','reports are copies');
  for(const t of full.tiers())assert.ok(['localStorage','memory','local-result-store','none'].includes(t.backend));
  assert.throws(()=>createStorageAdapter({preferences:{port:{getItem:'x'},backend:'memory',reason:null}}),/trusted key-value port/);
  assert.throws(()=>createStorageAdapter({preferences:{port:null,backend:'localStorage',reason:null}}),/backend "none"/);
});

test('browserPreferences probes localStorage like the workspace store and reports none without it',()=>{
  const had=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{
    const s=spyStore();Object.defineProperty(globalThis,'localStorage',{value:s,configurable:true});
    const p=browserPreferences();assert.equal(p.port,s);assert.equal(p.backend,'localStorage');
    assert.deepEqual(s.calls,[['set','datapass.workspace.probe'],['remove','datapass.workspace.probe']]);assert.equal(s.data.size,0);
    Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('denied');},configurable:true});
    const q=browserPreferences();assert.equal(q.port,null);assert.equal(q.backend,'none');assert.match(q.reason,/unavailable/);
  }finally{if(had)Object.defineProperty(globalThis,'localStorage',had);else delete globalThis.localStorage;}
  const m=memoryKeyValue({a:'1'});m.setItem('b','2');m.removeItem('a');assert.deepEqual(m.keys(),['b']);assert.equal(m.getItem('a'),null);
});

test('workbench results module re-exports the framework constants and hash (one definition)',async()=>{
  assert.equal(results.RESULT_FORMAT,RESULT_FORMAT);assert.equal(results.ARTIFACT_MIME,ARTIFACT_MIME);assert.equal(results.sha256Hex,sha256Hex);
  assert.equal(await sha256Hex('synthetic'),sha('synthetic'));
  const art=syntheticArtifact(),doc=results.validateResultDoc(modelResult(art));
  assert.deepEqual(readArtifactResult(doc,'c'.repeat(64)).artifact,results.storedArtifact(doc).artifact,'both readers agree on an artifact result');
});

test('result tier reads an artifact result only after its bytes match the hash',async()=>{
  const text=JSON.stringify(modelResult(syntheticArtifact())),good=sha(text);
  const manifest=JSON.stringify({format:'datapass.result-store',version:1,entries:[
    {cellId:'site-wind-run',cellKind:'python',sourceSha256:'a'.repeat(64),resultSha256:good,bytes:text.length,savedAt:'2026-10-16T00:00:00Z',present:true,run:{}},
    {cellId:'sql-cell',cellKind:'sql',sourceSha256:'a'.repeat(64),resultSha256:'d'.repeat(64),bytes:1,savedAt:'2026-10-16T00:00:00Z',present:true,run:{}}],jobs:[],workspace:null,store:{name:'synthetic',maxBytes:1,usedBytes:1}});
  const {fetch,seen}=fakeFetch({'/api/notebook/v1/store/manifest':{text:manifest},[`/api/notebook/v1/store/results/${good}`]:{text},[`/api/notebook/v1/store/results/${'e'.repeat(64)}`]:{text}});
  const client=new ResultStoreClient({origin:ORIGIN,token:TOKEN},{fetch});
  const entries=await client.entries();
  assert.deepEqual(entries.map(e=>e.cellId),['site-wind-run'],'only model results are listed');
  const read=await client.artifactResult(good);
  assert.equal(read.resultSha256,good);assert.equal(read.artifact.id,'example');assert.equal(read.run.runId,'run-0123456789abcdef');
  await assert.rejects(client.artifactResult('e'.repeat(64)),/does not match its hash/);
  await assert.rejects(client.artifactResult('not-a-hash'),ResultStoreError);
  for(const s of seen){assert.equal(s.init.method,'GET');assert.equal(s.init.credentials,'omit');assert.equal(s.init.headers['X-Datapass-Token'],TOKEN);}
  assert.equal(seen.some(s=>/save|delete|jobs/.test(s.url)),false,'the tier never writes');
});

test('result tier refuses non-model results, other origins and a bad artifact',async()=>{
  const art=syntheticArtifact();
  for(const [label,doc] of [['sql',modelResult(art,{cellKind:'sql'})],['jupyter origin',modelResult(art,{origin:'jupyter'})],['version',modelResult(art,{version:2})],
    ['two outputs',modelResult(art,{outputs:[...modelResult(art).outputs,...modelResult(art).outputs]})],['bad artifact',modelResult({...art,format:'nope'})]]){
    assert.throws(()=>readArtifactResult(doc,'c'.repeat(64)),Error,label);
    const text=JSON.stringify(doc),{fetch}=fakeFetch({[`/api/notebook/v1/store/results/${sha(text)}`]:{text}});
    await assert.rejects(new ResultStoreClient({origin:ORIGIN,token:TOKEN},{fetch}).artifactResult(sha(text)),ResultStoreError,label);
  }
  const {fetch}=fakeFetch({'/api/notebook/v1/store/manifest':{status:401,text:'{"detail":"no"}'}});
  await assert.rejects(new ResultStoreClient({origin:ORIGIN,token:TOKEN},{fetch}).entries(),/refused the token/);
  await assert.rejects(new ResultStoreClient({origin:ORIGIN,token:TOKEN},{fetch:async()=>{throw new Error('down');}}).entries(),/unreachable/);
});

test('result tier pairs only with an exact loopback origin and a well-formed token',()=>{
  assert.equal(resultStoreOrigin('http://localhost:24310/'),'http://localhost:24310');
  for(const bad of ['https://127.0.0.1:1','http://example.com:80','http://127.0.0.1','http://127.0.0.1:1/x','nope'])assert.throws(()=>resultStoreOrigin(bad),Error,bad);
  assert.throws(()=>new ResultStoreClient({origin:ORIGIN,token:'short'}),/token/);
});

test('framework storage stays SDK-safe: no workbench imports, no new backends',async()=>{
  for(const f of ['index.ts','ports.ts','kv.ts','result-store-client.ts','tiers.ts']){
    const src=await readFile('src/framework/storage/'+f,'utf8');
    assert.equal(/from\s+['"][^'"]*\/workspace\//.test(src),false,f+' imports src/workspace');
    assert.equal(/indexedDB|IDBFactory|BroadcastChannel|WebSocket/.test(src),false,f+' adds a backend');
  }
  const store=await readFile('src/store.ts','utf8');
  assert.match(store,/createStorageAdapter\(\{preferences:browserPreferences\(\)\}\)/);
  assert.equal(store.includes('browserStorage()'),false);
});

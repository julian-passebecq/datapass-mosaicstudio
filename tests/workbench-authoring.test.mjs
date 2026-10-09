import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {addCell,cellSourceKey,executionPlan,moveCell,removeCell,staleReason,updateCell,validateNotebook} from '../src/workspace/notebook.ts';
import {mapColumns,sqlResultArtifact} from '../src/workspace/sql-artifact.ts';
import {blankWorkspace,importWorkspace,loadWorkspace,saveWorkspace,validateWorkspace,WORKSPACE_BACKUP_KEY,WORKSPACE_KEY} from '../src/workspace/persist.ts';
import {checkInputs,connectionFromHash,RuntimeClient,RuntimeError,runtimeOrigin,validateRunRecord,waitForRun} from '../src/workspace/runtime.ts';
import {demoPipeline} from '../src/core/pipeline.ts';

const MODULES=['notebook','explore','linked','sql','pipeline','stories','explain','board','architecture'];
const sql=(id,deps=[],q='SELECT 1')=>({id,kind:'sql',title:id,sql:q,dependsOn:deps});
const py=(id,deps=[])=>({id,kind:'python',title:id,model:'wind-reference',inputs:{k:2,c:8,hubHeight:120},dependsOn:deps});

test('notebook: dependencies run first, in a deterministic order, notes never run',()=>{
  const nb=validateNotebook({cells:[sql('load'),{id:'memo',kind:'note',title:'memo',text:'why',dependsOn:[]},py('model',['load']),sql('report',['model','load'])]});
  assert.deepEqual(executionPlan(nb,'report'),['load','model','report']);
  assert.deepEqual(executionPlan(nb,'load'),['load']);
  assert.throws(()=>executionPlan(nb,'missing'),/Unknown cell/);
});
test('notebook: cycles, unknown or self dependencies and duplicate ids are refused before any change',()=>{
  const nb=validateNotebook({cells:[sql('a'),sql('b',['a'])]});
  assert.throws(()=>updateCell(nb,sql('a',['b'])),/cycle/);
  assert.throws(()=>validateNotebook({cells:[sql('a',['ghost'])]}),/unknown cell/);
  assert.throws(()=>validateNotebook({cells:[sql('a',['a'])]}),/self/);
  assert.throws(()=>validateNotebook({cells:[sql('a'),sql('a')]}),/duplicate/);
  assert.deepEqual(nb.cells[0].dependsOn,[]);
});
test('notebook: imported cells are inert data (no code fields, bounded, typed inputs)',()=>{
  assert.throws(()=>validateNotebook({cells:[{...py('p'),code:'import os'}]}),/unexpected fields/);
  assert.throws(()=>validateNotebook({cells:[{...py('p'),inputs:{k:Infinity}}]}),/finite/);
  assert.throws(()=>validateNotebook({cells:[{...py('p'),outputTable:'Drop Table'}]}),/output table/);
  assert.throws(()=>validateNotebook({cells:Array.from({length:51},(_,i)=>sql('c'+i))}),/budget/);
  assert.throws(()=>validateNotebook({cells:[{...sql('a'),kind:'shell'}]}),/unknown kind/);
});
test('notebook: ordering and removal keep the document valid',()=>{
  let nb=validateNotebook({cells:[sql('a'),sql('b',['a'])]});
  nb=moveCell(nb,'b',-1);assert.deepEqual(nb.cells.map(c=>c.id),['b','a']);
  assert.deepEqual(executionPlan(nb,'b'),['a','b']);
  nb=removeCell(nb,'a');assert.deepEqual(nb.cells[0].dependsOn,[]);
  nb=addCell(nb,sql('c'),'b');assert.deepEqual(nb.cells.map(c=>c.id),['b','c']);
});
test('notebook: staleness follows source edits and newer dependency results, not chart choices',()=>{
  const nb=validateNotebook({cells:[sql('a'),sql('b',['a'])]});
  const runs={a:{cellId:'a',sequence:1,sourceKey:cellSourceKey(nb.cells[0]),dependencySequences:{}},b:{cellId:'b',sequence:2,sourceKey:cellSourceKey(nb.cells[1]),dependencySequences:{a:1}}};
  assert.equal(staleReason(nb,runs,'b'),null);
  assert.match(staleReason(nb,{...runs,a:{...runs.a,sequence:3}},'b'),/newer result/);
  const edited=updateCell(nb,{...nb.cells[1],sql:'SELECT 2'});
  assert.match(staleReason(edited,runs,'b'),/changed/);
  const charted=updateCell(nb,{...nb.cells[1],chart:{kind:'bar',x:'a',y:'b'}});
  assert.equal(staleReason(charted,runs,'b'),null);
  const chain=validateNotebook({cells:[sql('a'),sql('b',['a']),sql('c',['b'])]});
  const chainRuns={a:{cellId:'a',sequence:1,sourceKey:'edited-since',dependencySequences:{}},b:{cellId:'b',sequence:2,sourceKey:cellSourceKey(chain.cells[1]),dependencySequences:{a:1}},c:{cellId:'c',sequence:3,sourceKey:cellSourceKey(chain.cells[2]),dependencySequences:{b:2}}};
  assert.match(staleReason(chain,chainRuns,'c'),/itself stale/);
});

test('SQL results become one validated artifact with typed columns, row identity and an optional chart',()=>{
  const rows=[{region:'North',energy:12.5,n:3n,ok:true},{region:'South',energy:null,n:4n,ok:false}];
  const artifact=sqlResultArtifact({columns:['region','energy','n','ok'],rows,cellId:'cell-1',title:'Energy',sql:'SELECT *\n FROM t',chart:{kind:'bar',x:'region',y:'energy'}});
  assert.equal(artifact.format,'datapass.artifact');assert.equal(artifact.payload.rowKey,'row');
  assert.deepEqual(artifact.payload.columns.map(c=>[c.id,c.type]),[['row','number'],['region','string'],['energy','number'],['n','number'],['ok','boolean']]);
  assert.deepEqual(artifact.payload.rows.map(r=>r.row),[1,2]);
  assert.equal(artifact.payload.rows[1].energy,null);
  assert.deepEqual(artifact.representations.map(r=>r.kind),['table','chart','json']);
  assert.equal(artifact.provenance.kind,'computed');assert.match(artifact.provenance.source,/SELECT \* FROM t/);
  assert.throws(()=>sqlResultArtifact({columns:['region'],rows:[{region:'x'}],cellId:'c',title:'t',sql:'s',chart:{kind:'line',x:'region',y:'region'}}),/numeric/);
});
test('SQL artifacts refuse oversized results instead of truncating silently and keep odd column names readable',()=>{
  assert.throws(()=>sqlResultArtifact({columns:['a'],rows:Array.from({length:10001},(_,i)=>({a:i})),cellId:'c',title:'t',sql:'s'}),/10000 rows/);
  const map=mapColumns(['Revenue €','Revenue €','1st','row'],[{'Revenue €':1,'1st':'x',row:2}]);
  assert.equal(new Set(map.map(m=>m.id)).size,4);
  for(const m of map)assert.match(m.id,/^[a-z][a-zA-Z0-9_-]*$/);
  assert.deepEqual(mapColumns(['mixed'],[{mixed:1},{mixed:'a'}]).map(m=>m.type),['string']);
});

function memoryStorage(initial={}){const map=new Map(Object.entries(initial));return {map,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
const fullDoc=()=>({...blankWorkspace(),savedAt:'2026-10-09T10:00:00.000Z',samples:true,queries:[{id:'q1',name:'Q',query:'SELECT 1'}],selectedQueryId:'q1',notebook:{cells:[sql('a'),py('b',['a'])]},
  runs:[{runId:'run-0123456789abcdef',cellId:'b',origin:'http://127.0.0.1:8765',model:'wind-reference',modelVersion:'v1',status:'succeeded',inputHash:'a'.repeat(64),inputs:{k:2},submittedAt:'2026-10-09T10:00:00.000Z',finishedAt:'2026-10-09T10:00:01.000Z',artifactId:'wind-reference-run',artifactSha256:'b'.repeat(64)}],
  sources:[{table:'data_1_sales',name:'sales.csv',kind:'user-file',bytes:120}],runtimeOrigin:'http://127.0.0.1:8765',pipeline:structuredClone(demoPipeline),cards:[{id:'5b0c1a0e-1',title:'Card',lane:'Done'}]});
test('workspace: a complete document round-trips through storage and reload',()=>{
  const storage=memoryStorage();
  assert.equal(saveWorkspace(storage,fullDoc(),MODULES),null);
  const {doc,notice}=loadWorkspace(storage,MODULES);
  assert.equal(notice,null);assert.equal(doc.notebook.cells.length,2);assert.equal(doc.runs[0].runId,'run-0123456789abcdef');assert.equal(doc.queries[0].query,'SELECT 1');
  assert.equal(JSON.stringify(doc).includes('token'),false);
});
test('workspace: results, tokens and unknown fields are refused; remote runtime origins are refused',()=>{
  assert.throws(()=>validateWorkspace({...fullDoc(),token:'secret'},MODULES),/unexpected fields/);
  assert.throws(()=>validateWorkspace({...fullDoc(),runtimeOrigin:'http://example.com:8765'},MODULES),/loopback/);
  assert.throws(()=>validateWorkspace({...fullDoc(),runs:[{...fullDoc().runs[0],rows:[1]}]},MODULES),/unexpected fields/);
  assert.throws(()=>validateWorkspace({...fullDoc(),module:'shell'},MODULES),/unknown module/);
});
test('workspace: a corrupt or newer saved document is moved aside, never half-applied',()=>{
  const storage=memoryStorage({[WORKSPACE_KEY]:JSON.stringify({...fullDoc(),version:2})});
  const result=loadWorkspace(storage,MODULES);
  assert.equal(result.doc,null);assert.match(result.notice,/newer studio/);
  assert.equal(storage.getItem(WORKSPACE_KEY),null);assert.match(storage.getItem(WORKSPACE_BACKUP_KEY),/"version":2/);
  const broken=memoryStorage({[WORKSPACE_KEY]:'{'});
  assert.match(loadWorkspace(broken,MODULES).notice,/not valid JSON/);
  assert.match(loadWorkspace(null,MODULES).notice,/unavailable/);
});
test('workspace: the older explicit draft export migrates without running anything',()=>{
  const draft={format:'datapass.studio2.draft',version:1,module:'pipeline',layout:{},pipeline:structuredClone(demoPipeline),board:[{id:'x',title:'Card',lane:'Review'}],note:'old'};
  const {doc,migratedFrom}=importWorkspace(JSON.stringify(draft),MODULES);
  assert.equal(migratedFrom,'datapass.studio2.draft v1');assert.equal(doc.module,'pipeline');assert.equal(doc.cards[0].lane,'Review');assert.deepEqual(doc.notebook.cells,[]);
  assert.throws(()=>importWorkspace('{"format":"other"}',MODULES),/not a datapass.workspace/);
});

test('runtime: only exact loopback http origins and well-formed tokens are accepted',()=>{
  assert.equal(runtimeOrigin('http://127.0.0.1:8765/'),'http://127.0.0.1:8765');
  for(const bad of ['https://127.0.0.1:8765','http://192.168.1.5:8765','http://127.0.0.1','http://127.0.0.1:8765/api','http://u:p@localhost:1','http://localhost:1/?x=1'])assert.throws(()=>runtimeOrigin(bad),undefined,bad);
  assert.deepEqual(connectionFromHash('#runtime=http%3A%2F%2F127.0.0.1%3A8765&token=abcdefghijklmnopqrstu'),{origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'});
  assert.equal(connectionFromHash('#other=1'),null);
  assert.throws(()=>connectionFromHash('#runtime=http%3A%2F%2Fevil.example%3A80&token=abcdefghijklmnopqrstu'),/loopback/);
  assert.throws(()=>new RuntimeClient({origin:'http://127.0.0.1:8765',token:'short'}),/token/);
});
test('runtime: inputs are checked against declared bounds before submission',()=>{
  const model={id:'wind-reference',version:'1',title:'W',description:'d',illustrative:true,artifactId:'w',inputs:[{id:'k',label:'Shape',unit:'',type:'number',min:1,max:4,default:2,step:0.1}]};
  assert.deepEqual(checkInputs(model,{}),{k:2});
  assert.throws(()=>checkInputs(model,{k:9}),/between 1 and 4/);
  assert.throws(()=>checkInputs(model,{other:1}),/Unknown input/);
});

function artifactFor(runId){return {format:'datapass.artifact',version:1,id:'wind-reference-run',title:'ILLUSTRATIVE run',provenance:{kind:'computed',source:'test',runId},payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'Id',type:'string'},{id:'aep',label:'AEP',type:'number'}],rows:[{id:'selected',aep:1}]},representations:[{id:'table',title:'Rows',kind:'table'},{id:'aep',title:'AEP',kind:'metric',row:'selected',column:'aep'}]};}
const record=(over={})=>({runId:'run-00000000000000aa',model:'wind-reference',modelVersion:'v1',status:'queued',inputs:{k:2},inputHash:'c'.repeat(64),submittedAt:'2026-10-09T10:00:00.000Z',startedAt:null,finishedAt:null,error:null,artifactId:null,artifactSha256:null,...over});
function fakeRuntime(routes){
  const calls=[];
  const fetch=async(url,init)=>{calls.push({url,init});const path=new URL(url).pathname,handler=routes[init.method+' '+path];if(!handler)return reply(404,{detail:'Not Found'});return handler(init);};
  return {fetch,calls};
}
function reply(status,json){const text=typeof json==='string'?json:JSON.stringify(json);return {ok:status<300,status,headers:{get:()=>null},text:async()=>text};}
test('runtime: submit, poll, verify artifact hash and validate the artifact; the token is a header, never a URL',async()=>{
  const body=JSON.stringify(artifactFor('run-00000000000000aa')),sha=createHash('sha256').update(body).digest('hex');
  let polls=0;
  const {fetch,calls}=fakeRuntime({
    'POST /api/runtime/v1/runs':()=>reply(202,record()),
    'GET /api/runtime/v1/runs/run-00000000000000aa':()=>reply(200,++polls<2?record({status:'running'}):record({status:'succeeded',finishedAt:'2026-10-09T10:00:01.000Z',artifactId:'wind-reference-run',artifactSha256:sha})),
    'GET /api/runtime/v1/runs/run-00000000000000aa/artifact':()=>reply(200,body),
  });
  const client=new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch});
  const submitted=await client.submit('wind-reference',{k:2});
  const final=await waitForRun(client,submitted,{intervalMs:1});
  assert.equal(final.status,'succeeded');
  const artifact=await client.artifact(final);
  assert.equal(artifact.provenance.runId,'run-00000000000000aa');
  for(const c of calls){assert.equal(c.init.headers['X-Datapass-Token'],'abcdefghijklmnopqrstu');assert.equal(c.url.includes('abcdefghijklmnopqrstu'),false);assert.equal(c.init.credentials,'omit');}
  const tampered=fakeRuntime({'GET /api/runtime/v1/runs/run-00000000000000aa/artifact':()=>reply(200,body.replace('"aep":1','"aep":2'))});
  await assert.rejects(new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch:tampered.fetch}).artifact(final),/do not match the hash/);
});
test('runtime: unavailable, denied, malformed and foreign-run answers are explicit errors',async()=>{
  const down=new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch:async()=>{throw new TypeError('Failed to fetch');}});
  await assert.rejects(down.health(),e=>e instanceof RuntimeError&&e.kind==='unavailable');
  const denied=new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch:async()=>reply(401,{detail:'invalid token'})});
  await assert.rejects(denied.health(),e=>e.kind==='denied'&&/token/.test(e.message));
  const wrong=new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch:async()=>reply(200,{service:'something-else'})});
  await assert.rejects(wrong.health(),/does not speak datapass.runtime\/1/);
  assert.throws(()=>validateRunRecord({...record(),status:'done'}),/unknown run status/);
  const foreign=fakeRuntime({'GET /api/runtime/v1/runs/run-00000000000000aa/artifact':()=>reply(200,artifactFor('run-00000000000000bb'))});
  await assert.rejects(new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch:foreign.fetch}).artifact(record({status:'succeeded'})),/belongs to run-00000000000000bb/);
  const conflict=fakeRuntime({'GET /api/runtime/v1/runs/run-00000000000000aa/artifact':()=>reply(409,{detail:'run is cancelled'})});
  await assert.rejects(new RuntimeClient({origin:'http://127.0.0.1:8765',token:'abcdefghijklmnopqrstu'},{fetch:conflict.fetch}).artifact(record()),e=>e.kind==='conflict');
});

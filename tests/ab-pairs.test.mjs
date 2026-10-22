// F207 A/B comparison that survives reopen: a pair of result references kept in the browser, both results read
// back from the ResultStore by hash and compared with the compareRuns rules. Fake fetch only. All data synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SiteRunStore,memoryKeyValue,AB_PAIR_FORMAT,AbPairError,abPairKey,validateAbPair,abCompatibility,createAbPair,loadAbPair,saveAbPair,clearAbPair,openAbPair,compareSavedRuns} from '../src/framework/storage/index.ts';
import {compareRuns,artifactMetricDeltas,artifactRowDeltas,parameterDeltas,validateArtifact} from '../src/framework/foundation/index.ts';

const ORIGIN='http://127.0.0.1:24371',TOKEN='synthetic-token-ab-0123456789';
const APP={id:'example',version:'1'};
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');

function artifact(runId,gain,{metric=true}={}){
  return validateArtifact({format:'datapass.artifact',version:1,id:'synthetic-gain-run',title:'SYNTHETIC run',
    provenance:{kind:'synthetic',source:'Synthetic fake runtime',runId},
    payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'ID',type:'string'},{id:'value',label:'Value',type:'number',unit:'kW',nullable:true}],
      rows:[{id:'a',value:2*gain},{id:'b',value:3*gain}]},
    representations:[{id:'table',title:'Rows',kind:'table'},...(metric?[{id:'peak',title:'Row b',kind:'metric',row:'b',column:'value',unit:'kW'}]:[])]});
}
let seq=0;
/** A completed runtime run as F206's handler would keep it (synthetic). */
function runtimeRun(gain,{modelVersion='synthetic-gain-1',model='synthetic-gain',taskId='compute'}={}){
  const runId='run-'+(++seq).toString(16).padStart(16,'0');
  const a=artifact(runId,gain);
  return {taskId,values:{gain},inputs:{gain},artifact:a,origin:ORIGIN,model:{id:model,title:'SYNTHETIC gain model'},
    record:{runId,model,modelVersion,status:'succeeded',inputs:{gain},inputHash:sha(JSON.stringify({gain})),finishedAt:'2026-10-16T02:00:01.000Z',artifactSha256:sha(JSON.stringify(a))}};
}
/** Fake ResultStore routes; `disk` survives a restart. Records every call so "no recompute" is checkable. */
function fakeStore(disk){
  const calls=[];
  const reply=(status,body)=>{const text=typeof body==='string'?body:JSON.stringify(body);return {ok:status<300,status,text:async()=>text};};
  const fetch=async(url,init)=>{
    const path=new URL(url).pathname,key=init.method+' '+path;calls.push(key);
    if(!disk.up)throw new TypeError('Failed to fetch');
    if(init.headers['X-Datapass-Token']!==TOKEN)return reply(401,{detail:'bad token'});
    if(key==='GET /api/notebook/v1/store/manifest')return reply(200,{format:'datapass.result-store',version:1,workspace:null,jobs:[],entries:disk.entries.map(e=>({...e,present:disk.files.has(e.resultSha256)}))});
    if(key==='POST /api/notebook/v1/store/results'){
      const out=JSON.parse(init.body).results.map(item=>{
        const bytes=JSON.stringify(item.result),h=sha(bytes);disk.files.set(h,bytes);
        disk.entries.push({cellId:item.cellId,cellKind:item.cellKind,sourceSha256:item.sourceSha256,resultSha256:h,bytes:bytes.length,run:item.run,savedAt:'2026-10-16T02:01:00.000Z'});
        return {cellId:item.cellId,resultSha256:h};
      });
      return reply(200,{results:out});
    }
    const res=path.match(/^\/api\/notebook\/v1\/store\/results\/([0-9a-f]{64})$/);
    if(res){const bytes=disk.files.get(res[1]);return bytes===undefined?reply(404,{detail:`Result ${res[1].slice(0,12)} is not in the store.`}):reply(200,bytes);}
    return reply(404,{detail:'Not Found'});
  };
  return {fetch,calls,store:new SiteRunStore({origin:ORIGIN,token:TOKEN},{fetch})};
}
async function seeded(specs){
  const disk={up:true,entries:[],files:new Map()},s=fakeStore(disk),shas=[];
  for(const spec of specs)shas.push((await s.store.save(APP,runtimeRun(spec.gain,spec))).resultSha256);
  const {runs}=await s.store.list(APP);
  return {disk,s,shas,runs,bySha:h=>runs.find(r=>r.resultSha256===h)};
}

test('compareRuns keeps its behavior over the shared pure helpers',()=>{
  const a=artifact('run-00000000000000aa',1),b=artifact('run-00000000000000bb',2);
  assert.deepEqual(artifactMetricDeltas(a,b),[{id:'peak',title:'Row b',before:3,after:6,delta:3,unit:'kW'}]);
  assert.deepEqual(parameterDeltas({gain:1,x:'k'},{gain:2}),[{id:'gain',before:1,after:2,changed:true},{id:'x',before:'k',after:null,changed:true}]);
  const rows=artifactRowDeltas(a,b);
  assert.equal(rows.comparable,true);
  assert.deepEqual(rows.rows,[{key:'a',cells:[{before:2,after:4,delta:2}]},{key:'b',cells:[{before:3,after:6,delta:3}]}]);
  const other=validateArtifact({...JSON.parse(JSON.stringify(b)),payload:{...b.payload,columns:[...b.payload.columns,{id:'extra',label:'Extra',type:'number',nullable:true}],rows:b.payload.rows.map(r=>({...r,extra:null}))}});
  assert.match(artifactRowDeltas(a,other).reason,/same columns and row key/);
  assert.deepEqual(artifactMetricDeltas(a,other),[],'no metric across different tables');
  // compareRuns still refuses a mismatched contract and returns the same shape.
  const rec=(id,art,params,modelVersion='m1')=>({format:'datapass.run',version:1,id,taskId:'compute',appId:'example',appVersion:'1',modelId:'m',modelVersion,providerId:'p',parameters:params,dependencies:{},status:'succeeded',startedAt:'2026-10-16T02:00:00.000Z',finishedAt:'2026-10-16T02:00:01.000Z',durationMs:1000,artifact:art,retention:'retained',message:''});
  const cmp=compareRuns(rec('run-00000000000000aa',a,{gain:1}),rec('run-00000000000000bb',b,{gain:2}));
  assert.deepEqual(Object.keys(cmp),['parameters','durationDeltaMs','metrics']);
  assert.equal(cmp.metrics[0].delta,3);
  assert.throws(()=>compareRuns(rec('run-00000000000000aa',a,{gain:1}),rec('run-00000000000000bb',b,{gain:2},'m2')),/same declared model/);
});

test('datapass.ab-pair v1 is strict: references only, negative cases refused',()=>{
  const side=(n)=>({resultSha256:String(n).repeat(64).slice(0,64),runId:'run-000000000000000'+n,model:'synthetic-gain',modelVersion:'synthetic-gain-1'});
  const good={format:AB_PAIR_FORMAT,version:1,appId:'example',a:side(1),b:side(2),savedAt:'2026-10-16T02:02:00.000Z'};
  const pair=validateAbPair(good,'example');
  assert.ok(Object.isFrozen(pair)&&Object.isFrozen(pair.a));
  assert.equal(abPairKey('example'),'datapass.ab-pair.example');
  const bad=[
    [{...good,version:2},/Unsupported/],[{...good,format:'datapass.ab'},/Unsupported/],
    [{...good,extra:1},/unexpected fields/],[{...good,a:{...side(1),rows:[1]}},/unexpected fields/],
    [{...good,b:side(1)},/two different results/],[{...good,a:{...side(1),resultSha256:'XYZ'}},/result hash/],
    [{...good,a:{...side(1),runId:'run-1'}},/run id/],[{...good,a:{...side(1),modelVersion:''}},/invalid text/],
    [{...good,savedAt:'yesterday'},/save time/],[{...good,appId:'Bad id'},/invalid id/],[null,/non-object/],
  ];
  for(const [value,pattern] of bad)assert.throws(()=>validateAbPair(value),pattern);
  assert.throws(()=>validateAbPair(good,'other'),/belongs to example, not other/);
});

test('an incompatible pair (different modelVersion) is refused with the reason, never saved',async()=>{
  const {s,shas,bySha}=await seeded([{gain:2},{gain:5,modelVersion:'synthetic-gain-2'}]);
  const verdict=abCompatibility(bySha(shas[0]),bySha(shas[1]));
  assert.equal(verdict.ok,false);
  assert.match(verdict.reason,/Model versions differ: A ran synthetic-gain synthetic-gain-1, B ran synthetic-gain synthetic-gain-2/);
  assert.throws(()=>createAbPair(APP,bySha(shas[0]),bySha(shas[1])),e=>e instanceof AbPairError&&e.kind==='incompatible'&&/Model versions differ/.test(e.message));
  // A tampered browser value naming an incompatible pair is refused on reopen too, before any result is read.
  const port=memoryKeyValue();
  const forged={format:AB_PAIR_FORMAT,version:1,appId:'example',savedAt:'2026-10-16T02:02:00.000Z',
    a:{resultSha256:shas[0],runId:bySha(shas[0]).run.runId,model:'synthetic-gain',modelVersion:'synthetic-gain-1'},
    b:{resultSha256:shas[1],runId:bySha(shas[1]).run.runId,model:'synthetic-gain',modelVersion:'synthetic-gain-2'}};
  saveAbPair(port,validateAbPair(forged));
  const before=s.calls.length;
  await assert.rejects(openAbPair(s.store,APP,loadAbPair(port,'example').pair,(await s.store.list(APP)).runs),e=>e instanceof AbPairError&&e.kind==='incompatible'&&/Model versions differ/.test(e.message));
  assert.ok(!s.calls.slice(before).some(c=>c.includes('/results/')),'no result read for a refused pair');
  // Other incompatibilities name their reason.
  const more=await seeded([{gain:1},{gain:1,taskId:'other'},{gain:1,model:'synthetic-other'}]);
  assert.match(abCompatibility(more.bySha(more.shas[0]),more.bySha(more.shas[1])).reason,/different tasks/);
  assert.match(abCompatibility(more.bySha(more.shas[0]),more.bySha(more.shas[2])).reason,/different models/);
  assert.match(abCompatibility(more.bySha(more.shas[0]),more.bySha(more.shas[0])).reason,/two different/);
  assert.match(abCompatibility(more.bySha(more.shas[0]),{...more.bySha(more.shas[2]),run:null}).reason,/no run reference/);
});

test('S06: results that record a shared quantity in different units are refused with a unit-mismatch reason, never converted',async()=>{
  const {unitMismatch}=await import('../src/framework/storage/ab-pairs.ts');
  const {s,shas,bySha}=await seeded([{gain:2},{gain:5}]);
  const a=await s.store.open(APP,bySha(shas[0])),b=await s.store.open(APP,bySha(shas[1]));
  assert.equal(unitMismatch(a.artifact,b.artifact),null);
  const inMW=JSON.parse(JSON.stringify(b.artifact));inMW.payload.columns[1].unit='MW';
  const column={...b,artifact:validateArtifact(inMW)};
  assert.match(unitMismatch(a.artifact,column.artifact),/Units differ for Value \(value\): A is in kW, B is in MW/);
  assert.throws(()=>compareSavedRuns(a,column),e=>e instanceof AbPairError&&e.kind==='incompatible'&&/Units differ for Value/.test(e.message)&&/not compared or converted/.test(e.message));
  const metric=JSON.parse(JSON.stringify(b.artifact));metric.representations[1].unit='MW';
  assert.match(unitMismatch(a.artifact,validateArtifact(metric)),/Units differ for the metric Row b \(peak\): A is in kW, B is in MW/);
  const unitless=JSON.parse(JSON.stringify(b.artifact));delete unitless.payload.columns[1].unit;
  assert.match(unitMismatch(a.artifact,validateArtifact(unitless)),/B is in no unit/,'a missing unit is not the same unit');
});

test('a kept comparison reopens after a browser and service restart with the same deltas, without recompute',async()=>{
  const {disk,s,shas,bySha}=await seeded([{gain:2},{gain:5}]);
  const port=memoryKeyValue();
  const pair=createAbPair(APP,bySha(shas[0]),bySha(shas[1]),new Date('2026-10-16T02:03:00.000Z'));
  saveAbPair(port,pair);
  const raw=port.getItem('datapass.ab-pair.example');
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['a','appId','b','format','savedAt','version']);
  assert.ok(!/rows|values|inputs|"gain"|artifact/.test(raw)&&!raw.includes(TOKEN),'references only: no rows, inputs or token');
  const first=await openAbPair(s.store,APP,pair,(await s.store.list(APP)).runs);
  assert.deepEqual(first.comparison.parameters,[{id:'gain',before:2,after:5,changed:true}]);
  assert.deepEqual(first.comparison.metrics.map(m=>[m.id,m.before,m.after,m.delta]),[['peak',6,15,9]]);
  assert.equal(first.comparison.deltaArtifact.provenance.kind,'synthetic','synthetic stays labelled synthetic');
  assert.match(first.comparison.deltaArtifact.provenance.source,/^SYNTHETIC\. .*not a model run/);
  assert.deepEqual(first.comparison.deltaArtifact.payload.rows,[{id:'a',value_a:4,value_b:10,value_delta:6},{id:'b',value_a:6,value_b:15,value_delta:9}]);
  assert.deepEqual(first.comparison.deltaArtifact.representations.map(r=>r.kind),['table','chart']);

  // Restart: new service process on the same disk, new browser page (same browser storage).
  const restarted=fakeStore(disk);
  const loaded=loadAbPair(port,'example');
  assert.equal(loaded.notice,null);assert.deepEqual(loaded.pair,pair);
  const runs=(await restarted.store.list(APP)).runs,before=restarted.calls.length;
  const again=await openAbPair(restarted.store,APP,loaded.pair,runs);
  assert.deepEqual(again.comparison,first.comparison,'the same deltas');
  assert.deepEqual(restarted.calls.slice(before),shas.map(h=>'GET /api/notebook/v1/store/results/'+h),'two reads by hash, no runtime call');
  assert.ok(!restarted.calls.some(c=>c.includes('/api/runtime/')),'nothing recomputed');
  assert.equal(compareSavedRuns(again.a,again.b).metrics[0].delta,9);
});

test('a missing, corrupt or unreachable side is reported for that side and never replaced',async()=>{
  const {disk,s,shas,bySha}=await seeded([{gain:2},{gain:2},{gain:5}]);
  const pair=createAbPair(APP,bySha(shas[0]),bySha(shas[2]));
  disk.files.delete(shas[2]);
  let runs=(await s.store.list(APP)).runs;
  await assert.rejects(openAbPair(s.store,APP,pair,runs),e=>e instanceof AbPairError&&e.kind==='unreadable'&&e.side==='b'&&/\(missing\)/.test(e.message));
  // Removed from the manifest altogether.
  disk.entries=disk.entries.filter(e=>e.resultSha256!==shas[2]);
  runs=(await s.store.list(APP)).runs;
  await assert.rejects(openAbPair(s.store,APP,pair,runs),e=>e instanceof AbPairError&&e.kind==='missing'&&e.side==='b');
  // A reference whose run id no longer matches is a mismatch.
  const wrong={...pair,a:{...pair.a,runId:'run-00000000000000ff'}};
  await assert.rejects(openAbPair(s.store,APP,wrong,runs),e=>e instanceof AbPairError&&e.kind==='mismatch'&&e.side==='a');
  disk.up=false;
  const pair01=createAbPair(APP,bySha(shas[0]),bySha(shas[1]));
  await assert.rejects(openAbPair(s.store,APP,pair01,runs),e=>e instanceof AbPairError&&e.kind==='unreadable'&&/unreachable/.test(e.message));
});

test('browser storage: invalid values are ignored with a notice, refused saves leave the stored value unchanged',()=>{
  const port=memoryKeyValue({'datapass.ab-pair.example':'{"format":"datapass.ab-pair","version":9}'});
  const loaded=loadAbPair(port,'example');
  assert.equal(loaded.pair,null);assert.match(loaded.notice,/invalid and was ignored/);
  assert.equal(port.getItem('datapass.ab-pair.example'),'{"format":"datapass.ab-pair","version":9}','left unchanged');
  assert.deepEqual(loadAbPair(memoryKeyValue(),'example'),{pair:null,notice:null});
  assert.deepEqual(loadAbPair(null,'example'),{pair:null,notice:null});
  const throwing={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');},removeItem(){throw new Error('denied');}};
  assert.match(loadAbPair(throwing,'example').notice,/unavailable/);
  const side=(n)=>({resultSha256:String(n).repeat(64),runId:'run-000000000000000'+n,model:'m',modelVersion:'1'});
  const pair=validateAbPair({format:AB_PAIR_FORMAT,version:1,appId:'example',a:side(1),b:side(2),savedAt:'2026-10-16T02:02:00.000Z'});
  assert.throws(()=>saveAbPair(throwing,pair),e=>e instanceof AbPairError&&e.kind==='storage');
  assert.throws(()=>saveAbPair(null,pair),e=>e instanceof AbPairError&&e.kind==='storage');
  const kept=memoryKeyValue();saveAbPair(kept,pair);
  assert.throws(()=>saveAbPair(kept,{...pair,b:pair.a}),/two different results/);
  assert.deepEqual(JSON.parse(kept.getItem('datapass.ab-pair.example')),pair,'refused save leaves the stored pair unchanged');
  clearAbPair(kept,'example');assert.equal(kept.getItem('datapass.ab-pair.example'),null);
  clearAbPair(throwing,'example');
});

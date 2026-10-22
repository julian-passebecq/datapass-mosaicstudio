// S04 selection binding over datapass.engineering/1 (frozen at d20ecd6): resolveBinding, mayAnimate, designDigest.
// Two consumers use the same helpers: the generic model-reference record and a SYNTHETIC FOIL adapter fixture
// (tests/fixtures/engineering-consumers), with no FOIL import in src/framework.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {EngineeringError,VIEW_STATE_KEYS,designDigest,digest,mayAnimate,readSelectionBinding,resolveBinding} from '../src/framework/engineering/index.ts';
import {model} from '../clients/model-reference/model.ts';
import {genericBinding,MODEL_GEOMETRY_REVISION} from '../clients/model-reference/bindings.ts';

const foil=JSON.parse(readFileSync('tests/fixtures/engineering-consumers/foil-adapter.synthetic.json','utf8'));
const corpus=JSON.parse(readFileSync('tests/fixtures/engineering/valid/selection-binding.json','utf8'));

test('records are validated by validateEngineering; other kinds and broken bindings are refused',()=>{
  assert.equal(readSelectionBinding(corpus).entityId,'rotor/blade-1');
  assert.equal(readSelectionBinding(genericBinding).viewToken,'synthetic.model-reference.1');
  assert.equal(readSelectionBinding(foil).viewToken,'synthetic.foil-adapter.1');
  assert.throws(()=>readSelectionBinding(JSON.parse(readFileSync('tests/fixtures/engineering/valid/parameter-diff.json','utf8'))),/selection-binding/);
  for(const file of readdirSync('tests/fixtures/engineering/invalid').filter(f=>f.startsWith('b-'))){
    assert.throws(()=>readSelectionBinding(JSON.parse(readFileSync(path.join('tests/fixtures/engineering/invalid',file),'utf8'))),EngineeringError,file);
  }
  // A bare list gets the same per-binding rules.
  assert.throws(()=>resolveBinding('x',[{signal:'x',entityId:null,status:'sourced',source:'s'}]),EngineeringError);
  assert.throws(()=>resolveBinding('x',[{signal:'x',entityId:'a',status:'sourced',source:'s'},{signal:'x',entityId:'b',status:'inferred'}]),EngineeringError);
});

test('resolveBinding is an exact lookup: no binding is inferred from similar IDs',()=>{
  assert.deepEqual(resolveBinding('blade-1.pitch',corpus),{signal:'blade-1.pitch',entityId:'rotor/blade-1',status:'sourced',source:'SYNTHETIC telemetry column pitch_deg_b1'});
  assert.equal(resolveBinding('blade-1.strain',corpus).status,'inferred');
  assert.deepEqual(resolveBinding('nacelle.vibration-x',corpus),{signal:'nacelle.vibration-x',entityId:null,status:'unmapped',source:null});
  // Absent signals, even ones that look like a bound entity or signal, are unmapped.
  for(const near of ['blade-1','rotor/blade-1','blade-1.Pitch','blade-1.pitch ','blade-2.pitch','pitch'])
    assert.deepEqual(resolveBinding(near,corpus),{signal:near,entityId:null,status:'unmapped',source:null},near);
  assert.equal(resolveBinding('plate',genericBinding).status,'unmapped');
  assert.ok(Object.isFrozen(resolveBinding('blade-1.pitch',corpus)));
});

test('mayAnimate: unmapped never, inferred only with explicit opt-in, sourced yes',()=>{
  const policy=(signal,record,inferredOptIn)=>mayAnimate(resolveBinding(signal,record),{inferredOptIn});
  for(const record of [genericBinding,foil]){
    for(const b of record.bindings){
      assert.equal(policy(b.signal,record,false),b.status==='sourced',b.signal);
      assert.equal(policy(b.signal,record,true),b.status!=='unmapped',b.signal);
    }
    assert.equal(policy('not-in-record',record,true),false);
  }
  assert.equal(mayAnimate({entityId:'x',status:'inferred'},{inferredOptIn:'yes'}),false,'opt-in must be the boolean true');
  assert.equal(mayAnimate({entityId:null,status:'sourced'},{inferredOptIn:true}),false);
});

test('designDigest ignores view state at any depth and changes with the design',()=>{
  assert.deepEqual([...VIEW_STATE_KEYS],['camera','selection','isolate','explode','timeCursor','viewToken']);
  const base=designDigest(model);
  assert.equal(base.over,'datapass-c14n/1');
  assert.equal(base.value,MODEL_GEOMETRY_REVISION,'bindings.ts geometry revision tracks model.ts');
  assert.equal(foil.geometryRevision.value,MODEL_GEOMETRY_REVISION,'the FOIL adapter fixture targets the same generic geometry');
  const view={camera:'plate',selection:'module',isolate:true,explode:.4,timeCursor:7,viewToken:'v.2'};
  assert.deepEqual(designDigest({...model,...view}),base);
  assert.deepEqual(designDigest({...model,parts:model.parts.map(p=>({...p,explode:[9,9,9],selection:true}))}),base);
  assert.notDeepEqual(designDigest({...model,title:model.title+'!'}),base);
  assert.notDeepEqual(designDigest({...model,parts:model.parts.map(p=>p.id==='plate'?{...p,node:12}:p)}),base);
  assert.notDeepEqual(designDigest({...model,mode:'isolate'}),base,'only the declared view keys are excluded');
  assert.deepEqual(designDigest({a:1,camera:{x:1}}),digest({a:1}));
  assert.throws(()=>designDigest({a:Number.NaN}),EngineeringError);
  assert.throws(()=>designDigest({a:new Date(0)}),EngineeringError);
});

test('the binding helpers live in the framework without FOIL, React or store imports',()=>{
  const source=readFileSync('src/framework/engineering/binding.ts','utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(m=>m[1]),['./contract.ts']);
  for(const file of readdirSync('src/framework',{recursive:true}).filter(f=>/\.(ts|tsx)$/.test(f)))
    assert.doesNotMatch(readFileSync(path.join('src/framework',file),'utf8'),/foil-adapter|engineering-consumers/i,file);
});

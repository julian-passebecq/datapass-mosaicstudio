// Differential test: every fixture in tests/fixtures/artifact-corpus (all SYNTHETIC) is decided by
// (1) JSON Schema docs/contracts/artifact.schema.json (Ajv 2020-12, pinned dev dependency),
// (2) the TypeScript validator and (3) the Python mirror py/datapass_artifact.py.
// All three must agree with manifest.json: accept/reject, the refusing gate and the JSON Pointer of the offending field.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {artifactDecision,checkArtifactEnvelope,checkArtifactStructure,validateArtifactSet,ArtifactValidationError} from '../src/framework/foundation/artifact.ts';

const root='tests/fixtures/artifact-corpus';
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
const load=file=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
const schema=JSON.parse(readFileSync('docs/contracts/artifact.schema.json','utf8'));
const validateSchema=new Ajv2020({allErrors:true,strict:false}).compile(schema);
const escape=key=>String(key).replace(/~/g,'~0').replace(/\//g,'~1');
/** Ajv reports a missing or unexpected property, or a bad property name, at the parent object: point at the property itself. */
const schemaPaths=errors=>new Set(errors.map(e=>e.instancePath+(e.keyword==='required'?'/'+escape(e.params.missingProperty):e.keyword==='additionalProperties'?'/'+escape(e.params.additionalProperty):e.propertyName!==undefined?'/'+escape(e.propertyName):'')));
const schemaDecision=value=>validateSchema(value)?{ok:true}:{ok:false,paths:schemaPaths(validateSchema.errors)};

function pythonDecisions(files){
  for(const python of process.platform==='win32'?['python','py']:['python3','python']){
    const run=spawnSync(python,['-I','py/datapass_artifact.py',...files.map(f=>path.join(root,f))],{encoding:'utf8',maxBuffer:64*1024*1024});
    if(run.error)continue;
    assert.ok(run.status===0||run.status===1,'python mirror crashed: '+run.stderr);
    return run.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  }
  throw new Error('A Python 3 interpreter is required for the Python leg of the artifact corpus.');
}

test('the manifest lists every corpus file and covers all three gates',()=>{
  const present=readdirSync(root,{recursive:true}).map(f=>String(f).replace(/\\/g,'/')).filter(f=>f.endsWith('.json')&&f!=='manifest.json').sort();
  const listed=[...manifest.fixtures.map(f=>f.file),...manifest.sets.flatMap(s=>s.files)].sort();
  assert.deepEqual(listed,present);
  const gates=new Set(manifest.fixtures.filter(f=>f.expect==='reject').map(f=>f.gate));
  assert.deepEqual([...gates].sort(),['envelope','semantic','structure']);
  for(const name of ['legacy-v1-wind-aep-6e97cae','contoso-shaped','foil-shaped'])assert.ok(manifest.fixtures.some(f=>f.expect==='accept'&&f.file.includes(name)),name);
});

test('JSON Schema decides exactly the structure gate, with the offending field among its errors',()=>{
  for(const f of manifest.fixtures){
    const got=schemaDecision(load(f.file));
    if(f.expect==='accept'||f.gate!=='structure')assert.ok(got.ok,f.file+' should pass the schema: '+[...(got.paths??[])].join(', '));
    else{assert.equal(got.ok,false,f.file+' should fail the schema');assert.ok(got.paths.has(f.path),f.file+': expected '+f.path+' among '+[...got.paths].join(', '));}
  }
});

test('the TypeScript validator gives the expected decision, gate and path',()=>{
  for(const f of manifest.fixtures){
    const value=load(f.file),got=artifactDecision(value);
    if(f.expect==='accept'){assert.deepEqual(got,{ok:true},f.file+': '+got.message);continue;}
    assert.equal(got.ok,false,f.file);
    assert.deepEqual([got.gate,got.path],[f.gate,f.path],f.file+': '+got.message);
    assert.ok(got.message.startsWith((f.path||'/')+': '),got.message);
  }
});

test('the TypeScript structure gate and JSON Schema agree on every fixture that passes the envelope',()=>{
  for(const f of manifest.fixtures){
    const value=load(f.file);
    try{checkArtifactEnvelope(value);}catch{continue;}
    let structural=true;try{checkArtifactStructure(value);}catch(error){assert.ok(error instanceof ArtifactValidationError);structural=false;}
    assert.equal(structural,schemaDecision(value).ok,f.file);
  }
});

test('the Python mirror gives identical decisions, gates and paths',()=>{
  const files=manifest.fixtures.map(f=>f.file),decisions=pythonDecisions(files);
  assert.equal(decisions.length,files.length);
  manifest.fixtures.forEach((f,i)=>{
    const py=decisions[i],ts=artifactDecision(load(f.file));
    assert.equal(py.ok,ts.ok,f.file+': '+(py.message??ts.message));
    if(!ts.ok)assert.deepEqual([py.gate,py.path],[ts.gate,ts.path],f.file+': python '+py.message+' / ts '+ts.message);
  });
});

test('artifact sets: unique ids and no dependsOn cycle, identical in TypeScript and Python',()=>{
  for(const s of manifest.sets){
    let ts={ok:true};
    try{validateArtifactSet(s.files.map(load));}catch(error){assert.ok(error instanceof ArtifactValidationError);ts={ok:false,gate:error.gate,path:error.path};}
    assert.deepEqual(ts,s.expect==='accept'?{ok:true}:{ok:false,gate:s.gate,path:s.path},s.name);
    const run=spawnSync(process.platform==='win32'?'python':'python3',['-I','py/datapass_artifact.py','--set',...s.files.map(f=>path.join(root,f))],{encoding:'utf8'});
    const py=JSON.parse(run.stdout.trim());
    assert.equal(py.ok,ts.ok,s.name);if(!ts.ok)assert.deepEqual([py.gate,py.path],[ts.gate,ts.path],s.name);
  }
});

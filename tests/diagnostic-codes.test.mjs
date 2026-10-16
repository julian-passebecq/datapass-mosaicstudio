// Stable diagnostic codes (F209): one table in src/framework/diagnostics, published as docs/contracts/diagnostic-codes.json,
// reported by the TypeScript artifact validator and (same rule, same code) by py/datapass_artifact.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ART,ARTIFACT_DIAGNOSTICS,DIAGNOSTICS,DIAGNOSTIC_PREFIXES,ENV_DIAGNOSTICS,CLI_DIAGNOSTICS,STO_DIAGNOSTICS,BUN_DIAGNOSTICS,diagnostic,diagnosticCodesContract} from '../src/framework/diagnostics/index.ts';
import {artifactDecision,checkArtifactEnvelope,validateArtifact,ArtifactValidationError} from '../src/framework/foundation/artifact.ts';

const corpus='tests/fixtures/artifact-corpus/';
const load=file=>JSON.parse(readFileSync(corpus+file,'utf8'));

test('codes are unique, well formed and under their reserved prefix',()=>{
  assert.deepEqual(Object.keys(DIAGNOSTIC_PREFIXES).sort(),['DP-ART','DP-BUN','DP-CLI','DP-ENV','DP-STO']);
  const codes=DIAGNOSTICS.map(row=>row.code);
  assert.equal(new Set(codes).size,codes.length);
  for(const row of DIAGNOSTICS){assert.match(row.code,/^DP-(ART|ENV|CLI|STO|BUN)-\d{3}$/);assert.match(row.rule,/^[a-z][a-z0-9-]*$/);assert.ok(row.summary.length>10);assert.ok(row.languages.length>0);}
  assert.equal(new Set(ARTIFACT_DIAGNOSTICS.map(row=>row.rule)).size,ARTIFACT_DIAGNOSTICS.length,'one rule, one code');
  assert.ok(Object.isFrozen(DIAGNOSTICS)&&Object.isFrozen(DIAGNOSTICS[0]));
});

test('reserved areas start empty (F205-F208, F210, F213 own them)',()=>{
  for(const rows of [ENV_DIAGNOSTICS,CLI_DIAGNOSTICS,STO_DIAGNOSTICS,BUN_DIAGNOSTICS])assert.deepEqual(rows,[]);
});

test('every ART constant has exactly one table row with a valid gate',()=>{
  assert.deepEqual(Object.values(ART).sort(),ARTIFACT_DIAGNOSTICS.map(row=>row.code).sort());
  for(const row of ARTIFACT_DIAGNOSTICS)assert.ok(['envelope','structure','semantic'].includes(row.gate),row.code);
  assert.equal(diagnostic('DP-ART-013').rule,'format');assert.equal(diagnostic('DP-ART-999'),undefined);
});

test('the published contract matches the source table',()=>{
  const published=JSON.parse(readFileSync('docs/contracts/diagnostic-codes.json','utf8'));
  assert.deepEqual(published,JSON.parse(JSON.stringify(diagnosticCodesContract)));
});

test('docs/DIAGNOSTIC_CODES.md documents every code with its gate and rule',()=>{
  const doc=readFileSync('docs/DIAGNOSTIC_CODES.md','utf8');
  for(const row of DIAGNOSTICS)assert.ok(doc.includes('| `'+row.code+'` | '+row.gate+' | `'+row.rule+'` |'),row.code);
  for(const prefix of Object.keys(DIAGNOSTIC_PREFIXES))assert.ok(doc.includes('| `'+prefix+'` |'),prefix);
});

test('a rejection carries its code and keeps the message text unchanged',()=>{
  const got=artifactDecision(load('invalid/s-format.json'));
  assert.deepEqual(got,{ok:false,gate:'structure',path:'/format',message:'/format: Unsupported artifact format',code:'DP-ART-013'});
  assert.throws(()=>validateArtifact(load('invalid/m-depends-on-self.json')),error=>error instanceof ArtifactValidationError&&error.code===ART.dependsOnSelf&&error.message==='/provenance/dependsOn/1: artifact dependsOn: an artifact cannot depend on itself');
  assert.deepEqual(artifactDecision(load('valid/lineage-full.json')),{ok:true});
});

test('envelope rules map to distinct codes (inert JSON, structure budget, byte budget)',()=>{
  const code=value=>{try{checkArtifactEnvelope(value);return null;}catch(error){return error.code;}};
  let deep={};const root=deep;for(let i=0;i<30;i++){deep.x={};deep=deep.x;}
  assert.equal(code(root),ART.structureBudget);
  assert.equal(code({x:Number.NaN}),ART.inertJson);
  assert.equal(code({x:()=>1}),ART.inertJson);
  assert.equal(code({x:'y'.repeat(1048577)}),ART.byteBudget);
});

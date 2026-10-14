import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {WORKBENCH_CSP,WORKBENCH_HEADERS,workbenchHeadersFile,parseHeadersFile} from '../scripts/workbench-headers.mjs';

const directives=csp=>Object.fromEntries(csp.split(';').map(d=>d.trim().split(/\s+/)).map(([name,...values])=>[name,values]));

test('the static-host _headers file carries exactly the vite preview headers',()=>{
  assert.deepEqual(parseHeadersFile(workbenchHeadersFile()),{'/*':WORKBENCH_HEADERS});
});

test('vite preview, prepare-assets and the rollback check all use the shared headers, with no inline CSP copy',()=>{
  const vite=readFileSync('vite.config.ts','utf8'),prepare=readFileSync('scripts/prepare-assets.mjs','utf8'),rollback=readFileSync('scripts/release-rollback-check.mjs','utf8');
  assert.match(vite,/preview:\{[^}]*headers:WORKBENCH_HEADERS\}/);
  assert.match(prepare,/writeFile\('public\/_headers',workbenchHeadersFile\(\)\)/);
  assert.match(rollback,/\.\.\.WORKBENCH_HEADERS/);
  for(const [name,text] of [['vite.config.ts',vite],['prepare-assets.mjs',prepare],['release-rollback-check.mjs',rollback]])assert.doesNotMatch(text,/connect-src/,name+' must not inline its own CSP');
});

test('connect-src adds only loopback http/ws to self and blob; everything else stays strict',()=>{
  const d=directives(WORKBENCH_CSP);
  assert.deepEqual(d['connect-src'],["'self'",'blob:','http://127.0.0.1:*','http://localhost:*','ws://127.0.0.1:*','ws://localhost:*']);
  assert.deepEqual(d['default-src'],["'self'"]);
  assert.deepEqual(d['script-src'],["'self'","'wasm-unsafe-eval'"]);
  assert.deepEqual(d['object-src'],["'none'"]);
  assert.ok(!/unsafe-eval'|https?:\/\/\*|\shttps:|\*\./.test(WORKBENCH_CSP.replace("'wasm-unsafe-eval'",'')),'no remote wildcard or unsafe-eval');
});

for(const file of ['public/_headers','dist/_headers'])test(file+' (when generated) matches the shared headers',{skip:!existsSync(file)&&'not generated'},()=>{
  assert.deepEqual(parseHeadersFile(readFileSync(file,'utf8')),{'/*':WORKBENCH_HEADERS});
});

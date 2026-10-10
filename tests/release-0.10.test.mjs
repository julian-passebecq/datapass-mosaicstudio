import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SDK_LICENSE} from '../scripts/sdk-pack.mjs';
import {buildInventory,isPermissive,spdxIds} from '../scripts/license-inventory.mjs';

// FR-07 release packaging: version identity, license honesty and the hand-off receipts agree with the tree.
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const blobSha=p=>createHash('sha256').update(execFileSync('git',['show','HEAD:'+p])).digest('hex');
const pkg=json('package.json'),lock=json('package-lock.json');
const DIR='handoff/01-mosaicstudio/full-release-2026-10-10';

test('one version everywhere: package.json, the lock and the committed standalone viewer',()=>{
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  assert.match(readFileSync('dist-standalone/concept-viewer.html','utf8').slice(0,600),new RegExp(`DataPass MosaicStudio ${pkg.version.replace(/\./g,'\\.')} · source commit [0-9a-f]{40} `));
});

test('no license is invented: SDK manifest statement and inventory say none, publication not authorized',()=>{
  assert.equal(SDK_LICENSE.spdx,null);
  assert.doesNotMatch(SDK_LICENSE.statement,/private repository/);
  assert.match(SDK_LICENSE.statement,/no license is granted/i);assert.match(SDK_LICENSE.statement,/NOT_AUTHORIZED/);
  const inv=json('docs/licenses/third-party-inventory.json');
  assert.equal(inv.project.spdx,null);assert.equal(inv.publicSdkPublication,'NOT_AUTHORIZED');
  assert.ok(inv.python&&inv.python.distributions>0,'the committed inventory has its Python section');
  assert.equal(git(['ls-files','LICENSE','LICENSE.md','LICENSE.txt','COPYING']),'');
  assert.equal(pkg.license,undefined);
});

test('the committed license inventory matches package-lock.json (npm section)',()=>{
  const committed=json('docs/licenses/third-party-inventory.json'),fresh=buildInventory();
  assert.deepEqual(committed.npm,fresh.npm);assert.equal(committed.package.version,pkg.version);
  assert.equal(committed.npm.packages,committed.npm.list.length);
  for(const dep of Object.keys(pkg.dependencies))assert.ok(committed.npm.list.some(p=>p.name===dep&&p.direct&&p.production),dep);
});

test('permissive-license classification handles SPDX expressions',()=>{
  assert.ok(isPermissive('MIT'));assert.ok(isPermissive('(MIT OR GPL-3.0)'));assert.ok(isPermissive('Apache-2.0 AND MIT'));
  assert.ok(!isPermissive('MPL-2.0'));assert.ok(!isPermissive('MIT AND LGPL-3.0'));assert.ok(!isPermissive(null));
  assert.deepEqual(spdxIds('(MIT OR Apache-2.0)'),['MIT','Apache-2.0']);
});

test('READY receipt hashes are the committed contract bytes',()=>{
  const ready=json(DIR+'/READY.json');
  assert.equal(ready.template,false);assert.equal(ready.visibility,'PRIVATE_OR_LOCAL_UNTIL_APPROVED');
  const ids=ready.contract_versions.map(c=>c.id);
  for(const id of ['datapass.artifact/1','datapass.concept-spec/1','datapass.preview/1'])assert.ok(ids.includes(id),id);
  for(const c of ready.contract_versions)for(const f of c.files)assert.equal(f.sha256,blobSha(f.path),f.path);
});

test('OUTCOME keeps every original row, maps FR-01..FR-07 and leaves publication and Fabric off',()=>{
  const o=json(DIR+'/OUTCOME.json');
  assert.equal(o.public_distribution,'NOT_AUTHORIZED');assert.equal(o.fabric_runtime,'NOT_AUTHORIZED');assert.equal(o.template,false);
  const keys=o.features.map(f=>f.key);
  for(let i=1;i<=14;i++)assert.ok(keys.includes(`01-mosaicstudio/F${String(i).padStart(2,'0')}`));
  for(let i=1;i<=7;i++)assert.ok(keys.includes(`01-mosaicstudio/FR-0${i}`));
  assert.deepEqual(o.ux.map(u=>u.key),[1,2,3,4].map(i=>`01-mosaicstudio/UX0${i}`));
  for(const row of [...o.features,...o.ux])assert.ok(['PASS','FAIL','BLOCKED','UNKNOWN','PARTIAL'].includes(row.result),row.key+' '+row.result);
  const release=readFileSync('docs/RELEASE_0.10.md','utf8');
  for(const k of [...keys,...o.ux.map(u=>u.key)])assert.ok(release.includes(k.replace('01-mosaicstudio/','')),'RELEASE_0.10.md maps '+k);
  for(const e of ['E2E-01','E2E-05','E2E-06','E2E-07','E2E-08'])assert.ok(release.includes(e),e);
});

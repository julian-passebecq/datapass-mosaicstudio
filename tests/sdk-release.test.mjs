import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {packSdk,SDK_FORBIDDEN} from '../scripts/sdk-pack.mjs';
import {verifySdkRelease,archiveFiles} from '../scripts/sdk-verify.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const git=(args,cwd=repo)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const node=(args)=>spawnSync(process.execPath,args,{cwd:repo,encoding:'utf8'});
const work=await mkdtemp(path.join(tmpdir(),'sdk-release-'));
test.after(()=>rm(work,{recursive:true,force:true}));
const out=path.join(work,'release');
const packed=node(['scripts/sdk-pack.mjs','--out',out,'--allow-dirty']);
const manifest=packed.status===0?JSON.parse(await readFile(path.join(out,'sdk-release.json'),'utf8')):null;

test('sdk:pack writes the archive, the standalone viewer and a complete manifest',async()=>{
  assert.equal(packed.status,0,packed.stderr);
  const pkg=JSON.parse(git(['show','HEAD:package.json']));
  assert.equal(manifest.format,'datapass.sdk-release');assert.equal(manifest.version,1);
  assert.equal(manifest.sdkVersion,pkg.version);assert.equal(manifest.sourceCommit,git(['rev-parse','HEAD']));
  assert.equal(manifest.commitDate,git(['show','-s','--format=%cI','HEAD']));assert.equal(typeof manifest.sourceTreeClean,'boolean');
  assert.equal(manifest.license.spdx,null);assert.match(manifest.license.statement,/all rights reserved/);
  assert.equal(manifest.archive.name,`datapass-mosaicstudio-sdk-${pkg.version}.tar.gz`);assert.equal(manifest.upgrade,'docs/CONSUMING.md');
  assert.deepEqual(manifest.contracts.map(c=>c.id),['datapass.concept-spec/1','datapass.artifact/1','datapass.preview/1']);
  assert.deepEqual(manifest.standalone.map(s=>s.path),['concept-viewer.html']);
  const paths=manifest.files.map(f=>f.path);
  assert.deepEqual(paths,[...paths].sort((a,b)=>a<b?-1:a>b?1:0));
  for(const need of ['package.json','package-lock.json','upstreams.lock.json','tsconfig.json','vite.client.config.ts','index.html','AGENTS.md','README.md','THIRD_PARTY_NOTICES.md',
    'src/framework/authoring.ts','src/client-main.tsx','scripts/scaffold-client.mjs','scripts/templates/analytics.mjs','scripts/build-client.mjs','scripts/sdk-verify.mjs',
    'spec/concept/v1/concept-spec.schema.json','spec/preview/v1/preview.schema.json','docs/CONSUMING.md','docs/API_VERSION_MIGRATION_POLICY.md'])assert.ok(paths.includes(need),'missing '+need);
  const html=await readFile(path.join(out,'concept-viewer.html'));assert.ok(html.subarray(0,200).toString().startsWith('<!doctype html>'));
});

test('the release holds no forbidden paths (dependencies, upstreams, clients, builds, secrets, workbench)',()=>{
  const paths=manifest.files.map(f=>f.path);
  for(const p of paths){assert.ok(!SDK_FORBIDDEN.some(r=>r.test(p)),'forbidden '+p);assert.ok(!/(^|\/)(node_modules|\.upstream|dist-clients|dist-sdk)(\/|$)|^clients\/|\.env$/.test(p),'forbidden '+p);}
  for(const p of ['src/App.tsx','src/store.ts','src/main.tsx'])assert.ok(!paths.includes(p),'workbench file in SDK: '+p);
  assert.ok(!paths.some(p=>p.startsWith('src/workspace/')||p.startsWith('py/')||p.startsWith('docs/media/')));
});

test('every relative import of the archived sources resolves inside the archive',async()=>{
  const files=new Set(manifest.files.map(f=>f.path)),missing=[];
  const exts=['','.ts','.tsx','.mjs','.js','.mts','.css','.json','/index.ts','/index.tsx'];
  for(const p of files){
    if(!/^(src|scripts)\/.*\.(tsx?|mjs)$/.test(p))continue;
    const text=await readFile(path.join(repo,p),'utf8').catch(()=>'');
    for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.\.?\/[^'"]+)['"]/g)){
      const base=path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1]));
      if(!exts.some(e=>files.has(base+e)))missing.push(p+' -> '+m[1]);
    }
  }
  // Scripts that drive the repository's own acceptance (tests/, tools/, reference clients) may point outside the SDK.
  const allowed=missing.filter(x=>!/^scripts\/(test-|smoke-|capture-|record-|check-visuals|make-test)/.test(x));
  assert.deepEqual(allowed,[]);
});

test('sdk:verify passes on the release and fails after any tampering',async()=>{
  assert.equal(node(['scripts/sdk-verify.mjs',out]).status,0);
  assert.equal((await verifySdkRelease(out)).ok,true);
  const archive=path.join(out,manifest.archive.name),copy=path.join(work,'tamper');
  await cp(out,copy,{recursive:true});
  const bytes=await readFile(path.join(copy,manifest.archive.name));bytes[bytes.length>>1]^=1;await writeFile(path.join(copy,manifest.archive.name),bytes);
  const r=node(['scripts/sdk-verify.mjs',copy]);assert.equal(r.status,1);assert.match(r.stderr,/archive/);
  await cp(archive,path.join(copy,manifest.archive.name));
  const html=await readFile(path.join(copy,'concept-viewer.html'));html[100]^=1;await writeFile(path.join(copy,'concept-viewer.html'),html);
  assert.match((await verifySdkRelease(copy)).problems.join('\n'),/changed standalone file: concept-viewer.html/);
  await cp(path.join(out,'concept-viewer.html'),path.join(copy,'concept-viewer.html'));
  const m=structuredClone(manifest);m.files[0].sha256='0'.repeat(64);m.files.pop();await writeFile(path.join(copy,'sdk-release.json'),JSON.stringify(m));
  const problems=(await verifySdkRelease(copy)).problems.join('\n');assert.match(problems,/changed file/);assert.match(problems,/extra file in archive/);
  assert.equal(node(['scripts/sdk-verify.mjs']).status,2);
});

test('archive file entries match the manifest exactly',async()=>{
  const {files}=archiveFiles(await readFile(path.join(out,manifest.archive.name)));
  assert.deepEqual(files,manifest.files);
});

test('a dirty tree is refused without --allow-dirty and a clean commit packs deterministically',{timeout:120000},async()=>{
  const clone=path.join(work,'clone');
  git(['clone','-q','--depth','1',pathToFileURL(repo).href,clone]);
  const a=await packSdk({cwd:clone,out:path.join(work,'a')}),b=await packSdk({cwd:clone,out:path.join(work,'b')});
  assert.equal(a.sourceTreeClean,true);
  assert.equal(await readFile(path.join(work,'a','sdk-release.json'),'utf8'),await readFile(path.join(work,'b','sdk-release.json'),'utf8'));
  await writeFile(path.join(clone,'untracked.txt'),'dirty');
  await assert.rejects(packSdk({cwd:clone,out:path.join(work,'c')}),e=>e.code==='DIRTY');
  assert.ok(!existsSync(path.join(work,'c','sdk-release.json')));
  assert.equal((await packSdk({cwd:clone,out:path.join(work,'c'),allowDirty:true})).sourceTreeClean,false);
});

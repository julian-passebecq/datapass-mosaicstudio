import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const script=path.resolve(import.meta.dirname,'../scripts/release-manifest.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');

async function fixture(t,{runtime=true}={}){
  const work=await mkdtemp(path.join(tmpdir(),'release-manifest-'));
  t.after(()=>rm(work,{recursive:true,force:true}));
  const repo=path.join(work,'checkout');
  await mkdir(path.join(repo,'scripts'),{recursive:true});
  await cp(script,path.join(repo,'scripts/release-manifest.mjs'));
  await writeFile(path.join(repo,'package.json'),JSON.stringify({name:'synthetic-release',version:'1.2.3'}));
  await writeFile(path.join(repo,'.gitignore'),'dist/\ndist-sdk/\ndist-runtime/\ndist-standalone/\ndist-clients/\n');
  const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
  git(['init','--quiet']);git(['add','.']);
  git(['-c','user.name=Release fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic manifest fixture']);
  const commit=git(['rev-parse','HEAD']);
  for(const dir of ['dist','dist-sdk','dist-standalone','dist-clients/example'])await mkdir(path.join(repo,dir),{recursive:true});
  for(const [p,text] of [['dist/index.html','workbench'],['dist-standalone/concept-viewer.html','viewer'],['dist-sdk/example.txt','SDK'],['dist-clients/example/index.html','client']])await writeFile(path.join(repo,p),text);
  let runtimeManifest=null,archive=null;
  if(runtime){
    const folder=path.join(repo,'dist-runtime');await mkdir(folder);
    archive=gzipSync(execFileSync('git',['archive','--format=tar','--prefix=datapass-runtime-companion-1.2.3/','HEAD','--','package.json'],{cwd:repo}));
    runtimeManifest={format:'datapass.runtime-companion',version:1,sdkVersion:'1.2.3',sourceCommit:commit,sourceTreeClean:true,
      archive:{name:'datapass-runtime-companion-1.2.3.tar.gz',bytes:archive.length,sha256:sha(archive)},
      files:[{path:'package.json',bytes:(await readFile(path.join(repo,'package.json'))).length}]};
    await writeFile(path.join(folder,runtimeManifest.archive.name),archive);
    await writeFile(path.join(folder,'runtime-companion.json'),JSON.stringify(runtimeManifest)+'\n');
  }
  let runIndex=0;
  async function run(compare){
    const out=path.join(work,'evidence '+runIndex++);
    const args=[path.join(repo,'scripts/release-manifest.mjs'),'--out',out];
    if(compare)args.push('--compare',compare);
    const result=spawnSync(process.execPath,args,{cwd:work,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const file=path.join(out,'release-manifest.json');
    return {file,manifest:JSON.parse(await readFile(file,'utf8')),stdout:result.stdout};
  }
  return {repo,commit,archive,runtimeManifest,run};
}

test('release manifest includes the optional companion bytes and declared archive identity',async t=>{
  const f=await fixture(t),before=await readFile(path.join(f.repo,'dist-runtime',f.runtimeManifest.archive.name));
  const {manifest,stdout}=await f.run();
  assert.equal(manifest.format,'datapass.release-manifest');assert.equal(manifest.version,1);
  assert.equal(manifest.sourceCommit,f.commit);assert.equal(manifest.sourceTreeClean,true);
  const runtime=manifest.outputs.find(o=>o.id==='runtime-companion');
  assert.ok(runtime,'the companion must appear in the release inventory');
  assert.equal(runtime.present,true);assert.equal(runtime.path,'dist-runtime');assert.equal(runtime.files,2);
  const archive=runtime.list.find(o=>o.path===f.runtimeManifest.archive.name);
  assert.equal(archive.sha256,sha(f.archive));assert.equal(archive.bytes,f.archive.length);
  const companion=await readFile(path.join(f.repo,'dist-runtime','runtime-companion.json'));
  assert.equal(runtime.list.find(o=>o.path==='runtime-companion.json').sha256,sha(companion));
  assert.equal(runtime.bytes,f.archive.length+companion.length);
  assert.deepEqual(manifest.runtimeArchive,{name:f.runtimeManifest.archive.name,bytes:f.archive.length,sha256:sha(f.archive),
    sdkVersion:'1.2.3',sourceCommit:f.commit,sourceTreeClean:true,files:1});
  assert.match(stdout,/runtime-companion: 2 files/);
  assert.deepEqual(await readFile(path.join(f.repo,'dist-runtime',f.runtimeManifest.archive.name)),before,'inventory does not rewrite the archive');
});

test('unchanged companion compares identical, and a companion-only archive change is visible',async t=>{
  const f=await fixture(t),first=await f.run(),same=await f.run(first.file);
  assert.equal(same.manifest.comparison.outputs.find(o=>o.id==='runtime-companion')?.result,'IDENTICAL');
  const archivePath=path.join(f.repo,'dist-runtime',f.runtimeManifest.archive.name);
  const changed=Buffer.from(f.archive);changed[changed.length-1]^=1;await writeFile(archivePath,changed);
  const next=await f.run(first.file),comparison=next.manifest.comparison.outputs;
  const runtime=comparison.find(o=>o.id==='runtime-companion');
  assert.equal(runtime?.result,'DIFFERENT');assert.deepEqual(runtime.differing,[f.runtimeManifest.archive.name]);
  assert.equal(runtime.differingCount,1);
  assert.ok(comparison.filter(o=>o.id!=='runtime-companion').every(o=>o.result==='IDENTICAL'));
});

test('companion-only manifest metadata changes affect the release comparison',async t=>{
  const f=await fixture(t),first=await f.run();
  await writeFile(path.join(f.repo,'dist-runtime','runtime-companion.json'),JSON.stringify({...f.runtimeManifest,sourceTreeClean:false})+'\n');
  const next=await f.run(first.file),runtime=next.manifest.comparison.outputs.find(o=>o.id==='runtime-companion');
  assert.equal(runtime?.result,'DIFFERENT');assert.deepEqual(runtime.differing,['runtime-companion.json']);
  assert.equal(next.manifest.runtimeArchive.sourceTreeClean,false);
});

test('a browser-only build keeps the optional companion explicitly absent',async t=>{
  const f=await fixture(t,{runtime:false}),{manifest}=await f.run();
  assert.equal(manifest.outputs.find(o=>o.id==='runtime-companion')?.present,false);
  assert.equal(manifest.runtimeArchive,null);
  assert.ok(manifest.outputs.filter(o=>o.id!=='runtime-companion').every(o=>o.present));
});

test('older release manifests remain readable without inventing companion comparison evidence',async t=>{
  const f=await fixture(t),first=await f.run();
  delete first.manifest.runtimeArchive;
  first.manifest.outputs=first.manifest.outputs.filter(o=>o.id!=='runtime-companion');
  await writeFile(first.file,JSON.stringify(first.manifest));
  const {manifest}=await f.run(first.file),comparison=manifest.comparison.outputs;
  assert.equal(comparison.find(o=>o.id==='runtime-companion')?.result,'MISSING');
  assert.ok(comparison.filter(o=>o.id!=='runtime-companion').every(o=>o.result==='IDENTICAL'));
});

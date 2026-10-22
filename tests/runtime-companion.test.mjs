import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {packRuntime,companionPathProblems,pinnedRequirements,RUNTIME_MANIFEST,RUNTIME_REQUIRED} from '../scripts/runtime-pack.mjs';
import {verifyRuntimeCompanion,startCompanion} from '../scripts/runtime-verify.mjs';
import {SDK_FORBIDDEN} from '../scripts/sdk-pack.mjs';

const repo=path.resolve(import.meta.dirname,'..');
const git=(args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const work=await mkdtemp(path.join(tmpdir(),'runtime-companion-'));
test.after(()=>rm(work,{recursive:true,force:true}));
const out=path.join(work,'release');
const manifest=await packRuntime({out,allowDirty:true});
const copy=async name=>{const dir=path.join(work,name);await cp(out,dir,{recursive:true});return dir;};
const readManifest=async dir=>JSON.parse(await readFile(path.join(dir,RUNTIME_MANIFEST),'utf8'));
const writeManifest=(dir,m)=>writeFile(path.join(dir,RUNTIME_MANIFEST),JSON.stringify(m,null,2)+'\n');

test('runtime:pack writes a versioned archive and a datapass.runtime-companion v1 manifest naming commit and SDK version',async()=>{
  const pkg=JSON.parse(git(['show','HEAD:package.json']));
  assert.equal(manifest.format,'datapass.runtime-companion');assert.equal(manifest.version,1);
  assert.equal(manifest.sdkVersion,pkg.version);assert.equal(manifest.sourceCommit,git(['rev-parse','HEAD']));
  assert.equal(manifest.commitDate,git(['show','-s','--format=%cI','HEAD']));assert.equal(typeof manifest.sourceTreeClean,'boolean');
  assert.equal(manifest.archive.name,`datapass-runtime-companion-${pkg.version}.tar.gz`);
  assert.equal(manifest.publication.public,false);assert.match(manifest.publication.statement,/Never published publicly/);
  assert.equal(manifest.service.entry,'py/service/app.py');assert.equal(manifest.service.health,'/api/runtime/v1/health');
  assert.match(manifest.service.version,/^\d+\.\d+\.\d+$/);assert.equal(manifest.service.name,'datapass-artifact-service');
  assert.ok(manifest.env.DATAPASS_ARTIFACT_DIR&&manifest.env.DATAPASS_RUNTIME_TOKEN&&manifest.env.DATAPASS_SERVICE_PROFILE);
  assert.equal(manifest.service.profile,'safe');assert.deepEqual(manifest.service.start,['py/service/app.py','--profile','safe']);
  assert.equal(manifest.service.ready,'/api/runtime/v1/ready');
  assert.equal(manifest.guide,'docs/RUNTIME_COMPANION.md');
});

test('the archive holds exactly the companion: service modules, artifact library, model, pins, guide; no tests or client data',()=>{
  const paths=manifest.files.map(f=>f.path);
  assert.deepEqual(paths,[...paths].sort((a,b)=>a<b?-1:a>b?1:0));
  for(const need of RUNTIME_REQUIRED)assert.ok(paths.includes(need),'missing '+need);
  const expected=git(['ls-files','py/service/*.py','py/datapass_artifact.py','py/datapass_engineering.py','py/wind_reference_model.py','py/service/requirements*.txt','docs/RUNTIME_COMPANION.md'])
    .split('\n').filter(p=>p&&!/\/test_[^/]*\.py$/.test(p)).sort();
  assert.deepEqual(paths,expected);
  assert.deepEqual(companionPathProblems(paths),[]);
  assert.ok(!paths.some(p=>/test_|^clients\/|^qa\/|\.env|notebooks|examples/.test(p)));
});

test('pinned requirement lines equal the committed requirement files',async()=>{
  assert.deepEqual(manifest.requirements.map(r=>r.path).sort(),['py/service/requirements-jupyter.txt','py/service/requirements.txt']);
  for(const r of manifest.requirements){
    const text=git(['show','HEAD:'+r.path]);
    assert.deepEqual(r.pins,pinnedRequirements(text,r.path));
    assert.ok(r.pins.length>0&&r.pins.every(p=>/==/.test(p)));
  }
  const service=manifest.requirements.find(r=>r.path==='py/service/requirements.txt');
  for(const name of ['fastapi','pydantic','uvicorn'])assert.ok(service.pins.some(p=>p.startsWith(name+'==')),'unpinned '+name);
});

test('pinnedRequirements accepts exact pins only',()=>{
  assert.deepEqual(pinnedRequirements('# comment\nfastapi==0.142.2  # api\n\nuvicorn[standard]==0.54.0\n'),['fastapi==0.142.2','uvicorn[standard]==0.54.0']);
  for(const bad of ['fastapi>=0.1','fastapi','-e .','git+https://example.invalid/x.git','fastapi==0.1; python_version<"3"'])
    assert.throws(()=>pinnedRequirements(bad,'r.txt'),/not an exact name==version pin/,bad);
});

test('the path policy refuses clients, qa, tests, notebooks, env files, keys and anything outside the allowlist',()=>{
  const base=[...RUNTIME_REQUIRED];
  for(const bad of ['clients/foil-wind/data.json','qa/receipt.json','py/service/test_service.py','py/notebooks/a.ipynb','py/service/.env','py/service/.env.local',
    'py/service/server.key','py/service/credentials.json','py/coding_lab_trace.py','src/store.ts','py/service/__pycache__/app.cpython-314.pyc'])
    assert.ok(companionPathProblems([...base,bad]).length>0,'accepted '+bad);
  assert.match(companionPathProblems(base.filter(p=>p!=='py/service/runtime.py')).join(),/required file missing: py\/service\/runtime.py/);
});

test('packing the same commit twice gives the same bytes',async()=>{
  const again=await packRuntime({out:path.join(work,'again'),allowDirty:true});
  assert.equal(again.archive.sha256,manifest.archive.sha256);assert.deepEqual(again.files,manifest.files);
});

test('runtime:verify (static) passes on a fresh pack and fails on any tampering',async()=>{
  const ok=await verifyRuntimeCompanion(out);assert.equal(ok.ok,true,ok.problems?.join('\n'));
  const cli=spawnSync(process.execPath,['scripts/runtime-verify.mjs',out,'--no-start'],{cwd:repo,encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);assert.match(cli.stdout,/Runtime companion .* verified/);
  assert.equal(spawnSync(process.execPath,['scripts/runtime-verify.mjs',out,'--port','8765'],{cwd:repo,encoding:'utf8'}).status,2,'ports at or below 20000 are refused');

  let dir=await copy('hash');let m=await readManifest(dir);m.files[0].sha256='0'.repeat(64);await writeManifest(dir,m);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/changed file/);

  dir=await copy('bytes');const archive=path.join(dir,manifest.archive.name);const raw=await readFile(archive);raw[raw.length-20]^=0xff;await writeFile(archive,raw);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/sha256 mismatch|archive:/);

  dir=await copy('pins');m=await readManifest(dir);m.requirements[0].pins=[...m.requirements[0].pins,'evil==1.0'];await writeManifest(dir,m);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/pins differ/);

  dir=await copy('profile');m=await readManifest(dir);m.service.start=['py/service/app.py','--profile','demo'];await writeManifest(dir,m);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/--profile safe/);
  dir=await copy('noprofile');m=await readManifest(dir);delete m.service.start;delete m.service.profile;await writeManifest(dir,m);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/--profile safe/);

  dir=await copy('public');m=await readManifest(dir);m.publication.public=true;await writeManifest(dir,m);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/public:false/);

  dir=await copy('missing');m=await readManifest(dir);m.files.push({path:'py/service/extra.py',bytes:1,sha256:'1'.repeat(64)});await writeManifest(dir,m);
  assert.match((await verifyRuntimeCompanion(dir)).problems.join('\n'),/missing file in archive: py\/service\/extra.py/);
});

test('a re-packed archive that smuggles a test file is refused even with consistent hashes',async()=>{
  // Append a tar entry by rebuilding: take the original tar, insert a forbidden file before the end blocks.
  const dir=await copy('smuggle');const archive=path.join(dir,manifest.archive.name);
  const tar=gunzipSync(await readFile(archive));
  const name=`${manifest.archive.root}/py/service/test_extra.py`,body=Buffer.from('print(1)\n');
  const header=Buffer.alloc(512);header.write(name,0,'utf8');header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write(body.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.write('        ',148);header.write('0',156);header.write('ustar\0',257);header.write('00',263);
  let sum=0;for(const b of header)sum+=b;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
  let end=tar.length;while(end>=512&&tar.subarray(end-512,end).every(b=>b===0))end-=512;
  const padded=Buffer.concat([body,Buffer.alloc((512-body.length%512)%512)]);
  const gz=gzipSync(Buffer.concat([tar.subarray(0,end),header,padded,Buffer.alloc(1024)]));
  await writeFile(archive,gz);
  const m=await readManifest(dir);const {createHash}=await import('node:crypto');const h=b=>createHash('sha256').update(b).digest('hex');
  m.archive.bytes=gz.length;m.archive.sha256=h(gz);m.files.push({path:'py/service/test_extra.py',bytes:body.length,sha256:h(body)});m.files.sort((a,b)=>a.path<b.path?-1:1);
  await writeManifest(dir,m);
  const r=await verifyRuntimeCompanion(dir);
  assert.equal(r.ok,false);assert.match(r.problems.join('\n'),/forbidden path: py\/service\/test_extra.py/);
});

test('the SDK archive still never carries py/ (the companion is a separate archive)',()=>{
  assert.ok(SDK_FORBIDDEN.some(r=>r.test('py/service/app.py')));
});

const hasService=spawnSync(process.env.PYTHON||'python',['-c','import fastapi, uvicorn, pydantic'],{encoding:'utf8'}).status===0;
test('the companion starts outside the checkout and answers health, token guard, 404 and one run',{skip:hasService?false:'fastapi/uvicorn not installed (CI runs npm run runtime:verify after pip)',timeout:90000},async()=>{
  const r=await verifyRuntimeCompanion(out);assert.equal(r.ok,true);
  const live=await startCompanion({manifest:r.manifest,gz:r.gz,python:process.env.PYTHON||'python',port:24361});
  assert.equal(live.ok,true,live.problems.join('\n'));
  assert.ok(live.checks.some(c=>/outside any checkout/.test(c)));
  assert.ok(live.checks.some(c=>/succeeded/.test(c)));
  for(const name of ['404 in safe: POST /compute/wind-reference','404 in safe: GET /openapi.json','cancelRequested:true (not cancelled yet)','replays the first record','409','JSON-escaped','demo: POST /compute'])
    assert.ok(live.probes.some(p=>p.ok&&p.name.includes(name)),'probe missing or failed: '+name);
});

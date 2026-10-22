#!/usr/bin/env node
/**
 * Pack the Python runtime companion of the current commit: a versioned, hashed archive of py/service and the
 * artifact library, which installs and starts outside a checkout (guide: docs/RUNTIME_COMPANION.md).
 * Local and private only: no upload, no npm/PyPI publication, no tag, no vault delivery, no deployment.
 *
 *   node scripts/runtime-pack.mjs [--out dist-runtime] [--allow-dirty]
 *
 * Writes <out>/datapass-runtime-companion-<version>.tar.gz (git archive of HEAD, companion paths only) and
 * <out>/runtime-companion.json (format datapass.runtime-companion v1: source commit, SDK version, service version,
 * file hashes, pinned requirement lines). Content always comes from HEAD, so the bytes are deterministic for a commit.
 * Tests, notebooks, examples, client data, qa evidence, env files and keys are never packed (allowlist + denylist).
 * Check a folder with scripts/runtime-verify.mjs (hashes, then a live start on a loopback port above 20000).
 */
import {execFileSync} from 'node:child_process';
import {mkdir,rm,writeFile,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveFiles,readTarGz,sha256} from './sdk-verify.mjs';
import {SDK_LICENSE} from './sdk-pack.mjs';

const repo=path.resolve(import.meta.dirname,'..');
export const RUNTIME_COMPANION_FORMAT='datapass.runtime-companion';
export const RUNTIME_MANIFEST='runtime-companion.json';
export const RUNTIME_ENTRY='py/service/app.py';
export const RUNTIME_HEALTH='/api/runtime/v1/health';
/** The packaged start command: always the safe profile (no unauthenticated demo routes, no OpenAPI pages). */
export const RUNTIME_PROFILE='safe';
export const RUNTIME_READY='/api/runtime/v1/ready';
export const RUNTIME_START=Object.freeze(['py/service/app.py','--profile',RUNTIME_PROFILE]);
/** git pathspecs of the companion (relative to the repository root). */
export const RUNTIME_SURFACE=Object.freeze([
  'py/service/*.py','py/service/requirements.txt','py/service/requirements-jupyter.txt',
  'py/datapass_artifact.py','py/datapass_engineering.py','py/wind_reference_model.py','docs/RUNTIME_COMPANION.md',
]);
export const RUNTIME_EXCLUDE=Object.freeze([':(exclude,glob)py/service/test_*.py']);
/** Every archived path must match one of these. */
export const RUNTIME_ALLOWED=Object.freeze([/^py\/service\/(?!test_)[a-z][a-z0-9_]*\.py$/,/^py\/service\/requirements(-[a-z]+)?\.txt$/,
  /^py\/(datapass_artifact|datapass_engineering|wind_reference_model)\.py$/,/^docs\/RUNTIME_COMPANION\.md$/]);
/** Never in a companion, even if the allowlist were widened by mistake. */
export const RUNTIME_FORBIDDEN=Object.freeze([/^clients\//,/^qa\//,/^tests?\//,/(^|\/)test_[^/]*\.py$/,/(^|\/)node_modules\//,/^\.upstream\//,
  /^py\/(notebooks|examples)\//,/^dist(-[a-z]+)?\//,/(^|\/)\.env(\.[^/]*)?$/,/\.(pem|key|p12|pfx|keystore)$/i,/(^|\/)id_(rsa|ed25519|ecdsa)/,
  /(^|\/)\.npmrc$/,/(^|\/)credentials?(\.[a-z]+)?$/i,/(^|\/)__pycache__\//,/\.ipynb$/]);
export const RUNTIME_REQUIRED=Object.freeze([RUNTIME_ENTRY,'py/service/runtime.py','py/service/result_store.py','py/service/requirements.txt',
  'py/datapass_artifact.py','py/datapass_engineering.py','py/wind_reference_model.py','docs/RUNTIME_COMPANION.md']);
export const RUNTIME_PUBLICATION=Object.freeze({public:false,
  statement:'Private companion for the owner\'s machines and approved private destinations only. Never published publicly (no PyPI, npm, public release, tag or Marketplace). Delivery to a private vault is a separate, explicit release act.'});
export const RUNTIME_ENV=Object.freeze({
  DATAPASS_RUNTIME_TOKEN:'16-128 URL-safe characters; required header X-Datapass-Token for /api/runtime/v1 (random when unset)',
  DATAPASS_ARTIFACT_DIR:'demo profile only: folder of precomputed artifacts for GET /artifacts/{id}; a missing folder answers 404',
  DATAPASS_SERVICE_PORT:'loopback port (default 8765; use one above 20000 for checks)',
  DATAPASS_SERVICE_ORIGINS:'comma-separated browser origins allowed by CORS and the runtime guard',
  DATAPASS_SERVICE_PROFILE:'safe (default) or demo; --profile wins. The packaged start command passes --profile safe',
});
const PIN=/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?==[0-9][0-9A-Za-z.+!-]*$/;

/** Requirement lines of a requirements file: every non-comment line must be an exact `name==version` pin. */
export function pinnedRequirements(text,file='requirements'){
  const pins=[];
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.replace(/\s+#.*$/,'').trim();
    if(!line||line.startsWith('#'))continue;
    if(!PIN.test(line))throw new Error(`${file}: "${line.slice(0,80)}" is not an exact name==version pin`);
    pins.push(line);
  }
  return pins;
}
/** Problems with a companion path list (empty when every path is allowed, none forbidden and every required file present). */
export function companionPathProblems(paths){
  const problems=[];
  for(const p of paths){
    if(RUNTIME_FORBIDDEN.some(r=>r.test(p)))problems.push('forbidden path: '+p);
    else if(!RUNTIME_ALLOWED.some(r=>r.test(p)))problems.push('path outside the companion allowlist: '+p);
  }
  for(const p of RUNTIME_REQUIRED)if(!paths.includes(p))problems.push('required file missing: '+p);
  return problems;
}
const pyConstant=(text,name)=>text.match(new RegExp(`^${name} = "([^"\\n]{1,80})"$`,'m'))?.[1]??null;

const git=(args,options={})=>execFileSync('git',args,{cwd:options.cwd??repo,maxBuffer:256*1024*1024,...(options.buffer?{}:{encoding:'utf8'})});

export async function packRuntime({out=path.join(repo,'dist-runtime'),allowDirty=false,cwd=repo}={}){
  const dirty=git(['status','--porcelain'],{cwd}).trim()!=='';
  if(dirty&&!allowDirty)throw Object.assign(new Error('Working tree is dirty: commit first, or pass --allow-dirty (recorded as sourceTreeClean:false). The archive always holds HEAD.'),{code:'DIRTY'});
  const sourceCommit=git(['rev-parse','HEAD'],{cwd}).trim(),commitDate=git(['show','-s','--format=%cI','HEAD'],{cwd}).trim();
  const pkg=JSON.parse(git(['show','HEAD:package.json'],{cwd}));
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version??''))throw new Error('package.json has no usable version');
  const base=`datapass-runtime-companion-${pkg.version}`;
  const tar=git(['-c','core.autocrlf=false','archive','--format=tar','--prefix='+base+'/','HEAD','--',...RUNTIME_SURFACE,...RUNTIME_EXCLUDE],{cwd,buffer:true});
  const gz=gzipSync(tar,{level:9}); // zero mtime from Node: the same commit gives the same bytes on this Node/zlib.
  const {root,files}=archiveFiles(gz);
  if(root!==base)throw new Error('Unexpected archive root '+root);
  const problems=companionPathProblems(files.map(f=>f.path));
  if(problems.length)throw new Error('Companion archive refused: '+problems.slice(0,10).join('; '));
  const data=new Map(readTarGz(gz).filter(e=>e.type==='file').map(e=>[e.path.slice(base.length+1),e.data]));
  const requirements=files.filter(f=>/requirements(-[a-z]+)?\.txt$/.test(f.path)).map(f=>({path:f.path,sha256:f.sha256,pins:pinnedRequirements(data.get(f.path).toString('utf8'),f.path)}));
  const app=data.get(RUNTIME_ENTRY).toString('utf8');
  const service={entry:RUNTIME_ENTRY,name:pyConstant(app,'SERVICE_NAME'),version:pyConstant(app,'SERVICE_VERSION'),modelVersion:pyConstant(app,'MODEL_VERSION'),health:RUNTIME_HEALTH,ready:RUNTIME_READY,host:'127.0.0.1',profile:RUNTIME_PROFILE,start:[...RUNTIME_START]};
  if(!service.name||!service.version||!service.modelVersion)throw new Error(RUNTIME_ENTRY+': SERVICE_NAME, SERVICE_VERSION or MODEL_VERSION not found');
  await mkdir(out,{recursive:true});
  for(const name of await readdir(out))if(/^datapass-runtime-companion-.*\.tar\.gz$/.test(name)||name===RUNTIME_MANIFEST)await rm(path.join(out,name),{force:true});
  const archiveName=base+'.tar.gz';
  await writeFile(path.join(out,archiveName),gz);
  const manifest={format:RUNTIME_COMPANION_FORMAT,version:1,sdkVersion:pkg.version,sourceCommit,sourceTreeClean:!dirty,commitDate,
    service,license:SDK_LICENSE,publication:RUNTIME_PUBLICATION,archive:{name:archiveName,root:base,bytes:gz.length,sha256:sha256(gz)},
    files,requirements,env:RUNTIME_ENV,guide:'docs/RUNTIME_COMPANION.md'};
  await writeFile(path.join(out,RUNTIME_MANIFEST),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let out=path.join(repo,'dist-runtime'),allowDirty=false;
  for(let i=0;i<args.length;i++){if(args[i]==='--allow-dirty')allowDirty=true;else if(args[i]==='--out'&&args[i+1])out=path.resolve(args[++i]);else{console.error('Usage: node scripts/runtime-pack.mjs [--out <dir>] [--allow-dirty]');process.exit(2);}}
  try{
    const m=await packRuntime({out,allowDirty});
    console.log(`Runtime companion ${m.sdkVersion} (service ${m.service.version}) packed: ${path.relative(process.cwd(),path.join(out,m.archive.name))} · ${m.files.length} files · ${(m.archive.bytes/1024).toFixed(0)} KB · sha256 ${m.archive.sha256.slice(0,16)}… · commit ${m.sourceCommit.slice(0,12)}${m.sourceTreeClean?'':' (dirty tree: archive holds HEAD only)'}. Nothing was published.`);
  }catch(e){console.error(e.message);process.exit(1);}
}

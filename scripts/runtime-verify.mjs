#!/usr/bin/env node
/**
 * Verify a Python runtime companion folder written by scripts/runtime-pack.mjs, then start it outside the checkout.
 *
 *   node scripts/runtime-verify.mjs <dir> [--no-start] [--python <exe>] [--port <n>]
 *
 * 1. Static: re-hashes the archive and every file in it against runtime-companion.json, applies the companion
 *    allowlist/denylist, and checks that the recorded pins are exactly the archived requirement files.
 * 2. Live (default): extracts the archive to a new OS temp folder, starts `python py/service/app.py` there on
 *    127.0.0.1:<port> (default 24360, must be above 20000) with a random DATAPASS_RUNTIME_TOKEN and an absent
 *    DATAPASS_ARTIFACT_DIR, then checks the runtime health, the token guard, the 404 for a missing artifact folder
 *    and one allowlisted ILLUSTRATIVE run. The process is stopped and the temp folder removed afterwards.
 *    Needs a Python with py/service/requirements.txt installed. Exit 1 = verification failed, 2 = bad usage.
 */
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveFiles,readTarGz,safeRelativePath,sha256} from './sdk-verify.mjs';
import {RUNTIME_COMPANION_FORMAT,RUNTIME_MANIFEST,RUNTIME_HEALTH,companionPathProblems,pinnedRequirements} from './runtime-pack.mjs';

const HEX=/^[0-9a-f]{64}$/;
export const DEFAULT_VERIFY_PORT=24360;

/** Static verification; returns {ok, problems[], manifest, gz}. Never throws for content problems. */
export async function verifyRuntimeCompanion(dir){
  const problems=[];let m;
  try{m=JSON.parse(await readFile(path.join(dir,RUNTIME_MANIFEST),'utf8'));}catch(e){return {ok:false,problems:[RUNTIME_MANIFEST+': '+e.message]};}
  if(m?.format!==RUNTIME_COMPANION_FORMAT||m.version!==1)problems.push(RUNTIME_MANIFEST+': unsupported format/version');
  if(typeof m?.sdkVersion!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(m.sdkVersion))problems.push('sdkVersion: invalid');
  if(typeof m?.sourceCommit!=='string'||!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(m.sourceCommit))problems.push('sourceCommit: invalid');
  if(typeof m?.sourceTreeClean!=='boolean')problems.push('sourceTreeClean: expected a boolean');
  if(m?.publication?.public!==false)problems.push('publication: the companion must be marked public:false');
  if(typeof m?.service?.entry!=='string'||typeof m?.service?.version!=='string')problems.push('service: invalid entry');
  for(const key of ['files','requirements'])if(!Array.isArray(m?.[key]))problems.push(key+': expected an array');
  if(problems.length)return {ok:false,problems,manifest:m};
  const a=m.archive;
  if(!a||typeof a.name!=='string'||!safeRelativePath(a.name)||a.name.includes('/')||!HEX.test(a.sha256??''))return {ok:false,problems:['archive: invalid entry'],manifest:m};
  let gz;try{gz=await readFile(path.join(dir,a.name));}catch(e){return {ok:false,problems:['archive: '+e.message],manifest:m};}
  if(gz.length!==a.bytes)problems.push(`archive: ${gz.length} bytes, manifest says ${a.bytes}`);
  if(sha256(gz)!==a.sha256)problems.push('archive: sha256 mismatch');
  let actual=[],root=null,data=new Map();
  try{({root,files:actual}=archiveFiles(gz));data=new Map(readTarGz(gz).filter(e=>e.type==='file').map(e=>[e.path.slice(root.length+1),e.data]));}
  catch(e){problems.push('archive: '+e.message);}
  if(root&&a.root!==root)problems.push(`archive: root folder ${root}, manifest says ${a.root}`);
  const declared=new Map();
  for(const f of m.files){if(!safeRelativePath(f?.path)||!HEX.test(f?.sha256??'')||!Number.isSafeInteger(f?.bytes)){problems.push('files: invalid entry '+JSON.stringify(f).slice(0,120));continue;}if(declared.has(f.path))problems.push('files: duplicate '+f.path);declared.set(f.path,f);}
  const seen=new Set();
  for(const f of actual){seen.add(f.path);const d=declared.get(f.path);
    if(!d)problems.push('extra file in archive: '+f.path);
    else if(d.bytes!==f.bytes||d.sha256!==f.sha256)problems.push('changed file: '+f.path);}
  if(actual.length){
    for(const p of declared.keys())if(!seen.has(p))problems.push('missing file in archive: '+p);
    problems.push(...companionPathProblems(actual.map(f=>f.path)));
    if(!seen.has(m.service.entry))problems.push('service entry not in archive: '+m.service.entry);
    const reqFiles=actual.filter(f=>/requirements(-[a-z]+)?\.txt$/.test(f.path)).map(f=>f.path).sort();
    const listed=m.requirements.map(r=>r?.path).sort();
    if(JSON.stringify(reqFiles)!==JSON.stringify(listed))problems.push('requirements: manifest lists '+listed.join(', ')+', archive holds '+reqFiles.join(', '));
    for(const r of m.requirements){
      const bytes=data.get(r?.path);if(!bytes)continue;
      if(r.sha256!==sha256(bytes))problems.push('requirements hash mismatch: '+r.path);
      let pins=[];try{pins=pinnedRequirements(bytes.toString('utf8'),r.path);}catch(e){problems.push(e.message);continue;}
      if(JSON.stringify(pins)!==JSON.stringify(r.pins))problems.push('requirements pins differ from the archived file: '+r.path);
    }
  }
  return {ok:problems.length===0,problems,manifest:m,gz};
}

/** Extract a verified archive into `target` (files only; paths were checked by archiveFiles). Returns the companion root. */
export async function extractCompanion(gz,target){
  const {root}=archiveFiles(gz);
  for(const e of readTarGz(gz)){
    if(e.type!=='file')continue;
    const rel=e.path.slice(root.length+1),file=path.join(target,root,...rel.split('/'));
    await mkdir(path.dirname(file),{recursive:true});await writeFile(file,e.data);
  }
  return path.join(target,root);
}

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,{token,method='GET',body}={}){
  const headers={};if(token)headers['X-Datapass-Token']=token;if(body)headers['Content-Type']='application/json';
  const res=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  let json=null;try{json=await res.json();}catch{}
  return {status:res.status,json};
}

/** Live check of a statically verified companion. Returns {ok, problems[], checks[]}; always stops what it started. */
export async function startCompanion({manifest,gz,python='python',port=DEFAULT_VERIFY_PORT,repoRoot=path.resolve(import.meta.dirname,'..'),timeoutMs=45000}){
  if(!Number.isInteger(port)||port<=20000||port>65535)return {ok:false,problems:['port must be an integer above 20000'],checks:[]};
  const problems=[],checks=[],work=await mkdtemp(path.join(tmpdir(),'datapass-runtime-'));
  let child=null,stderr='';
  try{
    const root=await extractCompanion(gz,work);
    const rel=path.relative(repoRoot,root);
    if(!rel.startsWith('..')&&!path.isAbsolute(rel))problems.push('extraction folder is inside the checkout: '+root);
    let insideGit=false;try{execFileSync('git',['rev-parse','--is-inside-work-tree'],{cwd:root,stdio:'pipe'});insideGit=true;}catch{}
    if(insideGit)problems.push('extraction folder is inside a git work tree: '+root);
    else checks.push('extracted outside any checkout');
    const token=randomBytes(24).toString('base64url'),origin=`http://127.0.0.1:${port}`;
    const env={...process.env,DATAPASS_RUNTIME_TOKEN:token,DATAPASS_ARTIFACT_DIR:path.join(root,'artifacts-not-installed'),DATAPASS_SERVICE_ORIGINS:origin,PYTHONDONTWRITEBYTECODE:'1'};
    delete env.PYTHONPATH;delete env.DATAPASS_SERVICE_PORT;
    child=spawn(python,[path.join(root,...manifest.service.entry.split('/')),'--port',String(port)],{cwd:root,env,stdio:['ignore','ignore','pipe'],windowsHide:true});
    child.stderr.on('data',d=>{stderr=(stderr+d).slice(-4000);});
    let exited=null;child.on('exit',code=>{exited=code??-1;});child.on('error',e=>{exited=-1;stderr+=String(e.message);});
    const base=`http://127.0.0.1:${port}`,deadline=Date.now()+timeoutMs;let health=null;
    while(Date.now()<deadline&&exited===null){
      try{health=await request(base+RUNTIME_HEALTH,{token});if(health.status===200)break;}catch{}
      await wait(250);
    }
    if(health?.status!==200){problems.push(`service did not answer ${RUNTIME_HEALTH} within ${timeoutMs} ms`+(exited!==null?` (exited ${exited})`:'')+(stderr?': '+stderr.trim().split('\n').slice(-3).join(' | '):''));return {ok:false,problems,checks};}
    if(health.json?.runtime!=='datapass.runtime/1'||health.json?.service!==manifest.service.name||health.json?.version!==manifest.service.version)
      problems.push('health does not match the manifest service: '+JSON.stringify(health.json).slice(0,200));
    else checks.push(`health ${health.json.service} ${health.json.version} (${RUNTIME_HEALTH})`);
    const anonymous=await request(base+RUNTIME_HEALTH);
    if(anonymous.status!==401)problems.push('runtime API answered '+anonymous.status+' without a token (expected 401)');else checks.push('token required (401 without X-Datapass-Token)');
    const missing=await request(base+'/artifacts/wind-aep-weibull');
    if(missing.status!==404)problems.push('GET /artifacts with an absent DATAPASS_ARTIFACT_DIR answered '+missing.status+' (expected 404)');else checks.push('absent DATAPASS_ARTIFACT_DIR answers 404');
    const model=health.json.models?.[0];
    if(model!=='wind-reference')problems.push('expected the allowlisted model wind-reference, got '+JSON.stringify(health.json.models));
    else{
      const submitted=await request(base+'/api/runtime/v1/runs',{token,method:'POST',body:{model,inputs:{k:2,c:8,hubHeight:120}}});
      const runId=submitted.json?.runId;let record=submitted.json;
      if(submitted.status!==202||!runId)problems.push('run submission answered '+submitted.status);
      else{
        while(Date.now()<deadline&&!['succeeded','failed','cancelled'].includes(record?.status)){await wait(100);record=(await request(base+'/api/runtime/v1/runs/'+runId,{token})).json;}
        const artifact=record?.status==='succeeded'?await request(base+`/api/runtime/v1/runs/${runId}/artifact`,{token}):null;
        if(artifact?.status!==200||artifact.json?.format!=='datapass.artifact'||artifact.json?.version!==1||!Array.isArray(artifact.json?.payload?.rows)||!artifact.json.payload.rows.length)
          problems.push('ILLUSTRATIVE run did not produce a datapass.artifact v1 (status '+record?.status+')');
        else checks.push(`ILLUSTRATIVE run ${runId} succeeded: ${artifact.json.payload.rows.length} rows, datapass.artifact v1`);
      }
    }
    return {ok:problems.length===0,problems,checks};
  }finally{
    if(child&&child.exitCode===null){
      const gone=new Promise(r=>child.once('exit',r));
      if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{child.kill();}}else child.kill('SIGTERM');
      await Promise.race([gone,wait(5000)]);
    }
    await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let dir=null,start=true,python=process.env.PYTHON||'python',port=DEFAULT_VERIFY_PORT;
  const usage=()=>{console.error('Usage: node scripts/runtime-verify.mjs <dist-runtime directory> [--no-start] [--python <exe>] [--port <n above 20000>]');process.exit(2);};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--no-start')start=false;else if(args[i]==='--python'&&args[i+1])python=args[++i];
    else if(args[i]==='--port'&&args[i+1]){port=Number(args[++i]);if(!Number.isInteger(port)||port<=20000||port>65535)usage();}
    else if(!args[i].startsWith('--')&&dir===null)dir=args[i];else usage();
  }
  if(!dir)usage();
  const r=await verifyRuntimeCompanion(path.resolve(dir));
  if(!r.ok){for(const p of r.problems.slice(0,50))console.error('FAIL '+p);process.exit(1);}
  const m=r.manifest;
  console.log(`Runtime companion ${m.sdkVersion} verified: ${m.archive.name} (${m.files.length} files, ${m.requirements.reduce((n,x)=>n+x.pins.length,0)} pinned requirements); service ${m.service.name} ${m.service.version}; commit ${m.sourceCommit.slice(0,12)}${m.sourceTreeClean?'':' (packed from a dirty tree)'}.`);
  if(start){
    const live=await startCompanion({manifest:m,gz:r.gz,python,port});
    for(const c of live.checks)console.log('ok   '+c);
    if(!live.ok){for(const p of live.problems)console.error('FAIL '+p);process.exit(1);}
    console.log(`Runtime companion started outside the checkout on 127.0.0.1:${port} and stopped. Nothing was published.`);
  }
}

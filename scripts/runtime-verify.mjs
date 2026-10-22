#!/usr/bin/env node
/**
 * Verify a Python runtime companion folder written by scripts/runtime-pack.mjs, then start it outside the checkout.
 *
 *   node scripts/runtime-verify.mjs <dir> [--no-start] [--python <exe>] [--port <n>]
 *
 * 1. Static: re-hashes the archive and every file in it against runtime-companion.json, applies the companion
 *    allowlist/denylist, checks that the recorded pins are exactly the archived requirement files and that the
 *    packaged start command uses the safe profile.
 * 2. Live (default): extracts the archive to a new OS temp folder and starts the manifest's start command
 *    (`py/service/app.py --profile safe`) there on 127.0.0.1:<port> (default 24360, must be above 20000) with a random
 *    DATAPASS_RUNTIME_TOKEN and an absent DATAPASS_ARTIFACT_DIR. It then probes the ACTUAL endpoints over HTTP (raw
 *    requests, no helper short-cuts): token guard (none, wrong, in the query string), foreign Origin, wrong Host,
 *    missing/oversized Content-Length, traversal run ids, unknown model, every legacy route and the OpenAPI pages (404
 *    in safe), /ready shape without secrets, Idempotency-Key replay and 409, cancelRequested on a slow run, markup
 *    echoed JSON-escaped, and one ILLUSTRATIVE run. A second start with `--profile demo` (port + 1) checks that the
 *    legacy demo routes still answer behind the loopback Host and Origin guards. Every probe prints PASS or FAIL.
 *    Processes are stopped and the temp folder removed afterwards. The token is never printed.
 *    Needs a Python with py/service/requirements.txt installed. Exit 1 = verification failed, 2 = bad usage.
 */
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import http from 'node:http';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveFiles,readTarGz,safeRelativePath,sha256} from './sdk-verify.mjs';
import {RUNTIME_COMPANION_FORMAT,RUNTIME_MANIFEST,RUNTIME_HEALTH,RUNTIME_PROFILE,RUNTIME_READY,companionPathProblems,pinnedRequirements} from './runtime-pack.mjs';

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
  else if(m.service.profile!==RUNTIME_PROFILE||!Array.isArray(m.service.start)||m.service.start[0]!==m.service.entry
    ||m.service.start.join(' ')!==[m.service.entry,'--profile',RUNTIME_PROFILE].join(' '))
    problems.push(`service: the start command must be "${m.service.entry} --profile ${RUNTIME_PROFILE}"`);
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
  const destination=path.resolve(target);
  // Preflight every destination before the first write, even if a future parser changes path handling.
  const files=readTarGz(gz).filter(e=>e.type==='file').map(e=>{
    const file=path.resolve(destination,...e.path.split('/')),rel=path.relative(destination,file);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Unsafe archive path: '+e.path);
    return {file,data:e.data};
  });
  for(const {file,data} of files){
    await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);
  }
  return path.join(destination,root);
}

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const TERMINAL=['succeeded','failed','cancelled'];
export const MARKUP='<img src=x onerror=alert(1)>';

/**
 * One raw HTTP/1.1 request to 127.0.0.1:<port>. The path is sent byte for byte (no URL normalisation, so `../` and
 * `%2e%2e%2f` reach the server as written). `chunked` sends the body without Content-Length.
 */
export function rawRequest(port,{method='GET',path:target='/',headers={},body,chunked=false,timeoutMs=8000}={}){
  return new Promise((resolve,reject)=>{
    const data=body===undefined?undefined:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
    const h={...headers};
    if(data&&!h['Content-Type'])h['Content-Type']='application/json';
    if(data&&!chunked&&h['Content-Length']===undefined)h['Content-Length']=String(data.length);
    if(!data&&method==='POST'&&!chunked&&h['Content-Length']===undefined)h['Content-Length']='0';
    const req=http.request({host:'127.0.0.1',port,method,path:target,headers:h,agent:false},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));
      res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,text,json});});
    });
    req.setTimeout(timeoutMs,()=>req.destroy(new Error('timeout after '+timeoutMs+' ms')));
    req.on('error',reject);
    if(data)req.write(data);
    req.end();
  });
}

async function startProcess({python,root,argv,port,env,timeoutMs}){
  const child=spawn(python,[...argv.map((a,i)=>i===0?path.join(root,...a.split('/')):a),'--port',String(port)],{cwd:root,env,stdio:['ignore','ignore','pipe'],windowsHide:true});
  let stderr='',exited=null;
  child.stderr.on('data',d=>{stderr=(stderr+d).slice(-4000);});
  child.on('exit',code=>{exited=code??-1;});child.on('error',e=>{exited=-1;stderr+=String(e.message);});
  const deadline=Date.now()+timeoutMs;let health=null;
  while(Date.now()<deadline&&exited===null){
    try{health=await rawRequest(port,{path:'/health',timeoutMs:2000});if(health.status===200)break;}catch{}
    await wait(250);
  }
  return {child,health,stderr:()=>stderr,exited:()=>exited};
}

async function stopProcess(child){
  if(!child||child.exitCode!==null)return;
  const gone=new Promise(r=>child.once('exit',r));
  if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}catch{child.kill();}}else child.kill('SIGTERM');
  await Promise.race([gone,wait(5000)]);
}

/**
 * Live check of a statically verified companion. Returns {ok, problems[], checks[], probes[{name, ok, detail}]};
 * always stops what it started. `checks` / `problems` are the PASS / FAIL lines.
 */
export async function startCompanion({manifest,gz,python='python',port=DEFAULT_VERIFY_PORT,repoRoot=path.resolve(import.meta.dirname,'..'),timeoutMs=45000,demo=true}){
  if(!Number.isInteger(port)||port<=20000||port>=65535)return {ok:false,problems:['port must be an integer above 20000 (and below 65535: port + 1 runs the demo profile)'],checks:[],probes:[]};
  const probes=[],work=await mkdtemp(path.join(tmpdir(),'datapass-runtime-'));
  const token=randomBytes(24).toString('base64url');
  const scrub=s=>String(s).split(token).join('<token>');
  const probe=(name,ok,detail='')=>{probes.push({name,ok:!!ok,detail:scrub(detail)});return !!ok;};
  const result=()=>({ok:probes.every(p=>p.ok),probes,checks:probes.filter(p=>p.ok).map(p=>p.name+(p.detail?': '+p.detail:'')),problems:probes.filter(p=>!p.ok).map(p=>p.name+(p.detail?': '+p.detail:''))});
  const started=[];
  try{
    const root=await extractCompanion(gz,work);
    const rel=path.relative(repoRoot,root);
    let insideGit=false;try{execFileSync('git',['rev-parse','--is-inside-work-tree'],{cwd:root,stdio:'pipe'});insideGit=true;}catch{}
    probe('extracted outside any checkout',(rel.startsWith('..')||path.isAbsolute(rel))&&!insideGit,insideGit?'inside a git work tree':'');
    const origin=`http://127.0.0.1:${port}`;
    const env={...process.env,DATAPASS_RUNTIME_TOKEN:token,DATAPASS_ARTIFACT_DIR:path.join(root,'artifacts-not-installed'),DATAPASS_SERVICE_ORIGINS:origin,PYTHONDONTWRITEBYTECODE:'1'};
    for(const k of ['PYTHONPATH','DATAPASS_SERVICE_PORT','DATAPASS_SERVICE_PROFILE'])delete env[k];
    const argv=Array.isArray(manifest.service.start)?manifest.service.start:[manifest.service.entry];
    const safe=await startProcess({python,root,argv,port,env,timeoutMs});started.push(safe.child);
    if(safe.health?.status!==200){
      probe('safe profile starts',false,`no answer on /health within ${timeoutMs} ms`+(safe.exited()!==null?` (exited ${safe.exited()})`:'')+(safe.stderr()?': '+safe.stderr().trim().split('\n').slice(-3).join(' | '):''));
      return result();
    }
    const req=(o)=>rawRequest(port,o);
    const auth={'X-Datapass-Token':token};
    const isJson=r=>String(r.headers['content-type']||'').startsWith('application/json')&&r.headers['x-content-type-options']==='nosniff';
    const API='/api/runtime/v1';

    // -- liveness and identity -------------------------------------------------------------------------------
    const live=safe.health;
    probe('GET /health is minimal liveness {status, service, version, profile=safe}',
      JSON.stringify(Object.keys(live.json||{}).sort())===JSON.stringify(['profile','service','status','version'])&&live.json.profile==='safe'
      &&live.json.status==='ok'&&live.json.service===manifest.service.name&&live.json.version===manifest.service.version&&!live.text.includes(token),
      JSON.stringify(live.json).slice(0,160));
    const health=await req({path:RUNTIME_HEALTH,headers:auth});
    probe(`GET ${RUNTIME_HEALTH} with the token matches the manifest`,health.status===200&&health.json?.runtime==='datapass.runtime/1'
      &&health.json?.service===manifest.service.name&&health.json?.version===manifest.service.version,`${health.status} ${health.json?.service} ${health.json?.version}`);

    // -- token, origin, host, body guards ----------------------------------------------------------------------
    let r=await req({path:RUNTIME_HEALTH});probe('401 without a token',r.status===401&&isJson(r),String(r.status));
    r=await req({path:RUNTIME_HEALTH,headers:{'X-Datapass-Token':token+'x'}});probe('401 with a wrong token',r.status===401,String(r.status));
    r=await req({path:`${RUNTIME_HEALTH}?token=${encodeURIComponent(token)}&X-Datapass-Token=${encodeURIComponent(token)}`});
    probe('401 with the token in the query string',r.status===401,String(r.status));
    r=await req({method:'POST',path:API+'/runs',headers:{...auth,Origin:'http://evil.example'},body:{model:'wind-reference',inputs:{}}});
    probe('403 for a foreign Origin on POST /runs',r.status===403,String(r.status));
    r=await req({path:RUNTIME_HEALTH,headers:{...auth,Host:'evil.example'}});
    const r2=await req({path:'/health',headers:{Host:'evil.example:80'}});
    probe('400 for a wrong Host (DNS-rebinding guard)',r.status===400&&r2.status===400,`${r.status}, /health ${r2.status}`);
    r=await req({method:'POST',path:API+'/runs',headers:auth,body:{model:'wind-reference',inputs:{}},chunked:true});
    probe('411 without Content-Length (chunked body)',r.status===411,String(r.status));
    r=await req({method:'POST',path:API+'/runs',headers:auth,body:{model:'wind-reference',inputs:{pad:'x'.repeat(4096)}}});
    probe('413 for a body above 2 KB',r.status===413,String(r.status));

    // -- traversal and unknown ids ---------------------------------------------------------------------------
    for(const p of [`${API}/runs/../../health`,`${API}/runs/..`,`${API}/runs/%2e%2e%2f%2e%2e%2fhealth`,`${API}/runs/%2E%2E`,`${API}/runs/..%5c..%5chealth/artifact`]){
      r=await req({path:p,headers:auth});probe(`422 traversal run id ${p.slice(API.length)}`,r.status===422&&r.json?.code==='DP-RT-PATH',`${r.status} ${r.text.slice(0,80)}`);
    }
    r=await req({path:`${API}/runs/run-0123456789abcdef`,headers:auth});probe('404 for an unknown run id',r.status===404,String(r.status));
    r=await req({method:'POST',path:API+'/runs',headers:auth,body:{model:'os.system',inputs:{cmd:'calc'}}});
    probe('404 for an unknown model',r.status===404,String(r.status));

    // -- safe profile: no legacy route, no OpenAPI page --------------------------------------------------------
    for(const [method,p,body] of [['GET','/artifacts/wind-aep-weibull'],['POST','/compute/wind-reference',{k:2,c:8,hubHeight:120}],['GET','/docs'],['GET','/docs/oauth2-redirect'],['GET','/redoc'],['GET','/openapi.json']]){
      const anonymous=await req({method,path:p,body});const withToken=await req({method,path:p,body,headers:auth});
      probe(`404 in safe: ${method} ${p}`,anonymous.status===404&&withToken.status===404,`${anonymous.status}/${withToken.status}`);
    }

    // -- readiness -------------------------------------------------------------------------------------------
    r=await req({path:RUNTIME_READY});probe(`401 on ${RUNTIME_READY} without a token`,r.status===401,String(r.status));
    r=await req({path:RUNTIME_READY,headers:auth});
    const ready=r.json,checks=Array.isArray(ready?.checks)?ready.checks:[];
    const leaks=[token,root,root.replaceAll('\\','\\\\'),root.replaceAll('\\','/'),work].filter(s=>r.text.includes(s));
    probe(`GET ${RUNTIME_READY} shape {live, ready, checks[{id, ok, detail}]}`,r.status===200&&JSON.stringify(Object.keys(ready||{}).sort())==='["checks","live","ready"]'
      &&ready.live===true&&ready.ready===true&&checks.length>=4&&checks.every(c=>JSON.stringify(Object.keys(c).sort())==='["detail","id","ok"]'&&typeof c.ok==='boolean'&&typeof c.detail==='string')
      &&['workers','run-capacity','result-store','notebook-routes'].every(id=>checks.some(c=>c.id===id)),checks.map(c=>`${c.id}=${c.ok}`).join(' '));
    probe(`${RUNTIME_READY} carries no token or path`,leaks.length===0,leaks.length?'leaks '+leaks.length+' secret/path value(s)':'');

    // -- a run, idempotent replay, 409 -----------------------------------------------------------------------
    const key='verify-'+randomBytes(8).toString('hex'),body={model:'wind-reference',inputs:{k:2,c:8,hubHeight:120}};
    const first=await req({method:'POST',path:API+'/runs',headers:{...auth,'Idempotency-Key':key},body});
    const runId=first.json?.runId;
    probe('POST /runs with an Idempotency-Key answers 202 with cancelRequested:false',first.status===202&&/^run-[0-9a-f]{16}$/.test(runId??'')&&first.json?.cancelRequested===false,`${first.status} ${runId}`);
    const replay=await req({method:'POST',path:API+'/runs',headers:{...auth,'Idempotency-Key':key},body:{inputs:{hubHeight:120,c:8,k:2},model:'wind-reference'}});
    probe('same Idempotency-Key + same payload replays the first record (200, same runId)',replay.status===200&&replay.json?.runId===runId,`${replay.status} ${replay.json?.runId}`);
    const conflict=await req({method:'POST',path:API+'/runs',headers:{...auth,'Idempotency-Key':key},body:{model:'wind-reference',inputs:{k:3,c:8,hubHeight:120}}});
    probe('same Idempotency-Key + changed payload answers 409 DP-RT-IDEMPOTENCY-CONFLICT',conflict.status===409&&conflict.json?.code==='DP-RT-IDEMPOTENCY-CONFLICT',`${conflict.status} ${conflict.json?.code}`);
    const badKey=await req({method:'POST',path:API+'/runs',headers:{...auth,'Idempotency-Key':'bad key'},body});
    probe('a malformed Idempotency-Key answers 422',badKey.status===422&&badKey.json?.code==='DP-RT-IDEMPOTENCY-KEY',String(badKey.status));
    const deadline=Date.now()+timeoutMs;let record=first.json;
    while(runId&&Date.now()<deadline&&!TERMINAL.includes(record?.status)){await wait(100);record=(await req({path:`${API}/runs/${runId}`,headers:auth})).json;}
    const artifact=record?.status==='succeeded'?await req({path:`${API}/runs/${runId}/artifact`,headers:auth}):null;
    probe('ILLUSTRATIVE run succeeds with a datapass.artifact v1',artifact?.status===200&&artifact.json?.format==='datapass.artifact'&&artifact.json?.version===1
      &&Array.isArray(artifact.json?.payload?.rows)&&artifact.json.payload.rows.length>0&&isJson(artifact),`run ${runId} ${record?.status}${artifact?.json?.payload?`, ${artifact.json.payload.rows.length} rows`:''}`);

    // -- cancelRequested on a slow run (grid resolution 80, about 2 s of real work) ----------------------------
    const slow=await req({method:'POST',path:API+'/runs',headers:auth,body:{model:'wind-weibull-grid',inputs:{kMin:1.5,kMax:3,cMin:5,cMax:11,resolution:80}}});
    let slowRecord=slow.json;const slowId=slowRecord?.runId;
    while(slowId&&Date.now()<deadline&&slowRecord?.status==='queued'){await wait(20);slowRecord=(await req({path:`${API}/runs/${slowId}`,headers:auth})).json;}
    const cancel=slowId?await req({method:'POST',path:`${API}/runs/${slowId}/cancel`,headers:auth}):null;
    probe('cancel of a running run reports running + cancelRequested:true (not cancelled yet)',cancel?.status===200&&cancel.json?.status==='running'&&cancel.json?.cancelRequested===true,
      `${cancel?.status} ${cancel?.json?.status} cancelRequested=${cancel?.json?.cancelRequested}`);
    let after=cancel?.json;
    while(slowId&&Date.now()<deadline&&!TERMINAL.includes(after?.status)){await wait(50);after=(await req({path:`${API}/runs/${slowId}`,headers:auth})).json;}
    probe('the worker confirms: cancelled with cancelRequested:true and a finishedAt',after?.status==='cancelled'&&after?.cancelRequested===true&&!!after?.finishedAt,`${after?.status}`);

    // -- markup is echoed JSON-escaped -----------------------------------------------------------------------
    for(const [label,payload] of [['model id',{model:MARKUP,inputs:{}}],['input label',{model:'wind-reference',inputs:{[MARKUP]:1}}]]){
      r=await req({method:'POST',path:API+'/runs',headers:auth,body:payload});
      probe(`markup in the ${label} is returned JSON-escaped (application/json, nosniff)`,[404,422].includes(r.status)&&isJson(r)&&!r.text.includes('<img')
        &&r.text.includes('\\u003cimg')&&JSON.stringify(r.json).includes(MARKUP),`${r.status} ${r.headers['content-type']}`);
    }
    probe('runtime responses are no-store + nosniff',r.headers['cache-control']==='no-store'&&r.headers['x-content-type-options']==='nosniff');
    await stopProcess(safe.child);

    // -- demo profile: legacy routes still work behind the loopback/origin guards ----------------------------
    if(demo){
      const dport=port+1,dreq=o=>rawRequest(dport,o);
      const d=await startProcess({python,root,argv:[manifest.service.entry,'--profile','demo'],port:dport,env,timeoutMs});started.push(d.child);
      if(d.health?.status!==200)probe('demo profile starts',false,'no answer on /health'+(d.stderr()?': '+d.stderr().trim().split('\n').slice(-3).join(' | '):''));
      else{
        probe('demo: GET /health reports profile=demo',d.health.json?.profile==='demo',JSON.stringify(d.health.json).slice(0,120));
        const inputs={k:2,c:8,hubHeight:120};
        r=await dreq({method:'POST',path:'/compute/wind-reference',body:inputs});
        probe('demo: POST /compute/wind-reference answers an artifact',r.status===200&&r.json?.format==='datapass.artifact'&&r.json?.id==='wind-aep-live',String(r.status));
        r=await dreq({method:'POST',path:'/compute/wind-reference',body:inputs,headers:{Origin:origin}});
        probe('demo: an allowed Origin is accepted',r.status===200&&r.headers['access-control-allow-origin']===origin,String(r.status));
        r=await dreq({method:'POST',path:'/compute/wind-reference',body:inputs,headers:{Origin:'http://evil.example'}});
        probe('demo: 403 for a foreign Origin on a legacy route',r.status===403,String(r.status));
        r=await dreq({method:'POST',path:'/compute/wind-reference',body:inputs,headers:{Host:'evil.example'}});
        probe('demo: 400 for a wrong Host on a legacy route',r.status===400,String(r.status));
        r=await dreq({path:'/artifacts/wind-aep-weibull'});
        probe('demo: absent DATAPASS_ARTIFACT_DIR answers 404',r.status===404,String(r.status));
        r=await dreq({path:'/openapi.json'});probe('demo: /openapi.json is served',r.status===200,String(r.status));
        r=await dreq({path:RUNTIME_HEALTH});probe('demo: the runtime API still needs the token (401)',r.status===401,String(r.status));
      }
    }
    return result();
  }catch(e){
    probe('live verification',false,e?.message??String(e));
    return result();
  }finally{
    for(const child of started)await stopProcess(child);
    await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let dir=null,start=true,python=process.env.PYTHON||'python',port=DEFAULT_VERIFY_PORT;
  const usage=()=>{console.error('Usage: node scripts/runtime-verify.mjs <dist-runtime directory> [--no-start] [--python <exe>] [--port <n above 20000>]');process.exit(2);};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--no-start')start=false;else if(args[i]==='--python'&&args[i+1])python=args[++i];
    else if(args[i]==='--port'&&args[i+1]){port=Number(args[++i]);if(!Number.isInteger(port)||port<=20000||port>=65535)usage();}
    else if(!args[i].startsWith('--')&&dir===null)dir=args[i];else usage();
  }
  if(!dir)usage();
  const r=await verifyRuntimeCompanion(path.resolve(dir));
  if(!r.ok){for(const p of r.problems.slice(0,50))console.error('FAIL '+p);process.exit(1);}
  const m=r.manifest;
  console.log(`Runtime companion ${m.sdkVersion} verified: ${m.archive.name} (${m.files.length} files, ${m.requirements.reduce((n,x)=>n+x.pins.length,0)} pinned requirements); service ${m.service.name} ${m.service.version}; start ${m.service.start.join(' ')}; commit ${m.sourceCommit.slice(0,12)}${m.sourceTreeClean?'':' (packed from a dirty tree)'}.`);
  if(start){
    const live=await startCompanion({manifest:m,gz:r.gz,python,port});
    for(const p of live.probes)(p.ok?console.log:console.error)(`${p.ok?'PASS':'FAIL'} ${p.name}${p.detail?' ('+p.detail+')':''}`);
    const failed=live.probes.filter(p=>!p.ok).length;
    console.log(`${live.probes.length-failed} PASS, ${failed} FAIL.`);
    if(!live.ok)process.exit(1);
    console.log(`Runtime companion started outside the checkout on 127.0.0.1:${port} (safe) and ${port+1} (demo) and stopped. Nothing was published.`);
  }
}

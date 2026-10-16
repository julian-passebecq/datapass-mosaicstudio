#!/usr/bin/env node
/**
 * Executed old -> new -> old -> new rollback check for the result store and saved notebook (M-ROLLBACK).
 * Each side is a qualified distribution: a built workbench folder (dist/) plus the py/service runtime of the same
 * release. Both workbenches are served in turn on the SAME origin by a small static server with the vite preview
 * headers, and both runtimes use the SAME user-selected store folder, so the check sees exactly what a user who
 * swaps the build behind a bookmark sees. The browser profile is a temp folder and is closed between steps.
 *
 *   node scripts/release-rollback-check.mjs --old-dist <dir> --old-service <repo dir with py/service>
 *        --new-dist <dir> --new-service <repo dir> --python <python with fastapi + nbformat>
 *        [--port 24190] [--rport 24799] [--out <evidence dir>] [--site-run 1|0]
 *
 * Steps (all data synthetic: inline SQL literals):
 *   1 old : blank workspace, two SQL cells run, results + notebook saved to the store, .ipynb exported. A pre-hash
 *           old release (0.10.0) writes no SQL hashes; an M-SQLHASH one (0.11.x) must write the authored hashes.
 *   1b new: (F206, on by default, `--site-run 0` skips it) a client-site run of an allowlisted model is saved through the
 *           results-only route POST /store/results under `site-rollback-check-run`. Every later step must keep its
 *           result file byte-identical and its manifest entry, and the newer runtime serves it back by hash at the end.
 *   2 new : upgrade; Open from store reopens both results by hash without recomputation; saving again records
 *           each SQL cell's source hash (M-SQLHASH) and leaves every result file byte-identical.
 *   3 old : rollback; the older release opens the newer manifest (the extra field is ignored), reopens the same
 *           results without recomputation, and its own save keeps every result and notebook file.
 *   4 new : recovery; reopens after the older save (no hashes = the pre-hash format), saves (hashes return).
 *           Then the manifest's SQL hash is tampered: the newer release refuses to open (nothing opened, manifest
 *           untouched); restoring the copied manifest recovers the same results.
 * Writes <out>/rollback-check.json (store file hashes after every step, observed notices) and screenshots.
 * Exit 1 on any unexpected observation. Nothing is installed, published or deleted outside its temp folders.
 */
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {copyFile,mkdir,mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {WORKBENCH_HEADERS} from './workbench-headers.mjs';

const args=process.argv.slice(2),opt={'old-dist':null,'old-service':null,'new-dist':null,'new-service':null,python:'python',port:24190,rport:24799,out:null,'site-run':'1'};
for(let i=0;i<args.length;i++){const k=args[i].replace(/^--/,'');if(!(k in opt)||args[i+1]===undefined){console.error('Usage: see the header of scripts/release-rollback-check.mjs');process.exit(2);}opt[k]=args[++i];}
for(const k of ['old-dist','old-service','new-dist','new-service'])if(!opt[k])throw new Error('--'+k+' is required');
opt.port=Number(opt.port);opt.rport=Number(opt.rport);
if(!(opt.port>20000&&opt.rport>20000))throw new Error('Use ports above 20000');
const ORIGIN=`http://127.0.0.1:${opt.port}`,RORIGIN=`http://127.0.0.1:${opt.rport}`;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.parquet':'application/octet-stream','.csv':'text/csv'};
const out=path.resolve(opt.out??path.join(os.tmpdir(),'mosaic-rollback-check'));await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const fail=m=>{throw new Error(m);};
const SQL_A="SELECT * FROM (VALUES (1, 'SYNTHETIC north', 2.5), (2, 'SYNTHETIC south', 4.0), (3, 'SYNTHETIC east', 1.25)) AS t(id, label, value)";
const SQL_B="SELECT count(*)::INTEGER AS n, round(sum(v), 2)::DOUBLE AS total FROM (VALUES (2.5), (4.0), (1.25)) AS t(v)";
const sqlHash=sql=>sha(JSON.stringify(['sql',sql]));

// --- static server for a built workbench (same headers as `vite preview`) ---------------------------------
let web=null;
async function serve(dist){
  await stopWeb();
  if(!existsSync(path.join(dist,'index.html')))fail('No built workbench in '+dist);
  const root=path.resolve(dist);
  web=http.createServer((req,res)=>{
    const url=new URL(req.url,ORIGIN);let rel=decodeURIComponent(url.pathname);if(rel.endsWith('/'))rel+='index.html';
    const file=path.resolve(root,'.'+rel);
    if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]??'application/octet-stream',...WORKBENCH_HEADERS,'Cache-Control':'no-store'});
    createReadStream(file).pipe(res);
  });
  await new Promise((ok,ko)=>{web.once('error',ko);web.listen(opt.port,'127.0.0.1',ok);});
}
async function stopWeb(){if(web){await new Promise(r=>web.close(()=>r()));web.closeAllConnections?.();web=null;}}

// --- the release's own runtime over the shared store --------------------------------------------------------
let runtime=null,token='',runtimeLog='';
async function startRuntime(serviceRepo){
  await stopRuntime();
  token='rb-'+randomBytes(12).toString('hex');runtimeLog='';
  runtime=spawn(opt.python,[path.join(serviceRepo,'py','service','app.py'),'--port',String(opt.rport),'--workbench-origin',ORIGIN,'--results-dir',store],{env:{...process.env,DATAPASS_RUNTIME_TOKEN:token,DATAPASS_SERVICE_ORIGINS:ORIGIN},stdio:['ignore','pipe','pipe']});
  runtime.stdout.on('data',d=>{runtimeLog+=d;});runtime.stderr.on('data',d=>{runtimeLog+=d;});
  for(let i=0;i<160;i++){try{if((await fetch(RORIGIN+'/health')).ok)return;}catch{/* starting */}await pause(250);}
  fail('runtime did not start: '+runtimeLog.slice(-800));
}
async function stopRuntime(){
  if(runtime&&runtime.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(runtime.pid),'/T','/F']);else runtime.kill();}
  runtime=null;
  for(let i=0;i<40;i++){try{await fetch(RORIGIN+'/health');}catch{return;}await pause(250);}
  fail('runtime still answers after stop');
}

const work=await mkdtemp(path.join(os.tmpdir(),'mosaic-rollback-'));
const store=path.join(work,'store'),profile=path.join(work,'profile');
async function storeFiles(){
  const acc={};
  async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else acc[path.relative(store,p).split(path.sep).join('/')]=sha(await readFile(p));}}
  if(existsSync(store))await walk(store);
  return Object.fromEntries(Object.entries(acc).sort(([a],[b])=>a<b?-1:1));
}
const manifest=async()=>JSON.parse(await readFile(path.join(store,'manifest.json'),'utf8'));
/** Results are immutable and kept; the notebook snapshot is the latest explicit save (the store replaces the
 *  superseded one by design), so it must exist and match the hash the manifest names. */
async function currentNotebookIntact(files){
  const nb=(await manifest()).workspace.notebookSha256,key='notebooks/'+nb+'.ipynb';
  if(files[key]!==nb)fail('the saved notebook named by the manifest is missing or corrupt');
}
/** F206: save one client-site run (allowlisted model on the newer runtime) through the results-only route, as a site does. */
const SITE={appId:'rollback-check',appVersion:'1',taskId:'run'},SITE_CELL=`site-${SITE.appId}-${SITE.taskId}`;
async function seedSiteRun(step){
  await startRuntime(opt['new-service']);
  const h={'X-Datapass-Token':token,'Content-Type':'application/json'};
  const get=async p=>{const r=await fetch(RORIGIN+p,{headers:h});if(!r.ok)fail(p+' answered '+r.status+': '+await r.text());return r;};
  const models=(await (await get('/api/runtime/v1/models')).json()).models;
  const model=models.find(m=>m.id==='wind-reference')??models[0];
  const inputs=Object.fromEntries(model.inputs.map(i=>[i.id,i.default]));
  const submitted=await fetch(RORIGIN+'/api/runtime/v1/runs',{method:'POST',headers:h,body:JSON.stringify({model:model.id,inputs})});
  if(!submitted.ok)fail('site run refused: '+await submitted.text());
  let run=await submitted.json();
  for(let i=0;i<480&&(run.status==='queued'||run.status==='running');i++){await pause(250);run=await (await get('/api/runtime/v1/runs/'+run.runId)).json();}
  if(run.status!=='succeeded')fail('site run ended '+run.status);
  const text=await (await get(`/api/runtime/v1/runs/${run.runId}/artifact`)).text();
  if(sha(text)!==run.artifactSha256)fail('site run artifact does not match its recorded hash');
  const ref={runId:run.runId,model:run.model,modelVersion:run.modelVersion,inputHash:run.inputHash,artifactSha256:run.artifactSha256};
  const sourceSha256=sha(JSON.stringify(['site',SITE.appId,SITE.appVersion,SITE.taskId,run.model,run.modelVersion,run.inputHash]));
  const result={format:'datapass.cell-result',version:1,cellId:SITE_CELL,cellKind:'python',sourceSha256,
    outputs:[{output_type:'display_data',data:{'application/vnd.datapass.artifact+json':JSON.parse(text)},metadata:{datapass:{run:ref}}}],
    table:null,executionCount:null,finishedAt:run.finishedAt,origin:'datapass.runtime/1'};
  const saved=await fetch(RORIGIN+'/api/notebook/v1/store/results',{method:'POST',headers:h,
    body:JSON.stringify({results:[{cellId:SITE_CELL,cellKind:'python',sourceSha256,result,run:{...ref,site:{...SITE,values:inputs}}}]})});
  if(!saved.ok)fail('site run save refused: '+saved.status+' '+await saved.text());
  const receipt=await saved.json(),resultSha256=receipt.results[0].resultSha256;
  await stopRuntime();
  Object.assign(step,{model:run.model,modelVersion:run.modelVersion,inputs,sourceSha256,resultSha256});
  return resultSha256;
}
async function siteRunKept(files,label){
  if(!site)return;
  if(files['results/'+site+'.json']!==site)fail(label+': the saved site run file is missing or changed');
  const entries=(await manifest()).entries.filter(e=>e.cellId===SITE_CELL&&e.resultSha256===site);
  if(entries.length!==1||entries[0].run?.site?.appId!==SITE.appId)fail(label+': the saved site run entry was lost');
}
let site=null;

const link=()=>`${ORIGIN}/?workspace=blank#runtime=${encodeURIComponent(RORIGIN)}&token=${token}`;

const record={format:'datapass.rollback-check',version:1,origin:ORIGIN,old:{dist:opt['old-dist'],service:opt['old-service']},new:{dist:opt['new-dist'],service:opt['new-service']},sql:{a:{sql:SQL_A,sourceSha256:sqlHash(SQL_A)},b:{sql:SQL_B,sourceSha256:sqlHash(SQL_B)}},steps:[],ok:false};

async function session(label,side,body){
  await serve(side==='old'?opt['old-dist']:opt['new-dist']);
  await startRuntime(side==='old'?opt['old-service']:opt['new-service']);
  const context=await chromium.launchPersistentContext(profile,{viewport:{width:1440,height:960},acceptDownloads:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=context.pages()[0]??await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const step={label,side,notes:[]};
  try{
    await page.goto(link(),{waitUntil:'domcontentloaded'});
    await connect(page);
    await body(page,step);
    await page.screenshot({path:path.join(out,label+'.png'),fullPage:false});
  }catch(error){
    await page.screenshot({path:path.join(out,label+'-failed.png'),fullPage:true}).catch(()=>{});
    step.failure=String(error.message??error).slice(0,600);record.steps.push(step);throw error;
  }finally{await context.close();}
  if(errors.length)step.pageErrors=errors;
  step.store=await storeFiles();
  record.steps.push(step);
  console.log('ok',label);
}
const cells=page=>page.getByTestId('cell');
/** Explicit runtime consent, as a user does: nothing connects on its own. */
async function connect(page){
  await page.getByTestId('runtime-state').filter({hasText:'DuckDB ready'}).waitFor({timeout:120000});
  // A reload in the same tab keeps the consent already given (session only); a new browser asks again.
  const consent=page.getByTestId('runtime-consent').getByRole('button',{name:'Connect'});
  for(let t=0;t<20000;t+=250){
    if(await consent.isVisible().catch(()=>false)){await consent.click();break;}
    if(await page.locator('[data-testid="runtime-bar"][data-status="connected"]').count())break;
    await pause(250);
  }
  await page.locator('[data-testid="runtime-bar"][data-status="connected"]').waitFor({timeout:30000});
  await page.locator('[data-testid="notebook-files"][data-store="ready"]').waitFor({timeout:30000});
}
async function waitStatus(cell,status,ms=90000){
  for(let t=0;t<ms;t+=250){if(await cell.getAttribute('data-status')===status)return;await pause(250);}
  fail('cell status '+await cell.getAttribute('data-status')+' instead of '+status);
}
async function openFromStore(page,step){
  await page.getByRole('button',{name:'Open from store'}).click();
  const notice=page.getByTestId('workspace-notice');
  await notice.waitFor({timeout:30000});
  step.notes.push((await notice.textContent()).trim());
}
async function expectReopened(page,shas){
  if(await cells(page).count()!==2)fail('expected 2 reopened cells, got '+await cells(page).count());
  for(let i=0;i<2;i++){
    const c=cells(page).nth(i);
    await waitStatus(c,'done',30000);
    if(await c.getAttribute('data-result-sha')!==shas[i])fail('cell '+i+' result hash changed');
    if(!(await c.getByTestId('cell-message').textContent()).includes('Not recomputed'))fail('cell '+i+' was not reported as reopened without recomputation');
  }
}
async function save(page,step,expectCount){
  await page.getByRole('button',{name:'Save results to store'}).click();
  const notice=page.getByTestId('workspace-notice');
  await notice.filter({hasText:'Saved '+expectCount+' result'}).waitFor({timeout:30000});
  step.notes.push((await notice.textContent()).trim());
}

let shas=[];
try{
  await mkdir(store);
  // 1 old: author two SQL cells, run, save, export .ipynb.
  await session('1-old-author-save','old',async(page,step)=>{
    await page.getByTestId('notebook-empty').waitFor({timeout:60000});
    for(const [title,sql] of [['Synthetic regions',SQL_A],['Synthetic total',SQL_B]]){
      await page.getByRole('button',{name:'Add SQL cell'}).click();
      const c=cells(page).last();
      await c.getByLabel('Cell title').fill(title);
      await c.getByLabel(/^SQL for/).fill(sql);
      await c.getByRole('button',{name:/^Run/}).click();
      await waitStatus(c,'done');
    }
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export .ipynb'}).click()]);
    const ipynb=await readFile(await download.path());
    step.exportedIpynbSha256=sha(ipynb);
    await save(page,step,2);
    shas=[await cells(page).nth(0).getAttribute('data-result-sha'),await cells(page).nth(1).getAttribute('data-result-sha')];
    if(!shas.every(s=>/^[0-9a-f]{64}$/.test(s??'')))fail('no stored result hash after save');
    step.resultSha256=shas;
  });
  const resultsOf=files=>Object.fromEntries(Object.entries(files).filter(([k])=>k.startsWith('results/')));
  const m1=await manifest();
  // A pre-hash old release (0.10.0) writes none; an old release that already ships M-SQLHASH (0.11.x) must write
  // exactly the authored hash for every cell. A partial or wrong hash fails either way.
  const oldHashes=m1.workspace.cells.filter(c=>'sourceSha256' in c).length;
  record.steps[0].manifestHasSqlHashes=oldHashes>0;
  if(oldHashes>0){
    if(oldHashes!==m1.workspace.cells.length)fail('the old release wrote SQL source hashes for only some cells');
    const want1=[sqlHash(SQL_A),sqlHash(SQL_B)];
    m1.workspace.cells.forEach((c,i)=>{if(c.sourceSha256!==want1[i])fail('the old release wrote a wrong SQL source hash for '+c.cellId);});
  }

  // 1b new (F206): a client site saves one runtime run; the notebook workspace must be untouched.
  if(opt['site-run']!=='0'){
    const step={label:'1b-new-site-run-save',side:'new',notes:[]};
    site=await seedSiteRun(step);
    step.store=await storeFiles();record.steps.push(step);
    if(JSON.stringify((await manifest()).workspace)!==JSON.stringify(m1.workspace))fail('the site run save changed the notebook workspace');
    await siteRunKept(step.store,'1b');
    console.log('ok',step.label);
  }
  const savedResults=resultsOf(record.steps.at(-1).store);
  const at=label=>record.steps.find(s=>s.label===label);

  // 2 new: upgrade; reopen by hash, then save: SQL hashes recorded, result files unchanged.
  await session('2-new-upgrade-reopen-save','new',async(page,step)=>{
    await openFromStore(page,step);
    await expectReopened(page,shas);
    await save(page,step,2);
  });
  const m2=await manifest();
  const want={[m2.workspace.cells[0].cellId]:sqlHash(SQL_A),[m2.workspace.cells[1].cellId]:sqlHash(SQL_B)};
  for(const c of m2.workspace.cells)if(c.sourceSha256!==want[c.cellId])fail('new release did not record the authored SQL hash for '+c.cellId);
  if(JSON.stringify(resultsOf(at('2-new-upgrade-reopen-save').store))!==JSON.stringify(savedResults))fail('result files changed on upgrade');
  await currentNotebookIntact(at('2-new-upgrade-reopen-save').store);
  await siteRunKept(at('2-new-upgrade-reopen-save').store,'2');

  // 3 old: rollback; the older release reads the newer manifest and keeps every file.
  await session('3-old-rollback-reopen-save','old',async(page,step)=>{
    await openFromStore(page,step);
    await expectReopened(page,shas);
    await save(page,step,2);
  });
  const s3=at('3-old-rollback-reopen-save').store;
  if(JSON.stringify(resultsOf(s3))!==JSON.stringify(savedResults))fail('result files changed on rollback');
  await currentNotebookIntact(s3);
  await siteRunKept(s3,'3 (the older release opened and saved)');
  at('3-old-rollback-reopen-save').manifestHasSqlHashes=(await manifest()).workspace.cells.some(c=>'sourceSha256' in c);

  // 4 new: recovery after the older save, then a tampered hash is refused and recovered from a copy.
  await session('4-new-recover-tamper-restore','new',async(page,step)=>{
    await openFromStore(page,step);
    await expectReopened(page,shas);
    await save(page,step,2);
    const good=path.join(work,'manifest.copy.json');
    await copyFile(path.join(store,'manifest.json'),good);
    const doc=await manifest();
    doc.workspace.cells[0].sourceSha256=sqlHash('SELECT 1');
    const tampered=JSON.stringify(doc);
    await writeFile(path.join(store,'manifest.json'),tampered);
    await page.reload({waitUntil:'domcontentloaded'});await connect(page);
    await page.getByRole('button',{name:'Open from store'}).click();
    const problem=page.getByText(/nothing was opened/);
    await problem.first().waitFor({timeout:30000});
    step.tamperRefusal=(await problem.first().textContent()).trim();
    if(sha(await readFile(path.join(store,'manifest.json')))!==sha(tampered))fail('the refused open changed the manifest');
    step.tamperedManifestSha256=sha(tampered);
    await copyFile(good,path.join(store,'manifest.json'));
    await page.reload({waitUntil:'domcontentloaded'});await connect(page);
    await openFromStore(page,step);
    await expectReopened(page,shas);
    if(site){
      // The newer runtime serves the site run back by hash after every restart: nothing recomputed.
      const r=await fetch(`${RORIGIN}/api/notebook/v1/store/results/${site}`,{headers:{'X-Datapass-Token':token}});
      if(!r.ok||sha(Buffer.from(await r.arrayBuffer()))!==site)fail('the newer runtime does not serve the saved site run by its hash');
      step.siteRunReopened=site;
    }
  });
  const m4=await manifest();
  for(const c of m4.workspace.cells)if(c.sourceSha256!==want[c.cellId])fail('hashes not restored after recovery');
  if(JSON.stringify(resultsOf(at('4-new-recover-tamper-restore').store))!==JSON.stringify(savedResults))fail('result files changed during recovery');
  await currentNotebookIntact(at('4-new-recover-tamper-restore').store);
  await siteRunKept(at('4-new-recover-tamper-restore').store,'4');
  record.ok=true;
}finally{
  await stopRuntime().catch(()=>{});await stopWeb();
  record.runtimeLogTail=runtimeLog.slice(-400).replaceAll(token,'<token>');
  // Shareable after review: no token, and the local temp folder (it names the OS user) is shown as %TEMP%.
  const tmp=os.tmpdir(),redact=(_k,v)=>typeof v==='string'?[tmp,tmp.split(path.sep).join('/')].reduce((s,t)=>s.split(t).join('%TEMP%'),v):v;
  await writeFile(path.join(out,'rollback-check.json'),JSON.stringify(record,redact,2)+'\n');
  await rm(work,{recursive:true,force:true});
}
console.log(record.ok?'PASS':'FAIL',path.join(out,'rollback-check.json'));
process.exit(record.ok?0:1);

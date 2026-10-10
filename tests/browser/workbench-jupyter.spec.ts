import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// E2E-01 (FR-02/FR-03): a REAL user-installed Jupyter Server (py/service/requirements-jupyter.txt, started through
// py/service/jupyter_local.py) and the real local service with an opt-in result store in a temp folder outside Git.
// All data is SYNTHETIC. Locally the suite skips when jupyter_server/ipykernel/nbformat are missing; CI sets
// DATAPASS_REQUIRE_JUPYTER=1 so a missing dependency fails instead of skipping.
const PY=process.env.DATAPASS_JUPYTER_PYTHON||process.env.PYTHON||'python';
const REQUIRE=process.env.DATAPASS_REQUIRE_JUPYTER==='1';
const JPORT=Number(process.env.DATAPASS_JUPYTER_TEST_PORT||28888),RPORT=Number(process.env.DATAPASS_NOTEBOOK_TEST_RUNTIME_PORT||28799);
const JORIGIN=`http://127.0.0.1:${JPORT}`,RORIGIN=`http://127.0.0.1:${RPORT}`;
const JTOKEN=randomBytes(24).toString('hex');
const available=spawnSync(PY,['-c','import jupyter_server, ipykernel, nbformat, fastapi, uvicorn'],{stdio:'ignore'}).status===0;
if(REQUIRE&&!available)throw new Error(`DATAPASS_REQUIRE_JUPYTER=1 but ${PY} cannot import jupyter_server/ipykernel/nbformat/fastapi.`);
test.skip(!available,`${PY} lacks py/service/requirements-jupyter.txt; set DATAPASS_JUPYTER_PYTHON to a venv that has it.`);

let PAGE='http://127.0.0.1:4173',rtoken='',jupyter:ChildProcess|null=null,runtime:ChildProcess|null=null,storeDir='',kernelDir='',runtimeLog='',jupyterLog='';
let errors:string[]=[],external:string[]=[];
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function waitFor(url:string,headers:Record<string,string>,what:()=>string){
  for(let i=0;i<240;i++){try{const r=await fetch(url,{headers});if(r.ok)return;}catch{/* starting */}await pause(250);}
  throw new Error('Did not start: '+what().slice(-1500));
}
// Services start in their own process group on POSIX, so the whole tree (launcher + jupyter_server + kernels) stops.
const DETACHED=process.platform!=='win32';
function signalTree(p:ChildProcess,sig:NodeJS.Signals){try{process.kill(-p.pid!,sig);}catch{try{p.kill(sig);}catch{/* already gone */}}}
async function stopTree(p:ChildProcess|null,probe:string){
  if(p&&p.exitCode===null&&p.signalCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(p.pid),'/T','/F']);else signalTree(p,'SIGTERM');}
  for(let i=0;i<120;i++){
    try{await fetch(probe);}catch{return;}
    if(i===40&&p&&DETACHED)signalTree(p,'SIGKILL');
    await pause(250);
  }
  throw new Error('Still answering after stop: '+probe);
}
async function startJupyter(){
  await stopTree(jupyter,JORIGIN+'/api/status');
  jupyter=spawn(PY,['py/service/jupyter_local.py','--port',String(JPORT),'--workbench-origin',PAGE,'--root-dir',kernelDir,'--no-print-token'],{env:{...process.env,DATAPASS_JUPYTER_TOKEN:JTOKEN},stdio:['ignore','pipe','pipe'],detached:DETACHED});
  jupyter.stdout!.on('data',d=>{jupyterLog+=String(d);});jupyter.stderr!.on('data',d=>{jupyterLog+=String(d);});
  await waitFor(JORIGIN+'/api/status',{Authorization:'token '+JTOKEN},()=>jupyterLog);
}
async function startRuntime(maxBytes?:number){
  await stopTree(runtime,RORIGIN+'/health');
  rtoken='nb-e2e-'+randomBytes(12).toString('hex');
  runtime=spawn(PY,['py/service/app.py','--port',String(RPORT),'--workbench-origin',PAGE,'--results-dir',storeDir,...(maxBytes?['--results-max-bytes',String(maxBytes)]:[])],{env:{...process.env,DATAPASS_RUNTIME_TOKEN:rtoken,DATAPASS_SERVICE_ORIGINS:PAGE},stdio:['ignore','pipe','pipe'],detached:DETACHED});
  runtime.stdout!.on('data',d=>{runtimeLog+=String(d);});runtime.stderr!.on('data',d=>{runtimeLog+=String(d);});
  await waitFor(RORIGIN+'/health',{},()=>runtimeLog);
}
const link=()=>`/?workspace=blank#runtime=${encodeURIComponent(RORIGIN)}&token=${rtoken}`;
function watch(page:Page){
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const u=r.url();if(/^(https?|wss?):/.test(u)&&![PAGE+'/',RORIGIN+'/',JORIGIN+'/','ws://127.0.0.1:'+JPORT+'/'].some(o=>u.startsWith(o)))external.push(u);});
  page.on('dialog',d=>{errors.push('Unexpected dialog: '+d.message());void d.dismiss();});
}
async function open(context:BrowserContext,url:string,withRuntime=true):Promise<Page>{
  const page=await context.newPage();watch(page);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:120000});
  if(withRuntime){
    await page.getByTestId('runtime-consent').getByRole('button',{name:'Connect'}).click();
    await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','connected');
    await expect(page.getByTestId('notebook-files')).toHaveAttribute('data-store','ready');
  }
  return page;
}
async function pairKernel(page:Page,token=JTOKEN){
  const bar=page.getByTestId('jupyter-bar');
  await bar.getByLabel('Jupyter Server URL').fill(JORIGIN);
  await bar.getByLabel('Jupyter token').fill(token);
  await bar.getByRole('button',{name:'Pair kernel'}).click();
}
async function filesUnder(dir:string):Promise<string[]>{
  const out:string[]=[];
  for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await filesUnder(p));else out.push(p);}
  return out;
}
async function assertNoTokens(dir:string,tokens:string[]){
  for(const f of await filesUnder(dir)){const text=await readFile(f,'latin1');for(const t of tokens)expect(text.includes(t),`token found in ${f}`).toBe(false);}
}

test.beforeAll(async({},info)=>{
  PAGE=new URL(String(info.project.use.baseURL)).origin;
  storeDir=await mkdtemp(path.join(os.tmpdir(),'datapass-e2e-store-'));
  kernelDir=await mkdtemp(path.join(os.tmpdir(),'datapass-e2e-kernel-'));
});
test.beforeEach(()=>{errors=[];external=[];});
test.afterEach(async({},info)=>{
  // Service logs help diagnose a failure; they are written only when they do not contain the Jupyter token.
  if(info.status!==info.expectedStatus)for(const [name,log] of [['jupyter.log',jupyterLog],['runtime.log',runtimeLog]] as const)if(!log.includes(JTOKEN))await writeFile(info.outputPath(name),log.slice(-20000));
  expect(errors,'Unhandled browser exceptions or dialogs').toEqual([]);
  expect(external,'Only the page, the consented runtime and the paired Jupyter Server').toEqual([]);
});
test.afterAll(async()=>{
  await stopTree(jupyter,JORIGIN+'/api/status');await stopTree(runtime,RORIGIN+'/health');
  for(const log of [jupyterLog,runtimeLog])expect(log.includes(JTOKEN),'the Jupyter token never appears in a service log').toBe(false);
  await rm(storeDir,{recursive:true,force:true});await rm(kernelDir,{recursive:true,force:true});
});

test('E2E-01 blank workspace -> pair -> Python -> SQL on its result -> chart -> .ipynb + results -> restart -> reopen without rerun',async({browser},info)=>{
  test.setTimeout(600000); // three service restarts and four page loads; generous for a loaded shared runner
  await startRuntime();await startJupyter();
  let context=await browser.newContext({acceptDownloads:true});
  let page=await open(context,link());
  await expect(page.getByTestId('notebook-empty')).toBeVisible();
  await pairKernel(page);
  await expect(page.getByTestId('jupyter-bar')).toHaveAttribute('data-status','connected',{timeout:60000});
  await expect(page.getByTestId('jupyter-bar')).toContainText('python3');

  // Edit and run a real Python cell; its variable becomes a bounded SQL table.
  await page.getByRole('button',{name:'Add Python (Jupyter) cell'}).click();
  const py=page.getByTestId('cell').nth(0);
  await py.getByLabel('Cell title').fill('Synthetic rows');
  await py.getByLabel(/^Python for/).fill('import math\nsynthetic = [{"step": i, "value": round(math.sin(i / 3) * 10, 3)} for i in range(24)]\nprint("SYNTHETIC rows:", len(synthetic))');
  await py.getByLabel('Publish variable as SQL table (optional)').fill('synthetic');
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','done',{timeout:90000});
  await expect(py.getByTestId('cell-outputs')).toContainText('SYNTHETIC rows: 24');
  await expect(py.getByTestId('cell-table')).toContainText('step');

  // SQL on the Python result through DuckDB, with an explicit dependency; then a chart.
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  const q=page.getByTestId('cell').nth(1);
  await q.getByLabel('Cell title').fill('Buckets');
  await q.getByLabel(/^SQL for/).fill('SELECT step % 4 AS bucket, round(sum(value), 3)::DOUBLE AS total FROM synthetic GROUP BY 1 ORDER BY 1');
  await q.locator('.cell-deps summary').click();
  await q.locator('.cell-deps').getByRole('checkbox').first().check();
  await expect(q.getByRole('button',{name:/after 1 dependency$/})).toHaveText('Run (2 cells)');
  await q.getByRole('button',{name:/after 1 dependency$/}).click();
  await expect(q).toHaveAttribute('data-status','done',{timeout:90000});
  await expect(q.getByTestId('artifact')).toContainText('bucket');
  await q.getByRole('group',{name:'Chart this result'}).getByLabel('Y').selectOption('total');
  await q.getByRole('button',{name:'Apply chart'}).click();
  await q.getByLabel('Artifact representation').selectOption({label:'total by bucket'});
  await expect(q.locator('svg').first()).toBeVisible();

  // Interrupt a long cell: the last valid output stays, marked stale; interrupted is its own state.
  await page.getByRole('button',{name:'Add Python (Jupyter) cell'}).click();
  const slow=page.getByTestId('cell').nth(2);
  await slow.getByLabel('Cell title').fill('Long loop');
  await slow.getByLabel(/^Python for/).fill('print("first valid output")');
  await slow.getByRole('button',{name:/^Run/}).click();
  await expect(slow).toHaveAttribute('data-status','done',{timeout:60000});
  await slow.getByLabel(/^Python for/).fill('import time\nprint("long loop started", flush=True)\nfor i in range(1200):\n    time.sleep(0.1)');
  await slow.getByRole('button',{name:/^Run/}).click();
  await expect(slow).toHaveAttribute('data-status','running');
  await expect(slow).toContainText('long loop started',{timeout:30000});
  await slow.getByRole('button',{name:'Interrupt'}).click();
  await expect(slow).toHaveAttribute('data-status','interrupted',{timeout:60000});
  await expect(slow.getByTestId('previous-result')).toContainText('first valid output');
  await expect(slow.getByTestId('previous-result')).toContainText('Stale');
  await expect(slow.getByTestId('cell-message')).toContainText('Interrupted');
  await page.screenshot({path:info.outputPath('e2e01-authoring.png'),fullPage:true});

  // Export a standard .ipynb through nbformat.
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export .ipynb'}).click();
  const ipynbPath=(await (await download).path())!;
  const ipynbText=await readFile(ipynbPath,'utf8');
  const nb=JSON.parse(ipynbText);
  expect(nb.nbformat).toBe(4);
  expect(nb.cells.map((c:{cell_type:string})=>c.cell_type)).toEqual(['code','code','code']);
  expect([].concat(nb.cells[1].source).join('')).toMatch(/^%%sql\n/);
  expect(nb.cells[0].metadata.datapass).toMatchObject({kind:'python',outputTable:'synthetic'});
  expect(ipynbText.includes(JTOKEN)||ipynbText.includes(rtoken)).toBe(false);
  await writeFile(info.outputPath('e2e01-export.ipynb'),ipynbText);

  // Save results + notebook to the user-selected store (outside Git).
  await page.getByRole('button',{name:'Save results to store'}).click();
  await expect(page.getByTestId('workspace-notice')).toContainText('Saved 2 results');
  const pySha=(await py.getAttribute('data-result-sha'))!,qSha=(await q.getAttribute('data-result-sha'))!;
  expect(pySha).toMatch(/^[0-9a-f]{64}$/);expect(qSha).toMatch(/^[0-9a-f]{64}$/);
  for(const s of [pySha,qSha])expect(sha(await readFile(path.join(storeDir,'results',s+'.json')))).toBe(s);
  const manifest=JSON.parse(await readFile(path.join(storeDir,'manifest.json'),'utf8'));
  expect(manifest.jobs.some((j:{cellId:string;status:string})=>j.status==='interrupted')).toBe(true);
  await assertNoTokens(storeDir,[JTOKEN,rtoken]);
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage}));
  expect(stored.includes(JTOKEN)).toBe(false);
  expect(stored).not.toContain('SYNTHETIC rows: 24'); // source is saved, outputs are not

  // Restart the service AND the browser; the Jupyter Server stays stopped, so nothing can be recomputed.
  await context.close();
  await stopTree(jupyter,JORIGIN+'/api/status');jupyter=null;
  await startRuntime();
  context=await browser.newContext({acceptDownloads:true});
  page=await open(context,link());
  await expect(page.getByTestId('jupyter-bar')).toHaveAttribute('data-status','disconnected');
  await page.getByRole('button',{name:'Open from store'}).click();
  await expect(page.getByTestId('cell')).toHaveCount(3);
  const py2=page.getByTestId('cell').nth(0),q2=page.getByTestId('cell').nth(1),slow2=page.getByTestId('cell').nth(2);
  await expect(py2).toHaveAttribute('data-status','done');
  await expect(py2).toHaveAttribute('data-result-sha',pySha);
  await expect(q2).toHaveAttribute('data-result-sha',qSha);
  await expect(py2.getByTestId('cell-message')).toContainText('Not recomputed');
  await expect(py2.getByTestId('cell-outputs')).toContainText('SYNTHETIC rows: 24');
  await expect(q2.getByTestId('artifact')).toContainText('bucket');
  await expect(py2.locator('.notice.stale')).toHaveCount(0);
  await expect(q2.locator('.notice.stale')).toHaveCount(0);
  await expect(slow2.getByTestId('job-note')).toContainText('interrupted');
  for(const s of [pySha,qSha])expect(sha(await readFile(path.join(storeDir,'results',s+'.json')))).toBe(s);
  // The reopened table is queryable without a kernel: it was loaded from the store, not recomputed.
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  const count=page.getByTestId('cell').nth(3);
  await count.getByLabel(/^SQL for/).fill('SELECT count(*)::INTEGER AS n FROM synthetic');
  await count.getByRole('button',{name:/^Run/}).click();
  await expect(count).toHaveAttribute('data-status','done');
  await expect(count.getByTestId('artifact')).toContainText('24');
  await page.screenshot({path:info.outputPath('e2e01-reopened.png'),fullPage:true});

  // User-driven retention: delete one saved result; reopening then offers relink or an explicit rerun.
  await page.getByTestId('store-panel').locator('summary').click();
  await page.locator(`[data-testid="store-entry"][data-sha="${qSha}"]`).getByRole('button',{name:/^Delete saved result/}).click();
  await page.locator(`[data-testid="store-entry"][data-sha="${qSha}"]`).getByRole('button',{name:'Confirm delete'}).click();
  await expect(page.locator(`[data-testid="store-entry"][data-sha="${qSha}"]`)).toHaveCount(0);
  await page.getByRole('button',{name:'Open from store'}).click();
  const q3=page.getByTestId('cell').nth(1);
  await expect(q3).toHaveAttribute('data-status','missing');
  await expect(q3.getByTestId('cell-relink')).toContainText('Run again');
  await expect(page.getByTestId('cell').nth(0)).toHaveAttribute('data-result-sha',pySha);

  // Storage full: a bounded store refuses the save and leaves the previous saved state byte-identical.
  const before=sha(await readFile(path.join(storeDir,'manifest.json')));
  const filesBefore=(await filesUnder(storeDir)).sort();
  await context.close();
  await startRuntime(1024);
  context=await browser.newContext();
  page=await open(context,link());
  await page.getByRole('button',{name:'Open from store'}).click();
  await expect(page.getByTestId('cell').nth(0)).toHaveAttribute('data-result-sha',pySha);
  await page.getByRole('button',{name:'Save results to store'}).click();
  await expect(page.locator('.notebook > .notice.error')).toContainText('Result store full');
  expect(sha(await readFile(path.join(storeDir,'manifest.json')))).toBe(before);
  expect((await filesUnder(storeDir)).sort()).toEqual(filesBefore);
  await assertNoTokens(storeDir,[JTOKEN,rtoken]);
  await context.close();
  await writeFile(info.outputPath('e2e01-hashes.json'),JSON.stringify({pythonResultSha256:pySha,sqlResultSha256:qSha,reopenedPythonSha256:pySha,manifestSha256:before},null,2));
});

function rawRequest(url:string,headers:Record<string,string>):Promise<number>{
  return new Promise((resolve,reject)=>{const u=new URL(url);const req=http.request({host:u.hostname,port:u.port,path:u.pathname+u.search,method:'GET',headers},res=>{res.resume();resolve(res.statusCode??0);});req.on('upgrade',(res,socket)=>{socket.destroy();resolve(101);});req.on('error',reject);req.end();});
}

test('pairing refusals: remote URL, wrong token, foreign Origin and Host on Jupyter and on the notebook routes',async({browser})=>{
  test.setTimeout(180000);
  await startRuntime();await startJupyter();
  const context=await browser.newContext();
  const page=await open(context,'/?workspace=blank',false);
  const bar=page.getByTestId('jupyter-bar');
  await bar.getByLabel('Jupyter Server URL').fill('http://192.168.1.10:8888');
  await bar.getByLabel('Jupyter token').fill(JTOKEN);
  await expect(bar.getByRole('alert')).toContainText('loopback');
  await expect(bar.getByRole('button',{name:'Pair kernel'})).toBeDisabled();
  await pairKernel(page,'wrong-token-'+randomBytes(8).toString('hex'));
  await expect(bar).toHaveAttribute('data-status','denied');
  await expect(bar).toContainText('refused the token');
  await context.close();
  const auth={Authorization:'token '+JTOKEN};
  expect(await rawRequest(JORIGIN+'/api/status',{...auth,Origin:PAGE})).toBe(200);
  expect(await rawRequest(JORIGIN+'/api/status',{...auth,Origin:'http://evil.example'})).not.toBe(200);
  expect(await rawRequest(JORIGIN+'/api/status',{...auth,Host:'evil.example:'+JPORT})).toBe(403);
  // The kernel websocket keeps the Origin check even with a valid token (jupyter_strict_origin.py).
  const kernel=await (await fetch(JORIGIN+'/api/kernels',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({name:'python3'})})).json();
  const ws={Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':randomBytes(16).toString('base64')};
  const wsPath=`${JORIGIN}/api/kernels/${kernel.id}/channels?token=${JTOKEN}`;
  expect(await rawRequest(wsPath,{...ws,Origin:'http://evil.example'})).not.toBe(101);
  expect(await rawRequest(wsPath,{...ws,Origin:PAGE})).toBe(101);
  await fetch(`${JORIGIN}/api/kernels/${kernel.id}`,{method:'DELETE',headers:auth});
  const token={'X-Datapass-Token':rtoken};
  expect(await rawRequest(RORIGIN+'/api/notebook/v1/status',{...token,Origin:PAGE})).toBe(200);
  expect(await rawRequest(RORIGIN+'/api/notebook/v1/status',{...token,Origin:'http://evil.example'})).toBe(403);
  expect(await rawRequest(RORIGIN+'/api/notebook/v1/status',{'X-Datapass-Token':'wrong-token-0123456789'})).toBe(401);
  expect(await rawRequest(RORIGIN+'/api/notebook/v1/status',{...token,Host:'evil.example'})).toBe(400);
});

test('notebook import: corrupt and invalid files change nothing; unsupported cells stay inert; outputs render untrusted',async({browser})=>{
  test.setTimeout(300000);
  await startRuntime();
  const context=await browser.newContext();
  const page=await open(context,link());
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  await page.getByTestId('cell').first().getByLabel(/^SQL for/).fill('SELECT 7 AS kept');
  const picker=page.getByLabel('Import notebook file');
  await picker.setInputFiles({name:'corrupt.ipynb',mimeType:'application/json',buffer:Buffer.from('{"cells": [')});
  await expect(page.locator('.global-error')).toContainText('nothing changed');
  await expect(page.locator('.global-error')).toContainText('not valid JSON');
  await page.locator('.global-error').getByRole('button',{name:'Dismiss error'}).click();
  const invalid={nbformat:4,nbformat_minor:5,metadata:{},cells:[{cell_type:'code',id:'a',metadata:{},outputs:[],execution_count:null}]};
  await picker.setInputFiles({name:'invalid.ipynb',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.locator('.global-error')).toContainText('does not validate');
  await expect(page.getByTestId('cell')).toHaveCount(1);
  await expect(page.getByTestId('cell').first().getByLabel(/^SQL for/)).toHaveValue('SELECT 7 AS kept');
  const synthetic={nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'python3',display_name:'Python 3',language:'python'},language_info:{name:'python'}},cells:[
    {cell_type:'markdown',id:'about',metadata:{},source:'# SYNTHETIC notebook\nNot real data.'},
    {cell_type:'code',id:'shown',metadata:{},execution_count:1,source:'print("never run on import")',outputs:[
      {output_type:'display_data',metadata:{},data:{'text/html':'<b id="xss-probe">bold</b><script>window.__xss=1</script>','application/javascript':'window.__xss=2'}},
      {output_type:'stream',name:'stdout',text:'imported text output\n'}]},
    {cell_type:'raw',id:'rawcell',metadata:{},source:'raw text kept verbatim'}]};
  await picker.setInputFiles({name:'synthetic.ipynb',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(synthetic))});
  await expect(page.getByTestId('workspace-notice')).toContainText('Nothing was run');
  await expect(page.getByTestId('cell')).toHaveCount(3);
  const shown=page.getByTestId('cell').nth(1);
  await expect(shown).toHaveAttribute('data-status','imported');
  await expect(shown.getByTestId('cell-outputs')).toContainText('<script>window.__xss=1</script>');
  await expect(shown.getByTestId('output-refused')).toContainText('application/javascript');
  await expect(shown.getByTestId('cell-outputs')).toContainText('imported text output');
  await expect(page.locator('#xss-probe')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {__xss?:number}).__xss)).toBeUndefined();
  await expect(page.getByTestId('cell').nth(2)).toHaveAttribute('data-kind','inert');
  await expect(page.getByTestId('inert-cell')).toContainText('raw text kept verbatim');
  await expect(page.getByTestId('loss-report')).toContainText('raw cell');
  // Round trip: the inert cell goes back out unchanged.
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export .ipynb'}).click();
  const back=JSON.parse(await readFile((await (await download).path())!,'utf8'));
  const raw=back.cells.find((c:{cell_type:string})=>c.cell_type==='raw');
  expect([].concat(raw.source).join('')).toBe('raw text kept verbatim');
  await context.close();
});

test('a static light client and the blank workbench start with no Python service and no kernel',async({browser})=>{
  await stopTree(runtime,RORIGIN+'/health');runtime=null;
  await stopTree(jupyter,JORIGIN+'/api/status');jupyter=null;
  const context=await browser.newContext();
  const page=await open(context,'/?workspace=blank',false);
  const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
  await expect(page.getByTestId('notebook-files')).toContainText('Connect the local runtime');
  await expect(page.getByTestId('jupyter-bar')).toHaveAttribute('data-status','disconnected');
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  await page.getByTestId('cell').first().getByRole('button',{name:/^Run/}).click();
  await expect(page.getByTestId('cell').first()).toHaveAttribute('data-status','done');
  await page.goto('/?app=motion-reference&page=flow',{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('motion')).toBeVisible();
  expect(requests.filter(u=>!u.startsWith(PAGE+'/'))).toEqual([]);
  await context.close();
});

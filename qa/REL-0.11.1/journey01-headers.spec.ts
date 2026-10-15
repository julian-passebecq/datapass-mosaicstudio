import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import os from 'node:os';
import path from 'node:path';

// REL-0.11.1 JOURNEY-01 on an installed workbench folder (unzipped release zip, or dist/) served WITH its own _headers
// (serve-with-headers.mjs). Same 15 steps as FIN-0.11.0 JOURNEY-01, plus: every workbench document response must carry
// exactly the headers of the shipped _headers, the page must raise no CSP violation (document listener and console),
// and a non-loopback connect must still be blocked by connect-src (proves the policy is enforced, not bypassed).
// All data synthetic (tests/fixtures/sample.csv, tests/fixtures/interop/*.synthetic.*).
const EVID=process.env.JOURNEY_EVIDENCE!;
const WORKBENCH=process.env.JOURNEY_WORKBENCH!; // unzipped release folder that holds index.html and _headers
const PY=process.env.DATAPASS_JUPYTER_PYTHON||'python';
const PYROOT=process.env.JOURNEY_PYROOT!; // folder that holds py/ (build worktree at 0bc8c8c)
const FIX=process.env.JOURNEY_FIXTURES!;  // folder that holds sample.csv and interop/
const VIEWER=process.env.JOURNEY_VIEWER!; // release concept-viewer.html
const JPORT=Number(process.env.JOURNEY_JPORT||28822),RPORT=Number(process.env.JOURNEY_RPORT||28821);
const JORIGIN=`http://127.0.0.1:${JPORT}`,RORIGIN=`http://127.0.0.1:${RPORT}`;
const JTOKEN=randomBytes(24).toString('hex');
let PAGE='',rtoken='',jupyter:ChildProcess|null=null,runtime:ChildProcess|null=null,storeDir='',kernelDir='',rlog='',jlog='';
const steps:{step:string;status:'pass'|'fail'|'note';detail?:unknown;at:string}[]=[];
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let errors:string[]=[],external:string[]=[],runtimeCalls:string[]=[],jupyterCalls:string[]=[];
const PROBE='http://192.0.2.1:9/csp-probe'; // TEST-NET-1, never routed: only used to prove connect-src is enforced
const cspViolations:{directive:string;blocked:string;source:string;page:string}[]=[],cspConsole:string[]=[],headerMismatches:string[]=[];
let shippedHeaders:Record<string,string>={},documentsChecked=0;
function parseHeaders(text:string){const rules:Record<string,Record<string,string>>={};let cur:Record<string,string>|null=null;
  for(const line of text.split(/\r?\n/)){if(!line.trim()||line.trimStart().startsWith('#'))continue;
    if(!/^\s/.test(line)){cur=rules[line.trim()]={};continue;}const i=line.indexOf(':');cur![line.slice(0,i).trim()]=line.slice(i+1).trim();}
  return rules;}
async function newContext(browser:import('@playwright/test').Browser){
  const c=await browser.newContext({acceptDownloads:true});
  await c.exposeBinding('__cspViolation',({page},v:{directive:string;blocked:string;source:string})=>{cspViolations.push({...v,page:page.url().replace(/token=[^&]+/,'token=<redacted>')});});
  await c.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>(window as any).__cspViolation?.({directive:e.effectiveDirective,blocked:e.blockedURI,source:e.sourceFile+':'+e.lineNumber})));
  return c;
}
async function step<T>(name:string,fn:()=>Promise<T>):Promise<T>{
  try{const v=await fn();steps.push({step:name,status:'pass',detail:v===undefined||(typeof v==='object'&&v!==null&&!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype)?undefined:v,at:new Date().toISOString()});return v;}
  catch(e){steps.push({step:name,status:'fail',detail:String((e as Error).message).slice(0,2000),at:new Date().toISOString()});throw e;}
}
async function waitFor(url:string,headers:Record<string,string>,what:()=>string){
  for(let i=0;i<240;i++){try{const r=await fetch(url,{headers});if(r.ok)return;}catch{/* starting */}await pause(250);}
  throw new Error('Did not start: '+what().slice(-1500));
}
async function stopTree(p:ChildProcess|null,probe:string){
  if(p&&p.exitCode===null&&p.signalCode===null)spawnSync('taskkill',['/pid',String(p.pid),'/T','/F']);
  for(let i=0;i<120;i++){try{await fetch(probe);}catch{return;}await pause(250);}
  throw new Error('Still answering after stop: '+probe);
}
async function startJupyter(){
  await stopTree(jupyter,JORIGIN+'/api/status');
  jupyter=spawn(PY,[path.join(PYROOT,'py/service/jupyter_local.py'),'--port',String(JPORT),'--workbench-origin',PAGE,'--root-dir',kernelDir,'--no-print-token'],{cwd:PYROOT,env:{...process.env,DATAPASS_JUPYTER_TOKEN:JTOKEN},stdio:['ignore','pipe','pipe']});
  jupyter.stdout!.on('data',d=>{jlog+=String(d);});jupyter.stderr!.on('data',d=>{jlog+=String(d);});
  await waitFor(JORIGIN+'/api/status',{Authorization:'token '+JTOKEN},()=>jlog);
}
async function startRuntime(){
  await stopTree(runtime,RORIGIN+'/health');
  rtoken='journey-'+randomBytes(12).toString('hex');
  runtime=spawn(PY,[path.join(PYROOT,'py/service/app.py'),'--port',String(RPORT),'--workbench-origin',PAGE,'--results-dir',storeDir],{cwd:PYROOT,env:{...process.env,DATAPASS_RUNTIME_TOKEN:rtoken,DATAPASS_SERVICE_ORIGINS:PAGE},stdio:['ignore','pipe','pipe']});
  runtime.stdout!.on('data',d=>{rlog+=String(d);});runtime.stderr!.on('data',d=>{rlog+=String(d);});
  await waitFor(RORIGIN+'/health',{},()=>rlog);
}
const link=()=>`/?workspace=blank#runtime=${encodeURIComponent(RORIGIN)}&token=${rtoken}`;
function watch(page:Page){
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>{errors.push('dialog: '+d.message());void d.dismiss();});
  page.on('console',m=>{if(/Content Security Policy|Content-Security-Policy/i.test(m.text()))cspConsole.push(m.type()+': '+m.text().slice(0,400));});
  page.on('response',r=>{if(r.request().resourceType()!=='document'||!r.url().startsWith(PAGE+'/'))return;documentsChecked++;
    const h=r.headers();for(const [k,v] of Object.entries(shippedHeaders))if(h[k.toLowerCase()]!==v)headerMismatches.push(`${r.url()} ${k}: ${h[k.toLowerCase()]}`);});
  page.on('request',r=>{const u=r.url();if(u.startsWith(PROBE))return;
    if(u.startsWith(RORIGIN+'/'))runtimeCalls.push(r.method()+' '+new URL(u).pathname);
    if(u.startsWith(JORIGIN+'/')||u.startsWith('ws://127.0.0.1:'+JPORT))jupyterCalls.push(r.method()+' '+new URL(u).pathname);
    if(/^(https?|wss?):/.test(u)&&![PAGE+'/',RORIGIN+'/',JORIGIN+'/','ws://127.0.0.1:'+JPORT+'/'].some(o=>u.startsWith(o)))external.push(u);});
}
async function open(context:BrowserContext,url:string):Promise<Page>{
  const page=await context.newPage();watch(page);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:120000});
  const consent=page.getByTestId('runtime-consent');
  await expect(consent).toContainText(RORIGIN);
  await consent.getByRole('button',{name:'Connect'}).click();
  await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','connected');
  await expect(page.getByTestId('notebook-files')).toHaveAttribute('data-store','ready');
  return page;
}
async function filesUnder(dir:string):Promise<string[]>{const out:string[]=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await filesUnder(p));else out.push(p);}return out;}
async function hashes(dir:string){const m:Record<string,string>={};for(const f of (await filesUnder(dir)).sort())m[path.relative(dir,f).replace(/\\/g,'/')]=sha(await readFile(f));return m;}
const shot=(page:Page,name:string)=>page.screenshot({path:path.join(EVID,name),fullPage:true});
async function saveDownload(page:Page,click:()=>Promise<void>,name:string){
  const dl=page.waitForEvent('download');await click();
  const d=await dl;const buf=await readFile((await d.path())!);
  await writeFile(path.join(EVID,name),buf);return {suggested:d.suggestedFilename(),saved:name,bytes:buf.length,sha256:sha(buf)};
}

test.beforeAll(async({},info)=>{
  PAGE=new URL(String(info.project.use.baseURL)).origin;
  await mkdir(EVID,{recursive:true});
  const rules=parseHeaders(await readFile(path.join(WORKBENCH,'_headers'),'utf8'));
  expect(Object.keys(rules),'single /* rule in the shipped _headers').toEqual(['/*']);
  shippedHeaders=rules['/*'];
  expect(shippedHeaders['Content-Security-Policy']).toContain('connect-src');
  storeDir=await mkdtemp(path.join(os.tmpdir(),'rel0111-store-'));
  kernelDir=await mkdtemp(path.join(os.tmpdir(),'rel0111-kernel-'));
});
test.afterAll(async({browser})=>{
  await stopTree(jupyter,JORIGIN+'/api/status');await stopTree(runtime,RORIGIN+'/health');
  const leaked=[jlog,rlog].some(l=>l.includes(JTOKEN));
  await writeFile(path.join(EVID,'journey01-log.json'),JSON.stringify({journey:'JOURNEY-01 served with its own _headers: '+(process.env.JOURNEY_LABEL||WORKBENCH),page:PAGE,browser:`${browser.browserType().name()} ${browser.version()}`,shippedHeaders,documentsChecked,headerMismatches,cspViolations,cspConsole,steps,errors,external,jupyterTokenInServiceLogs:leaked},null,2));
  await rm(storeDir,{recursive:true,force:true});await rm(kernelDir,{recursive:true,force:true});
});

test('JOURNEY-01 under the shipped _headers: blank -> CSV -> SQL -> approved Python -> result -> chart/table -> save -> close -> reopen',async({browser})=>{
  test.setTimeout(900000);
  await step('start runtime (result store in %TEMP%) and Jupyter Server from py/ (identical to 3575e6b)',async()=>{await startRuntime();await startJupyter();});
  let context=await newContext(browser);
  let page=await step('blank workspace, consent to loopback runtime',async()=>{
    const p=await open(context,link());
    await expect(p).toHaveURL(/workspace=blank$/);
    await expect(p.getByTestId('notebook-empty')).toBeVisible();
    await expect(p.locator('.catalog .asset-row')).toHaveCount(0);
    await shot(p,'j01-01-blank.png');
    steps.push({step:'page title',status:'note',detail:await p.evaluate(()=>document.title),at:new Date().toISOString()});
    return p;});
  const table=await step('import CSV (sample.csv) in Data explorer',async()=>{
    await page.getByRole('button',{name:'Data explorer',exact:true}).click();
    await page.getByLabel('Import data file').setInputFiles(path.join(FIX,'sample.csv'));
    await expect(page.getByRole('heading',{name:'sample.csv',exact:true})).toBeVisible();
    const t=(await page.locator('.dataset-summary .mono').textContent())!.trim();
    await shot(page,'j01-02-csv-imported.png');return t;});
  await page.getByRole('button',{name:'Notebook',exact:true}).click();
  await step('pair Jupyter kernel',async()=>{
    const bar=page.getByTestId('jupyter-bar');
    await bar.getByLabel('Jupyter Server URL').fill(JORIGIN);await bar.getByLabel('Jupyter token').fill(JTOKEN);
    await bar.getByRole('button',{name:'Pair kernel'}).click();
    await expect(bar).toHaveAttribute('data-status','connected',{timeout:60000});});
  const SQL=`SELECT region, sum(amount)::DOUBLE AS total FROM ${table} GROUP BY region ORDER BY region`;
  const q=page.getByTestId('cell').nth(0);
  await step('explicit SQL run on imported data',async()=>{
    await page.getByRole('button',{name:'Add SQL cell'}).click();
    await q.getByLabel('Cell title').fill('Sales by region');
    await q.getByLabel(/^SQL for/).fill(SQL);
    await expect(q).not.toHaveAttribute('data-status','done');
    await q.getByRole('button',{name:/^Run/}).click();
    await expect(q).toHaveAttribute('data-status','done');
    await expect(q.getByTestId('artifact')).toContainText('North');
    await expect(q.getByTestId('artifact')).toContainText('40');});
  await step('chart and table representations (presentation only, no rerun)',async()=>{
    await q.getByRole('group',{name:'Chart this result'}).getByLabel('Y').selectOption('total');
    await q.getByRole('button',{name:'Apply chart'}).click();
    await q.getByLabel('Artifact representation').selectOption({label:'total by region'});
    await expect(q.getByTestId('artifact')).toHaveAttribute('data-representation','chart');
    await expect(q.locator('svg').first()).toBeVisible();
    await shot(page,'j01-03-sql-chart.png');
    const opts=await q.getByLabel('Artifact representation').locator('option').allTextContents();
    await q.getByLabel('Artifact representation').selectOption({index:0});
    await expect(q.getByTestId('artifact')).toHaveAttribute('data-representation','table');
    await expect(q.getByTestId('artifact')).toContainText('South');
    return {representations:opts};});
  const sqlArtifact=await step('export the SQL result as datapass.artifact JSON',async()=>
    saveDownload(page,()=>q.getByRole('button',{name:'Export artifact JSON'}).click(),'export-sql-result.artifact.json'));
  const m=page.getByTestId('cell').nth(1);
  const modelRun=await step('explicit Python run on the approved runtime (allowlisted model)',async()=>{
    await page.getByRole('button',{name:'Add Python cell'}).click();
    await m.getByRole('button',{name:/^Run/}).click();
    await expect(m).toHaveAttribute('data-status','done',{timeout:60000});
    const id=(await m.locator('.cell-result .footnote .mono').first().textContent())!;
    expect(id).toMatch(/^run-[0-9a-f]{16}$/);
    await expect(m.getByTestId('artifact')).toBeVisible();
    return {runId:id,artifactId:await m.getByTestId('artifact').getAttribute('data-artifact-id')};});
  const modelArtifact=await step('export the approved-Python result as datapass.artifact JSON',async()=>
    saveDownload(page,()=>m.getByRole('button',{name:'Export artifact JSON'}).first().click(),'export-python-model.artifact.json'));
  const j=page.getByTestId('cell').nth(2);
  const CODE='import math\nsynthetic = [{"step": i, "value": round(math.sin(i / 3) * 10, 3)} for i in range(24)]\nprint("SYNTHETIC rows:", len(synthetic))';
  await step('explicit Python run on the paired Jupyter kernel, published as SQL table',async()=>{
    await page.getByRole('button',{name:'Add Python (Jupyter) cell'}).click();
    await j.getByLabel('Cell title').fill('Synthetic rows');
    await j.getByLabel(/^Python for/).fill(CODE);
    await j.getByLabel('Publish variable as SQL table (optional)').fill('synthetic');
    await j.getByRole('button',{name:/^Run/}).click();
    await expect(j).toHaveAttribute('data-status','done',{timeout:90000});
    await expect(j.getByTestId('cell-outputs')).toContainText('SYNTHETIC rows: 24');
    await expect(j.getByTestId('cell-table')).toContainText('step');});
  const s=page.getByTestId('cell').nth(3);
  await step('SQL on the Python result (dependency) and chart',async()=>{
    await page.getByRole('button',{name:'Add SQL cell'}).click();
    await s.getByLabel('Cell title').fill('Buckets');
    await s.getByLabel(/^SQL for/).fill('SELECT step % 4 AS bucket, round(sum(value), 3)::DOUBLE AS total FROM synthetic GROUP BY 1 ORDER BY 1');
    await s.locator('.cell-deps summary').click();
    await s.locator('.cell-deps label').filter({hasText:'Synthetic rows'}).getByRole('checkbox').check();
    await s.getByRole('button',{name:/after 1 dependency$/}).click();
    await expect(s).toHaveAttribute('data-status','done',{timeout:90000});
    await s.getByRole('group',{name:'Chart this result'}).getByLabel('Y').selectOption('total');
    await s.getByRole('button',{name:'Apply chart'}).click();
    await s.getByLabel('Artifact representation').selectOption({label:'total by bucket'});
    await expect(s.locator('svg').first()).toBeVisible();
    await shot(page,'j01-04-python-result-chart.png');});
  const saved=await step('save results + notebook to the result store',async()=>{
    await page.getByRole('button',{name:'Save results to store'}).click();
    await expect(page.getByTestId('workspace-notice')).toContainText(/Saved \d+ results/);
    const notice=await page.getByTestId('workspace-notice').innerText();
    const qSha=(await q.getAttribute('data-result-sha'))!,jSha=(await j.getAttribute('data-result-sha'))!,sSha=(await s.getAttribute('data-result-sha'))!,mSha=await m.getAttribute('data-result-sha');
    for(const x of [qSha,jSha,sSha]){expect(x).toMatch(/^[0-9a-f]{64}$/);expect(sha(await readFile(path.join(storeDir,'results',x+'.json')))).toBe(x);}
    await shot(page,'j01-05-saved.png');
    return {notice,qSha,jSha,sSha,modelCellSha:mSha||null};});
  const storeBefore=await hashes(storeDir);
  await step('close: browser context closed, Jupyter stopped, runtime restarted',async()=>{
    await context.close();await stopTree(jupyter,JORIGIN+'/api/status');jupyter=null;await startRuntime();});
  context=await newContext(browser);
  runtimeCalls=[];jupyterCalls=[];
  page=await open(context,link());
  await step('reopen from store without recomputation',async()=>{
    await page.getByRole('button',{name:'Open from store'}).click();
    await expect(page.getByTestId('cell')).toHaveCount(4);
    const [q2,m2,j2,s2]=[0,1,2,3].map(i=>page.getByTestId('cell').nth(i));
    await expect(q2).toHaveAttribute('data-result-sha',saved.qSha);
    await expect(j2).toHaveAttribute('data-result-sha',saved.jSha);
    await expect(s2).toHaveAttribute('data-result-sha',saved.sSha);
    for(const c of [q2,j2,s2]){await expect(c).toHaveAttribute('data-status','done');await expect(c.getByTestId('cell-message')).toContainText('Not recomputed');await expect(c.locator('.notice.stale')).toHaveCount(0);}
    await expect(q2.getByTestId('artifact')).toContainText('North');
    await expect(j2.getByTestId('cell-outputs')).toContainText('SYNTHETIC rows: 24');
    await expect(s2.locator('svg').first()).toBeVisible();
    // 0.11.0 claim (GUIDE-0.11 section 5): Python model results are saved and reopen without recomputation too.
    expect.soft(saved.modelCellSha,'model cell result saved to store').toMatch(/^[0-9a-f]{64}$/);
    if(saved.modelCellSha){await expect.soft(m2).toHaveAttribute('data-result-sha',saved.modelCellSha);await expect.soft(m2.getByTestId('cell-message')).toContainText('Not recomputed');}
    await shot(page,'j01-06-reopened.png');
    const runs=runtimeCalls.filter(c=>/^POST .*\/runs/.test(c));
    expect(runs,'no model run was submitted on reopen').toEqual([]);
    expect(jupyterCalls,'no Jupyter call on reopen').toEqual([]);
    expect(await hashes(storeDir)).toEqual(storeBefore);
    return {modelCellStatus:await m2.getAttribute('data-status'),modelCellText:(await m2.innerText()).slice(0,300),runtimeCalls:[...new Set(runtimeCalls)],postRuns:runs.length,jupyterCalls:jupyterCalls.length,storeUnchanged:true};});
  await context.close();

  // Cross-app: peer-app-shaped fixtures (FR-04 synthetic mirrors of the Contoso and DataPass React exports).
  context=await newContext(browser);
  page=await context.newPage();watch(page);
  const xImport=await step('cross-app import: Contoso-shape artifact opened in the installed build (?artifact=1)',async()=>{
    await page.goto('/?artifact=1');
    await expect(page.getByTestId('artifact-empty')).toBeVisible();
    const file=path.join(FIX,'interop/contoso-shape.synthetic.artifact.json');
    await page.getByTestId('artifact-file').setInputFiles(file);
    const fixture=JSON.parse(await readFile(file,'utf8'));
    await expect(page.getByTestId('artifact-file-viewer')).toHaveAttribute('data-artifact-id',fixture.id);
    const art=page.getByTestId('artifact');
    await expect(art.locator('tbody tr')).toHaveCount(fixture.payload.rows.length);
    await expect(page.getByTestId('artifact-input-hash')).toHaveText(fixture.provenance.inputHash);
    await shot(page,'j01-07-crossapp-artifact-import.png');
    return {id:fixture.id,rows:fixture.payload.rows.length,fixtureSha256:sha(await readFile(file))};});
  const xExport=await step('cross-app export: re-export that artifact as datapass.artifact JSON',async()=>
    saveDownload(page,()=>page.getByTestId('artifact').getByRole('button',{name:'Export artifact JSON'}).click(),'export-crossapp-contoso.artifact.json'));
  const enforcement=await step('CSP enforced: a non-loopback connect is blocked by connect-src under the shipped _headers',async()=>{
    const before=cspViolations.length;
    await page.evaluate(u=>fetch(u).catch(()=>{}),PROBE);
    await expect.poll(()=>cspViolations.slice(before).some(v=>v.directive==='connect-src'&&v.blocked.startsWith('http://192.0.2.1'))).toBe(true);
    const probe=cspViolations.splice(before); // remove the deliberate probe so only unexpected violations remain
    return {blocked:probe.map(v=>v.directive+' '+v.blocked)};});
  await context.close();
  context=await browser.newContext();
  page=await context.newPage();
  const cerr:string[]=[];page.on('pageerror',e=>cerr.push(e.message));
  const conceptReq:string[]=[];page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))conceptReq.push(r.url());});
  await step('cross-app import: React-shape concept spec in the release concept-viewer.html over file://',async()=>{
    await page.goto(pathToFileURL(VIEWER).href);
    const file=path.join(FIX,'interop/react-shape.synthetic.concept.json');
    await page.getByTestId('concept-file').setInputFiles(file);
    const spec=JSON.parse(await readFile(file,'utf8'));
    await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-spec',spec.id);
    await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-warnings','0');
    for(const n of spec.nodes)await expect(page.locator(`[data-testid=concept-isometric] [data-entity="${n.id}"]`)).toHaveCount(1);
    await page.screenshot({path:path.join(EVID,'j01-08-crossapp-concept-viewer.png')});
    expect(cerr).toEqual([]);expect(conceptReq).toEqual([]);
    return {id:spec.id,nodes:spec.nodes.length,networkRequests:conceptReq.length};});
  await context.close();
  await writeFile(path.join(EVID,'journey01-exports.json'),JSON.stringify({sqlArtifact,modelRun,modelArtifact,xImport,xExport,enforcement},null,2));
  expect(documentsChecked,'workbench documents served and checked').toBeGreaterThan(2);
  expect(headerMismatches,'served headers equal the shipped _headers').toEqual([]);
  expect(cspViolations,'CSP violations during the journey').toEqual([]);
  expect(cspConsole.filter(l=>!l.includes('192.0.2.1')),'CSP console reports during the journey').toEqual([]);
  expect(errors,'browser errors').toEqual([]);
  expect(external,'external requests').toEqual([]);
});

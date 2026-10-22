// F212: the V2 product loop on two consumers, end to end in a real browser against their selected-client builds
// and their approved local producers (the existing py/service runtime plus one allowlisted model each):
// open the client, give parameters, run on the producer, inspect table/chart/metric/explanation, save, compare A/B,
// export a provenance bundle (re-imported in TypeScript and Python), close the browser, restart the producer,
// reopen, and find the same result hashes and the same A/B deltas without recomputation.
// All data is SYNTHETIC. Receipts hold hashes and verdicts only (no tokens, run ids or local paths).
import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'..','..');
const RECEIPTS=process.env.LOOP_RECEIPTS||path.join(ROOT,'qa','V2-LOOP','receipts.json');
const PYTHON=process.env.PYTHON||'python';

type Step={label:string;set:(page:Page)=>Promise<void>};
type Consumer={id:string;site:string;runtimePort:number;serve:string;taskId:string;taskLabel:string;model:string;steps:[Step,Step]};
const setNumber=async(page:Page,label:string,value:number)=>{const input=page.getByLabel(label,{exact:true});await input.fill(String(value));await input.press('Enter');await expect(input).toHaveValue(String(value));};
const setSelect=async(page:Page,label:string,value:string)=>{await page.getByLabel(label,{exact:true}).selectOption(value);};
const CONSUMERS:Consumer[]=[
  {id:'contoso-shape-analytics',site:'http://127.0.0.1:21491',runtimePort:24811,serve:'clients/contoso-shape-analytics/py/serve.py',taskId:'scenario',taskLabel:'Run the scenario on the local producer',model:'contoso-shape-scenario',steps:[
    {label:'price +10%, cost 0%',set:async page=>{await setNumber(page,'Price change (%)',10);await setNumber(page,'Cost change (%)',0);}},
    {label:'price +10%, cost +5%',set:async page=>{await setNumber(page,'Cost change (%)',5);}},
  ]},
  {id:'foil-wind',site:'http://127.0.0.1:21481',runtimePort:24812,serve:'clients/foil-wind/py/serve.py',taskId:'compareRuntime',taskLabel:'Compare on the local producer',model:'foil-wind-compare',steps:[
    {label:'run-2 against run-1',set:async page=>{await setSelect(page,'Run A (reference)','run-1');await setSelect(page,'Run B','run-2');}},
    {label:'run-3 against run-1',set:async page=>{await setSelect(page,'Run B','run-3');}},
  ]},
];
const receipts:Record<string,unknown>[]=[];

// One local producer at a time; on Windows `python` may be a launcher, so the whole tree is stopped.
class Producer{
  private child:ChildProcess|null=null;
  constructor(readonly consumer:Consumer,readonly resultsDir:string){}
  get origin(){return `http://127.0.0.1:${this.consumer.runtimePort}`;}
  async start(token:string){
    let busy=false;try{busy=(await fetch(this.origin+'/health')).ok;}catch{/* free */}
    if(busy)throw new Error(`Port ${this.consumer.runtimePort} already answers: stop the other process first.`);
    let log='';
    this.child=spawn(PYTHON,[this.consumer.serve,'--port',String(this.consumer.runtimePort),'--results-dir',this.resultsDir,'--site',this.consumer.site],
      {cwd:ROOT,env:{...process.env,DATAPASS_RUNTIME_TOKEN:token,DATAPASS_SERVICE_ORIGINS:this.consumer.site,FOIL_EXPORT_DIR:''},stdio:['ignore','ignore','pipe']});
    this.child.stderr!.on('data',d=>{log+=String(d);});
    for(let i=0;i<160;i++){
      if(this.child.exitCode!==null)break;
      try{if((await fetch(this.origin+'/health')).ok)return;}catch{/* starting */}
      await new Promise(r=>setTimeout(r,250));
    }
    throw new Error(`The ${this.consumer.id} producer did not start: ${log.slice(-800)}`);
  }
  async stop(){
    const child=this.child;this.child=null;
    if(child&&child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F']);else child.kill();}
    for(let i=0;i<40;i++){try{await fetch(this.origin+'/health');}catch{return;}await new Promise(r=>setTimeout(r,250));}
    throw new Error('The producer is still answering after it was stopped.');
  }
}

/** The preview sends the client's built CSP (vite.client.config.ts, same policy as dist-clients/<id>/_headers), so the
 *  browser enforces connect-src during the journey: it must name the exact runtime origin, no wildcard. */
async function guard(context:BrowserContext,consumer:Consumer,origin:string){
  const headers=await readFile(path.join(ROOT,'dist-clients',consumer.id,'_headers'),'utf8');
  const csp=/Content-Security-Policy:\s*(.+)/.exec(headers)![1].trim();
  expect(csp,'the client CSP names its exact runtime origin').toContain(`connect-src 'self' ${origin};`);
  expect((await fetch(consumer.site+'/')).headers.get('content-security-policy'),'the preview serves the built CSP').toBe(csp);
  const seen={errors:[] as string[],runtime:[] as string[],external:[] as string[]};
  context.on('page',page=>{
    page.on('pageerror',e=>seen.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')seen.errors.push(m.text());});
  });
  context.on('request',r=>{
    const url=r.url();
    if(url.startsWith(origin+'/'))seen.runtime.push(r.method()+' '+new URL(url).pathname);
    else if(/^https?:/.test(url)&&!url.startsWith(consumer.site+'/'))seen.external.push(url);
  });
  return seen;
}
async function open(context:BrowserContext,consumer:Consumer,origin:string,token:string){
  const page=await context.newPage();
  await page.goto(`${consumer.site}/?page=loop#runtime=${encodeURIComponent(origin)}&token=${token}`);
  const durable=page.getByTestId('durable-runs');
  await expect(durable).toHaveAttribute('data-paired','false');
  await page.getByTestId('durable-consent').getByRole('button',{name:'Connect',exact:true}).click();
  await expect(durable).toHaveAttribute('data-paired','true');
  await expect(durable).toHaveAttribute('data-store','ready');
  expect(page.url(),'the token leaves the address bar').not.toContain(token);
  return page;
}
const savedShas=async(page:Page)=>(await page.getByTestId('durable-saved-run').evaluateAll(els=>els.map(e=>e.getAttribute('data-result-sha')!))).sort();
const tab=(page:Page,name:string)=>page.getByTestId('runs').getByRole('tab',{name,exact:true}).click();
async function metricRows(page:Page){
  const result=page.getByTestId('ab-result');
  return result.locator('table').nth(1).locator('tbody tr').evaluateAll(rows=>rows.map(r=>[...r.children].map(c=>c.textContent!.trim()).join(' | ')));
}
/** Switch every representation of one artifact view; returns the runtime requests made meanwhile (must be none). */
async function representations(page:Page,view:ReturnType<Page['getByTestId']>,runtime:string[]){
  const before=runtime.length,select=view.getByLabel('Artifact representation');
  const ids=await select.locator('option').evaluateAll(o=>o.map(x=>(x as HTMLOptionElement).value));
  for(const id of ids){
    await select.selectOption(id);
    await expect(view).toHaveAttribute('data-representation',id);
    if(/chart/.test(id))await expect(view.locator('svg').first()).toBeVisible();
    if(id==='table')await expect(view.locator('table tbody tr').first()).toBeVisible();
  }
  expect(ids.filter(id=>/chart/.test(id)).length,'a chart view').toBe(1);
  await page.waitForTimeout(300);
  return {views:ids,requests:runtime.slice(before)};
}
function validateTs(file:string){
  const out=spawnSync(process.execPath,['--experimental-strip-types','tests/product-loop/validate-bundle.mjs',file],{cwd:ROOT,encoding:'utf8'});
  expect(out.status,out.stderr).toBe(0);
  return JSON.parse(out.stdout.trim()) as {bundleSha256:string;files:{path:string;sha256:string}[];runs:number};
}
function validatePy(file:string){
  const out=spawnSync(PYTHON,['-I','py/datapass_bundle.py','validate',file],{cwd:ROOT,encoding:'utf8'});
  expect(out.status,out.stderr).toBe(0);
  return JSON.parse(out.stdout.trim()) as {bundleSha256:string;files:{path:string;sha256:string}[]};
}

const runPosts=(seen:{runtime:string[]})=>seen.runtime.filter(r=>r==='POST /api/runtime/v1/runs').length;
/** S03 in the real browser against the real producer, after the saved runs and the export:
 *  1. view-only changes (tabs, run selection, follow latest) send 0 POST /api/runtime/v1/runs;
 *  2. a second run is cancelled while its status answers are HELD by the test (a Playwright route delays them; the
 *     producer itself is untouched): the task ends cancelled, an explicit cancel reaches the producer, nothing is applied;
 *  3. one controlled failure: the test refuses the connection for both submit attempts (route.abort), so the run fails;
 *     both attempts carry the same Idempotency-Key, the failed run stays failed, and the last valid result stays visible
 *     labelled "Previous result — not this run's output". */
async function lifecycleChecks(page:Page,consumer:Consumer,origin:string,seen:{runtime:string[];errors:string[]}){
  const task=page.getByTestId('task-'+consumer.taskId),runs=page.getByTestId('runs');
  const saveNote=await page.getByTestId('durable-save').locator('xpath=..').textContent();
  const lastRun=/Run (run-[0-9a-f]{16})/.exec(saveNote??'')![1];
  // 1. View-only changes.
  const before=runPosts(seen);
  for(const name of ['Compare','Record','Result'])await tab(page,name);
  await runs.getByRole('button',{name:'Inspect run 1',exact:true}).click();
  await expect(runs).toHaveAttribute('data-selected-status','succeeded');
  await runs.getByRole('button',{name:'Follow latest',exact:true}).click();
  await page.waitForTimeout(300);
  expect(runPosts(seen),'a view-only change (tab, selection) sends no run').toBe(before);
  // 2. Cancel a second run.
  let release:()=>void=()=>{};const held=new Promise<void>(r=>{release=r;});
  const statusRoute=new RegExp('^'+origin.replace(/[.]/g,'\\.')+'/api/runtime/v1/runs/run-[0-9a-f]{16}$');
  await page.route(statusRoute,async route=>{if(route.request().method()==='GET')await held;try{await route.continue();}catch{/* the page aborted it */}});
  await page.getByRole('button',{name:consumer.taskLabel,exact:true}).click();
  await expect(task).toHaveText('running');
  await expect.poll(()=>runPosts(seen)).toBe(before+1);
  await expect(page.getByTestId('durable-run-state')).toHaveAttribute('data-state',/queued|running/);
  const cancelsBefore=seen.runtime.filter(r=>r.endsWith('/cancel')).length;
  await page.getByRole('button',{name:'Cancel task',exact:true}).click();
  await expect(task).toHaveText('cancelled');
  await expect.poll(()=>seen.runtime.filter(r=>r.endsWith('/cancel')).length,{message:'an explicit cancel reaches the producer'}).toBe(cancelsBefore+1);
  await expect(page.getByTestId('durable-run-state')).toHaveAttribute('data-state',/cancel-requested|cancelled|succeeded/);
  const cancelState=await page.getByTestId('durable-run-state').getAttribute('data-state');
  release();await page.unroute(statusRoute);
  await expect(page.getByTestId('durable-previous')).toHaveAttribute('data-run-id',lastRun);
  await expect(runs).toHaveAttribute('data-selected-status','cancelled');
  // 3. One controlled failure.
  const keys:string[]=[];
  const submitRoute=origin+'/api/runtime/v1/runs';
  await page.route(submitRoute,async route=>{if(route.request().method()==='POST'){keys.push(route.request().headers()['idempotency-key']??'');await route.abort('connectionrefused');}else await route.continue();});
  const errorsBefore=seen.errors.length;
  await page.getByRole('button',{name:consumer.taskLabel,exact:true}).click();
  await expect(task).toHaveText('error');
  await page.unroute(submitRoute);
  expect(keys.length,'one submit plus one more attempt, not more').toBe(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);expect(keys[1],'the same Idempotency-Key on the second attempt').toBe(keys[0]);
  const previous=page.getByTestId('durable-previous');
  await expect(previous).toContainText('Previous result — not this run\'s output');
  await expect(previous).toHaveAttribute('data-run-id',lastRun);
  await expect(previous.getByTestId('artifact')).toBeVisible();
  await expect(runs,'the failed run keeps its own outcome').toHaveAttribute('data-selected-status','failed');
  await expect(page.getByTestId('durable-save')).toBeDisabled();
  await expect(page.getByTestId('durable-run-state'),'this submit is shown as failed').toHaveAttribute('data-state','failed');
  expect(seen.errors.slice(errorsBefore).filter(e=>!/ERR_CONNECTION_REFUSED|ERR_ABORTED|Failed to load resource|net::ERR_FAILED/.test(e)),'only the refused connections of the controlled failure').toEqual([]);
  seen.errors.splice(errorsBefore);
  return {viewOnlyRunPosts:0,cancel:{taskState:'cancelled',cancelSent:true,displayState:cancelState},
    failure:{submitAttempts:keys.length,sameIdempotencyKey:true,previousResultLabelled:true,failedRunState:'failed'}};
}

async function loop(browser:Browser,consumer:Consumer){
  const resultsDir=await mkdtemp(path.join(os.tmpdir(),`dp-f212-${consumer.id}-`));
  const producer=new Producer(consumer,resultsDir);
  const tokens=[randomBytes(18).toString('base64url'),randomBytes(18).toString('base64url')];
  try{
    // ---- Session 1: open, parameters, run on the producer, inspect, save, A/B, export ----
    await producer.start(tokens[0]);
    const first=await browser.newContext();
    const seen1=await guard(first,consumer,producer.origin);
    const page=await open(first,consumer,producer.origin,tokens[0]);
    await expect(page.getByText(/SYNTHETIC/).first()).toBeVisible();
    await expect(page.getByText('How a result is made',{exact:false}).first()).toBeVisible();
    const task=page.getByTestId('task-'+consumer.taskId);
    const inspected:{step:string;views:string[];requests:number}[]=[];
    for(const step of consumer.steps){
      await step.set(page);
      const posts=seen1.runtime.filter(r=>r==='POST /api/runtime/v1/runs').length;
      await page.getByRole('button',{name:consumer.taskLabel,exact:true}).click();
      await expect(task).toHaveText('ready');
      expect(seen1.runtime.filter(r=>r==='POST /api/runtime/v1/runs').length,'one explicit run on the producer').toBe(posts+1);
      await tab(page,'Result');
      const view=page.getByTestId('runs').getByTestId('artifact').first();
      await expect(view).toBeVisible();
      const r=await representations(page,view,seen1.runtime);
      expect(r.requests,'a representation change sends no runtime request').toEqual([]);
      inspected.push({step:step.label,views:r.views,requests:r.requests.length});
      await expect(page.getByTestId('durable-save')).toBeEnabled();
      await page.getByTestId('durable-save').click();
      await expect(page.getByTestId('durable-notice')).toContainText('Saved run');
    }
    await expect(page.getByTestId('durable-saved-run')).toHaveCount(2);
    const saved=await savedShas(page);
    // Newest first in the list: A is the first saved run, B the second.
    const order=await page.getByTestId('durable-saved-run').evaluateAll(els=>els.map(e=>e.getAttribute('data-result-sha')!));
    const [b,a]=order;
    await tab(page,'Compare');
    const ab=page.getByTestId('ab-comparison');
    await ab.getByLabel('Saved result A').selectOption(a);
    await ab.getByLabel('Saved result B').selectOption(b);
    await page.getByTestId('ab-compare').click();
    await expect(page.getByTestId('ab-result')).toHaveAttribute('data-a',a);
    await expect(page.getByTestId('ab-result')).toHaveAttribute('data-b',b);
    await expect(page.getByTestId('ab-result')).toContainText('Not recomputed');
    const deltas=await metricRows(page);
    expect(deltas.length,'declared metrics give A/B deltas').toBeGreaterThan(0);
    await expect(page.getByTestId('ab-result').getByTestId('artifact')).toBeVisible();
    // Provenance bundle after the sharing review.
    const panel=page.getByTestId('bundle-export');
    await expect(panel).toHaveAttribute('data-run-count','2');
    await page.getByTestId('bundle-reviewed').check();
    const pending=page.waitForEvent('download');
    await page.getByTestId('bundle-export-button').click();
    const file=(await (await pending).path())!;
    const shown=(await page.getByTestId('bundle-exported').getAttribute('data-bundle-sha'))!;
    const text=await readFile(file,'utf8');
    for(const token of tokens)expect(text.includes(token),'no runtime token in the bundle').toBe(false);
    const ts=validateTs(file),py=validatePy(file);
    expect(ts.bundleSha256).toBe(shown);expect(py.bundleSha256).toBe(shown);
    expect(py.files.map(f=>({path:f.path,sha256:f.sha256})),'same file hashes in TypeScript and Python').toEqual(ts.files);
    expect(ts.runs).toBe(2);
    await page.screenshot({path:test.info().outputPath(consumer.id+'-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),{message:'no horizontal page scroll at 390 px'}).toBeLessThanOrEqual(1);
    await page.screenshot({path:test.info().outputPath(consumer.id+'-mobile.png'),fullPage:true});
    expect(seen1.errors,'no browser errors (CSP included)').toEqual([]);
    expect(seen1.external,'only the site and its paired runtime').toEqual([]);
    await page.setViewportSize({width:1440,height:960});
    const lifecycle=await lifecycleChecks(page,consumer,producer.origin,seen1);
    const storage=await first.storageState();
    await first.close();

    // ---- Close: browser context gone, producer restarted (new token, same result store) ----
    await producer.stop();
    await producer.start(tokens[1]);
    const second=await browser.newContext({storageState:storage});
    const seen2=await guard(second,consumer,producer.origin);
    const again=await open(second,consumer,producer.origin,tokens[1]);
    await expect(again.getByTestId('durable-saved-run')).toHaveCount(2);
    expect(await savedShas(again),'same result hashes after the restart').toEqual(saved);
    const reopened:Record<string,string>={};
    for(const sha of [a,b]){
      await again.locator(`[data-testid=durable-saved-run][data-result-sha="${sha}"]`).getByRole('button',{name:'Reopen',exact:true}).click();
      const view=again.getByTestId('durable-reopened');
      await expect(view).toHaveAttribute('data-result-sha',sha);
      await expect(view).toContainText('Not recomputed');
      const r=await representations(again,view.getByTestId('artifact'),seen2.runtime);
      expect(r.requests,'a representation change of a reopened result sends no runtime request').toEqual([]);
      reopened[sha]='Not recomputed';
    }
    await tab(again,'Compare');
    await expect(again.getByTestId('ab-saved-pair')).toBeVisible();
    await again.getByTestId('ab-reopen').click();
    await expect(again.getByTestId('ab-result')).toHaveAttribute('data-a',a);
    await expect(again.getByTestId('ab-result')).toHaveAttribute('data-b',b);
    expect(await metricRows(again),'same A/B deltas after reopen').toEqual(deltas);
    expect(seen2.runtime.filter(r=>r.startsWith('POST /api/runtime/')),'nothing recomputed after reopen').toEqual([]);
    expect(seen2.errors).toEqual([]);expect(seen2.external).toEqual([]);
    await second.close();

    receipts.push({consumer:consumer.id,producer:{script:consumer.serve,model:consumer.model},synthetic:true,
      steps:inspected,savedResultSha256:saved,reopenedAfterRestart:saved.map(sha=>({resultSha256:sha,sameHash:true,state:reopened[sha]})),
      ab:{a,b,metricDeltas:deltas,sameAfterReopen:true},
      bundle:{bundleSha256:shown,files:ts.files,typescript:'valid',python:'valid',tokenFree:true},
      runtimeRunRequestsAfterReopen:0,lifecycle,verdict:'PASS'});
  }finally{
    await producer.stop().catch(()=>{});
    await rm(resultsDir,{recursive:true,force:true});
  }
}

for(const consumer of CONSUMERS)test(`F212 product loop: ${consumer.id}`,async({browser})=>{await loop(browser,consumer);});

test.afterAll(async()=>{
  if(receipts.length!==CONSUMERS.length)return;
  await mkdir(path.dirname(RECEIPTS),{recursive:true});
  await writeFile(RECEIPTS,JSON.stringify({format:'datapass.v2-loop-receipts',version:1,feature:'F212',
    notice:'SYNTHETIC data only. Hashes and verdicts from one run of tests/product-loop/loop.spec.ts; run ids differ per run, so hashes differ between runs. Not a signature, release or validation.',
    consumers:receipts},null,2)+'\n');
});

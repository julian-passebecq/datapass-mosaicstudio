import {test,expect,type Page} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

// Real journeys: DuckDB-WASM in the page and the actual Python runtime (py/service/app.py) on loopback.
const PORT=Number(process.env.DATAPASS_TEST_RUNTIME_PORT||8799);
const TOKEN='journey-token-'+Math.random().toString(36).slice(2,14).padEnd(12,'x');
const ORIGIN=`http://127.0.0.1:${PORT}`;
const LINK=`/?workspace=blank#runtime=${encodeURIComponent(ORIGIN)}&token=${TOKEN}`;
let service:ChildProcess|null=null,errors:string[]=[],external:string[]=[];

async function startService(){
  await stopService();
  service=spawn(process.env.PYTHON||'python',['py/service/app.py','--port',String(PORT),'--workbench-origin','http://127.0.0.1:4173'],{env:{...process.env,DATAPASS_RUNTIME_TOKEN:TOKEN},stdio:['ignore','ignore','pipe']});
  let log='';service.stderr!.on('data',d=>{log+=String(d);});
  for(let i=0;i<120;i++){
    try{const r=await fetch(ORIGIN+'/health');if(r.ok)return;}catch{/* starting */}
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error('The runtime did not start: '+log.slice(-800));
}
// On Windows `python` may be a launcher with a child interpreter: stop the whole tree, then confirm the port is closed.
async function stopService(){
  if(service&&service.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(service.pid),'/T','/F']);else service.kill();}
  service=null;
  for(let i=0;i<40;i++){try{await fetch(ORIGIN+'/health');}catch{return;}await new Promise(r=>setTimeout(r,250));}
  throw new Error('The runtime is still answering after it was stopped.');
}
async function ready(page:Page,url:string){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
}
test.beforeEach(async({page})=>{
  errors=[];external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const u=r.url();if(/^https?:/.test(u)&&!u.startsWith('http://127.0.0.1:4173/')&&!u.startsWith(ORIGIN+'/'))external.push(u);});
});
test.afterEach(()=>{expect(errors,'Unhandled browser exceptions').toEqual([]);expect(external,'Only the page origin and the consented loopback runtime').toEqual([]);});
test.afterAll(async()=>{await stopService();});

test('UX01 blank workspace: no forced dataset, real SQL, chart, artifact export, reload',async({page},info)=>{
  await ready(page,'/');
  await expect(page.getByTestId('notebook-empty')).toBeVisible();
  await expect(page.locator('.catalog .asset-row')).toHaveCount(0);
  await expect(page.locator('.header-context')).toContainText('Blank local workbench');
  await page.getByRole('button',{name:'Data explorer',exact:true}).click();
  await expect(page.getByTestId('blank-data')).toBeVisible();
  await page.getByLabel('Import data file').setInputFiles(path.resolve('tests/fixtures/sample.csv'));
  await expect(page.getByRole('heading',{name:'sample.csv',exact:true})).toBeVisible();
  const table=(await page.locator('.dataset-summary .mono').textContent())!.trim();
  await page.getByRole('button',{name:'Notebook',exact:true}).click();
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  const cell=page.getByTestId('cell').first();
  await cell.getByLabel(/^SQL for/).fill(`SELECT region, sum(amount)::DOUBLE AS total FROM ${table} GROUP BY region ORDER BY region`);
  await cell.getByRole('button',{name:/^Run/}).click();
  await expect(cell).toHaveAttribute('data-status','done');
  await expect(cell.locator('.cell-types')).toContainText('total');
  await expect(cell.getByTestId('artifact')).toContainText('North');
  await cell.getByRole('group',{name:'Chart this result'}).getByLabel('Y').selectOption('total');
  await cell.getByRole('button',{name:'Apply chart'}).click();
  await cell.getByLabel('Artifact representation').selectOption({label:'total by region'});
  await expect(cell.getByTestId('artifact')).toHaveAttribute('data-representation','chart');
  await expect(cell.locator('svg').first()).toBeVisible();
  const download=page.waitForEvent('download');
  await cell.getByRole('button',{name:'Export artifact JSON'}).click();
  const artifact=JSON.parse(await readFile((await (await download).path())!,'utf8'));
  expect(artifact).toMatchObject({format:'datapass.artifact',version:1,payload:{kind:'table',rowKey:'row'}});
  expect(artifact.payload.rows.map((r:{region:string;total:number})=>[r.region,r.total])).toEqual([['North',40],['South',20]]);
  expect(artifact.representations.map((r:{kind:string})=>r.kind)).toEqual(['table','chart','json']);
  await page.screenshot({path:info.outputPath('notebook-sql.png'),fullPage:true});
  await page.waitForTimeout(600); // autosave debounce
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
  await expect(page.getByTestId('workspace-notice')).toContainText('sample.csv');
  const restored=page.getByTestId('cell').first();
  await expect(restored.getByLabel(/^SQL for/)).toHaveValue(/sum\(amount\)/);
  await expect(restored).toContainText('Not run in this session');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.screenshot({path:info.outputPath('notebook-mobile.png'),fullPage:true});
});

test('UX02 Python through the real runtime: consent, run, representations, new run, history, dependent SQL, cancel',async({page},info)=>{
  await startService();
  await ready(page,LINK);
  await expect(page).toHaveURL(/workspace=blank$/); // the token left the address bar
  const consent=page.getByTestId('runtime-consent');
  await expect(consent).toContainText(ORIGIN);
  await consent.getByRole('button',{name:'Connect'}).click();
  await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','connected');
  await expect(page.getByTestId('runtime-bar')).toContainText('2 models');
  await page.getByRole('button',{name:'Add Python cell'}).click();
  const py=page.getByTestId('cell').first();
  await py.getByLabel('Output table (optional)').fill('wind_runs');
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','done',{timeout:30000});
  const firstRun=(await py.locator('.cell-result .footnote .mono').first().textContent())!;
  expect(firstRun).toMatch(/^run-[0-9a-f]{16}$/);
  for(const label of ['AEP by hub height','AEP vs hub height','AEP at selected hub height']){
    await py.getByLabel('Artifact representation').selectOption({label});
    await expect(py.getByTestId('artifact')).toHaveAttribute('data-artifact-id','wind-reference-run');
  }
  await expect(py.locator('.cell-result .footnote .mono').first()).toHaveText(firstRun); // changing the view did not rerun
  await py.getByLabel(/Hub height/).fill('150');
  await expect(py.locator('.notice.stale')).toContainText('changed');
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py.locator('.cell-result .footnote .mono').first()).not.toHaveText(firstRun,{timeout:30000});
  await expect(py.locator('.cell-history summary')).toContainText('Run history (2)');
  // A SQL cell that depends on the Python cell reads its output table; Run executes the plan in order.
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  const sql=page.getByTestId('cell').nth(1);
  await sql.getByLabel(/^SQL for/).fill('SELECT count(*)::INTEGER AS cases, max(aep) AS best_aep FROM wind_runs');
  await sql.locator('.cell-deps summary').click();
  await sql.locator('.cell-deps').getByRole('checkbox').check();
  const runAll=sql.getByRole('button',{name:/after 1 dependency$/});
  await expect(runAll).toHaveText('Run (2 cells)');
  await runAll.click();
  await expect(sql).toHaveAttribute('data-status','done',{timeout:30000});
  await expect(sql.getByTestId('artifact')).toContainText('cases');
  await expect(sql.getByTestId('artifact').locator('tbody td').nth(2)).toHaveText(/^[0-9,]+(\.[0-9]+)?$/); // DECIMAL stays numeric
  await expect(py.locator('.cell-history summary')).toContainText('Run history (3)');
  // Cancel a long, real grid computation.
  await page.getByRole('button',{name:'Add Python cell'}).click();
  const grid=page.getByTestId('cell').nth(2);
  await grid.getByLabel('Model',{exact:true}).selectOption('wind-weibull-grid');
  await grid.getByLabel(/Grid points per axis/).fill('80');
  await grid.getByRole('button',{name:/^Run/}).click();
  await grid.getByRole('button',{name:'Cancel'}).click();
  await expect(grid).toHaveAttribute('data-status',/cancelled|done/,{timeout:30000});
  const status=await grid.getAttribute('data-status');
  if(status==='cancelled')await expect(grid.locator('.notice.error')).toContainText('cancelled on the runtime');
  else await expect(page.locator('.notebook > .notice.error')).toContainText('already finished');
  await page.screenshot({path:info.outputPath('notebook-python.png'),fullPage:true});
  // Reload: run references persist; the result is re-fetched by run id, not recomputed; the token stays in the tab session.
  await page.waitForTimeout(600);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','connected');
  const again=page.getByTestId('cell').first();
  await again.locator('.cell-history summary').click();
  await again.locator('.cell-history').getByRole('button',{name:'Load result'}).first().click();
  await expect(again).toContainText('Re-fetched result of earlier run');
  const stored=await page.evaluate(()=>localStorage.getItem('datapass.workspace')||'');
  expect(stored).not.toContain(TOKEN);
  expect(stored).not.toContain('"rows"');
});

test('UX04 failures are explicit: stopped runtime, refused token, invalid import; the last result is not called live',async({page})=>{
  await startService();
  await ready(page,LINK);
  await page.getByTestId('runtime-consent').getByRole('button',{name:'Connect'}).click();
  await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','connected');
  await page.getByRole('button',{name:'Add Python cell'}).click();
  const py=page.getByTestId('cell').first();
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','done',{timeout:30000});
  await stopService();
  await py.getByRole('button',{name:/^Run/}).click();
  await expect(py).toHaveAttribute('data-status','error',{timeout:30000});
  await expect(py.locator('.notice.error').first()).toContainText('unreachable');
  await expect(py.locator('.previous-result')).toContainText('not live');
  await expect(page.getByTestId('runtime-bar')).toHaveAttribute('data-status','unavailable');
  // A refused token is a denial, not a silent fallback.
  await startService();
  await page.goto(`/?workspace=blank#runtime=${encodeURIComponent(ORIGIN)}&token=wrong-token-0123456789`,{waitUntil:'domcontentloaded'});
  await page.getByTestId('runtime-consent').getByRole('button',{name:'Connect'}).click();
  await expect(page.getByTestId('runtime-bar')).toContainText('refused the token');
  // A remote origin in a link is refused before any request.
  await page.goto(`/?workspace=blank#runtime=${encodeURIComponent('http://example.com:8765')}&token=${TOKEN}`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.notebook > .notice.error')).toContainText('loopback');
  // An invalid workspace import changes nothing.
  const before=await page.getByTestId('cell').count();
  await page.getByLabel('Import workspace file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'datapass.workspace',version:1,notebook:{cells:[{id:'x',kind:'shell'}]}}))});
  await expect(page.locator('.global-error')).toContainText('nothing changed');
  await expect(page.getByTestId('cell')).toHaveCount(before);
});

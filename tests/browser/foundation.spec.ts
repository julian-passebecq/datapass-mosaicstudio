import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let errors:string[]=[],external:string[]=[],heavy:string[]=[];
const button=(page:Page,name:string)=>page.getByRole('button',{name,exact:true});
async function open(page:Page,section='runs'){await page.goto('/?app=foundation-reference&page='+section);await expect(page.locator('.studio-site[data-app-id="foundation-reference"]')).toBeVisible();}
async function evaluate(page:Page,gain:string){await page.getByLabel('Gain',{exact:true}).fill(gain);await page.getByLabel('Gain',{exact:true}).press('Enter');await button(page,'Evaluate example').click();await expect(page.getByTestId('task-evaluate')).toHaveText('ready');await expect(page.getByTestId('artifact')).toBeVisible();}
test.beforeEach(async({page})=>{errors=[];external=[];heavy=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4173/'))external.push(r.url());if(/\.wasm|\/duckdb\/|SceneViewport-|Scene3D-/.test(r.url()))heavy.push(r.url());});});
test.afterEach(async({},info)=>{await info.attach('foundation-diagnostics',{body:JSON.stringify({errors,external,heavy},null,2),contentType:'application/json'});expect(errors).toEqual([]);expect(external).toEqual([]);expect(heavy).toEqual([]);});

test('one computation produces table chart and metric without rerunning it',async({page},info)=>{
  await open(page);await expect(page.getByTestId('runs')).toHaveAttribute('data-run-count','0');await evaluate(page,'2');
  await expect(page.getByTestId('runs')).toHaveAttribute('data-run-count','1');
  await expect(page.getByTestId('artifact').locator('svg').first()).toBeVisible();
  await page.getByLabel('Artifact representation').selectOption('table');await expect(page.locator('.foundation-artifact tbody tr')).toHaveCount(12);
  await page.getByLabel('Artifact representation').selectOption('metric');await expect(page.getByTestId('metric-metric')).toContainText('24');
  await page.getByLabel('Artifact representation').selectOption('json');await expect(page.locator('.foundation-artifact pre')).toContainText('sample-11');
  await expect(page.getByTestId('runs')).toHaveAttribute('data-run-count','1');
  await page.getByLabel('Artifact representation').selectOption('curve');await page.screenshot({path:info.outputPath('foundation-result.png'),fullPage:true});
});
test('captured runs compare exact input and output changes without corrupting earlier results',async({page},info)=>{
  await open(page);await evaluate(page,'1');await evaluate(page,'3');await expect(page.getByTestId('runs')).toHaveAttribute('data-run-count','2');
  await page.getByRole('tab',{name:'Compare',exact:true}).click();await expect(page.getByTestId('run-comparison')).toContainText('gain');
  const metrics=page.getByTestId('run-comparison').locator('table').nth(1);await expect(metrics).toContainText('12');await expect(metrics).toContainText('36');await expect(metrics).toContainText('24');
  await page.screenshot({path:info.outputPath('foundation-comparison.png'),fullPage:true});
  await button(page,'Inspect run 1').click();await page.getByRole('tab',{name:'Result',exact:true}).click();await page.getByLabel('Artifact representation').selectOption('metric');await expect(page.getByTestId('metric-metric')).toContainText('12');
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Navigation',exact:true}).click();await expect(page.getByTestId('semantic-navigation')).toBeVisible();
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Results',exact:true}).click();await expect(page.getByTestId('runs')).toHaveAttribute('data-run-count','2');await expect(button(page,'Inspect run 1')).toHaveAttribute('aria-pressed','true');
});
test('failed and cancelled runs never display a previous successful artifact',async({page})=>{
  await open(page);await evaluate(page,'1');await page.getByLabel('Demonstrate a model error').check();await button(page,'Evaluate example').click();await expect(page.getByTestId('task-evaluate')).toHaveText('error');await expect(page.getByTestId('runs')).toHaveAttribute('data-selected-status','failed');await expect(page.getByTestId('artifact')).toHaveCount(0);
  await page.getByLabel('Demonstrate a model error').uncheck();await button(page,'Evaluate example').click();await button(page,'Cancel task').click();await expect(page.getByTestId('runs')).toHaveAttribute('data-selected-status','cancelled');await expect(page.getByTestId('artifact')).toHaveCount(0);
  await button(page,'Inspect run 1').click();await expect(page.getByTestId('artifact')).toBeVisible();
});
test('run export is explicitly reviewed and separate from saved UI values',async({page})=>{
  await open(page);await evaluate(page,'2');await page.getByRole('tab',{name:'Record',exact:true}).click();await expect(button(page,'Export selected run JSON')).toBeDisabled();
  await page.getByLabel('I reviewed the captured inputs and result data for sharing.').check();let pending=page.waitForEvent('download');await button(page,'Export selected run JSON').click();let file=await pending;const run=JSON.parse(await readFile((await file.path())!,'utf8'));expect(run.format).toBe('datapass.run');expect(run.parameters).toEqual({gain:2,'reject-run':false});expect(run.artifact.payload.rows[11].value).toBe(24);
  await page.locator('.site-session summary').click();pending=page.waitForEvent('download');await button(page,'Export inputs').click();file=await pending;const state=JSON.parse(await readFile((await file.path())!,'utf8'));expect(state.format).toBe('datapass.web-state');expect(JSON.stringify(state)).not.toContain('sample-11');expect(state).not.toHaveProperty('artifact');
});
test('projection and facet changes preserve semantic identity with no model execution',async({page},info)=>{
  await open(page,'navigation');await button(page,'Inspect External API').click();await page.getByLabel('Navigation depth').selectOption('evidence');
  for(const label of ['Dependency view','Inventory','Orbit']){await page.getByRole('tab',{name:label,exact:true}).click();await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-selection','external-api');await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-depth','evidence');}
  await page.getByLabel('Navigation facet').selectOption('internal');await expect(page.getByRole('region',{name:'Context inspector'})).toContainText('No; selection is preserved');await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-selection','external-api');
  await page.getByLabel('Navigation facet').selectOption('system');await page.screenshot({path:info.outputPath('foundation-navigation.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Results',exact:true}).click();await expect(page.getByTestId('runs')).toHaveAttribute('data-run-count','0');
});
test('view links restore only bounded IDs and invalid combined saved context changes nothing',async({page})=>{
  await open(page,'navigation');await button(page,'Inspect Calculation').click();await page.getByLabel('Navigation depth').selectOption('focus');await page.getByRole('tab',{name:'Inventory',exact:true}).click();const link=await page.getByRole('link',{name:'Open this view link'}).getAttribute('href');await page.goto(link!);await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-selection','calculation');await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-projection','list');
  await page.locator('.site-session summary').click();const pending=page.waitForEvent('download');await button(page,'Export inputs').click();const saved=JSON.parse(await readFile((await(await pending).path())!,'utf8'));saved.values['nav-selection']='none';saved.values['nav-depth']='evidence';
  await page.getByLabel('Restore saved site inputs').setInputFiles({name:'bad-context.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.getByRole('alert')).toContainText('Select an entity');await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-selection','calculation');
});
test('source search returns exact line evidence and context begins excluded',async({page},info)=>{
  await open(page,'knowledge');await page.getByLabel('Search approved sources').fill('gain');await button(page,'Search sources').click();const hit=page.getByTestId('source-search-results').getByRole('button').first();await hit.click();await expect(page.locator('.source-lines [data-highlight=true]')).toHaveCount(1);
  await page.getByRole('tab',{name:'Context for AI',exact:true}).click();await button(page,'Prepare local context').click();const initial=JSON.parse((await page.getByTestId('prepared-context').textContent())!);expect(initial.entries).toHaveLength(0);expect(initial.omitted).toHaveLength(2);
  await page.getByLabel('Context mode model-source').selectOption('summary');await button(page,'Prepare local context').click();const data=JSON.parse((await page.getByTestId('prepared-context').textContent())!);expect(data.entries).toHaveLength(1);expect(data.entries[0].mode).toBe('summary');expect(data.entries[0].references).toEqual([]);
  await page.screenshot({path:info.outputPath('foundation-knowledge-context.png'),fullPage:true});
  const pending=page.waitForEvent('download');await button(page,'Export prepared context JSON').click();const downloaded=await readFile((await(await pending).path())!,'utf8');expect(JSON.parse(downloaded)).toEqual(data);expect(Buffer.byteLength(JSON.stringify(data),'utf8')).toBeLessThanOrEqual(4096);
});
test('mobile result and navigation views remain usable without a 3D canvas',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await open(page);await evaluate(page,'2');await page.getByLabel('Artifact representation').selectOption('metric');await expect(page.getByTestId('metric-metric')).toContainText('24');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('foundation-mobile-result.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Navigation',exact:true}).click();await page.getByRole('tab',{name:'Inventory',exact:true}).click();await page.locator('.reference-inventory button').first().click();await expect(page.getByTestId('semantic-navigation')).toHaveAttribute('data-selection','presentation');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.locator('canvas')).toHaveCount(0);
});

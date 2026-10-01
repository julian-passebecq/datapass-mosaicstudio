import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let exceptions:string[]=[],consoleErrors:string[]=[],requests:string[]=[];
test.beforeEach(async({page})=>{
  exceptions=[];consoleErrors=[];requests=[];
  page.on('pageerror',e=>exceptions.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
});
test.afterEach(async({},info)=>{
  await info.attach('framework-diagnostics',{body:JSON.stringify({exceptions,consoleErrors,requests},null,2),contentType:'application/json'});
  expect(exceptions,'Unhandled client exceptions').toEqual([]);
  expect(consoleErrors,'Client console errors').toEqual([]);
  expect(requests.filter(r=>!r.startsWith('http://127.0.0.1:4173/')),'No external network from reference clients').toEqual([]);
  expect(requests.filter(r=>/\/duckdb\/|\.wasm(?:\?|$)/.test(r)),'Web clients must not initialize the workbench database').toEqual([]);
});
async function client(page:Page,id:string,pageId?:string){
  await page.goto('/?app='+id+(pageId?'&page='+pageId:''));
  await expect(page.locator('.studio-site[data-app-id]')).toHaveAttribute('data-app-id',id);
  await expect(page.locator('.module-rail')).toHaveCount(0);
}
async function session(page:Page){if(await page.locator('.site-session').getAttribute('open')===null)await page.locator('.site-session summary').click();}
async function save(page:Page){await session(page);const p=page.waitForEvent('download');await page.getByRole('button',{name:'Export inputs',exact:true}).click();return JSON.parse(await readFile((await(await p).path())!,'utf8'));}
const file=(value:unknown)=>({name:'inputs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
test('business client binds one filter to metrics, original D3 and paginated rows',async({page},info)=>{
  await client(page,'operations-reference');
  await expect(page.getByTestId('metric-observation-count')).toHaveText('48');
  await expect(page.locator('.site-viz svg')).toBeVisible();
  await expect(page.locator('[data-block="rows"] tbody tr')).toHaveCount(10);
  await page.getByLabel('Region filter', {exact:true}).selectOption('North');
  await expect(page.getByTestId('metric-observation-count')).toHaveText('12');
  await expect(page.getByTestId('metric-total-revenue')).toContainText('619,200');
  await page.getByLabel('Next rows in Filtered observations').click();
  await expect(page.locator('[data-block="rows"] tbody tr')).toHaveCount(2);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export CSV',exact:true}).click();
  const csv=await readFile((await(await pending).path())!,'utf8');expect(csv).toContain('North');expect(csv).not.toContain('South');
  await page.screenshot({path:info.outputPath('framework-business.png'),fullPage:true});
  await page.getByRole('button',{name:'Data contract',exact:true}).click();await expect(page.locator('.site-catalog')).toContainText('Bronze');await page.goBack();await expect(page.getByLabel('Region filter',{exact:true})).toHaveValue('North');
});
test('numeric drafts reject invalid values, and empty results are not fake metrics',async({page})=>{
  await client(page,'operations-reference');const input=page.getByRole('spinbutton',{name:'Minimum monthly revenue',exact:false});
  await input.fill('1001');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await expect(page.getByTestId('metric-observation-count')).toHaveText('48');
  await input.fill('200000');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','false');
  await expect(page.getByTestId('metric-observation-count')).toHaveText('0');await expect(page.getByTestId('metric-gross-margin')).toHaveText('Not available');await expect(page.locator('[data-block="rows"]')).toContainText('No matching rows');
});
test('input exports are reviewed and invalid/cross-client restores are atomic',async({page})=>{
  await client(page,'operations-reference');await page.getByLabel('Region filter',{exact:true}).selectOption('West');
  const saved=await save(page);expect(saved).not.toHaveProperty('datasets');expect(saved).not.toHaveProperty('bindings');expect(saved.values.region).toBe('West');
  await page.getByRole('button',{name:'Reset inputs',exact:true}).click();await expect(page.getByLabel('Region filter',{exact:true})).toHaveValue('All');
  await page.getByLabel('Restore saved site inputs').setInputFiles(file(saved));await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Region filter',{exact:true})).toHaveValue('All');
  await page.getByRole('button',{name:'Apply saved inputs',exact:true}).click();await expect(page.getByLabel('Region filter',{exact:true})).toHaveValue('West');
  await page.getByLabel('Restore saved site inputs').setInputFiles(file({...saved,appId:'another-client'}));await expect(page.getByRole('alert')).toContainText('different app');await expect(page.getByLabel('Region filter',{exact:true})).toHaveValue('West');
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();await page.getByLabel('Restore saved site inputs').setInputFiles(file({...saved,values:{...saved.values,minimum:1e99}}));await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('Region filter',{exact:true})).toHaveValue('West');
});
test('real Three renderer, component selection, explode and PNG export',async({page},info)=>{
  await client(page,'wind-reference');await expect(page.locator('.site-render-status')).toHaveText('3D ready');
  const canvas=page.locator('canvas[data-renderer="three-webgl2"]');await expect(canvas).toBeVisible();
  const first=await canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL());expect(first.length).toBeGreaterThan(2000);
  await page.getByRole('group',{name:'Select model component'}).getByRole('button',{name:'Generator',exact:true}).click();await expect(page.getByTestId('scene3d')).toHaveAttribute('data-selection','generator');
  await page.getByLabel('Exploded view',{exact:true}).focus();await page.getByLabel('Exploded view',{exact:true}).press('Home');for(let i=0;i<75;i++)await page.getByLabel('Exploded view',{exact:true}).press('ArrowRight');await expect(page.getByTestId('scene3d')).toHaveAttribute('data-explode','0.75');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Capture PNG',exact:true}).click();const bytes=await readFile((await(await pending).path())!);expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  await page.getByLabel('Camera preset',{exact:true}).selectOption('drivetrain');await page.getByRole('button',{name:'Reset camera',exact:true}).click();
  await page.screenshot({path:info.outputPath('framework-turbine-exploded.png'),fullPage:true});
  const second=await canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL());expect(second).not.toBe(first);
});
test('one VizForge story controls 3D, original figure and narrative; restore pauses it',async({page},info)=>{
  await client(page,'wind-reference');await expect(page.locator('.site-render-status')).toHaveText('3D ready');
  await expect(page.locator('.site-story-figure')).toHaveAttribute('data-scene','assembled');
  await page.getByRole('button',{name:'Next shared scene'}).click();await expect(page.locator('.site-story-controls h2')).toHaveText('Explore the rotor');await expect(page.getByTestId('scene3d')).toHaveAttribute('data-selection','rotor');await expect(page.locator('.site-story-figure')).toHaveAttribute('data-scene','rotor-focus');
  await page.getByRole('button',{name:'Next shared scene'}).click();await expect(page.locator('.site-story-controls h2')).toHaveText('Open the nacelle');await expect(page.getByTestId('scene3d')).toHaveAttribute('data-camera','drivetrain');
  await page.screenshot({path:info.outputPath('framework-shared-story.png'),fullPage:true});
  await page.getByRole('button',{name:'Play story',exact:true}).click();await expect(page.getByRole('button',{name:'Pause story',exact:true})).toBeVisible();
  const saved=await save(page);await page.getByLabel('Restore saved site inputs').setInputFiles(file(saved));await page.getByRole('button',{name:'Apply saved inputs',exact:true}).click();await expect(page.getByRole('button',{name:'Play story',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.getByRole('button',{name:'Play story',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Previous shared scene'}).click();await expect(page.locator('.site-story-figure')).toHaveAttribute('data-scene','rotor-focus');
});
test('client model reacts, explicit task cancels and stale results cannot masquerade as current',async({page},info)=>{
  await client(page,'wind-reference','economics');await expect(page.getByTestId('metric-aep')).toContainText('22,075');await expect(page.getByTestId('task-scenario-check')).toHaveText('idle');
  const before=await page.getByTestId('metric-lcoe').textContent();const cf=page.getByRole('spinbutton',{name:'Capacity factor',exact:false});await cf.fill('50');await cf.press('Enter');await expect(page.getByTestId('metric-lcoe')).not.toHaveText(before!);await expect(page.getByTestId('metric-aep')).toContainText('26,280');
  await page.getByRole('button',{name:'Run scenario check',exact:true}).click();await page.getByRole('button',{name:'Cancel task',exact:true}).click();await expect(page.getByTestId('task-scenario-check')).toHaveText('cancelled');
  await page.getByRole('button',{name:'Run scenario check',exact:true}).click();await expect(page.getByTestId('task-scenario-check')).toHaveText('ready');await expect(page.locator('[data-block="checked-table"] tbody tr')).toHaveCount(2);
  await cf.fill('51');await cf.press('Enter');await expect(page.getByTestId('task-scenario-check')).toHaveText('stale');await expect(page.locator('[data-block="checked-table"]')).toContainText('Run the task');
  await page.screenshot({path:info.outputPath('framework-scenario.png'),fullPage:true});
});
test('architecture client uses the existing artifact viewer, and mobile pages stay bounded',async({page},info)=>{
  await client(page,'architecture-reference');await expect(page.locator('.arch-node')).toHaveCount(8);await page.getByRole('button',{name:'Select Site performance',exact:true}).click();await expect(page.locator('.arch-inspector')).toContainText('2 differences');
  await client(page,'operations-reference');await page.setViewportSize({width:390,height:844});await expect(page.getByLabel('Region filter',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:info.outputPath('framework-mobile-business.png'),fullPage:true});
  await client(page,'wind-reference');await expect(page.locator('.site-render-status')).toHaveText('3D ready');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:info.outputPath('framework-mobile-turbine.png'),fullPage:true});
});
test('WebGL failure is explicit and keeps accessible component explanations',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl2')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  await client(page,'wind-reference');await expect(page.locator('.site-render-status')).toHaveText('3D unavailable');await expect(page.getByRole('button',{name:'Capture PNG',exact:true})).toBeDisabled();await page.getByRole('group',{name:'Select model component'}).getByRole('button',{name:'Tower',exact:true}).click();await expect(page.locator('.site-part-description')).toContainText('raises the rotor');
});

import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
let errors:string[]=[],requests:string[]=[];
const open=async(page:Page)=>{await page.goto('/?app=energy-replay-reference');await expect(page.getByTestId('replay')).toBeVisible();};
test.beforeEach(async({page})=>{errors=[];requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});});
test.afterEach(async({},info)=>{await info.attach('replay-diagnostics',{body:JSON.stringify({errors,requests},null,2),contentType:'application/json'});expect(errors).toEqual([]);expect(requests.filter(r=>!r.startsWith('http://127.0.0.1:4173/'))).toEqual([]);expect(requests.some(r=>/\.wasm|\/duckdb\//.test(r))).toBe(false);});
test('replay starts in 2D, without loading the optional scene or starting a clock',async({page},info)=>{
  await open(page);await expect(page.getByTestId('replay')).toHaveAttribute('data-view','plan');await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','0');await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.replay-trace svg')).toHaveCount(1);await expect(page.locator('.replay-unit')).toHaveCount(3);
  expect(requests.some(r=>/SceneViewport|Scene3D/.test(r))).toBe(false);
  await page.screenshot({path:info.outputPath('energy-plan.png'),fullPage:true});
});
test('one sample coordinates events, signal data, gaps and chart cursor',async({page})=>{
  await open(page);await page.getByLabel('Selected replay installation').selectOption('rig-b');await page.getByLabel('Replay signal').selectOption('power');await page.getByRole('button',{name:'Go to event Missing output sample',exact:true}).click();
  await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','18');await expect(page.getByTestId('replay')).toHaveAttribute('data-time','18');await expect(page.locator('[data-signal=power]')).toHaveAttribute('data-value','missing');await expect(page.locator('.replay-trace')).toHaveAttribute('data-cursor','18');await expect(page.locator('[data-signal=power]')).toContainText('Unavailable');
  await page.getByRole('button',{name:'Go to event Recording resumes after gap',exact:true}).click();await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','25');await expect(page.locator('.replay-message')).toContainText('gap');
  await page.getByLabel('Replay sample position').press('End');await expect(page.getByTestId('replay')).toHaveAttribute('data-time','51');await expect(page.getByRole('button',{name:'Play replay',exact:true})).toBeDisabled();
});
test('play, speed and pause use one finite sample sequence',async({page})=>{
  await open(page);await page.getByLabel('Replay speed').selectOption('4');await page.getByRole('button',{name:'Play replay',exact:true}).click();
  await expect.poll(async()=>Number(await page.getByTestId('replay').getAttribute('data-frame'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Pause replay',exact:true}).click();const index=await page.getByTestId('replay').getAttribute('data-frame');await page.waitForTimeout(350);await expect(page.getByTestId('replay')).toHaveAttribute('data-frame',index!);
  await page.getByRole('button',{name:'Previous replay sample',exact:true}).click();await expect(page.getByTestId('replay')).toHaveAttribute('data-frame',String(Number(index)-1));
});
test('3D is loaded on demand and shares sample/selection with the plan',async({page},info)=>{
  await open(page);await page.getByRole('button',{name:'Next replay sample',exact:true}).click();await page.getByRole('button',{name:'3D scene',exact:true}).click();await expect(page.locator('.site-render-status')).toHaveText('3D ready');
  await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveCount(1);await page.getByLabel('Selected replay installation').selectOption('rig-c');await expect(page.locator('.studio-scene-viewport')).toHaveAttribute('data-selection','rig-c');await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','1');
  await page.getByRole('button',{name:'Next replay sample',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');await expect(page.locator('.replay-trace')).toHaveAttribute('data-cursor','2');
  await page.screenshot({path:info.outputPath('energy-3d.png'),fullPage:true});const download=page.waitForEvent('download');await page.getByRole('button',{name:'Capture PNG',exact:true}).click();expect((await download).suggestedFilename()).toBe('recording-scene.png');
  await page.getByRole('button',{name:'2D plan',exact:true}).click();await expect(page.locator('canvas')).toHaveCount(0);await expect(page.getByTestId('replay')).toHaveAttribute('data-selection','rig-c');await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','2');
});
test('restore stops playback and preserves the exact selected missing sample',async({page})=>{
  await open(page);await page.getByLabel('Selected replay installation').selectOption('rig-b');await page.getByRole('button',{name:'Go to event Missing output sample',exact:true}).click();await page.locator('.site-session summary').click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export inputs',exact:true}).click();const saved=JSON.parse(await readFile((await(await download).path())!,'utf8'));expect(saved.values['energy-frame']).toBe(18);expect(saved.values['energy-selection']).toBe('rig-b');expect(saved).not.toHaveProperty('channels');
  await page.getByRole('button',{name:'Reset inputs',exact:true}).click();await page.locator('.site-session summary').click();await page.getByRole('button',{name:'Play replay',exact:true}).click();
  await page.getByLabel('Restore saved site inputs').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.getByRole('button',{name:'Apply saved inputs',exact:true}).click();
  await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','18');await expect(page.getByRole('button',{name:'Play replay',exact:true})).toBeVisible();await expect(page.locator('[data-signal=power]')).toContainText('Unavailable');
  saved.values['energy-frame']=999;await page.getByLabel('Restore saved site inputs').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.getByRole('alert')).toContainText('invalid number');await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','18');
});
test('reduced motion keeps manual inspection and fallback makes 3D nonessential',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind:string,...args:unknown[]){if(kind==='webgl2')return null;return Reflect.apply(original,this,[kind,...args]);} as typeof original;});
  await open(page);await expect(page.getByRole('button',{name:'Play replay',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Next replay sample',exact:true}).click();await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','1');
  await page.getByRole('button',{name:'3D scene',exact:true}).click();await expect(page.locator('.site-render-status')).toHaveText('3D unavailable');await page.getByRole('button',{name:'2D plan',exact:true}).click();await expect(page.locator('.replay-plan')).toBeVisible();await expect(page.locator('.replay-trace svg')).toHaveCount(1);
});
test('narrow replay keeps controls and current measurements inside the page',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await open(page);await page.getByRole('button',{name:'Select installation Rig B',exact:true}).click();await expect(page.getByTestId('replay')).toHaveAttribute('data-selection','rig-b');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  const boxes=await page.locator('.replay-transport button,.replay-transport select,.replay-scrubber input').evaluateAll(elements=>elements.map(el=>({x:el.getBoundingClientRect().left,r:el.getBoundingClientRect().right})));for(const b of boxes){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.r).toBeLessThanOrEqual(390);}
  await page.screenshot({path:info.outputPath('energy-mobile.png'),fullPage:true});
});

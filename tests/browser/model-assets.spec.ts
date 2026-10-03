import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const url='/?app=model-reference';
const load=async(page:Page)=>{await page.goto(url);await page.getByRole('button',{name:'Load verified 3D model',exact:true}).click();await expect(page.getByText('3D ready',{exact:true})).toBeVisible();};
let errors:string[]=[],requests:string[]=[];
test.beforeEach(async({page})=>{errors=[];requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));});
test.afterEach(async()=>{expect(errors).toEqual([]);expect(requests.filter(u=>/^https?:/.test(u)&&!u.startsWith('http://127.0.0.1:4173/'))).toEqual([]);});

test('outline loads neither geometry nor the optional model renderer',async({page},info)=>{
  await page.goto(url);await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-view','outline');
  await expect(page.locator('.model-outline tbody tr')).toHaveCount(5);await expect(page.locator('canvas')).toHaveCount(0);
  expect(requests.some(u=>u.endsWith('.glb')||u.includes('/ModelViewport-'))).toBe(false);
  await page.screenshot({path:info.outputPath('model-outline.png'),fullPage:true});
});
test('approved GLB loads into the shared renderer with real semantic part ownership',async({page},info)=>{
  await load(page);const canvas=page.locator('canvas[data-renderer=three-webgl2]');await expect(canvas).toHaveCount(1);await expect(canvas).toHaveAttribute('data-model-mode','assembled');
  const positions=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(Object.keys(positions)).toHaveLength(5);expect(positions.plate).toEqual([0,4.25,.25]);
  await page.getByRole('button',{name:'Inspect Oscillating plate',exact:true}).click();await expect(page.locator('[data-context-id=plate]')).toContainText('not a validated engineering profile');
  await page.screenshot({path:info.outputPath('model-assembled.png'),fullPage:true});
});
test('explosion interpolates to exact authored offsets and reassembly preserves identity',async({page},info)=>{
  await load(page);const canvas=page.locator('canvas');await canvas.evaluate(el=>Reflect.set(window,'__modelCanvas',el));
  await page.getByRole('button',{name:'Inspect Oscillating plate',exact:true}).click();await page.getByLabel('Model mode',{exact:true}).selectOption('exploded');
  await expect(canvas).toHaveAttribute('data-animating','false');let p=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(p.plate).toEqual([0,5.75,.95]);expect(p.frame).toEqual([-2,0,-1.5]);
  expect(await canvas.evaluate(el=>Reflect.get(window,'__modelCanvas')===el)).toBe(true);
  await page.screenshot({path:info.outputPath('model-exploded.png'),fullPage:true});
  await page.getByLabel('Model mode',{exact:true}).selectOption('assembled');await expect(canvas).toHaveAttribute('data-animating','false');p=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(p.plate).toEqual([0,4.25,.25]);
  await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-selection','plate');
});
test('wireframe, isolation and cutaway change only the presentation',async({page},info)=>{
  await load(page);const canvas=page.locator('canvas'),initial=await canvas.getAttribute('data-part-positions');
  await page.getByRole('button',{name:'Inspect Conversion module',exact:true}).click();await page.getByLabel('Model mode',{exact:true}).selectOption('isolate');await expect(canvas).toHaveAttribute('data-visible-parts','["module"]');
  await page.getByLabel('Model mode',{exact:true}).selectOption('wireframe');await expect(canvas).toHaveAttribute('data-model-mode','wireframe');await expect(canvas).toHaveAttribute('data-part-positions',initial!);
  await page.screenshot({path:info.outputPath('model-wireframe.png'),fullPage:true});
  await page.getByLabel('Model mode',{exact:true}).selectOption('section');await expect(page.locator('.model-note')).toContainText('no filled cross-section');await expect(canvas).toHaveAttribute('data-model-mode','section');
  await page.getByLabel('Model cutaway position',{exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(canvas).toHaveAttribute('data-part-positions',initial!);
  await page.screenshot({path:info.outputPath('model-cutaway.png'),fullPage:true});
});
test('authored cameras settle despite selected-part changes and can be reset after direct orbit',async({page})=>{
  await load(page);const canvas=page.locator('canvas');await page.getByLabel('Model camera',{exact:true}).selectOption('plate');await page.getByRole('button',{name:'Inspect Carriage',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-camera-position','3.0000,5.5000,8.0000');await expect(canvas).toHaveAttribute('data-animating','false');
  const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+20,{steps:6});await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-camera-position','3.0000,5.5000,8.0000');await page.getByRole('button',{name:'Reset camera',exact:true}).click();await expect(canvas).toHaveAttribute('data-camera-position','3.0000,5.5000,8.0000');
});
test('annotation links, source evidence and saved-state restore use the same IDs',async({page})=>{
  await load(page);await page.getByRole('button',{name:'Plate',exact:true}).click();await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-selection','plate');
  await page.getByRole('button',{name:'Read the geometry boundary design-note:2-3',exact:true}).click();await expect(page.locator('.source-lines [data-highlight=true]')).toHaveCount(2);await expect(page.locator('canvas')).toHaveCount(0);
  await page.locator('.site-session summary').click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export inputs',exact:true}).click();const saved=await readFile((await(await pending).path())!,'utf8');expect(saved).not.toContain('sha256');
  await page.getByRole('button',{name:'Reset inputs',exact:true}).click();await page.getByLabel('Restore saved site inputs').setInputFiles({name:'model.json',mimeType:'application/json',buffer:Buffer.from(saved)});await page.getByRole('button',{name:'Apply saved inputs',exact:true}).click();
  await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-selection','plate');await expect(page.getByLabel('Source file')).toHaveValue('design-note');
});
test('wrong asset identity shows a recoverable error instead of publishing geometry',async({page})=>{
  const bytes=await readFile('clients/model-reference/public/models/model-reference/assembly.glb');bytes[50]^=1;
  await page.route('**/models/model-reference/assembly.glb',r=>r.fulfill({status:200,body:bytes,contentType:'model/gltf-binary'}));
  await page.goto(url);await page.getByRole('button',{name:'Load verified 3D model',exact:true}).click();await expect(page.getByText('Model SHA-256 does not match the approved asset',{exact:true})).toBeVisible();await expect(page.locator('canvas')).toHaveCount(0);
  await page.unroute('**/models/model-reference/assembly.glb');await page.getByRole('button',{name:'Retry 3D',exact:true}).click();await expect(page.getByText('3D ready',{exact:true})).toBeVisible();
});
test('late model responses cannot mount a renderer after leaving the model tab',async({page})=>{
  let release:(()=>void)|undefined;const wait=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/models/model-reference/assembly.glb',async r=>{await wait;await r.continue().catch(()=>{});});
  await page.goto(url);await page.getByRole('button',{name:'Load verified 3D model',exact:true}).click();await expect(page.getByText('Verifying model',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Parts',exact:true}).click();release!();await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-view','outline');await expect(page.locator('canvas')).toHaveCount(0);
});
test('no-WebGL fallback keeps source and part context fully usable',async({page})=>{
  await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl2')return null;return Reflect.apply(native,this,[type,...args]);} as typeof native;});
  await page.goto(url);await page.getByRole('button',{name:'Load verified 3D model',exact:true}).click();await expect(page.getByText('3D unavailable',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Inspect Oscillating plate',exact:true}).click();await expect(page.locator('[data-context-id=plate]')).toBeVisible();await page.getByRole('tab',{name:'Parts',exact:true}).click();await expect(page.locator('.model-outline tbody tr')).toHaveCount(5);
});
test('original story controls drive imported geometry without a new playback engine',async({page})=>{
  await page.goto(url);await page.getByRole('button',{name:'Next shared scene',exact:true}).click();await expect(page.getByText('3D ready',{exact:true})).toBeVisible();await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-selection','plate');
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-position','3.0000,5.5000,8.0000');await page.getByRole('button',{name:'Next shared scene',exact:true}).click();await expect(page.getByTestId('model-workbench')).toHaveAttribute('data-mode','exploded');await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');
});
test('mobile and reduced motion preserve controls without full-page overflow',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await load(page);
  await page.getByLabel('Model mode',{exact:true}).selectOption('exploded');await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');await page.getByRole('button',{name:'Show objects',exact:true}).click();await page.getByRole('button',{name:'Inspect Oscillating plate',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('model-mobile.png'),fullPage:true});
});

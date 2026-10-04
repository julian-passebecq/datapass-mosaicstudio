import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const out='clients/fabric-bricks/qa/captures';
test.beforeAll(async()=>{await mkdir(out,{recursive:true});});
test('gallery lazy-load, kit build, explode, semantic selection and keyboard',async({page})=>{
  const requests:string[]=[],errors:string[]=[];
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?app=fabric-bricks');await expect(page.getByTestId('fabric-experience')).toHaveAttribute('data-screen','gallery');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(requests.filter(u=>/KitModel|SceneViewport|three(?:\.js|[_-])/.test(u))).toEqual([]);
  await page.screenshot({path:out+'/gallery.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Open Lakehouse',exact:true}).press('Enter');
  const canvas=page.locator('canvas[data-renderer=three-webgl2]');await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-animating','false');
  expect(requests.some(u=>u.includes('KitModel'))).toBe(true);
  await page.screenshot({path:out+'/lakehouse-assembled.png',fullPage:true});
  // A real raycast on the roof must update the same identity as the inspector.
  const rect=(await canvas.boundingBox())!;await page.mouse.click(rect.x+rect.width*.5,rect.y+rect.height*.4);
  await expect(page.locator('.fb-part-row[aria-pressed=true]')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.locator('.fb-explode-toggle').click();await expect(canvas).toHaveAttribute('data-animating','false');
  const positions=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(positions['roof-0-0'][1]).toBeCloseTo(5.39);
  await page.screenshot({path:out+'/lakehouse-exploded.png',fullPage:true});
  await page.locator('.fb-part-row').filter({hasText:'Boardwalk tile'}).press('Space');
  await expect(page.getByTestId('kit-model')).toHaveAttribute('data-selection','boardwalk');
  await page.locator('.fb-inspector-tools>button').click();await expect(page.getByTestId('kit-model')).toHaveAttribute('data-isolate','true');
  await page.screenshot({path:out+'/lakehouse-isolated.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'2D',exact:true}).click();await expect(page.locator('.fb-part-row[aria-pressed=true]')).toContainText('Boardwalk tile');
  await page.locator('.fb-illustration [aria-label^="Select Water tile"]').first().press('Enter');
  await page.getByRole('button',{name:'3D',exact:true}).click();await expect(page.getByTestId('kit-model')).toHaveAttribute('data-selection','water');
  const priorCamera=await canvas.getAttribute('data-camera-position');await page.getByRole('button',{name:'Focus selected part',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-animating','false');expect(await canvas.getAttribute('data-camera-position')).not.toBe(priorCamera);
  await expect(page.getByTestId('kit-model')).toHaveAttribute('data-selection','water');
  await page.getByRole('button',{name:'Reset model view',exact:true}).click();await page.getByRole('button',{name:'Build step 1: Foundation',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');
  const early=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(early['roof-0-0'][1]).toBeLessThan(-70);
  await page.getByRole('button',{name:'Build step 6: Trees & details',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');
  await page.getByRole('button',{name:'Back to all kits',exact:true}).click();await expect(page.getByTestId('fabric-experience')).toHaveAttribute('data-screen','gallery');
  expect(errors).toEqual([]);
});
test('secondary concept kits open in the shared viewport and return to the gallery',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?app=fabric-bricks');
  for(const title of ['OneLake','Power BI','Warehouse','Pipeline','Notebook']){
    await page.getByRole('button',{name:'Open '+title,exact:true}).click();await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveCount(1);
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to all kits',exact:true}).click();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test('3D collection, individual piece identity, focus, zoom and reversible isolation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?app=fabric-bricks');await page.getByRole('button',{name:'3D collection',exact:true}).click();
  const canvas=page.locator('canvas[data-renderer=three-webgl2]');await expect(canvas).toBeVisible();await expect(canvas).toHaveAttribute('data-animating','false');
  const collection=JSON.parse((await canvas.getAttribute('data-part-positions'))!);expect(Object.keys(collection)).toHaveLength(6);
  await page.screenshot({path:out+'/collection-3d.png',fullPage:true});
  // Pick a visible kit through actual shared renderer raycasting, not a UI-state injection.
  const box=(await canvas.boundingBox())!;await page.mouse.click(box.x+box.width*.38,box.y+box.height*.35);
  await expect(page.getByTestId('fabric-experience')).toHaveAttribute('data-screen','detail');
  await page.getByRole('button',{name:'Back to all kits',exact:true}).click();await page.getByRole('button',{name:'Open Lakehouse',exact:true}).click();
  await page.getByRole('button',{name:'Pieces (58)',exact:true}).click();await page.getByRole('button',{name:'Select piece roof-0-0',exact:true}).press('Enter');
  await expect(page.getByTestId('kit-model')).toHaveAttribute('data-piece','roof-0-0');await expect(page.getByTestId('selected-piece')).toContainText('lakehouse/roof-0-0');
  await page.locator('.fb-explode-toggle').click();await page.getByRole('button',{name:'Focus selected part',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');
  const focused=(await canvas.getAttribute('data-camera-position'))!.split(',').map(Number);expect(focused[1]).toBeGreaterThan(8);
  await page.locator('.fb-inspector-tools>button').click();
  await page.screenshot({path:out+'/piece-selected.png',fullPage:true});
  await page.getByRole('button',{name:'2D',exact:true}).click();await expect(page.locator('.fb-illustration [aria-pressed=true]')).toHaveCount(1);
  await page.getByRole('button',{name:'3D',exact:true}).click();await expect(page.getByTestId('kit-model')).toHaveAttribute('data-piece','roof-0-0');
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');const far=await canvas.getAttribute('data-camera-position');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(canvas).toHaveAttribute('data-animating','false');expect(await canvas.getAttribute('data-camera-position')).not.toBe(far);
  await page.getByRole('button',{name:'Reset model view',exact:true}).click();await expect(page.getByTestId('kit-model')).toHaveAttribute('data-piece','none');
  expect(errors).toEqual([]);
});
test('narrow responsive layout and reduced motion',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?app=fabric-bricks');await page.getByRole('button',{name:'Open Lakehouse',exact:true}).click();
  await expect(page.getByTestId('fabric-experience')).toHaveAttribute('data-reduced-motion','true');
  const canvas=page.locator('canvas');await expect(canvas).toBeVisible();await page.locator('.fb-explode-toggle').click();await expect(canvas).toHaveAttribute('data-animating','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Back to all kits',exact:true})).toBeVisible();await page.screenshot({path:out+'/lakehouse-mobile.png',fullPage:true});
});

import {test,expect} from '@playwright/test';
let errors:string[]=[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
test.afterEach(async()=>{expect(errors).toEqual([]);});
test('camera framing completes while new signal samples arrive and has an explicit overview',async({page},info)=>{
  await page.goto('/?app=energy-replay-reference');await expect(page.getByTestId('replay')).toBeVisible();await page.getByRole('button',{name:'3D scene',exact:true}).click();await expect(page.locator('.site-render-status')).toHaveText('3D ready');
  await expect(page.locator('.studio-scene-viewport')).toHaveAttribute('data-camera','overview');
  await page.getByLabel('Replay camera framing').selectOption('selection');await page.getByLabel('Selected replay installation').selectOption('rig-c');
  // Deliberately interrupt an in-flight camera move with signal-only changes.
  await page.getByRole('button',{name:'Next replay sample',exact:true}).click();await page.getByRole('button',{name:'Next replay sample',exact:true}).click();
  await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveAttribute('data-camera-position','6.0000,6.0000,12.0000');
  await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');
  await page.getByRole('button',{name:'Go to event Recording resumes after gap',exact:true}).click();
  await expect(page.getByTestId('replay')).toHaveAttribute('data-frame','25');
  await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');
  await page.screenshot({path:info.outputPath('energy-focused-replay.png'),fullPage:true});
  await page.getByLabel('Replay camera framing').selectOption('site');await expect(page.locator('canvas')).toHaveAttribute('data-camera-position','17.0000,16.0000,21.0000');await expect(page.locator('canvas')).toHaveAttribute('data-animating','false');
  await expect(page.getByTestId('replay')).toHaveAttribute('data-selection','rig-c');await expect(page.locator('.replay-trace')).toHaveAttribute('data-cursor','28');
  await page.screenshot({path:info.outputPath('energy-site-replay.png'),fullPage:true});
});

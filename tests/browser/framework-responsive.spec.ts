import {test,expect} from '@playwright/test';
test('3D controls remain fully within the narrow card, not merely within the document',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:390,height:844});await page.goto('/?app=wind-reference');
  await expect(page.locator('.site-render-status')).toHaveText('3D ready');
  const controls=page.locator('.site-scene-controls');
  const geometry=await controls.evaluate(el=>{const box=el.getBoundingClientRect();return {left:box.left,right:box.right,items:[...el.querySelectorAll('input,select')].map(control=>{const r=control.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})};});
  expect(geometry.items).toHaveLength(3);
  for(const item of geometry.items){expect(item.width).toBeGreaterThan(20);expect(item.left).toBeGreaterThanOrEqual(geometry.left);expect(item.right).toBeLessThanOrEqual(geometry.right);}
  await page.getByLabel('Camera preset',{exact:true}).selectOption('drivetrain');await expect(page.getByTestId('scene3d')).toHaveAttribute('data-camera','drivetrain');
  await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveAttribute('data-animating','false');
  await page.screenshot({path:info.outputPath('framework-mobile-controls.png'),fullPage:true});
  expect(errors).toEqual([]);
});

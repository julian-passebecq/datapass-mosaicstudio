import {test,expect} from '@playwright/test';
// F213 / U208: the ?sites catalog labels each built client with its declared status (text, not colour only).
const RULE_17=['wind-reference','operations-reference','architecture-reference','experience-reference','energy-replay-reference','motion-reference','foundation-reference','model-reference'];
for(const viewport of [{width:1440,height:960},{width:375,height:812}])test(`client catalog shows each reference with its status at ${viewport.width}px`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(viewport);
  await page.goto('/?sites=1');
  await expect(page.getByRole('heading',{name:'Reference applications'})).toBeVisible();
  const cards=page.locator('.site-catalog article');
  await expect(cards).toHaveCount(RULE_17.length);
  for(const id of RULE_17){
    const card=page.locator(`.site-catalog article:has(a[href="?app=${id}"])`);
    await expect(card).toHaveAttribute('data-client-status','reference');
    await expect(card.locator('.site-client-status')).toHaveText('reference');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/client-status-${viewport.width}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

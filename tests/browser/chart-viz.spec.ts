import {test,expect} from '@playwright/test';
/** Chart block viz path in a real browser: the flag routes the reference chart through the viz kit,
 * the drawn structure matches the plan (marks, series, domain), and the default stays VizForge. */
test('viz-chart flag draws the operations chart with the viz kit and follows the region filter',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?app=operations-reference&viz-chart=1');
  const svg=page.locator('[data-chart-renderer="viz"] svg[data-testid="chart-regional-chart"]');
  await expect(svg).toHaveAttribute('data-viz-settled','true');
  await expect(svg).toHaveAttribute('data-marks','4');await expect(svg).toHaveAttribute('data-series','1');
  const [lo,hi]=(await svg.getAttribute('data-domain-y'))!.split(':').map(Number);
  expect(lo).toBe(0);expect(hi).toBe(961200);// West: the largest regional revenue (VizForge ranking domain, not niced)
  await page.getByLabel('Region filter',{exact:true}).selectOption('North');
  await expect(svg).toHaveAttribute('data-marks','1');
  expect(errors).toEqual([]);
});
test('without the flag the chart block keeps the VizForge path',async({page})=>{
  await page.goto('/?app=operations-reference');
  await expect(page.locator('.site-viz svg').first()).toBeVisible();
  await expect(page.locator('[data-chart-renderer="viz"]')).toHaveCount(0);
});

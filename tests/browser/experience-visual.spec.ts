import {test,expect} from '@playwright/test';
let errors:string[]=[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
test.afterEach(async()=>{expect(errors).toEqual([]);});
test('original ConceptMotion uses compact geometry and settled non-overlapping stable items',async({page},info)=>{
  await page.goto('/?app=experience-reference&page=method');
  const explanation=page.locator('.site-explanation'),svg=explanation.locator('svg');
  await expect(svg).toHaveAttribute('viewBox','0 0 960 292');
  await page.getByRole('button',{name:'Next explanation frame',exact:true}).click();
  await page.getByRole('button',{name:'Next explanation frame',exact:true}).click();
  await expect(explanation).toHaveAttribute('data-frame','2');
  await expect.poll(()=>explanation.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  const items=await svg.locator('g[data-role=item]').evaluateAll(elements=>elements.map(el=>({id:el.getAttribute('data-item-id'),left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).sort((a,b)=>a.left-b.left));
  expect(items.map(i=>i.id)).toEqual(['b','d','a','c']);
  for(let i=1;i<items.length;i++)expect(items[i].left).toBeGreaterThanOrEqual(items[i-1].right-1);
  const box=await svg.boundingBox();expect(box!.height).toBeLessThan(410);
  await page.screenshot({path:info.outputPath('explorer-compact-explanation.png'),fullPage:true});
});
test('dark analytical views use original VizForge theme and indicators retain natural height',async({page},info)=>{
  await page.goto('/?app=experience-reference');
  await page.getByRole('navigation',{name:'Component outline'}).getByRole('button',{name:'Explore Cloud platform',exact:true}).click();
  const heights=await page.locator('.site-metric').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));expect(heights).toHaveLength(2);expect(Math.max(...heights)).toBeLessThan(180);
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Content signals',exact:true}).click();
  const chart=page.locator('.site-viz[data-theme=dark]');await expect(chart.locator('svg')).toHaveCount(1);
  await expect.poll(()=>chart.locator('.vf-figure').evaluate(el=>getComputedStyle(el).getPropertyValue('--vf-ink').trim())).toBe('#e1ebf5');
  await expect(chart).toContainText('Content by facet');await expect(chart.locator('.vf-entity')).toHaveCount(3);
  await page.screenshot({path:info.outputPath('explorer-dark-analytics.png'),fullPage:true});
});

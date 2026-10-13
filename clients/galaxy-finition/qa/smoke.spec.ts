import {test,expect,type Page} from '@playwright/test';
// Screenshots go to GF_SHOTS when set (inspection only; not committed).
const shots=process.env.GF_SHOTS;
const watch=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));return errors;};
const noHorizontalScroll=async(page:Page)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

for(const [name,viewport] of [['desktop',{width:1440,height:960}],['mobile',{width:390,height:844}]] as const){
  test(`status board renders 13 retained and 5 paused apps (${name})`,async({page})=>{
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
    const errors=watch(page);
    await page.goto('/');
    const tables=page.locator('table');
    await expect(tables).toHaveCount(2);
    await expect(tables.nth(0).locator('tbody tr')).toHaveCount(13);
    await expect(tables.nth(1).locator('tbody tr')).toHaveCount(5);
    await expect(tables.nth(1)).not.toContainText(/vault|registry|http/i);
    await expect(tables.nth(1).locator('tbody tr').filter({hasText:'PAUSED_BY_OWNER'})).toHaveCount(5);
    await expect(page.getByText('Owner-supplied status snapshot').first()).toBeVisible();
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/board-${name}.png`,fullPage:true});
    expect(errors).toEqual([]);
  });
  test(`architecture graph draws every app with its declared edges (${name})`,async({page})=>{
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
    const errors=watch(page);
    await page.goto('/?page=architecture');
    await expect(page.locator('.react-flow__node')).toHaveCount(18);
    await expect(page.locator('.react-flow__edge')).toHaveCount(24);
    await expect(page.getByText('User artifact - unverified').first()).toBeVisible();
    await expect(page.locator('table tbody tr')).toHaveCount(24);
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/architecture-${name}.png`,fullPage:true});
    expect(errors).toEqual([]);
  });
}

test('selected-client build carries no 3D or workbench chunk',async({page})=>{
  const requested:string[]=[];page.on('request',r=>requested.push(r.url()));
  await page.goto('/?page=architecture');
  await expect(page.locator('.react-flow__node')).toHaveCount(18);
  expect(requested.filter(u=>/three|duckdb|sqlrooms|\.wasm/i.test(u))).toEqual([]);
});

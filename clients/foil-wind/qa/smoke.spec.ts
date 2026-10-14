import {test,expect,type Page} from '@playwright/test';
// Works on the placeholder build and on a local-export build: counts come from the page's own runs table.
const shots=process.env.FW_SHOTS;
const watch=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));return errors;};
const noHorizontalScroll=async(page:Page)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

for(const [name,viewport] of [['desktop',{width:1440,height:960}],['mobile',{width:390,height:844}]] as const){
  test(`runs, measurements, SQL and comparison render (${name})`,async({page})=>{
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
    const errors=watch(page);
    await page.goto('/?page=runs');
    await expect(page.getByText('SYNTHETIC data.').first()).toBeVisible();
    await expect(page.getByText(/Data: (HAND-MADE PLACEHOLDER|SYNTHETIC local foil\.export)/).first()).toBeVisible();
    const runRows=page.locator('table').first().locator('tbody tr');
    await expect(runRows.first()).toBeVisible();
    const runs=await runRows.count();
    expect(runs).toBeGreaterThanOrEqual(2);
    await expect(page.locator('[role=alert]')).toHaveCount(0);
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/runs-${name}.png`,fullPage:true});

    await page.goto('/?page=measurements');
    await expect(page.getByTestId('foil-wind-measurements')).toHaveAttribute('data-slot','run-1');
    await expect(page.locator('[data-testid=foil-wind-measurements] table tbody tr').first()).toBeVisible();
    await page.getByLabel('Run to inspect',{exact:true}).selectOption('run-2');
    await expect(page.getByTestId('foil-wind-measurements')).toHaveAttribute('data-slot','run-2');
    await expect(page.getByText(/^run-2: /).first()).toBeVisible();
    await expect(page.locator('[role=alert]')).toHaveCount(0);
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/measurements-${name}.png`,fullPage:true});

    await page.goto('/?page=sql');
    await expect(page.locator('.site-code')).toHaveCount(3);
    await expect(page.locator('.site-code').first()).toContainText('SELECT');
    const sqlTables=page.locator('table');
    await expect(sqlTables).toHaveCount(3);
    await expect(sqlTables.first().locator('tbody tr')).toHaveCount(runs);
    await expect(page.locator('[role=alert]')).toHaveCount(0);
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/sql-${name}.png`,fullPage:true});

    await page.goto('/?page=compare');
    await expect(page.getByTestId('task-compare')).toHaveText('idle');
    await page.getByRole('button',{name:'Compare the two runs'}).click();
    await expect(page.getByTestId('task-compare')).toHaveText('ready');
    await expect(page.locator('table tbody tr')).toHaveCount(7);
    await expect(page.locator('table')).toContainText('Mean power (proxy)');
    await page.getByLabel('Run B',{exact:true}).selectOption('run-1');
    await expect(page.getByTestId('task-compare')).toHaveText('stale');
    await page.getByRole('button',{name:'Compare the two runs'}).click();
    await expect(page.getByTestId('task-compare')).toHaveText('error');
    await expect(page.getByText('Choose two different runs.')).toBeVisible();
    await page.getByLabel('Run B',{exact:true}).selectOption('run-2');
    await page.getByRole('button',{name:'Compare the two runs'}).click();
    await expect(page.getByTestId('task-compare')).toHaveText('ready');
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/compare-${name}.png`,fullPage:true});
    // Reversed pair: B lower than A on several metrics. The chart draws the signed bars (no fallback
    // note, no rank or rank-change column) and the table leads with the direction and the signed %.
    await page.getByLabel('Run A (reference)',{exact:true}).selectOption('run-2');
    await page.getByLabel('Run B',{exact:true}).selectOption('run-1');
    await page.getByRole('button',{name:'Compare the two runs'}).click();
    await expect(page.getByTestId('task-compare')).toHaveText('ready');
    const chart=page.getByTestId('chart-compare-chart');
    await expect(chart).toBeVisible();
    await expect(page.getByText(/nonnegative/)).toHaveCount(0);
    expect(Number((await chart.getAttribute('data-domain-y'))!.split(':')[0])).toBeLessThan(0);
    expect(Number(await chart.getAttribute('data-marks'))).toBeGreaterThan(0);
    await expect(chart.locator('[data-mark=rank], [data-mark=delta]')).toHaveCount(0);
    const head=page.locator('table thead th');
    await expect(head.nth(1)).toContainText('Direction');
    await expect(head.nth(2)).toContainText('B vs A');
    // The signed % must be on screen without scrolling the table sideways, also at 390 px.
    const signed=page.locator('table tbody tr',{hasText:'B lower'}).first().locator('td').nth(2);
    await expect(signed).toContainText('-');
    const box=(await signed.boundingBox())!;
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
    await noHorizontalScroll(page);
    if(shots)await page.screenshot({path:`${shots}/compare-negative-${name}.png`,fullPage:true});
    expect(errors).toEqual([]);
  });
}

test('selected-client build carries no 3D or workbench chunk',async({page})=>{
  const requested:string[]=[];page.on('request',r=>requested.push(r.url()));
  await page.goto('/?page=compare');
  await page.getByRole('button',{name:'Compare the two runs'}).click();
  await expect(page.getByTestId('task-compare')).toHaveText('ready');
  expect(requested.filter(u=>/three|duckdb|sqlrooms|\.wasm/i.test(u))).toEqual([]);
});

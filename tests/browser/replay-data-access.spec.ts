import {test,expect} from '@playwright/test';
test('replay preserves the original accessible table for the plotted observations',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?app=energy-replay-reference');await expect(page.getByTestId('replay')).toBeVisible();
  await page.getByLabel('Selected replay installation').selectOption('rig-b');await page.getByLabel('Replay signal').selectOption('power');
  await page.locator('.replay-trace summary').click();
  const table=page.locator('.replay-trace table');await expect(table).toBeVisible();
  // 49 supplied times minus five missing power observations: no invented rows.
  await expect(table.locator('tbody tr')).toHaveCount(44);await expect(table.locator('caption')).toHaveText('Canonical source data');
  expect(errors).toEqual([]);
});

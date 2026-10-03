import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('the actual downloaded context uses the exact byte-budgeted serialization',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?app=foundation-reference&page=knowledge');
  await page.getByRole('tab',{name:'Context for AI',exact:true}).click();
  await page.getByLabel('Context mode model-source').selectOption('full');
  await page.getByLabel('Context mode architecture-note').selectOption('summary');
  await page.getByRole('button',{name:'Prepare local context',exact:true}).click();
  const declared=Number((await page.getByTestId('context-bytes').innerText()).split(' ')[0]);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export prepared context JSON',exact:true}).click();
  const file=await readFile((await(await pending).path())!);
  expect(file.byteLength).toBe(declared);expect(file.byteLength).toBeLessThanOrEqual(4096);
  expect(JSON.parse(file.toString()).entries).toHaveLength(2);expect(errors).toEqual([]);
});

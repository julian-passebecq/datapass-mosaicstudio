import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * FR-07 release qualification (0.10.0): the first useful task on the production workbench build and the committed
 * standalone concept viewer over file://, in whatever browser the run selects. CI runs it in Chromium; the local
 * Windows qualification also runs it in the installed Microsoft Edge (PW_CHANNEL=msedge, see qa/FR-07-release-packaging.md).
 * Everything here is synthetic: an inline SQL literal and the viewer's bundled reference concept.
 * QUAL_SHOTS=<dir> also writes full-page screenshots of these public synthetic views there.
 */
const SHOTS=process.env.QUAL_SHOTS||'';
const shot=async(page:Page,info:{outputPath:(n:string)=>string},name:string)=>{
  await page.screenshot({path:SHOTS?path.join(SHOTS,name):info.outputPath(name),fullPage:true});
};
function watch(page:Page,allowed:(u:string)=>boolean){
  const errors:string[]=[],external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{const u=r.url();if(/^(https?|wss?):/.test(u)&&!allowed(u))external.push(u);});
  return {errors,external};
}

test('production workbench: blank start, a real DuckDB SQL cell, autosave and reload',async({page,browser,baseURL},info)=>{
  info.annotations.push({type:'browser',description:`${browser.browserType().name()} ${browser.version()}`});
  const origin=new URL(baseURL!).origin;
  const seen=watch(page,u=>u.startsWith(origin+'/'));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
  await expect(page.locator('.header-context')).toContainText('Blank local workbench');
  await expect(page.getByTestId('notebook-empty')).toBeVisible();
  await page.getByRole('button',{name:'Add SQL cell'}).click();
  const cell=page.getByTestId('cell').first();
  await cell.getByLabel(/^SQL for/).fill("SELECT 'synthetic' AS label, 6*7 AS answer");
  await cell.getByRole('button',{name:/^Run/}).click();
  await expect(cell).toHaveAttribute('data-status','done');
  await expect(cell.getByTestId('artifact')).toContainText('42');
  await shot(page,info,'workbench-sql.png');
  await page.waitForTimeout(600); // autosave debounce
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
  const restored=page.getByTestId('cell').first();
  await expect(restored.getByLabel(/^SQL for/)).toHaveValue(/6\*7 AS answer/);
  await expect(restored).toContainText('Not run in this session');
  expect(seen.errors,'Unhandled browser errors').toEqual([]);
  expect(seen.external,'Only the page origin').toEqual([]);
});

test('standalone concept viewer over file://: identifies 0.10.0, renders, makes no network request',async({page},info)=>{
  const html=path.resolve('dist-standalone/concept-viewer.html');
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  expect(await readFile(html,'utf8')).toContain(`DataPass MosaicStudio ${pkg.version} · source commit`);
  const seen=watch(page,()=>false);
  await page.goto(pathToFileURL(html).href);
  const viewer=page.getByTestId('concept-viewer');
  await expect(viewer).toHaveAttribute('data-spec','forecast-app');
  await expect(viewer).toHaveAttribute('data-warnings','0');
  await expect(page.locator('[data-testid=concept-isometric] [data-entity]').first()).toBeVisible();
  await shot(page,info,'concept-viewer-file.png');
  expect(seen.errors,'Unhandled browser errors').toEqual([]);
  expect(seen.external,'No network request from the standalone file').toEqual([]);
});

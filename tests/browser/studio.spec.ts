import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
let errors:string[]=[],consoleErrors:string[]=[],externalRequests:string[]=[];
test.beforeEach(async({page})=>{
 errors=[];consoleErrors=[];externalRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4173/'))externalRequests.push(r.url());});
});
test.afterEach(async({},info)=>{
 await info.attach('runtime-diagnostics',{body:JSON.stringify({errors,consoleErrors,externalRequests},null,2),contentType:'application/json'});
 expect(errors,'Unhandled browser exceptions').toEqual([]);
 expect(externalRequests,'No CDN, telemetry or upload requests from the app').toEqual([]);
});
async function start(page:Page,url='/'){
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
}
async function pipelineDownload(page:Page){
 const pending=page.waitForEvent('download');
 await page.locator('.pipeline-panel').getByRole('button',{name:'Export draft',exact:true}).click();
 const file=await pending;
 return JSON.parse(await readFile((await file.path())!,'utf8'));
}
test('real rows, schema, profile, CSV and Parquet metadata',async({page},info)=>{
 await start(page);
 await expect(page.locator('.results tbody tr')).toHaveCount(100);
 await page.getByRole('button',{name:'Next rows'}).click();
 await expect(page.locator('.pagination')).toContainText('101 - 200');
 await page.getByRole('tab',{name:'Schema',exact:true}).click();
 await expect(page.locator('.results')).toContainText('column_type');
 await page.getByRole('tab',{name:'Profile',exact:true}).click();
 await expect(page.locator('.results')).toContainText('null_percentage');
 await page.getByLabel('Import data file').setInputFiles(path.resolve('tests/fixtures/sample.csv'));
 await expect(page.getByRole('heading',{name:'sample.csv',exact:true})).toBeVisible();
 await expect(page.locator('.results tbody tr')).toHaveCount(3);
 await expect(page.locator('.results')).toContainText('North');
 await page.getByLabel('Import data file').setInputFiles(path.resolve('tests/fixtures/sample.parquet'));
 await expect(page.getByRole('heading',{name:'sample.parquet',exact:true})).toBeVisible();
 await expect(page.locator('.results tbody tr')).toHaveCount(3);
 await page.getByRole('tab',{name:'Parquet metadata',exact:true}).click();
 await expect(page.locator('.results')).toContainText('num_rows');
 await page.screenshot({path:info.outputPath('parquet-inspector.png'),fullPage:true});
 await page.reload();
 await expect(page.locator('.results tbody tr')).toHaveCount(100);
 await expect(page.locator('.asset-row')).toHaveCount(1);
});
test('SQLRooms editor runs actual local SQL',async({page},info)=>{
 await start(page,'/?module=sql');
 const editor=page.locator('.cm-content').first();
 await editor.fill('SELECT count(*) AS row_count FROM operations;');
 await editor.press('ControlOrMeta+Enter');
 await expect(page.locator('.sql-editor-host').getByText('360',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('sql-workspace.png'),fullPage:true});
});
test('Mosaic cross-filters the table with the plotted marks',async({page},info)=>{
 await start(page,'/?module=linked');
 await expect(page.locator('.linked-table')).toContainText('360 of 360 rows');
 const bars=page.locator('.chart-card svg g[aria-label="bar"] rect');
 await expect(bars).toHaveCount(4);
 await bars.first().click();
 await expect(page.locator('.linked-table')).toContainText('90 of 360 rows');
 await page.screenshot({path:info.outputPath('linked-views.png'),fullPage:true});
 await bars.first().click();
 await expect(page.locator('.linked-table')).toContainText('360 of 360 rows');
});
test('pipeline edit, drag, validation, inert import and actual download',async({page},info)=>{
 await start(page,'/?module=pipeline');
 const nodes=page.locator('.react-flow__node');
 await expect(nodes).toHaveCount(4);
 const first=nodes.first();const box=await first.boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+40,box!.y+35);await page.mouse.down();await page.mouse.move(box!.x+75,box!.y+75,{steps:8});await page.mouse.up();
 const moved=await pipelineDownload(page);expect(moved.activities[0].x).not.toBe(40);
 await page.locator('.pipeline-toolbar').getByRole('button',{name:'Check',exact:true}).click();
 await expect(nodes).toHaveCount(5);
 const before=await pipelineDownload(page);
 await page.getByLabel('Import pipeline definition').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
 await expect(page.locator('.global-error')).toBeVisible();
 expect(await pipelineDownload(page)).toEqual(before);
 await page.getByRole('button',{name:'Dismiss error'}).click();
 const adf={name:'Reviewed pipeline',properties:{activities:[{name:'Read',type:'Copy'},{name:'Inspect',type:'Script',dependsOn:[{activity:'Read',dependencyConditions:['Succeeded']}],typeProperties:{script:'globalThis.DO_NOT_EXECUTE = true'}}]}};
 await page.getByLabel('Import pipeline definition').setInputFiles({name:'pipeline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(adf))});
 await expect(nodes).toHaveCount(2);
 expect(await page.evaluate(()=>Reflect.get(globalThis,'DO_NOT_EXECUTE'))).toBeUndefined();
 const imported=await pipelineDownload(page);expect(imported.sourceKind).toBe('user-file');
 expect(imported.dependencies[0].condition).toBe('Succeeded');
 await page.getByRole('button',{name:'Restore demo'}).click();
 await page.screenshot({path:info.outputPath('pipeline-designer.png'),fullPage:true});
});
test('recovered VizForge stories render and step through original engine',async({page},info)=>{
 await start(page,'/?module=stories');
 const buttons=page.getByRole('navigation',{name:'Visual story catalog'}).getByRole('button');
 const count=await buttons.count();expect(count).toBeGreaterThanOrEqual(10);
 for(let i=0;i<count;i++){
  await buttons.nth(i).click();
  await expect(page.locator('.vf-react-figure svg, .vf-react-figure table').first()).toBeVisible();
 }
 await buttons.first().click();
 await page.getByRole('button',{name:'Next scene',exact:true}).click();
 await expect(page.locator('.vf-step-count')).toContainText('02');
 await page.screenshot({path:info.outputPath('vizforge.png'),fullPage:true});
});
test('ConceptMotion uses semantic frames and honors reduced motion',async({page},info)=>{
 await start(page,'/?module=explain');
 await expect(page.locator('.concept-caption')).toContainText('Target 13');
 await page.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(page.locator('.concept-caption')).toContainText('value 18');
 await expect(page.locator('.story-stage svg').first()).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('.playback').getByRole('button',{name:'Play',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(page.locator('.concept-caption')).toContainText('Index 4');
 await page.screenshot({path:info.outputPath('conceptmotion.png'),fullPage:true});
});
test('non-SQL project board, explicit draft, narrow layout and embedded route',async({page},info)=>{
 await start(page,'/?module=board');
 await page.getByLabel('Task title').fill('Review the shared data contract');
 await page.getByRole('button',{name:'Add task',exact:true}).click();
 await page.getByLabel('Status of Review the shared data contract').selectOption('Done');
 const download=page.waitForEvent('download');await page.locator('.app-header').getByRole('button',{name:'Export draft'}).click();
 const draft=JSON.parse(await readFile((await (await download).path())!,'utf8'));
 expect(draft.board.find((c:{title:string})=>c.title==='Review the shared data contract').lane).toBe('Done');
 expect(draft).not.toHaveProperty('datasets');
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByLabel('Task title')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:info.outputPath('mobile-board.png'),fullPage:true});
 await page.goto('/?module=explain&embed=1');
 await expect(page.locator('.concept-caption')).toContainText('Target 13');
 await expect(page.locator('.module-rail')).toBeHidden();
 await expect(page.locator('.app-header')).toBeHidden();
});

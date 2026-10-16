import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// F205 / U204: two tabs (two pages, one context, one localStorage) never silently overwrite each other's workspace.
// Synthetic content only: empty SQL/note cells. No runtime and no dataset are needed.
const stored=(page:Page)=>page.evaluate(()=>{const raw=localStorage.getItem('datapass.workspace');return raw?JSON.parse(raw):null;});
const sidecar=(page:Page)=>page.evaluate(()=>{const raw=localStorage.getItem('datapass.workspace.revision');return raw?JSON.parse(raw):null;});
const cellCount=async(page:Page)=>((await stored(page))?.notebook?.cells??[]).length;
async function ready(page:Page,url:string){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('runtime-state')).toHaveText('DuckDB ready',{timeout:60000});
}
async function addNote(page:Page){await page.getByRole('button',{name:'Add note'}).click();}

test('U204 conflict banner: keep mine, take theirs, export both, and an invalid theirs changes nothing',async({context},info)=>{
  const errors:string[]=[];
  const a=await context.newPage(),b=await context.newPage();
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));

  // Tab A writes first; tab B opens that saved workspace.
  await ready(a,'/?workspace=blank');
  await addNote(a);
  await expect.poll(()=>cellCount(a)).toBe(1);
  expect((await sidecar(a)).rev).toBeGreaterThanOrEqual(1);
  await ready(b,'/');
  await expect(b.getByTestId('cell')).toHaveCount(1);
  await expect(b.getByTestId('workspace-conflict')).toHaveCount(0);

  // B saves on top of what it loaded (no conflict); A learns of it through the storage event.
  await addNote(b);await addNote(b);
  await expect.poll(()=>cellCount(b)).toBe(3);
  const banner=a.getByTestId('workspace-conflict');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-code','DP-STO-001');
  await expect(banner).toContainText('Nothing is saved here until you choose');
  await expect(b.getByTestId('workspace-conflict')).toHaveCount(0);

  // While the conflict is open, A's edits are never written.
  const before=await a.evaluate(()=>localStorage.getItem('datapass.workspace'));
  await addNote(a);
  await expect(a.getByTestId('cell')).toHaveCount(2);
  await a.waitForTimeout(1500);
  expect(await a.evaluate(()=>localStorage.getItem('datapass.workspace'))).toBe(before);
  await a.screenshot({path:info.outputPath('conflict-banner.png')});

  // Export both: this tab's document and the other tab's saved document, both datapass.workspace v1.
  const downloads:{name:string;doc:{format:string;version:number;notebook:{cells:unknown[]}}}[]=[];
  a.on('download',async d=>{downloads.push({name:d.suggestedFilename(),doc:JSON.parse(await readFile((await d.path())!,'utf8'))});});
  await banner.getByRole('button',{name:'Export both'}).click();
  await expect.poll(()=>downloads.map(d=>d.name).sort()).toEqual(['mosaicstudio-workspace-other-tab.json','mosaicstudio-workspace-this-tab.json']);
  const mine=downloads.find(d=>d.name.endsWith('this-tab.json'))!.doc,theirs=downloads.find(d=>d.name.endsWith('other-tab.json'))!.doc;
  expect([mine.format,mine.version,mine.notebook.cells.length]).toEqual(['datapass.workspace',1,2]);
  expect([theirs.format,theirs.version,theirs.notebook.cells.length]).toEqual(['datapass.workspace',1,3]);
  await expect(banner).toBeVisible();

  // Take theirs: A now shows B's three cells and saves normally again.
  await banner.getByRole('button',{name:'Take theirs'}).click();
  await expect(banner).toHaveCount(0);
  await expect(a.getByTestId('cell')).toHaveCount(3);
  await expect(a.getByTestId('workspace-notice')).toContainText('Nothing was run');

  // A edits and saves; now B is the tab behind, and it keeps its own version explicitly.
  await addNote(a);
  await expect.poll(()=>cellCount(a)).toBe(4);
  const bBanner=b.getByTestId('workspace-conflict');
  await expect(bBanner).toBeVisible();
  await expect(bBanner).toContainText('revision');
  await bBanner.getByRole('button',{name:'Keep mine'}).click();
  await expect(bBanner).toHaveCount(0);
  await expect.poll(()=>cellCount(b)).toBe(3);
  expect((await sidecar(b)).tab).toMatch(/^tab-[0-9a-f]{16}$/);
  await expect(banner).toBeVisible();

  // An invalid foreign document (written without a sidecar): take theirs is refused and nothing changes.
  const bad=JSON.stringify({format:'datapass.workspace',version:1,notebook:{cells:[{id:'x',kind:'shell'}]}});
  await b.evaluate(v=>localStorage.setItem('datapass.workspace',v),bad);
  await banner.getByRole('button',{name:'Take theirs'}).click();
  await expect(a.getByTestId('workspace-conflict-error')).toContainText('Nothing changed');
  await expect(banner).toHaveAttribute('data-sidecar','mismatch');
  await expect(a.getByTestId('cell')).toHaveCount(4);
  expect(await a.evaluate(()=>localStorage.getItem('datapass.workspace'))).toBe(bad);

  // Keep mine resolves it; the stored document is still a strict v1 document without a revision field.
  await banner.getByRole('button',{name:'Keep mine'}).click();
  await expect(banner).toHaveCount(0);
  const final=await stored(a);
  expect([final.format,final.version,final.notebook.cells.length,'revision' in final]).toEqual(['datapass.workspace',1,4,false]);
  expect(errors,'Unhandled browser exceptions').toEqual([]);
});

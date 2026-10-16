// F208 provenance bundle in the browser: exported after a sharing review, re-imported in the artifact viewer and by
// py/datapass_bundle.py with identical hashes. All data is SYNTHETIC (foundation-reference runs, Contoso-shape fixture).
import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

const ARTIFACT=path.join('tests','fixtures','interop','contoso-shape.synthetic.artifact.json');
const sha=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
let errors:string[]=[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
test.afterEach(()=>{expect(errors).toEqual([]);});

function pythonValidate(file:string){
  for(const exe of process.platform==='win32'?['python','py']:['python3','python']){
    const out=spawnSync(exe,['-I','py/datapass_bundle.py','validate',file],{encoding:'utf8'});
    if(out.error)continue;
    return {status:out.status,result:JSON.parse(out.stdout.trim())};
  }
  throw new Error('A Python 3 interpreter is required');
}
async function download(page:Page,click:()=>Promise<void>){const pending=page.waitForEvent('download');await click();const file=await pending;return (await file.path())!;}

test('a run page exports a reviewed bundle that re-imports with the same hashes in the viewer and in Python',async({page})=>{
  await page.goto('/?app=foundation-reference&page=runs');
  const panel=page.getByTestId('bundle-export');
  await expect(panel).toHaveAttribute('data-run-count','0');
  await expect(page.getByTestId('bundle-notice')).toContainText('may be sensitive');
  await page.getByLabel('Gain',{exact:true}).fill('2');await page.getByLabel('Gain',{exact:true}).press('Enter');
  await page.getByRole('button',{name:'Evaluate example',exact:true}).click();await expect(page.getByTestId('task-evaluate')).toHaveText('ready');
  await expect(panel).toHaveAttribute('data-run-count','1');
  const exportButton=page.getByTestId('bundle-export-button');
  await expect(exportButton).toBeDisabled();
  await page.getByTestId('bundle-reviewed').check();
  const file=await download(page,()=>exportButton.click());
  const text=await readFile(file,'utf8'),doc=JSON.parse(text);
  expect([doc.format,doc.version,doc.status]).toEqual(['datapass.bundle',1,'candidate']);
  const shown=await page.getByTestId('bundle-exported').getAttribute('data-bundle-sha');
  const sums=doc.files.find((f:{path:string})=>f.path==='SHA256SUMS');
  expect(shown).toBe(sha(sums.text));
  const inputs=JSON.parse(doc.files.find((f:{path:string})=>f.path==='inputs.json').text);
  expect(inputs.runs[0].values).toEqual({gain:2,'reject-run':false});
  // Python re-import: same bundle identity and file hashes.
  const py=pythonValidate(file);
  expect(py.status).toBe(0);expect(py.result.bundleSha256).toBe(shown);
  // Browser re-import in the artifact viewer: same identity, nothing rerun.
  await page.goto('/?artifact=1');
  await page.getByTestId('artifact-file').setInputFiles(file);
  await expect(page.getByTestId('bundle-files')).toHaveAttribute('data-bundle-sha',shown!);
  for(const f of py.result.files)await expect(page.getByTestId('bundle-files').locator(`tr[data-path="${f.path}"]`)).toHaveAttribute('data-sha',f.sha256);
  await expect(page.getByTestId('artifact')).toBeVisible();
});

test('the artifact viewer exports the open file byte for byte and refuses a tampered bundle, keeping the current view',async({page})=>{
  await page.goto('/?artifact=1');
  await page.getByTestId('artifact-file').setInputFiles(ARTIFACT);
  await expect(page.getByTestId('artifact-file-viewer')).toHaveAttribute('data-artifact-id','orchard-monthly-yield');
  await expect(page.getByTestId('artifact-bundle-export-button')).toBeDisabled();
  await page.getByTestId('artifact-bundle-reviewed').check();
  const file=await download(page,()=>page.getByTestId('artifact-bundle-export-button').click());
  const doc=JSON.parse(await readFile(file,'utf8')),original=await readFile(ARTIFACT,'utf8');
  const member=doc.files.find((f:{path:string})=>f.path==='artifacts/orchard-monthly-yield.json');
  expect(member.text).toBe(original);expect(member.sha256).toBe(sha(original));
  const py=pythonValidate(file);expect(py.status).toBe(0);
  await expect(page.getByTestId('artifact-bundle-exported')).toHaveAttribute('data-bundle-sha',py.result.bundleSha256);
  // A tampered bundle is refused with its code; the open artifact stays.
  await page.getByTestId('artifact-file').setInputFiles({name:'tampered.datapass-bundle.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...doc,files:doc.files.map((f:{path:string;text:string})=>f.path==='inputs.json'?{...f,text:f.text.replace('"runs": []','"runs": [ ]')}:f)}))});
  await expect(page.getByTestId('artifact-problem')).toContainText('DP-BUN-003');
  await expect(page.getByTestId('artifact-problem')).toContainText('Still showing');
  await expect(page.getByTestId('artifact-file-viewer')).toHaveAttribute('data-artifact-id','orchard-monthly-yield');
  // Narrow window: the export section does not overflow.
  await page.setViewportSize({width:390,height:800});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

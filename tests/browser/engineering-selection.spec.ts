import {test,expect,type Page} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {clientCspFor} from '../../scripts/client-csp.mjs';
// S04 / S08 (datapass.engineering/1 @ d20ecd6): one semantic selection across the part tree, 2D schematic, 3D model and
// results table of the generic model-reference consumer; binding status policy; view state never changes the design
// digest; imported records (a SYNTHETIC FOIL adapter fixture, malicious markup, invalid records) use the same path;
// no-WebGL, keyboard, reduced motion and 390 px. S08: the current artifact consumer renders the 0.8.1 artifact bytes.
const url='/?app=model-reference';
const DESIGN='f63a96a1dbe2134aef495820fad0964ee62fbc56fba50a3d671227266c311623';
let errors:string[]=[],requests:string[]=[],origin='';
test.beforeEach(async({page},info)=>{
  errors=[];requests=[];origin=new URL(info.project.use.baseURL||'http://127.0.0.1:4173').origin+'/';
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
});
test.afterEach(async()=>{expect(errors).toEqual([]);expect(requests.filter(u=>/^https?:/.test(u)&&!u.startsWith(origin))).toEqual([]);});

const consumer=(page:Page)=>page.getByTestId('engineering-consumer');
const workbench=(page:Page)=>page.getByTestId('model-workbench');
const item=(page:Page,label:string)=>page.getByRole('treeitem',{name:label,exact:true});
const in2d=(page:Page,id:string)=>page.locator(`.eng-2d g[data-part="${id}"]`);
const row=(page:Page,signal:string)=>page.locator(`.eng-results tr[data-signal="${signal}"]`);
async function expectSelected(page:Page,id:string){
  await expect(workbench(page)).toHaveAttribute('data-selection',id);await expect(consumer(page)).toHaveAttribute('data-selection',id);
  if(id!=='none'){await expect(page.locator(`.eng-tree [data-entity="${id}"]`)).toHaveAttribute('aria-selected','true');await expect(in2d(page,id)).toHaveAttribute('aria-pressed','true');}
  await expect(page.locator('.eng-tree [aria-selected=true]')).toHaveCount(1);
}
const importRecord=(page:Page,name:string,body:string|Buffer)=>page.getByLabel('Import selection-binding record').setInputFiles({name,mimeType:'application/json',buffer:Buffer.isBuffer(body)?body:Buffer.from(body)});
const load3d=async(page:Page)=>{await page.getByRole('button',{name:'Load verified 3D model',exact:true}).click();await expect(page.getByText('3D ready',{exact:true})).toBeVisible();};

test.describe('engineering selection binding (model-reference)',()=>{
  test('selection round-trips tree -> 2D -> results -> 3D -> tree through one view field',async({page},info)=>{
    await page.goto(url);await expect(consumer(page)).toBeVisible();await expectSelected(page,'none');
    await item(page,'Oscillating plate').click();await expectSelected(page,'plate');await expect(row(page,'plate.heave')).toHaveAttribute('aria-selected','true');
    await in2d(page,'module').click();await expectSelected(page,'module');await expect(row(page,'module.output')).toHaveAttribute('aria-selected','true');await expect(row(page,'plate.heave')).toHaveAttribute('aria-selected','false');
    await page.getByRole('button',{name:'Select Linkage from results',exact:true}).click();await expectSelected(page,'linkage');
    await load3d(page);await expect(page.getByRole('button',{name:'Inspect Linkage',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Frame',exact:true}).click();await expectSelected(page,'frame'); // 3D spatial anchor -> tree/2D
    await item(page,'Oscillating plate').click();await expect(page.getByRole('button',{name:'Plate',exact:true})).toHaveAttribute('aria-pressed','true'); // tree -> 3D
    await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveCount(1);
    await page.screenshot({path:info.outputPath('engineering-roundtrip.png'),fullPage:true});
  });
  test('unmapped never animates, sourced follows the cursor, inferred is badged and animates only after opt-in',async({page})=>{
    await page.goto(url);const signal=page.getByLabel('Active signal'),time=page.getByLabel('Time cursor');
    await time.fill('2');await expect(consumer(page)).toHaveAttribute('data-animated-entity','plate');await expect(in2d(page,'plate')).toHaveAttribute('data-animated','true');
    expect(await in2d(page,'plate').getAttribute('transform')).not.toBe('translate(0,0)');
    await signal.selectOption('frame.vibration');await expect(consumer(page)).toHaveAttribute('data-binding-status','unmapped');
    for(const t of ['0','3','7','10']){await time.fill(t);await expect(consumer(page)).toHaveAttribute('data-animated-entity','');await expect(page.locator('.eng-2d g[data-animated=true]')).toHaveCount(0);}
    await expect(page.locator('.eng-2d g[transform="translate(0,0)"]')).toHaveCount(5);
    await page.getByLabel('Allow inferred bindings to animate (explicit opt-in)').check();await expect(page.locator('.eng-2d g[data-animated=true]')).toHaveCount(0); // opt-in never maps an unmapped signal
    await page.getByLabel('Allow inferred bindings to animate (explicit opt-in)').uncheck();
    await expect(row(page,'frame.vibration').locator('.eng-badge')).toHaveText('unmapped');
    await signal.selectOption('linkage.load');await time.fill('3');
    await expect(row(page,'linkage.load').locator('.eng-badge')).toHaveText('inferred');await expect(row(page,'linkage.load').locator('.eng-badge')).toBeVisible();
    await expect(consumer(page)).toHaveAttribute('data-binding-status','inferred');await expect(consumer(page)).toHaveAttribute('data-animated-entity','');
    await expect(page.getByTestId('binding-explanation')).toContainText('not animated until you opt in');
    await page.getByLabel('Allow inferred bindings to animate (explicit opt-in)').check();await expect(consumer(page)).toHaveAttribute('data-animated-entity','linkage');await expect(in2d(page,'linkage')).toHaveAttribute('data-animated','true');
    await expect(workbench(page)).toHaveAttribute('data-selection','none'); // animation is not selection
  });
  test('camera, selection, explode, isolate and time cursor leave the design digest unchanged',async({page})=>{
    await page.goto(url);const digest=page.getByTestId('design-digest');await expect(digest).toHaveText(DESIGN);await expect(page.getByTestId('geometry-match')).toHaveText('matches this geometry');
    await item(page,'Carriage').click();await load3d(page);
    await page.getByLabel('Model camera',{exact:true}).selectOption('side');await page.getByLabel('Model mode',{exact:true}).selectOption('exploded');
    await page.getByLabel('Model exploded amount',{exact:true}).fill('0.3');await page.getByLabel('Model mode',{exact:true}).selectOption('isolate');
    await in2d(page,'module').click();await page.getByLabel('Time cursor').fill('9');
    await expect(workbench(page)).toHaveAttribute('data-mode','isolate');await expect(consumer(page)).toHaveAttribute('data-selection','module');
    await expect(digest).toHaveText(DESIGN);await expect(consumer(page)).toHaveAttribute('data-design-digest',DESIGN);
    await expect(page.getByText('View token (not authorization)',{exact:true})).toBeVisible();
  });
  test('a SYNTHETIC FOIL adapter record is consumed through the same mechanism; invalid imports change nothing',async({page})=>{
    await page.goto(url);
    await importRecord(page,'b-unmapped-entity.json',await readFile('tests/fixtures/engineering/invalid/b-unmapped-entity.json'));
    await expect(page.getByRole('alert')).toContainText('Import refused; the current record is unchanged');await expect(page.getByTestId('binding-origin')).toHaveText('Generic model-reference record (synthetic)');
    await expect(page.locator('.eng-results tbody tr')).toHaveCount(4);
    await importRecord(page,'not-json.json','{"format":');await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.eng-results tbody tr')).toHaveCount(4);
    await importRecord(page,'foil-adapter.synthetic.json',await readFile('tests/fixtures/engineering-consumers/foil-adapter.synthetic.json'));
    await expect(page.getByTestId('binding-origin')).toHaveText('Imported: foil-adapter.synthetic.json');await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.eng-results tbody tr')).toHaveCount(5);await expect(page.getByTestId('geometry-match')).toHaveText('matches this geometry');
    await expect(row(page,'foil.heave').locator('td').nth(2)).toHaveText('no sample'); // nothing is invented for imported signals
    await expect(consumer(page)).toHaveAttribute('data-animated-entity','plate');
    const signal=page.getByLabel('Active signal');
    await signal.selectOption('foil.pitch-angle');await expect(row(page,'foil.pitch-angle').locator('.eng-badge')).toHaveText('inferred');await expect(consumer(page)).toHaveAttribute('data-animated-entity','');
    await signal.selectOption('foil.hydro-load');await expect(page.getByTestId('binding-explanation')).toContainText('not a part of this geometry');await expect(consumer(page)).toHaveAttribute('data-animated-entity','');
    await expect(row(page,'foil.hydro-load')).toContainText('hydrofoil (not in this geometry)');
    await signal.selectOption('mooring.tension');await expect(consumer(page)).toHaveAttribute('data-animated-entity','');
    await signal.selectOption('pto.power');await expect(consumer(page)).toHaveAttribute('data-animated-entity','module');
    await page.getByRole('button',{name:'Select Conversion module from results',exact:true}).click();await expectSelected(page,'module');
    const other=JSON.parse(await readFile('tests/fixtures/engineering-consumers/foil-adapter.synthetic.json','utf8'));other.geometryRevision.value='0'.repeat(64);
    await importRecord(page,'other-geometry.json',JSON.stringify(other));await expect(page.getByTestId('geometry-match')).toHaveText('different geometry revision');
    await expect(consumer(page)).toHaveAttribute('data-animated-entity','');await expect(page.getByTestId('binding-explanation')).toContainText('another geometry revision');
    await page.getByRole('button',{name:'Use generic record',exact:true}).click();await expect(page.locator('.eng-results tbody tr')).toHaveCount(4);
  });
  test('markup in an imported record renders as inert text',async({page})=>{
    await page.goto(url);const payload='<img src=x onerror=window.__xss=1>';
    const record=JSON.parse(await readFile('tests/fixtures/engineering-consumers/foil-adapter.synthetic.json','utf8'));record.bindings[0].source=payload;
    await importRecord(page,payload+'.json',JSON.stringify(record));
    await expect(row(page,'foil.heave').locator('.eng-source')).toHaveText(payload);await expect(page.getByTestId('binding-origin')).toHaveText('Imported: '+payload+'.json');
    await expect(consumer(page).locator('img')).toHaveCount(0);await page.waitForTimeout(300);
    expect(await page.evaluate(()=>Reflect.get(window,'__xss'))).toBeUndefined();expect(requests.some(u=>/\/x(?:\?|$)/.test(u))).toBe(false);
  });
  test('without WebGL the tree, 2D schematic and results keep working',async({page})=>{
    await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;Reflect.set(window,'__webgl',[]);HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(/webgl/i.test(type)){(Reflect.get(window,'__webgl') as string[]).push(type);return null;}return Reflect.apply(native,this,[type,...args]);} as typeof native;});
    await page.goto(url);await page.getByRole('button',{name:'Load verified 3D model',exact:true}).click();await expect(page.getByText('3D unavailable',{exact:true})).toBeVisible();
    expect((await page.evaluate(()=>Reflect.get(window,'__webgl') as string[])).length).toBeGreaterThan(0);
    await item(page,'Conversion module').click();await expectSelected(page,'module');await in2d(page,'frame').click();await expectSelected(page,'frame');
    await page.getByRole('button',{name:'Select Oscillating plate from results',exact:true}).click();await expectSelected(page,'plate');
    await page.getByLabel('Time cursor').fill('2');await expect(consumer(page)).toHaveAttribute('data-animated-entity','plate');await expect(page.getByTestId('design-digest')).toHaveText(DESIGN);
  });
  test('the part tree is keyboard navigable with roving focus',async({page})=>{
    await page.goto(url);await item(page,'Complete assembly').focus();
    await page.keyboard.press('ArrowDown');await expect(item(page,'Support frame')).toBeFocused();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await expect(item(page,'Oscillating plate')).toBeFocused();
    await expect(workbench(page)).toHaveAttribute('data-selection','none'); // focus alone does not select
    await page.keyboard.press('Enter');await expectSelected(page,'plate');
    await page.keyboard.press('End');await expect(item(page,'Linkage')).toBeFocused();await page.keyboard.press(' ');await expectSelected(page,'linkage');
    await page.keyboard.press('Home');await expect(item(page,'Complete assembly')).toBeFocused();await page.keyboard.press('Enter');await expectSelected(page,'none');
    await expect(page.locator('.eng-tree [tabindex="0"]')).toHaveCount(1);
    await in2d(page,'module').focus();await page.keyboard.press('Enter');await expectSelected(page,'module');
  });
  test('reduced motion and a 390 px viewport keep every projection usable without page overflow',async({page},info)=>{
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);
    await expect(consumer(page)).toHaveAttribute('data-motion','reduced');await page.getByLabel('Time cursor').fill('2');
    await expect(in2d(page,'plate')).toHaveClass(/reduced/);expect(await in2d(page,'plate').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
    await item(page,'Linkage').click();await expectSelected(page,'linkage');await page.getByRole('button',{name:'Select Conversion module from results',exact:true}).click();await expectSelected(page,'module');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('engineering-mobile.png'),fullPage:true});
  });
});

/** Build one selected client (no deployment) and serve dist-clients/<id> on an ephemeral loopback port. */
function selectedClient(id:string){
  let server:Server|undefined;const state={base:''};
  test.beforeAll(async()=>{
    test.setTimeout(600000);
    const built=spawnSync(process.execPath,['--experimental-strip-types','scripts/build-client.mjs',id],{encoding:'utf8',timeout:540000});
    expect(built.status,built.stdout+built.stderr).toBe(0);
    const root=path.resolve('dist-clients',id),csp=clientCspFor(path.resolve('clients',id));
    const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm'};
    server=createServer(async(req,res)=>{
      const u=new URL(req.url||'/','http://x'),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp});res.end(body);}
      catch{res.writeHead(404).end();}
    });
    await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
    const address=server.address();state.base=`http://127.0.0.1:${typeof address==='object'&&address?address.port:0}/`;
  });
  test.beforeEach(()=>{origin=state.base;});
  test.afterAll(async()=>{await new Promise(resolve=>server?server.close(resolve):resolve(undefined));});
  return state;
}

test.describe('S08 old artifact format (selected client build)',()=>{
  const client=selectedClient('python-wind-reference');
  test('the current artifact consumer renders the byte-exact 0.8.1 artifact',async({page})=>{
    const legacy=await readFile('tests/fixtures/engineering/legacy-0.8.1/wind-aep-weibull.json');let served=0;
    await page.route('**/artifacts/wind-aep-weibull.json',r=>{served++;return r.fulfill({status:200,body:legacy,contentType:'application/json'});});
    const source=page.getByTestId('artifact-source');await page.goto(client.base);await expect(source).toHaveAttribute('data-artifact-id','wind-aep-weibull');expect(served).toBeGreaterThan(0);
    await expect(page.getByTestId('artifact-error')).toHaveCount(0);await expect(page.getByTestId('artifact-provenance')).toBeVisible();
    const rows=JSON.parse(legacy.toString('utf8')).payload.rows as unknown[];
    await expect(source.locator('table tbody tr')).toHaveCount(rows.length);await expect(source).toContainText('9,926');
  });
});

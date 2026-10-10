import {test,expect,type Page,type FrameLocator} from '@playwright/test';
import {readFile,readdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * FR-04 consumer interoperability. Public runs use independently authored SYNTHETIC fixtures that mirror the shape of the
 * current DataPass React 2.1 and Contoso exports (tests/fixtures/interop/). A local qualification run can point
 * FR04_REAL_DIR at a private folder of real exports (never committed) and FR04_SHOT_DIR at the private evidence folder:
 * the same checks then run on those files and screenshots go there.
 */
const HTML=path.resolve('dist-standalone/concept-viewer.html');
const DIR=path.resolve('tests/fixtures/interop');
const REACT=path.join(DIR,'react-shape.synthetic.concept.json'),CONTOSO=path.join(DIR,'contoso-shape.synthetic.concept.json');
const ARTIFACT=path.join(DIR,'contoso-shape.synthetic.artifact.json');
const REAL=process.env.FR04_REAL_DIR,SHOTS=process.env.FR04_SHOT_DIR;
const VIEWER='https://viewer.concept.test',HOST='https://host.concept.test',OTHER='https://other.concept.test';
type Msg={type:string;origin:string;fromFrame:boolean;result?:{ok:boolean;id?:string;issues?:{path:string;message:string}[];warnings?:unknown[]}};
const errorsOf=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return errors;};
const shot=async(page:Page,name:string)=>{if(SHOTS)await page.screenshot({path:path.join(SHOTS,name),fullPage:false});};

/** A host page on another origin that frames the viewer; the frame size is driven by CSS variables. */
async function hostPage(page:Page,extra=''){
  const viewerHtml=await readFile(HTML,'utf8');
  await page.route(VIEWER+'/**',route=>route.fulfill({status:200,contentType:'text/html',body:viewerHtml}));
  await page.route(HOST+'/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>host</title>
    <style>body{margin:0}#v{border:0;display:block;width:var(--w,1000px);height:var(--h,600px)}</style>
    <script>window.msgs=[];addEventListener('message',e=>{const v=document.getElementById('v');
      window.msgs.push({...(e.data&&typeof e.data==='object'?e.data:{type:String(e.data)}),origin:e.origin,fromFrame:e.source===v.contentWindow});});</script>
    <iframe id="v" sandbox="allow-scripts" src="${VIEWER}/concept-viewer.html"></iframe>${extra}`}));
  await page.goto(HOST+'/parent.html');
  await expect.poll(()=>msgs(page).then(m=>m.filter(x=>x.type==='datapass.concept-spec/ready').length)).toBeGreaterThanOrEqual(1);
  return page.frameLocator('#v');
}
const msgs=(page:Page)=>page.evaluate(()=>(window as unknown as {msgs:Msg[]}).msgs);
const send=(page:Page,data:unknown)=>page.evaluate(d=>(document.getElementById('v') as HTMLIFrameElement).contentWindow!.postMessage(d,'*'),data);
/** Resizes the frame and returns only once the viewer itself sees the new size and has painted it:
 *  measuring or clicking earlier uses the previous layout (a click on stale coordinates misses its button). */
const frameSize=async(page:Page,w:number,h:number)=>{
  await page.evaluate(([w,h])=>{document.body.style.setProperty('--w',w+'px');document.body.style.setProperty('--h',h+'px');},[w,h]);
  const viewer=page.frames().find(f=>f.url().includes('concept-viewer.html'));
  if(!viewer)throw new Error('viewer frame not found');
  await viewer.waitForFunction(([w,h])=>innerWidth===w&&innerHeight===h,[w,h]);
  await viewer.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(null)))));
};

type Box={x:number;y:number;width:number;height:number};
type Fit={ok:true;el:Box;stage:Box}|{ok:false;reason:string};
/**
 * Every corner of the element, of the stage and of the frame lies inside the page viewport; the element lies inside the stage.
 * Used inside expect.poll: PanZoom renders the SVG from a string, so the element is replaced while a load or resize settles
 * (also on 6f45dd0) and a node detached between resolve and measure has no box. That is "not settled yet", not a pass.
 */
async function fitsInside(page:Page,frame:FrameLocator,selector:string):Promise<Fit>{
  const vp=page.viewportSize()!;
  const [el,stage,host]=await Promise.all([frame.locator(selector).first().boundingBox(),frame.locator('.aa-stage').boundingBox(),page.locator('#v').boundingBox()]);
  if(!el||!stage||!host)return {ok:false,reason:'no box yet for '+selector};
  const outside=(b:Box,o:Box)=>b.x<o.x-.5||b.y<o.y-.5||b.x+b.width>o.x+o.width+.5||b.y+b.height>o.y+o.height+.5;
  for(const [b,o,what] of [[host,{x:0,y:0,width:vp.width,height:vp.height},'frame'],[stage,host,'stage'],[el,stage,selector]] as [Box,Box,string][])
    if(outside(b,o))return {ok:false,reason:`${what} clipped: ${JSON.stringify(b)} not inside ${JSON.stringify(o)}`};
  return {ok:true,el,stage};
}
/** Whole-diagram fit leaves room for the zoom tools and hint, so small frames fill less of the stage. Not settled -> the reason. */
const MIN_FILL=.55;
const filled=(f:Fit)=>{if(!f.ok)return f.reason;const r=Math.max(f.el.width/f.stage.width,f.el.height/f.stage.height);return r>MIN_FILL?'ok':'fill '+r.toFixed(3);};
/** expect.poll until the probe says 'ok'; a timeout reports the probe's last verdict. */
async function pollOk(probe:()=>Promise<string>,message:string,timeout?:number){
  let last='(not run)';
  try{await expect.poll(async()=>(last=await probe()),{message,timeout}).toBe('ok');}
  catch(e){throw new Error(message+' - last verdict: '+last+'\n'+(e instanceof Error?e.message:String(e)));}
}

test('synthetic React- and Contoso-shape concept exports open over file:// with no warnings, all entities and evidence',async({page})=>{
  const errors=errorsOf(page);
  await page.goto(pathToFileURL(HTML).href);
  const viewer=page.getByTestId('concept-viewer');
  for(const [file,id] of [[REACT,'bookshop-synthetic'],[CONTOSO,'orchard-planner-synthetic']] as const){
    await page.getByTestId('concept-file').setInputFiles(file);
    await expect(viewer).toHaveAttribute('data-spec',id);
    await expect(viewer).toHaveAttribute('data-warnings','0');
    const spec=JSON.parse(await readFile(file,'utf8'));
    for(const n of spec.nodes)await expect(page.locator(`[data-testid=concept-isometric] [data-entity="${n.id}"]`)).toHaveCount(1);
    await expect(page.locator('#cv-panel')).toContainText('SYNTHETIC ILLUSTRATION');
    await page.getByRole('button',{name:'Layer cake 2D'}).click();
    for(const f of spec.flows)await expect(page.locator(`[data-testid=concept-layered] [data-flow="${f.id}"]`)).toHaveCount(1);
    await page.getByRole('button',{name:'Isometric 2D'}).click();
  }
  // The React exporter's unresolved links stay visible with their evidence.
  await page.getByTestId('concept-file').setInputFiles(REACT);
  await page.getByRole('button',{name:'Layer cake 2D'}).click();
  await page.locator('[data-testid=concept-layered] [data-node="server-unresolved"]').first().click();
  await expect(page.getByTestId('node-evidence').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('node-evidence')).toContainText('legacy/payments');
  expect(errors).toEqual([]);
});

test('embed fit: no corner of the diagram, stage or frame is clipped after each frame and window resize, in every view',async({page})=>{
  test.setTimeout(120000);
  await page.setViewportSize({width:1320,height:820});
  const frame=await hostPage(page),inner=frame.getByTestId('concept-viewer');
  const spec=JSON.parse(await readFile(REACT,'utf8'));
  await send(page,{type:'datapass.concept-spec/load',spec,options:{view:'isometric',fit:true,chrome:'embed'}});
  await expect(inner).toHaveAttribute('data-spec','bookshop-synthetic');
  await expect(inner).toHaveAttribute('data-fit','true');
  const sizes:[number,number][]=[[1000,600],[640,420],[1280,760],[480,360],[900,560]];
  for(const [w,h] of sizes){
    await frameSize(page,w,h);
    await pollOk(async()=>filled(await fitsInside(page,frame,'[data-testid=concept-isometric] svg')),`isometric ${w}x${h}`);
  }
  await shot(page,'embed-isometric-900x560.png');
  await send(page,{type:'datapass.concept-spec/load',spec,options:{view:'layered'}});
  await expect(inner).toHaveAttribute('data-view','layered');
  for(const [w,h] of sizes)await (async()=>{await frameSize(page,w,h);await pollOk(async()=>{const f=await fitsInside(page,frame,'[data-testid=concept-layered] svg');return !f.ok?f.reason:f.el.width>0?'ok':'empty';},`layered ${w}x${h}`);})();
  await frame.getByRole('button',{name:'3D scene'}).click();
  await expect(inner).toHaveAttribute('data-view','3d');
  for(const [w,h] of [[1000,600],[640,420],[1280,760]] as [number,number][]){
    await frameSize(page,w,h);
    await pollOk(async()=>{
      const f=await fitsInside(page,frame,'[data-testid=atlas-3d] canvas');if(!f.ok)return f.reason;const canvas=f.el;
      if(Math.abs(canvas.width-f.stage.width)>1)return `canvas ${canvas.width} not resized to stage ${f.stage.width}`;
      const labels=await frame.locator('[data-testid=atlas-3d] .aa-label[data-node], [data-testid=atlas-3d] .aa-layer-label').all();
      if(labels.length!==spec.nodes.length+spec.layers.length)return 'labels '+labels.length;
      for(const l of labels){const b=await l.boundingBox();if(!b)return 'label not measurable';if(b.x<canvas.x-.5||b.y<canvas.y-.5||b.x+b.width>canvas.x+canvas.width+.5||b.y+b.height>canvas.y+canvas.height+.5)return 'label clipped '+JSON.stringify(b)+' in '+JSON.stringify(canvas);}
      const settled=await frame.locator('[data-testid=atlas-3d] .aa-canvas').getAttribute('data-settled');
      return settled==='true'?'ok':'not settled ('+settled+')';
    },`3d ${w}x${h}`,30000);
  }
  await shot(page,'embed-3d-1280x760.png');
  // Window resize with a fluid frame.
  await page.evaluate(()=>{const v=document.getElementById('v')!;v.style.width='100vw';v.style.height='80vh';});
  await send(page,{type:'datapass.concept-spec/load',spec,options:{view:'isometric'}});
  for(const [w,h] of [[1100,700],[760,560],[1400,900]] as [number,number][]){
    await page.setViewportSize({width:w,height:h});
    await pollOk(async()=>filled(await fitsInside(page,frame,'[data-testid=concept-isometric] svg')),`window ${w}x${h}`);
  }
});

test('embed messages: only the direct parent is heard, replies carry the viewer origin, payloads are bounded and inert',async({page})=>{
  // A sibling frame on another origin tries to drive the viewer through window.parent.frames.
  await page.route(OTHER+'/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><script>
    addEventListener('message',e=>{if(e.source===parent){parent.frames[0].postMessage({type:'datapass.concept-spec/load',spec:e.data},'*');parent.postMessage('relayed','*');}});</script>`}));
  const frame=await hostPage(page,`<iframe id="o" src="${OTHER}/other.html" style="width:10px;height:10px;border:0"></iframe>`);
  const inner=frame.getByTestId('concept-viewer');
  const react=JSON.parse(await readFile(REACT,'utf8')),contoso=JSON.parse(await readFile(CONTOSO,'utf8'));
  await page.waitForFunction(()=>{try{return !!(document.getElementById('o') as HTMLIFrameElement).contentWindow;}catch{return false;}});
  await expect.poll(async()=>{await page.evaluate(spec=>(document.getElementById('o') as HTMLIFrameElement).contentWindow!.postMessage(spec,'*'),contoso);
    return (await msgs(page)).some(m=>m.type==='relayed');}).toBe(true);
  await page.waitForTimeout(500);
  await expect(inner).not.toHaveAttribute('data-spec','orchard-planner-synthetic');
  expect((await msgs(page)).filter(m=>m.result)).toEqual([]);
  // The parent is heard.
  await send(page,{type:'datapass.concept-spec/load',spec:react});
  await expect(inner).toHaveAttribute('data-spec','bookshop-synthetic');
  await expect.poll(async()=>(await msgs(page)).filter(m=>m.result).map(m=>m.result!.id)).toEqual(['bookshop-synthetic']);
  // Other types and non-objects get no reply and change nothing.
  for(const data of ['datapass.concept-spec/load',null,42,{type:'datapass.concept-spec/load '},{type:'other',spec:contoso}])await send(page,data);
  // Oversized payloads (as text and as an object) are refused with an issue; the current spec stays.
  await send(page,{type:'datapass.concept-spec/load',spec:' '.repeat(256*1024+1)});
  await expect.poll(async()=>(await msgs(page)).filter(m=>m.result).length).toBe(2);
  const big={...contoso,note:'x'.repeat(300*1024)};
  await send(page,{type:'datapass.concept-spec/load',spec:big});
  await expect.poll(async()=>(await msgs(page)).filter(m=>m.result).length).toBe(3);
  const results=(await msgs(page)).filter(m=>m.result);
  for(const r of results.slice(1)){expect(r.result!.ok).toBe(false);expect(r.result!.issues![0].message).toMatch(/larger than 256 KB/);}
  await expect(inner).toHaveAttribute('data-spec','bookshop-synthetic');
  await expect(frame.getByTestId('concept-problem')).toContainText('still showing');
  // Every reply came from the framed viewer's own window and origin.
  const viewerMsgs=(await msgs(page)).filter(m=>m.type.startsWith('datapass.concept-spec/'));
  expect(viewerMsgs.length).toBeGreaterThanOrEqual(4);
  // The host frames the viewer with sandbox="allow-scripts" (opaque origin "null"), so a host must check e.source, as this one does.
  for(const m of viewerMsgs){expect(m.type).toBe('datapass.concept-spec/ready');expect(m.fromFrame).toBe(true);expect(m.origin).toBe('null');}
});

test('artifact file viewer opens a Contoso-shape artifact in the existing ArtifactView, keeps lineage and rejects bad files',async({page})=>{
  const errors=errorsOf(page),heavy:string[]=[];
  page.on('request',r=>{if(/\.wasm|\/duckdb\/|three|SceneViewport-|ModelViewport-/.test(r.url()))heavy.push(r.url());});
  await page.goto('/?artifact=1');
  const viewer=page.getByTestId('artifact-file-viewer');
  await expect(page.getByTestId('artifact-empty')).toBeVisible();
  await page.getByTestId('artifact-file').setInputFiles(ARTIFACT);
  await expect(viewer).toHaveAttribute('data-artifact-id','orchard-monthly-yield');
  const fixture=JSON.parse(await readFile(ARTIFACT,'utf8'));
  const art=page.getByTestId('artifact');
  await expect(art).toHaveAttribute('data-representation','table');
  await expect(art.locator('tbody tr')).toHaveCount(fixture.payload.rows.length);
  await art.getByLabel('Artifact representation').selectOption({label:'revenue by harvest month'});
  await expect(art).toHaveAttribute('data-representation','chart');
  await expect(art.locator('svg').first()).toBeVisible();
  await art.getByLabel('Artifact representation').selectOption({label:'JSON'});
  await expect(art).toContainText('East slope');
  await expect(page.getByTestId('artifact-inputs').locator('tbody tr')).toHaveCount(13);
  await expect(page.getByTestId('artifact-input-hash')).toHaveText(fixture.provenance.inputHash);
  await expect(page.getByTestId('artifact-producer')).toContainText('service');
  await expect(page.getByTestId('artifact-lineage')).toContainText('models/curated/monthly_yield.sql:1-18');
  // Narrow window: nothing overflows the viewport horizontally.
  await page.setViewportSize({width:390,height:800});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const box=(await viewer.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390.5);
  await page.setViewportSize({width:1440,height:960});
  // A bad file (unknown provenance field, then oversize, then not JSON) is refused and the current artifact stays.
  const dir=await mkdtemp(path.join(tmpdir(),'artifact-viewer-'));
  try{
    const bad=structuredClone(fixture);bad.provenance.token='secret';
    await writeFile(path.join(dir,'bad.json'),JSON.stringify(bad));
    await writeFile(path.join(dir,'huge.json'),' '.repeat(2*1048576+1));
    await writeFile(path.join(dir,'text.json'),'{not json');
    for(const [name,reason] of [['bad.json',/unexpected fields/],['huge.json',/limited to 2097152 bytes/],['text.json',/Not valid JSON/]] as const){
      await page.getByTestId('artifact-file').setInputFiles(path.join(dir,name));
      await expect(page.getByTestId('artifact-problem')).toContainText(name+' was not opened');
      await expect(page.getByTestId('artifact-problem')).toContainText(reason);
      await expect(page.getByTestId('artifact-problem')).toContainText('Still showing');
      await expect(viewer).toHaveAttribute('data-artifact-id','orchard-monthly-yield');
    }
  }finally{await rm(dir,{recursive:true,force:true});}
  expect(heavy).toEqual([]);
  expect(errors).toEqual([]);
});

test('private qualification: real exports in FR04_REAL_DIR open in the concept viewer (embed fit) and the artifact viewer',async({page})=>{
  test.skip(!REAL,'FR04_REAL_DIR not set: real exports are private and never part of public CI');
  test.setTimeout(180000);
  const names=(await readdir(REAL!)).sort(),concepts=names.filter(n=>n.endsWith('.concept.json')),artifacts=names.filter(n=>n.endsWith('.artifact.json'));
  expect(concepts.length+artifacts.length).toBeGreaterThan(0);
  await page.setViewportSize({width:1320,height:820});
  for(const name of concepts){
    const spec=JSON.parse(await readFile(path.join(REAL!,name),'utf8'));
    await page.goto(pathToFileURL(HTML).href);
    await page.getByTestId('concept-file').setInputFiles(path.join(REAL!,name));
    await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-spec',spec.id);
    await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-warnings','0');
    for(const n of spec.nodes)await expect(page.locator(`[data-testid=concept-isometric] [data-entity="${n.id}"]`)).toHaveCount(1);
    await shot(page,name.replace(/\.json$/,'')+'.file.png');
    const frame=await hostPage(page),inner=frame.getByTestId('concept-viewer');
    await send(page,{type:'datapass.concept-spec/load',spec,options:{view:'isometric',fit:true,chrome:'embed'}});
    await expect(inner).toHaveAttribute('data-spec',spec.id);
    for(const [w,h] of [[1000,600],[640,420],[1280,760]] as [number,number][]){
      await frameSize(page,w,h);
      await pollOk(async()=>filled(await fitsInside(page,frame,'[data-testid=concept-isometric] svg')),'real isometric fit');
    }
    await shot(page,name.replace(/\.json$/,'')+'.embed.png');
    await page.unrouteAll({behavior:'ignoreErrors'});
  }
  for(const name of artifacts){
    await page.goto('/?artifact=1');
    await page.getByTestId('artifact-file').setInputFiles(path.join(REAL!,name));
    await expect(page.getByTestId('artifact-file-viewer')).toHaveAttribute('data-problem','false');
    await expect(page.getByTestId('artifact')).toBeVisible();
    await shot(page,name.replace(/\.json$/,'')+'.artifact.png');
  }
});

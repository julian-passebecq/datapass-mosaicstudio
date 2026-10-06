import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * The committed standalone viewer (dist-standalone/concept-viewer.html) opened over file:// with no server,
 * loading a concept file that is NOT part of its build (tests/fixtures/concept/). Regenerate the HTML with
 * npm run build:concept-standalone.
 */
const HTML=path.resolve('dist-standalone/concept-viewer.html');
const FIXTURE=path.resolve('tests/fixtures/concept/external-helpdesk.concept.json');
const fileUrl=(query='')=>pathToFileURL(HTML).href+query;
const errorsOf=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return errors;};
const viewer=(page:Page)=>page.getByTestId('concept-viewer');

test('the standalone file is self-contained and carries its provenance',async()=>{
  const html=await readFile(HTML,'utf8');
  expect(html).toMatch(/source commit [0-9a-f]{40}(-dirty)? · built \d{4}-\d{2}-\d{2}T/);
  expect(html).toContain('concept spec 1.0.0');
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  expect(html).toMatch(/Content-Security-Policy" content="default-src 'none'; script-src 'sha256-/);
  expect(Buffer.byteLength(html)).toBeLessThan(1400*1024);
});

test('opens over file://, loads an external fixture by picker, renders all three views and shows evidence',async({page})=>{
  const errors=errorsOf(page);
  await page.goto(fileUrl());
  await expect(viewer(page)).toHaveAttribute('data-spec','forecast-app');
  await page.getByTestId('concept-file').setInputFiles(FIXTURE);
  await expect(viewer(page)).toHaveAttribute('data-spec','helpdesk-fixture');
  await expect(viewer(page)).toHaveAttribute('data-source','external-helpdesk.concept.json');
  await expect(viewer(page)).toHaveAttribute('data-warnings','0');
  const fixture=JSON.parse(await readFile(FIXTURE,'utf8'));
  for(const n of fixture.nodes)await expect(page.locator(`[data-testid=concept-isometric] [data-entity="${n.id}"]`)).toHaveCount(1);
  await page.getByRole('button',{name:'Layer cake 2D'}).click();
  await expect(viewer(page)).toHaveAttribute('data-view','layered');
  for(const f of fixture.flows)await expect(page.locator(`[data-testid=concept-layered] [data-flow="${f.id}"]`)).toHaveCount(1);
  await page.locator('[data-testid=concept-layered] [data-node="tickets-api"]').first().click();
  await expect(page.getByTestId('node-evidence').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('flow-evidence')).toContainText('server/db.ts');
  await page.getByRole('button',{name:'3D scene'}).click();
  await expect(page.locator('[data-testid=atlas-3d] canvas')).toHaveCount(1);
  await page.waitForFunction(()=>window.__conceptStage?.settled()===true);
  expect(new URL(page.url()).searchParams.get('view')).toBe('3d');
  expect(errors).toEqual([]);
});

test('validation errors list path and message; the current spec stays; pasted JSON loads with warnings',async({page})=>{
  const dir=await mkdtemp(path.join(tmpdir(),'concept-standalone-'));
  try{
    const bad=JSON.parse(await readFile(FIXTURE,'utf8'));bad.flows[1].to='ghost';bad.nodes[0].kind='spaceship';
    const badFile=path.join(dir,'broken.concept.json');await writeFile(badFile,JSON.stringify(bad));
    await page.goto(fileUrl());
    await expect(viewer(page)).toHaveAttribute('data-spec','forecast-app');
    await page.getByTestId('concept-file').setInputFiles(badFile);
    const problem=page.getByTestId('concept-problem');
    await expect(problem).toContainText('broken.concept.json was not loaded');
    await expect(problem.locator('li',{hasText:'unknown node kind "spaceship"'}).locator('code')).toHaveText('nodes[0].kind');
    await expect(problem).toContainText('still showing');
    await expect(viewer(page)).toHaveAttribute('data-spec','forecast-app');
    const pasted=JSON.parse(await readFile(FIXTURE,'utf8'));pasted.exporter={name:'datapass-react'};
    await page.getByRole('button',{name:'Paste'}).click();
    await page.getByLabel('Concept spec JSON').fill(JSON.stringify(pasted));
    await page.getByRole('button',{name:'Load'}).click();
    await expect(viewer(page)).toHaveAttribute('data-spec','helpdesk-fixture');
    await expect(viewer(page)).toHaveAttribute('data-source','pasted JSON');
    const warnings=page.getByTestId('concept-warnings');
    await expect(warnings.locator('code')).toHaveText('exporter');
    await expect(warnings).toContainText('unknown field "exporter" ignored');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('embed API: a parent page iframes the viewer, gets ready, sends specs and receives each result',async({page})=>{
  // Two origins, as when Contoso frames the viewer: the parent and the viewer are served from different hosts.
  const viewerHtml=await readFile(HTML,'utf8'),fixture=JSON.parse(await readFile(FIXTURE,'utf8'));
  await page.route('https://viewer.concept.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:viewerHtml}));
  await page.route('https://host.concept.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>host</title>
    <script>window.msgs=[];addEventListener('message',e=>{if(e.origin==='https://viewer.concept.test')window.msgs.push(e.data);});</script>
    <iframe id="v" src="https://viewer.concept.test/concept-viewer.html?view=layered" style="width:1200px;height:800px;border:0"></iframe>`}));
  await page.goto('https://host.concept.test/parent.html');
  const msgs=()=>page.evaluate(()=>(window as unknown as {msgs:{type:string;result?:{ok:boolean;id?:string;issues?:{path:string;message:string}[];warnings?:unknown[]}}[]}).msgs);
  await expect.poll(async()=>(await msgs()).filter(m=>m.type==='datapass.concept-spec/ready').length).toBeGreaterThanOrEqual(1);
  const frame=page.frameLocator('#v'),inner=frame.getByTestId('concept-viewer');
  await expect(inner).toHaveAttribute('data-spec','forecast-app');
  const send=(data:unknown)=>page.evaluate(d=>(document.getElementById('v') as HTMLIFrameElement).contentWindow!.postMessage(d,'*'),data);
  // Wrong type and a "spec" with code-looking text: ignored / treated as data only.
  await send({type:'datapass.concept-spec/other',spec:fixture});
  await send({type:'datapass.concept-spec/load',spec:{...fixture,title:'alert(1)',onload:'alert(2)'}});
  await expect(inner).toHaveAttribute('data-spec','helpdesk-fixture');
  await expect(inner).toHaveAttribute('data-source','embedded spec');
  await expect(inner).toHaveAttribute('data-view','layered');
  await expect(frame.getByTestId('concept-warnings')).toContainText('unknown field "onload" ignored');
  await expect.poll(async()=>(await msgs()).at(-1)?.result).toEqual({ok:true,id:'helpdesk-fixture',warnings:[{path:'onload',message:'unknown field "onload" ignored (not part of concept spec 1.0.0)'}]});
  // Invalid spec (as JSON text): issues shown exactly like Open file, current spec kept, issues returned to the parent.
  const bad=structuredClone(fixture);bad.flows[0].from='ghost';
  await send({type:'datapass.concept-spec/load',spec:JSON.stringify(bad)});
  await expect(frame.getByTestId('concept-problem')).toContainText('embedded spec was not loaded');
  await expect(frame.getByTestId('concept-problem').locator('code')).toHaveText('flows[0].from');
  await expect(inner).toHaveAttribute('data-spec','helpdesk-fixture');
  await expect.poll(async()=>(await msgs()).at(-1)?.result?.ok).toBe(false);
  expect((await msgs()).at(-1)?.result?.issues?.[0]).toEqual({path:'flows[0].from',message:'unknown node "ghost"'});
  expect((await msgs()).filter(m=>m.type!=='datapass.concept-spec/ready')).toEqual([]);
});

test('embed options: chrome "embed" hides the gallery and inputs, fit shows the whole diagram in each view of a 1000x600 frame',async({page})=>{
  const viewerHtml=await readFile(HTML,'utf8'),fixture=JSON.parse(await readFile(FIXTURE,'utf8'));
  await page.setViewportSize({width:1100,height:700});
  await page.route('https://viewer.concept.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:viewerHtml}));
  // The host sizes the frame with its own CSS after the first layout, as host apps often do.
  await page.route('https://host.concept.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>host</title>
    <style>body{margin:0}iframe{border:0;width:300px;height:150px}.sized iframe{width:1000px;height:600px}</style>
    <script>window.msgs=[];addEventListener('message',e=>{if(e.source===document.getElementById('v').contentWindow)window.msgs.push(e.data);});</script>
    <iframe id="v" sandbox="allow-scripts" src="https://viewer.concept.test/concept-viewer.html"></iframe>`}));
  await page.goto('https://host.concept.test/parent.html');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {msgs:{type:string}[]}).msgs.length)).toBeGreaterThanOrEqual(1);
  const frame=page.frameLocator('#v'),inner=frame.getByTestId('concept-viewer');
  const send=(data:unknown)=>page.evaluate(d=>(document.getElementById('v') as HTMLIFrameElement).contentWindow!.postMessage(d,'*'),data);
  await send({type:'datapass.concept-spec/load',spec:fixture,options:{view:'isometric',fit:true,chrome:'embed',theme:'light',unknown:1}});
  await expect(inner).toHaveAttribute('data-spec','helpdesk-fixture');
  await page.evaluate(()=>document.body.classList.add('sized'));
  await expect(inner).toHaveAttribute('data-chrome','embed');
  await expect(inner).toHaveAttribute('data-fit','true');
  // Gallery and inputs gone; views, export and details stay (details collapsed below 1100 px, opened by toggle or selection).
  await expect(frame.getByRole('navigation',{name:'Examples'})).toHaveCount(0);
  for(const name of ['Forecasting app','Open file','URL','Paste'])await expect(frame.getByRole('button',{name})).toHaveCount(0);
  for(const name of ['Isometric 2D','Layer cake 2D','3D scene','Isometric SVG','Layer cake SVG'])await expect(frame.getByRole('button',{name})).toBeVisible();
  await expect(inner).toHaveAttribute('data-panel','collapsed');
  await expect(frame.locator('#cv-panel')).toBeHidden();
  await frame.getByTestId('concept-panel-toggle').click();
  await expect(frame.locator('#cv-panel')).toBeVisible();
  await expect(frame.locator('#cv-panel')).toContainText(fixture.title);
  await frame.getByTestId('concept-panel-toggle').click();
  await expect(inner).toHaveAttribute('data-panel','collapsed');
  const inside=async(selector:string)=>{
    const box=await frame.locator(selector).first().boundingBox(),stage=await frame.locator('.aa-stage').boundingBox(),host=await page.locator('#v').boundingBox();
    expect(box&&stage&&host).toBeTruthy();
    expect(host!.width).toBe(1000);expect(host!.height).toBe(600);
    for(const b of [stage!,box!]){
      expect(b.x).toBeGreaterThanOrEqual(host!.x-.5);expect(b.y).toBeGreaterThanOrEqual(host!.y-.5);
      expect(b.x+b.width).toBeLessThanOrEqual(host!.x+host!.width+.5);expect(b.y+b.height).toBeLessThanOrEqual(host!.y+host!.height+.5);
    }
    expect(box!.x).toBeGreaterThanOrEqual(stage!.x-.5);expect(box!.y).toBeGreaterThanOrEqual(stage!.y-.5);
    expect(box!.x+box!.width).toBeLessThanOrEqual(stage!.x+stage!.width+.5);expect(box!.y+box!.height).toBeLessThanOrEqual(stage!.y+stage!.height+.5);
    return {box:box!,stage:stage!};
  };
  // Isometric: the whole SVG (scaled by the pan/zoom transform) inside the stage, filling it in one direction.
  await expect(inner).toHaveAttribute('data-view','isometric');
  await expect.poll(async()=>{const {box,stage}=await inside('[data-testid=concept-isometric] svg');return Math.max(box.width/stage.width,box.height/stage.height);}).toBeGreaterThan(.75);
  await page.locator('#v').evaluate(f=>{(f as HTMLIFrameElement).style.width='900px';});
  await page.locator('#v').evaluate(f=>{(f as HTMLIFrameElement).style.width='';});
  await expect.poll(async()=>{const {box,stage}=await inside('[data-testid=concept-isometric] svg');return Math.max(box.width/stage.width,box.height/stage.height);}).toBeGreaterThan(.75);
  // Layer cake.
  await send({type:'datapass.concept-spec/load',spec:fixture,options:{view:'layered'}});
  await expect(inner).toHaveAttribute('data-view','layered');
  await inside('[data-testid=concept-layered] svg');
  for(const f of fixture.flows)await expect(frame.locator(`[data-testid=concept-layered] [data-flow="${f.id}"]`)).toHaveCount(1);
  // 3D: the canvas fills the stage and every node and layer label sits wholly inside it.
  await frame.getByRole('button',{name:'3D scene'}).click();
  await expect(inner).toHaveAttribute('data-view','3d');
  await expect(frame.locator('[data-testid=atlas-3d] canvas')).toHaveCount(1);
  const canvas=(await inside('[data-testid=atlas-3d] canvas')).box;
  await expect.poll(async()=>frame.locator('[data-testid=atlas-3d] .aa-label[data-node]').count()).toBe(fixture.nodes.length);
  await frame.locator('[data-testid=atlas-3d] .aa-canvas[data-settled=true]').waitFor();
  const labels=await frame.locator('[data-testid=atlas-3d] .aa-label[data-node], [data-testid=atlas-3d] .aa-layer-label').all();
  expect(labels.length).toBe(fixture.nodes.length+fixture.layers.length);
  for(const label of labels){
    const b=(await label.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(canvas.x-.5);expect(b.x+b.width).toBeLessThanOrEqual(canvas.x+canvas.width+.5);
    expect(b.y).toBeGreaterThanOrEqual(canvas.y-.5);expect(b.y+b.height).toBeLessThanOrEqual(canvas.y+canvas.height+.5);
  }
  // A load without options keeps the embed chrome; the parent still gets each result.
  await send({type:'datapass.concept-spec/load',spec:fixture});
  await expect(inner).toHaveAttribute('data-chrome','embed');
  await expect.poll(async()=>(await page.evaluate(()=>(window as unknown as {msgs:{result?:{ok:boolean}}[]}).msgs)).filter(m=>m.result?.ok).length).toBe(3);
  // Theme: dark on request.
  await send({type:'datapass.concept-spec/load',spec:fixture,options:{theme:'dark'}});
  await expect(inner).toHaveAttribute('data-theme','dark');
});

test('?src= reads an https URL that allows CORS and rejects other schemes; SVG export downloads a file',async({page})=>{
  const body=await readFile(FIXTURE,'utf8');
  await page.route('https://specs.concept.test/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body}));
  await page.goto(fileUrl('?src='+encodeURIComponent('https://specs.concept.test/helpdesk.concept.json')+'&view=layered'));
  await expect(viewer(page)).toHaveAttribute('data-spec','helpdesk-fixture');
  await expect(viewer(page)).toHaveAttribute('data-view','layered');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Layer cake SVG'}).click()]);
  expect(download.suggestedFilename()).toBe('helpdesk-fixture.layered.svg');
  const svg=await readFile(await download.path(),'utf8');
  expect(svg.startsWith('<svg')).toBe(true);expect(svg).toContain('data-node="tickets-db"');
  await page.goto(fileUrl('?src='+encodeURIComponent('file:///C:/secret.json')));
  await expect(page.getByTestId('concept-problem')).toContainText('must use https://');
  await page.route('https://unreachable.concept.test/**',route=>route.abort('failed'));
  await page.goto(fileUrl('?src='+encodeURIComponent('https://unreachable.concept.test/x.json')));
  await expect(page.getByTestId('concept-problem')).toContainText('Access-Control-Allow-Origin');
});

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

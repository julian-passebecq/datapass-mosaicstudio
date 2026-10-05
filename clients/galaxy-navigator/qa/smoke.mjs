/** Galaxy Navigator acceptance: JS budget + Playwright smoke + one capture on the built client.
 * Usage (repo root): node --experimental-strip-types clients/galaxy-navigator/qa/smoke.mjs [--no-build]
 * Writes qa/galaxy-navigator/{report.json,galaxy-navigator.png,export.svg,export.png} (untracked).
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';
import {REGISTRY} from '../registry.generated.ts';

const id='galaxy-navigator',port=4193,origin=`http://127.0.0.1:${port}`,url=origin+'/',dist=path.resolve('dist-clients',id),out=path.resolve('qa',id);
const BUDGET=Object.freeze({jsGzip:160*1024});
const report={format:'galaxy-navigator.acceptance',version:1,checks:{}};
const node=args=>{const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);};
node(['clients/galaxy-navigator/tools/registry.mjs','--check']);
if(!process.argv.includes('--no-build'))node(['--experimental-strip-types','scripts/build-client.mjs',id]);
await mkdir(out,{recursive:true});

// 1. Budget: sum of individually gzipped emitted JS (same metric as scripts/check-client-performance.mjs).
const assets=path.join(dist,'assets'),js=(await readdir(assets)).filter(f=>f.endsWith('.js'));
let jsGzip=0;for(const f of js)jsGzip+=gzipSync(await readFile(path.join(assets,f)),{level:9}).length;
const evidence=JSON.parse(await readFile(path.join(dist,'studio-build.json'),'utf8'));
assert.ok(jsGzip<=BUDGET.jsGzip,`JS gzip ${jsGzip} > ${BUDGET.jsGzip}`);
assert.equal(evidence.containsThree,false,'three.js must not be in the navigator build');
assert.ok(!(await readdir(dist,{recursive:true})).some(f=>/\.wasm$|duckdb|\.glb$/.test(f)),'Unexpected heavy capability in build');
report.checks.budget={jsGzipBytes:jsGzip,jsFiles:js.length,budgetBytes:BUDGET.jsGzip,containsThree:false};

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port',String(port)],{env:{...process.env,STUDIO_CLIENT:id},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>{log+=x;});server.stderr.on('data',x=>{log+=x;});
const browser=await chromium.launch(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{});
async function open({width=1440,height=960,query='?capture=1'}={}){
  const context=await browser.newContext({viewport:{width,height},acceptDownloads:true,colorScheme:'light'});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(url+query);await page.getByTestId('galaxy-navigator').waitFor({timeout:30000});
  return {page,context,errors,external};
}
const settled=page=>page.waitForFunction(()=>document.querySelector('[data-testid=gn-graph]')?.getAttribute('data-viz-settled')==='true');
try{
  let ready=false;for(let i=0;i<150&&!ready;i++){try{ready=(await fetch(url)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Preview failed: '+log);
  {
    const {page,context,errors,external}=await open();
    // Registry: every node drawn, edges drawn.
    assert.equal(await page.locator('.gn-node').count(),REGISTRY.nodes.length);
    const allEdges=await page.locator('[data-testid=gn-edges] path').count();assert.ok(allEdges>10,'edges drawn');
    const full=await page.getByTestId('gn-graph').getAttribute('viewBox');
    // Search -> Enter focuses the first hit.
    await page.getByTestId('gn-search').fill('mongo');
    assert.ok(await page.getByTestId('gn-hits').locator('button').count()>=1);
    await page.getByTestId('gn-search').press('Enter');
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=mongoku]');
    assert.match(await page.getByTestId('gn-inspector-title').textContent(),/Mongoku/);
    await settled(page);
    assert.notEqual(await page.getByTestId('gn-graph').getAttribute('viewBox'),full,'focus frames the neighbourhood');
    assert.ok(await page.locator('.gn-node[data-dimmed=true]').count()>0,'non-neighbours dimmed');
    report.checks.search={query:'mongo',focused:'mongoku'};
    // Projection switch keeps selection.
    await page.getByTestId('gn-search').fill('');
    await page.getByTestId('gn-view-list').click();
    assert.equal(await page.locator('[data-testid=gn-list] tr[data-node=mongoku]').getAttribute('aria-selected'),'true');
    await page.locator('[data-testid=gn-list] tr[data-node=diagramcloud] button').click();
    await page.getByTestId('gn-view-graph').click();
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=diagramcloud][data-view=graph]');
    assert.equal(await page.locator('.gn-node[data-node=diagramcloud]').getAttribute('aria-pressed'),'true');
    report.checks.projections={retained:'diagramcloud'};
    // Keyboard focus on a node.
    await page.locator('.gn-node[data-node=atlasnote]').focus();await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=atlasnote]');
    // Status filter.
    await page.getByTestId('gn-status').selectOption('live');
    const live=await page.locator('[data-testid=gn-edges] path').evaluateAll(ps=>ps.map(p=>p.getAttribute('data-status')));
    assert.ok(live.length>0&&live.length<allEdges&&live.every(s=>s==='live'),'live filter');
    await page.getByTestId('gn-status').selectOption('all');
    report.checks.filter={all:allEdges,live:live.length};
    // Static exports.
    const [svgDl]=await Promise.all([page.waitForEvent('download'),page.getByTestId('gn-export-svg').click()]);
    const svgPath=path.join(out,'export.svg');await svgDl.saveAs(svgPath);
    const svg=await readFile(svgPath,'utf8');
    assert.ok(svg.includes('<svg')&&!svg.includes('var(--'),'standalone SVG with resolved colours');
    assert.equal((svg.match(/<title>/g)||[]).length,(await page.locator('[data-testid=gn-edges] path').count()));
    const [pngDl]=await Promise.all([page.waitForEvent('download'),page.getByTestId('gn-export-png').click()]);
    const pngPath=path.join(out,'export.png');await pngDl.saveAs(pngPath);
    assert.ok((await stat(pngPath)).size>5000,'PNG export');
    report.checks.export={svgBytes:svg.length,pngBytes:(await stat(pngPath)).size};
    // The one capture: a focused node with its contracts (clear the current focus first so it is in view).
    await page.getByRole('button',{name:'Clear focus'}).click();await settled(page);
    await page.locator('.gn-node[data-node=datapass-vscode] .gn-hit').click();
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=datapass-vscode]');await settled(page);
    const capture=path.join(out,'galaxy-navigator.png');
    await page.screenshot({path:capture,fullPage:true});
    report.checks.capture=path.relative(process.cwd(),capture);
    assert.deepEqual(errors,[],'page errors');assert.deepEqual(external,[],'external requests');
    await context.close();
  }
  {
    // Narrow viewport, real motion: no horizontal overflow, focus still settles.
    const {page,context,errors}=await open({width:390,height:844,query:''});
    await page.locator('.gn-node[data-node=claude-control] .gn-hit').click();await settled(page);
    const wide=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(wide<=1,'horizontal overflow at 390px: '+wide);
    assert.deepEqual(errors,[]);
    report.checks.narrow={width:390,overflow:wide};
    await context.close();
  }
  report.status='passed';
}finally{
  await browser.close();server.kill();
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('Galaxy Navigator smoke passed: '+JSON.stringify(report.checks));

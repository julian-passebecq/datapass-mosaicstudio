/** Galaxy Navigator acceptance: JS budgets + Playwright smoke over every view + one capture per view
 * (3D in light and dark) on the built client.
 * Usage (repo root): node --experimental-strip-types clients/galaxy-navigator/qa/smoke.mjs [--no-build]
 * Writes qa/galaxy-navigator/{report.json,export.svg,export.png,export-iso.svg} (untracked) and the captures to
 * clients/galaxy-navigator/qa/captures/ (committed).
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';
import {REGISTRY} from '../registry.generated.ts';

const id='galaxy-navigator',port=4193,origin=`http://127.0.0.1:${port}`,url=origin+'/',dist=path.resolve('dist-clients',id),out=path.resolve('qa',id);
const captures=path.resolve('clients',id,'qa','captures');
/** initial: JS requested on first load (default Graph view). lazy3d: what choosing the 3D view adds. */
const BUDGET=Object.freeze({initialJsGzip:160*1024,lazy3dJsGzip:190*1024});
const report={format:'galaxy-navigator.acceptance',version:2,checks:{},captures:[]};
const node=args=>{const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);};
node(['clients/galaxy-navigator/tools/registry.mjs','--check']);
if(!process.argv.includes('--no-build'))node(['--experimental-strip-types','scripts/build-client.mjs',id]);
await mkdir(out,{recursive:true});await mkdir(captures,{recursive:true});
const evidence=JSON.parse(await readFile(path.join(dist,'studio-build.json'),'utf8'));
assert.ok(evidence.capabilities.includes('spatial'),'3D is declared (spatial)');
const gz=async rel=>gzipSync(await readFile(path.join(dist,rel)),{level:9}).length;

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port',String(port)],{env:{...process.env,STUDIO_CLIENT:id},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>{log+=x;});server.stderr.on('data',x=>{log+=x;});
const browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}),args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=default']});
async function open({width=1440,height=960,query='?capture=1',scheme='light',reduced='no-preference'}={}){
  const context=await browser.newContext({viewport:{width,height},acceptDownloads:true,colorScheme:scheme,reducedMotion:reduced});
  const page=await context.newPage(),errors=[],external=[],scripts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('blob:')&&!u.startsWith('data:'))external.push(u);else if(u.endsWith('.js'))scripts.push(new URL(u).pathname.replace(/^\//,''));});
  await page.goto(url+query);await page.getByTestId('galaxy-navigator').waitFor({timeout:30000});
  return {page,context,errors,external,scripts};
}
const view=async(page,v)=>{await page.getByTestId('gn-view-'+v).click();await page.waitForSelector(`[data-testid=galaxy-navigator][data-view=${v}]`);};
/** Every graph label is wholly inside the SVG viewport (or, for nodes outside a focus frame, wholly outside it). */
async function labelsInside(page,{allInside}){
  const bad=await page.evaluate(all=>{
    const svg=document.querySelector('[data-testid=gn-graph]').getBoundingClientRect(),out=[];
    for(const t of document.querySelectorAll('[data-testid=gn-graph] .gn-label,[data-testid=gn-graph] .gn-cluster-label')){
      const r=t.getBoundingClientRect(),inside=r.left>=svg.left-0.5&&r.right<=svg.right+0.5&&r.top>=svg.top-0.5&&r.bottom<=svg.bottom+0.5;
      const outside=r.right<=svg.left||r.left>=svg.right||r.bottom<=svg.top||r.top>=svg.bottom;
      const near=t.closest('.gn-node')?.getAttribute('data-dimmed')!=='true';
      if(!inside&&(all||near||!outside))out.push(t.textContent);
    }
    return out;
  },allInside);
  assert.deepEqual(bad,[],'labels cut by the SVG frame');
}
/** 3D: every shown label is wholly inside the stage; a label that would be cut is hidden, never clipped. */
async function labels3dInside(page){
  const r=await page.evaluate(()=>{
    const stage=document.querySelector('.gn3-stage').getBoundingClientRect(),bad=[];let shown=0;
    for(const el of document.querySelectorAll('.gn3-label,.gn3-plane')){
      const r=el.getBoundingClientRect(),visible=getComputedStyle(el).visibility!=='hidden';if(!visible)continue;shown++;
      if(r.left<stage.left-0.5||r.right>stage.right+0.5||r.top<stage.top-0.5||r.bottom>stage.bottom+0.5)bad.push(el.textContent);
    }
    return {bad,shown};
  });
  assert.deepEqual(r.bad,[],'3D labels cut by the stage');return r.shown;
}
/** Isometric: every SVG text is inside the SVG frame, and no two station labels overlap. */
async function isoLabelsInside(page){
  const r=await page.evaluate(()=>{
    const svg=document.querySelector('[data-testid=gn-iso] svg').getBoundingClientRect(),bad=[];
    for(const t of document.querySelectorAll('[data-testid=gn-iso] svg text')){const r=t.getBoundingClientRect();if(r.width&&(r.left<svg.left-0.5||r.right>svg.right+0.5||r.top<svg.top-0.5||r.bottom>svg.bottom+0.5))bad.push(t.textContent);}
    return {bad,count:document.querySelectorAll('[data-testid=gn-iso] svg text').length};
  });
  assert.deepEqual(r.bad,[],'isometric labels cut by the SVG frame');return r.count;
}
/** Matrix and board: no cell text is clipped by its own box (scrollWidth fits). */
async function noClippedText(page,selector){
  const bad=await page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.textContent.slice(0,40)),selector);
  assert.deepEqual(bad,[],'clipped text in '+selector);
}
const settled=page=>page.waitForFunction(()=>document.querySelector('[data-testid=gn-graph]')?.getAttribute('data-viz-settled')==='true');
const settled3d=page=>page.waitForFunction(()=>window.__galaxy3d?.settled()===true&&!!document.querySelector('[data-testid=gn-3d-canvas] canvas'),null,{timeout:60000});
const shot=async(page,name,locator)=>{const file=path.join(captures,name+'.png');await (locator?page.locator(locator):page).screenshot({path:file});report.captures.push(path.relative(process.cwd(),file).replaceAll('\\','/'));};
try{
  let ready=false;for(let i=0;i<150&&!ready;i++){try{ready=(await fetch(url)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Preview failed: '+log);
  {
    const {page,context,errors,external,scripts}=await open();
    // 1. Budgets: the first load (Graph) never requests three.js or the 3D/isometric chunks.
    await page.waitForLoadState('networkidle');
    const initial=[...new Set(scripts)];
    assert.ok(!initial.some(f=>/three|Galaxy3D|IsoView|Scene3D/.test(f)),'3D or isometric code loaded eagerly: '+initial.join(', '));
    let initialGzip=0;for(const f of initial)initialGzip+=await gz(f);
    assert.ok(initialGzip<=BUDGET.initialJsGzip,`initial JS gzip ${initialGzip} > ${BUDGET.initialJsGzip}`);
    report.checks.budget={initialJsGzip:initialGzip,initialFiles:initial.length,budget:BUDGET,containsThree:evidence.containsThree};
    // Registry: every node drawn, edges drawn.
    assert.equal(await page.locator('.gn-node').count(),REGISTRY.nodes.length);
    const allEdges=await page.locator('[data-testid=gn-edges] path').count();assert.ok(allEdges>10,'edges drawn');
    const full=await page.getByTestId('gn-graph').getAttribute('viewBox');
    await labelsInside(page,{allInside:true});
    await shot(page,'graph','[data-testid=galaxy-navigator]');
    // Search -> Enter focuses the first hit.
    await page.getByTestId('gn-search').fill('diagram');
    assert.ok(await page.getByTestId('gn-hits').locator('button').count()>=1);
    await page.getByTestId('gn-search').press('Enter');
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=diagramcloud]');
    assert.match(await page.getByTestId('gn-inspector-title').textContent(),/DiagramCloud/);
    await settled(page);
    assert.notEqual(await page.getByTestId('gn-graph').getAttribute('viewBox'),full,'focus frames the neighbourhood');
    assert.ok(await page.locator('.gn-node[data-dimmed=true]').count()>0,'non-neighbours dimmed');
    await labelsInside(page,{allInside:false});
    report.checks.search={query:'diagram',focused:'diagramcloud'};
    // Projection switch keeps selection.
    await page.getByTestId('gn-search').fill('');
    await view(page,'list');
    assert.equal(await page.locator('[data-testid=gn-list] tr[data-node=diagramcloud]').getAttribute('aria-selected'),'true');
    await shot(page,'list','[data-testid=galaxy-navigator]');
    await page.locator('[data-testid=gn-list] tr[data-node=mongoku] button').click();
    await view(page,'graph');
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=mongoku][data-view=graph]');
    assert.equal(await page.locator('.gn-node[data-node=mongoku]').getAttribute('aria-pressed'),'true');
    report.checks.projections={retained:'mongoku'};
    // Keyboard focus on a node.
    await page.locator('.gn-node[data-node=atlasnote]').focus();await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=atlasnote]');
    // Status filter.
    await page.getByTestId('gn-status').selectOption('live');
    const live=await page.locator('[data-testid=gn-edges] path').evaluateAll(ps=>ps.map(p=>p.getAttribute('data-status')));
    assert.ok(live.length>0&&live.length<allEdges&&live.every(s=>s==='live'),'live filter');
    await page.getByTestId('gn-status').selectOption('all');
    report.checks.filter={all:allEdges,live:live.length};
    // Static exports of the graph.
    const [svgDl]=await Promise.all([page.waitForEvent('download'),page.getByTestId('gn-export-svg').click()]);
    const svgPath=path.join(out,'export.svg');await svgDl.saveAs(svgPath);
    const svg=await readFile(svgPath,'utf8');
    assert.ok(svg.includes('<svg')&&!svg.includes('var(--'),'standalone SVG with resolved colours');
    assert.equal((svg.match(/<title>/g)||[]).length,(await page.locator('[data-testid=gn-edges] path').count()));
    const [pngDl]=await Promise.all([page.waitForEvent('download'),page.getByTestId('gn-export-png').click()]);
    const pngPath=path.join(out,'export.png');await pngDl.saveAs(pngPath);
    assert.ok((await stat(pngPath)).size>5000,'PNG export');
    report.checks.export={svgBytes:svg.length,pngBytes:(await stat(pngPath)).size};

    // 2. Matrix: one row per contract, sortable, focus column kept.
    await page.locator('.gn-node[data-node=mongoku] .gn-hit').click();await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=mongoku]');
    await view(page,'matrix');
    assert.equal(await page.locator('[data-testid=gn-matrix] tbody tr').count(),REGISTRY.contracts.length);
    assert.equal(await page.locator('[data-testid=gn-matrix] th.gn-col[data-node=mongoku]').getAttribute('aria-selected'),'true','focus kept in the matrix');
    const first=async()=>page.locator('[data-testid=gn-matrix] tbody tr').first().getAttribute('data-contract');
    assert.equal(await page.locator('[data-testid=gn-matrix] tbody tr').first().getAttribute('data-status'),'live','status sort by default');
    await page.getByTestId('gn-sort-id').click();const byId=await first();
    await page.getByTestId('gn-sort-id').click();const byIdDesc=await first();
    assert.notEqual(byId,byIdDesc,'sorting toggles');
    assert.equal(byId,[...REGISTRY.contracts].map(c=>c.id).sort((a,b)=>a.localeCompare(b))[0]);
    await page.getByTestId('gn-sort-focus').click();
    const top=await page.locator('[data-testid=gn-matrix] tbody tr').first().locator('td.gn-cell[aria-selected=true]').getAttribute('data-role');
    assert.ok(top==='P'||top==='PC','rows provided by the focused node come first');
    const roles=await page.locator('[data-testid=gn-matrix] td.gn-cell[data-role] button').count();
    assert.equal(roles,REGISTRY.contracts.reduce((n,c)=>n+new Set([c.owner,...c.consumers]).size,0),'one cell per provider and consumer');
    await noClippedText(page,'[data-testid=gn-matrix] th button,[data-testid=gn-matrix] td');
    await page.getByTestId('gn-sort-status').click();
    await shot(page,'matrix','[data-testid=galaxy-navigator]');
    report.checks.matrix={rows:REGISTRY.contracts.length,cells:roles,sortedFirst:byId};

    // 3. Board: lanes by status, cards of the focused node marked.
    await view(page,'board');
    const lanes=await page.locator('[data-testid=gn-board] .gn-lane').evaluateAll(ls=>ls.map(l=>[l.getAttribute('data-status'),l.querySelectorAll('.gn-card').length]));
    assert.deepEqual(lanes.map(l=>l[0]).slice(0,5),['live','branch','planned','retired','proposed']);
    assert.equal(lanes.reduce((n,l)=>n+l[1],0),REGISTRY.contracts.length);
    const involved=await page.locator('[data-testid=gn-board] .gn-card[data-involved=true]').count();
    assert.equal(involved,REGISTRY.contracts.filter(c=>c.owner==='mongoku'||c.consumers.includes('mongoku')).length);
    await noClippedText(page,'[data-testid=gn-board] .gn-card');
    await shot(page,'board','[data-testid=galaxy-navigator]');
    report.checks.board={lanes:Object.fromEntries(lanes),involved};

    // 4. Isometric: framework Motion v2 SVG, labels inside, click selects, export.
    await view(page,'iso');await page.waitForSelector('[data-testid=gn-iso] svg[data-renderer=framework-motion-v2]');
    assert.equal(await page.locator('[data-testid=gn-iso] [data-entity]').count(),REGISTRY.nodes.length);
    const isoTexts=await isoLabelsInside(page);
    await page.locator('[data-testid=gn-iso] [data-entity=powerops]').first().click();
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=powerops]');
    const [isoDl]=await Promise.all([page.waitForEvent('download'),page.getByTestId('gn-export-svg').click()]);
    const isoPath=path.join(out,'export-iso.svg');await isoDl.saveAs(isoPath);
    const iso=await readFile(isoPath,'utf8');assert.ok(iso.includes('data-representation="isometric"')&&!iso.includes('var(--'),'isometric SVG export');
    await shot(page,'isometric','[data-testid=gn-iso]');
    report.checks.isometric={texts:isoTexts,exportBytes:iso.length};
    assert.deepEqual(errors,[],'page errors');assert.deepEqual(external,[],'external requests');
    await context.close();
  }
  for(const scheme of ['light','dark']){
    // 5. 3D: lazy chunk, focus kept across views, focus-fly, label click, orbit, tour seek. Real motion (no capture flag).
    const {page,context,errors,external,scripts}=await open({query:'',scheme});
    await page.waitForLoadState('networkidle');const before=new Set(scripts);
    await page.locator('.gn-node[data-node=datapass-vscode] .gn-hit').click();await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=datapass-vscode]');
    await view(page,'galaxy3d');await settled3d(page);
    const lazy=[...new Set(scripts)].filter(f=>!before.has(f));
    assert.ok(lazy.some(f=>/three/.test(f))&&lazy.some(f=>/Galaxy3D/.test(f)),'three.js arrives only with the 3D view');
    let lazyGzip=0;for(const f of lazy)lazyGzip+=await gz(f);
    assert.ok(lazyGzip<=BUDGET.lazy3dJsGzip,`lazy 3D JS gzip ${lazyGzip} > ${BUDGET.lazy3dJsGzip}`);
    assert.equal(await page.locator('.gn3-label').count(),REGISTRY.nodes.length);
    assert.ok(await page.locator('.gn3-label.on[data-node=datapass-vscode]').count()===1,'focus kept in 3D');
    const shown=await labels3dInside(page);assert.ok(shown>=4,'3D labels shown: '+shown);
    if(scheme==='light'){
      // Click a label: focus moves and the camera flies.
      const p0=await page.evaluate(()=>window.__galaxy3d.pose());
      await page.evaluate(()=>document.querySelector('.gn3-label[data-node=mongoku]').click());
      await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=mongoku]');await settled3d(page);
      const p1=await page.evaluate(()=>window.__galaxy3d.pose());assert.notDeepEqual(p0.target,p1.target,'focus-fly moves the camera');
      await labels3dInside(page);
      // Orbit with the keyboard.
      await page.locator('.gn3-stage').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(az=>window.__galaxy3d.pose().azimuth>az+.1,p1.azimuth);await settled3d(page);
      const p2=await page.evaluate(()=>window.__galaxy3d.pose());assert.ok(p2.azimuth>p1.azimuth,'keyboard orbit');
      // Tour: deterministic seek.
      await page.evaluate(()=>window.__galaxy3d.seek(12.5));const a=await page.evaluate(()=>window.__galaxy3d.pose());
      await page.evaluate(()=>window.__galaxy3d.seek(3));await page.evaluate(()=>window.__galaxy3d.seek(12.5));const b=await page.evaluate(()=>window.__galaxy3d.pose());
      assert.deepEqual(a,b,'tour frames depend only on t');
      await page.getByTestId('gn-3d-reset').click();
      await page.locator('.gn-node[data-node=datapass-vscode]').count();
      report.checks.galaxy3d={lazyJsGzip:lazyGzip,lazyFiles:lazy.length,labelsShown:shown,flight:[p0.target,p1.target]};
      // Back to the focus used for the captures.
      await page.evaluate(()=>document.querySelector('.gn3-label[data-node=datapass-vscode]').click());
      await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=datapass-vscode]');await settled3d(page);
    }
    await page.waitForTimeout(300);
    await labels3dInside(page);
    await shot(page,'3d-'+scheme,'[data-testid=galaxy-navigator]');
    // Overview capture of the whole galaxy.
    await page.getByTestId('gn-3d-reset').click();await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=none]');await settled3d(page);await page.waitForTimeout(300);
    await labels3dInside(page);
    await shot(page,'3d-overview-'+scheme,'.gn3-stage');
    assert.deepEqual(errors,[],'page errors '+scheme);assert.deepEqual(external,[],'external requests');
    await context.close();
  }
  {
    // 6. Reduced motion: the 3D camera jumps (settled at once) and the tour is off.
    const {page,context,errors}=await open({query:'',reduced:'reduce'});
    await view(page,'galaxy3d');await settled3d(page);
    assert.equal(await page.getByTestId('gn-tour').isDisabled(),true,'tour off under reduced motion');
    await page.evaluate(()=>document.querySelector('.gn3-label[data-node=foil]').click());
    await page.waitForSelector('[data-testid=galaxy-navigator][data-focus=foil]');
    assert.equal(await page.evaluate(()=>window.__galaxy3d.settled()),true,'reduced motion jumps');
    assert.deepEqual(errors,[]);report.checks.reduced={tourDisabled:true};
    await context.close();
  }
  {
    // 7. Narrow viewport, every view: no horizontal overflow, labels inside.
    const {page,context,errors}=await open({width:390,height:844,query:''});
    await page.locator('.gn-node[data-node=claude-control] .gn-hit').click();await settled(page);
    await labelsInside(page,{allInside:false});
    const overflow={};
    for(const v of ['graph','list','matrix','board','iso','galaxy3d']){
      await view(page,v);
      if(v==='galaxy3d'){await settled3d(page);await labels3dInside(page);}
      if(v==='iso'){await page.waitForSelector('[data-testid=gn-iso] svg');await isoLabelsInside(page);}
      overflow[v]=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow[v]<=1,`horizontal overflow at 390px in ${v}: ${overflow[v]}`);
    }
    assert.deepEqual(errors,[]);
    report.checks.narrow={width:390,overflow};
    await context.close();
  }
  report.status='passed';
}finally{
  await browser.close();server.kill();
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('Galaxy Navigator smoke passed: '+JSON.stringify(report.checks));

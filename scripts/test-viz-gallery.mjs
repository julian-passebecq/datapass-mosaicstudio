/** Viz kit N1 + N2 acceptance: bundle budget + browser smoke on the built fabric-gallery-reference.
 * Usage: npm run test:viz-gallery [-- --no-build]. Writes qa/viz-gallery.json and captures under qa/viz-gallery/.
 * N1 checks: settled flags, brush filters bar/KPI, bar click crossfilters the other visuals,
 * reduced motion has no tweens, 120k scatter first paint < 300 ms, capture twice -> identical hashes.
 * N2 checks: the three.js chunk loads only on the 3D page, the 3D page renders (WebGL) and settles,
 * column click / lasso in 3D filter the 2D page and 2D filters reshape 3D, `?webgl=0` falls back to
 * 2D equivalents, reduced motion has no 3D tweens, and 3D captures are identical twice.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const id='fabric-gallery-reference',port=4183,url=`http://127.0.0.1:${port}/`;
const VIZ_BUDGETS=Object.freeze({core:40*1024,canvas:10*1024});
const ORDERS=120000;

/** Gzipped size of a minified bundle of an entry, React (shared runtime) external. */
async function gz(entry,external=[]){
  const out=await build({entryPoints:[entry],bundle:true,minify:true,write:false,format:'esm',platform:'browser',external:['react','react-dom','react/jsx-runtime',...external],jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
  return gzipSync(out.outputFiles[0].contents,{level:9}).length;
}
async function sizes(){
  const core=await gz('src/framework/viz/index.ts'),withCanvas=await (async()=>{await mkdir('.generated',{recursive:true});await writeFile('.generated/viz-all.ts',"export * from '../src/framework/viz/index.ts';export * from '../src/framework/viz/Scatter.tsx';\n");return gz('.generated/viz-all.ts');})();
  // WebGL: lazy chunk, reported but outside the core budget. The wrapper (main chunk) excludes the engine.
  const webglEngine=await gz('src/framework/viz/webgl/engine.ts'),webglEngineOwn=await gz('src/framework/viz/webgl/engine.ts',['three','three/*']);
  await writeFile('.generated/viz-3d.ts',"export * from '../src/framework/viz/index.ts';export * from '../src/framework/viz/webgl/Chart3D.tsx';\n");
  const wrapper=await gz('.generated/viz-3d.ts',['./engine.ts'])-core;
  return {coreGzipBytes:core,canvasGzipBytes:withCanvas-core,webgl:{lazyChunkGzipBytes:webglEngine,engineWithoutThreeGzipBytes:webglEngineOwn,wrapperGzipBytes:wrapper,note:'three.js + engine load only when a 3D mark renders; not part of the 40 KB core'},budget:VIZ_BUDGETS};
}
const sha=b=>createHash('sha256').update(b).digest('hex');
const allSettled=()=>{const all=[...document.querySelectorAll('[data-viz-settled]')];return all.length>=(document.querySelector('[data-page=explorer-3d]')?5:10)&&all.every(e=>e.getAttribute('data-viz-settled')==='true');};
async function open(browser,{query='',reduced=false,theme}={}){
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:reduced?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const scripts=[];page.on('request',r=>{if(r.resourceType()==='script')scripts.push(r.url());});page.scripts=scripts;
  await page.goto(url+query);await page.getByTestId('fabric-gallery').waitFor({timeout:60000});
  if(theme==='light')await page.getByRole('button',{name:'Switch to light theme'}).click();
  await page.waitForFunction(allSettled,null,{timeout:20000});
  return {page,errors};
}
/** N2: the 3D explorer page. */
async function test3D(browser){
  const out={};
  const {page,errors}=await open(browser,{query:'?page=explorer-3d'});
  assert.ok(page.scripts.some(u=>/\/engine-[^/]*\.js$/.test(u)),'3D page did not load the lazy WebGL chunk');
  for(const id of ['chart-columns3d','chart-surface3d','chart-cloud3d'])assert.equal(await page.getByTestId(id).getAttribute('data-viz-renderer'),'webgl',id);
  assert.equal(await page.getByTestId('chart-cloud3d').getAttribute('data-marks'),String(ORDERS));
  const total=()=>page.getByTestId('chart-columns3d').getAttribute('data-total').then(Number);
  const t0=await total(),k0=await kpi(page);
  // 3D -> 2D: a canvas click on a Latin America column (front row) writes fg-region.
  const at=await page.getByTestId('chart-columns3d').evaluate(h=>h.__viz3d.cell('latam','6'));
  const seen=await watchSettled(page,()=>page.mouse.click(at.x,at.y));
  assert.ok(seen.includes('false'),'3D column update did not animate');
  assert.equal(await page.getByRole('button',{name:'Remove filter Latin America'}).count(),1,'Column click did not select its region');
  const k1=await kpi(page);assert.ok(k1<k0,'KPI not filtered by the 3D column click');
  await page.getByTestId('tab-dashboard').click();await page.waitForFunction(allSettled);
  assert.equal(await page.getByRole('button',{name:'Remove filter Latin America'}).count(),1,'2D page lost the 3D selection');
  assert.equal(await kpi(page),k1,'2D KPI differs from the 3D page');
  // 2D -> 3D: a bar click on the overview reshapes the 3D columns.
  await page.getByRole('button',{name:/^Bikes:/}).click();await page.waitForFunction(allSettled);
  await page.getByTestId('tab-explorer-3d').click();await page.waitForFunction(allSettled);
  assert.ok(await total()<t0,'3D columns ignore the 2D category filter');
  assert.equal(await page.getByRole('button',{name:'Remove filter Bikes'}).count(),1);
  // Lasso on the 120k cloud -> discount/margin brush shared with the 2D scatter.
  await page.getByTestId('mode-lasso').click();
  const box=await page.getByTestId('chart-cloud3d').boundingBox(),cx=box.x+box.width*0.42,cy=box.y+box.height*0.45;
  await page.mouse.move(cx-90,cy-70);await page.mouse.down();
  for(const [dx,dy] of [[90,-80],[100,10],[60,90],[-60,80],[-110,20]])await page.mouse.move(cx+dx,cy+dy,{steps:4});
  await page.mouse.up();await page.waitForFunction(allSettled);
  assert.equal(await page.getByRole('button',{name:/^Remove filter Discount/}).count(),1,'Lasso did not write the brush');
  out.lassoSelected=Number(await page.getByTestId('chart-cloud3d').getAttribute('data-selected'));assert.ok(out.lassoSelected>0,'Lasso selected nothing');
  await page.getByTestId('tab-dashboard').click();await page.waitForFunction(allSettled);
  assert.equal(await page.getByTestId('chart-scatter-brush').count(),1,'2D scatter does not show the 3D lasso brush');
  assert.ok(Number(await page.getByTestId('chart-scatter').getAttribute('data-brushed'))>0);
  assert.deepEqual(errors,[]);await page.close();
  // Reduced motion: no 3D tweens.
  {const {page:p}=await open(browser,{query:'?page=explorer-3d',reduced:true});const a=await p.getByTestId('chart-columns3d').evaluate(h=>h.__viz3d.cell('latam','2'));const s=await watchSettled(p,()=>p.mouse.click(a.x,a.y));assert.ok(!s.includes('false'),'Reduced motion still animates 3D');await p.close();}
  // No WebGL: every 3D visual renders its 2D equivalent with a note.
  {const {page:p,errors:e}=await open(browser,{query:'?page=explorer-3d&webgl=0'});
    assert.equal(await p.locator('[data-viz-fallback=true]').count(),3);assert.equal(await p.getByRole('note').count(),3);
    assert.equal(await p.getByTestId('chart-cloud3d-2d').getAttribute('data-viz-renderer'),'canvas');assert.equal(await p.getByTestId('chart-columns3d-2d').getAttribute('data-viz-settled'),'true');
    assert.ok(!p.scripts.some(u=>/\/engine-[^/]*\.js$/.test(u)),'Fallback must not download the WebGL chunk');
    assert.deepEqual(e,[]);await p.close();}
  return {...out,columnsTotal:[t0],status:'passed'};
}
const kpi=page=>page.getByTestId('kpi-revenue').getAttribute('data-value').then(Number);
/** Record every data-viz-settled value seen during `action` plus 600 ms. */
async function watchSettled(page,action){
  await page.evaluate(()=>{window.__seen=[];new MutationObserver(list=>{for(const m of list)window.__seen.push(m.target.getAttribute('data-viz-settled'));}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-viz-settled']});});
  await action();await page.waitForTimeout(600);await page.waitForFunction(allSettled);
  return page.evaluate(()=>window.__seen);
}

{
  const report={format:'datapass.viz-gallery',version:1,client:id,sizes:await sizes()};
  assert.ok(report.sizes.coreGzipBytes<=VIZ_BUDGETS.core,`viz core ${report.sizes.coreGzipBytes} B gz > ${VIZ_BUDGETS.core}`);
  assert.ok(report.sizes.canvasGzipBytes<=VIZ_BUDGETS.canvas,`viz canvas ${report.sizes.canvasGzipBytes} B gz > ${VIZ_BUDGETS.canvas}`);
  if(!process.argv.includes('--no-build')){const b=spawnSync(process.execPath,['--experimental-strip-types','scripts/build-client.mjs',id],{stdio:'inherit'});if(b.status!==0)process.exit(b.status||1);}
  const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port',String(port)],{env:{...process.env,STUDIO_CLIENT:id},stdio:['ignore','pipe','pipe']});
  let log='';server.stdout.on('data',v=>{log+=v;});server.stderr.on('data',v=>{log+=v;});
  const browser=await chromium.launch();
  try{
    let ready=false;for(let i=0;i<150&&!ready;i++){try{ready=(await fetch(url)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'Preview failed: '+log);
    // 1. Load, settle, renderer and first paint.
    const {page,errors}=await open(browser);
    const scatter=page.getByTestId('chart-scatter');
    assert.equal(await scatter.getAttribute('data-viz-renderer'),'canvas');assert.equal(await scatter.getAttribute('data-marks'),String(ORDERS));
    const firstPaint=Number(await scatter.getAttribute('data-first-paint-ms'));assert.ok(firstPaint<300,'120k scatter first paint '+firstPaint+' ms');
    assert.ok(!page.scripts.some(u=>/\/(engine|OrbitControls)-[^/]*\.js$/.test(u)),'The WebGL engine / three.js chunks must not load on the 2D page');
    assert.equal(await page.getByTestId('chart-category').getAttribute('data-viz-renderer'),'svg');
    // 2. Brush on the scatter filters the bar chart and the KPI; transitions run (settled goes false then true).
    const before={revenue:await kpi(page),bars:await page.locator('[data-testid=chart-category] .viz-mark-shape').evaluateAll(n=>n.map(e=>e.getAttribute('d')).join('|'))};
    const box=await page.getByTestId('chart-scatter-surface').boundingBox();
    const seen=await watchSettled(page,async()=>{await page.mouse.move(box.x+box.width*0.1,box.y+box.height*0.15);await page.mouse.down();await page.mouse.move(box.x+box.width*0.35,box.y+box.height*0.5,{steps:6});await page.mouse.up();});
    assert.ok(seen.includes('false'),'Brush update did not animate');
    const brushed={revenue:await kpi(page),bars:await page.locator('[data-testid=chart-category] .viz-mark-shape').evaluateAll(n=>n.map(e=>e.getAttribute('d')).join('|'))};
    assert.ok(brushed.revenue>0&&brushed.revenue<before.revenue,'KPI not filtered by brush');assert.notEqual(brushed.bars,before.bars,'Bars not filtered by brush');
    assert.ok(Number(await scatter.getAttribute('data-brushed'))>0);
    await page.getByRole('button',{name:'Clear brush'}).click();await page.waitForFunction(allSettled);
    assert.equal(await kpi(page),before.revenue);
    // 3. Clicking a bar updates the five other visuals.
    const snapshot=()=>page.evaluate(()=>Object.fromEntries(['kpi-revenue','chart-trend','chart-channel','chart-heat','chart-scatter','chart-stores'].map(t=>{const e=document.querySelector(`[data-testid=${t}]`);return [t,t==='chart-scatter'?e.getAttribute('data-active')+'/'+e.getAttribute('data-brushed'):t.startsWith('kpi')?e.getAttribute('data-value'):e.innerHTML];})));
    const s0=await snapshot();
    await page.getByRole('button',{name:/^Bikes:/}).click();await page.waitForFunction(allSettled);
    assert.equal(await page.getByRole('button',{name:'Remove filter Bikes'}).count(),1);
    const s1=await snapshot(),changed=Object.keys(s0).filter(k=>s0[k]!==s1[k]);
    assert.deepEqual(changed.sort(),['chart-channel','chart-heat','chart-scatter','chart-stores','chart-trend','kpi-revenue'],'Bar click must update the other visuals');
    assert.deepEqual(errors,[]);await page.close();
    // 4. Reduced motion: no tween is ever scheduled.
    {const {page:p}=await open(browser,{reduced:true});const seenReduced=await watchSettled(p,()=>p.getByRole('button',{name:/^Services:/}).click());assert.ok(!seenReduced.includes('false'),'Reduced motion still animates');await p.close();}
    // 5. 3D page (N2): lazy WebGL, crossfilter both ways, lasso, fallback, reduced motion.
    report.threeD=await test3D(browser);
    // 6. Capture determinism: same state, twice, light and dark -> identical PNG hashes.
    await mkdir('qa/viz-gallery',{recursive:true});report.captures={};
    for(const theme of ['dark','light']){
      const hashes=[];
      for(let run=0;run<2;run++){const {page:p,errors:e}=await open(browser,{query:'?capture=1',theme});assert.equal(await p.getByTestId('fabric-gallery').getAttribute('data-viz-capture'),'true');const png=await p.screenshot({fullPage:true});hashes.push(sha(png));if(run===0)await writeFile(`qa/viz-gallery/${theme}.png`,png);assert.deepEqual(e,[]);await p.close();}
      assert.equal(hashes[0],hashes[1],'Capture not deterministic: '+theme);report.captures[theme]=hashes[0];
    }
    {const hashes=[];for(let run=0;run<2;run++){const {page:p,errors:e}=await open(browser,{query:'?page=explorer-3d&capture=1'});const png=await p.screenshot({fullPage:true});hashes.push(sha(png));if(run===0)await writeFile('qa/viz-gallery/explorer-3d.png',png);assert.deepEqual(e,[]);await p.close();}
      assert.equal(hashes[0],hashes[1],'3D capture not deterministic');report.captures['explorer-3d']=hashes[0];}
    Object.assign(report,{firstPaintMs:firstPaint,brush:{before:before.revenue,after:brushed.revenue},crossfilter:changed,status:'passed'});
    await writeFile('qa/viz-gallery.json',JSON.stringify(report,null,2)+'\n');
    console.log(`Viz gallery passed: core ${report.sizes.coreGzipBytes} B gz, canvas ${report.sizes.canvasGzipBytes} B gz, webgl lazy chunk ${report.sizes.webgl.lazyChunkGzipBytes} B gz (wrapper ${report.sizes.webgl.wrapperGzipBytes} B), scatter first paint ${firstPaint} ms, 3D sync + fallback ok, captures stable.`);
  }finally{await browser.close();server.kill();}
}

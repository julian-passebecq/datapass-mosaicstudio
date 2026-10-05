/** Viz kit N1 acceptance: bundle budget + browser smoke on the built fabric-gallery-reference.
 * Usage: npm run test:viz-gallery [-- --no-build]. Writes qa/viz-gallery.json and captures under qa/viz-gallery/.
 * Checks: settled flags, brush filters bar/KPI, bar click crossfilters the other visuals,
 * reduced motion has no tweens, 50k scatter first paint < 300 ms, capture twice -> identical hashes.
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

/** Gzipped size of a minified bundle of an entry, React (shared runtime) external. */
async function gz(entry){
  const out=await build({entryPoints:[entry],bundle:true,minify:true,write:false,format:'esm',platform:'browser',external:['react','react-dom','react/jsx-runtime'],jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
  return gzipSync(out.outputFiles[0].contents,{level:9}).length;
}
async function sizes(){
  const core=await gz('src/framework/viz/index.ts'),withCanvas=await (async()=>{await mkdir('.generated',{recursive:true});await writeFile('.generated/viz-all.ts',"export * from '../src/framework/viz/index.ts';export * from '../src/framework/viz/Scatter.tsx';\n");return gz('.generated/viz-all.ts');})();
  return {coreGzipBytes:core,canvasGzipBytes:withCanvas-core,budget:VIZ_BUDGETS};
}
const sha=b=>createHash('sha256').update(b).digest('hex');
const allSettled=()=>{const all=[...document.querySelectorAll('[data-viz-settled]')];return all.length>=10&&all.every(e=>e.getAttribute('data-viz-settled')==='true');};
async function open(browser,{query='',reduced=false,theme}={}){
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:reduced?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+query);await page.getByTestId('fabric-gallery').waitFor({timeout:60000});
  if(theme==='light')await page.getByRole('button',{name:'Switch to light theme'}).click();
  await page.waitForFunction(allSettled,null,{timeout:20000});
  return {page,errors};
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
    assert.equal(await scatter.getAttribute('data-viz-renderer'),'canvas');assert.equal(await scatter.getAttribute('data-marks'),'50000');
    const firstPaint=Number(await scatter.getAttribute('data-first-paint-ms'));assert.ok(firstPaint<300,'50k scatter first paint '+firstPaint+' ms');
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
    // 5. Capture determinism: same state, twice, light and dark -> identical PNG hashes.
    await mkdir('qa/viz-gallery',{recursive:true});report.captures={};
    for(const theme of ['dark','light']){
      const hashes=[];
      for(let run=0;run<2;run++){const {page:p,errors:e}=await open(browser,{query:'?capture=1',theme});assert.equal(await p.getByTestId('fabric-gallery').getAttribute('data-viz-capture'),'true');const png=await p.screenshot({fullPage:true});hashes.push(sha(png));if(run===0)await writeFile(`qa/viz-gallery/${theme}.png`,png);assert.deepEqual(e,[]);await p.close();}
      assert.equal(hashes[0],hashes[1],'Capture not deterministic: '+theme);report.captures[theme]=hashes[0];
    }
    Object.assign(report,{firstPaintMs:firstPaint,brush:{before:before.revenue,after:brushed.revenue},crossfilter:changed,status:'passed'});
    await writeFile('qa/viz-gallery.json',JSON.stringify(report,null,2)+'\n');
    console.log(`Viz gallery passed: core ${report.sizes.coreGzipBytes} B gz, canvas ${report.sizes.canvasGzipBytes} B gz, scatter first paint ${firstPaint} ms, captures stable.`);
  }finally{await browser.close();server.kill();}
}

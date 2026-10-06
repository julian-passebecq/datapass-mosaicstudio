/** Portfolio showcase acceptance: budgets + Playwright smoke + stable captures on the built client.
 * Usage (repo root): node --experimental-strip-types clients/portfolio-showcase/qa/smoke.mjs [--no-build]
 * Writes qa/portfolio-showcase/{report.json,*.png} (untracked).
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';
import {STATS} from '../stats.generated.ts';

const id='portfolio-showcase',port=4191,url=`http://127.0.0.1:${port}/`,dist=path.resolve('dist-clients',id),out=path.resolve('qa',id);
const BUDGET=Object.freeze({jsGzip:160*1024,image:64*1024,images:360*1024,video:2*1024*1024,videos:6*1024*1024,fonts:128*1024});
const CARDS=10,IMAGES=8,VIDEOS=['viz-2d','fabric-bricks','arch-atlas','coding-lab'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={format:'portfolio.acceptance',version:1,checks:{}};

const node=(args)=>{const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);};
node(['--experimental-strip-types','clients/portfolio-showcase/tools/stats.mjs','--check']);
if(!process.argv.includes('--no-build'))node(['--experimental-strip-types','scripts/build-client.mjs',id]);

// 1. Build budgets.
const assets=path.join(dist,'assets'),js=(await readdir(assets)).filter(f=>f.endsWith('.js'));
let jsGzip=0;for(const f of js)jsGzip+=gzipSync(await readFile(path.join(assets,f)),{level:9}).length;
const evidence=JSON.parse(await readFile(path.join(dist,'studio-build.json'),'utf8'));
const sized=async(dir,ok)=>Promise.all((await readdir(path.join(dist,dir))).filter(ok).map(async f=>({f,bytes:(await stat(path.join(dist,dir,f))).size})));
const stills=[...await sized('work',f=>f.endsWith('.webp')),...await sized('media',f=>f.endsWith('.webp'))];
const videos=await sized('media',f=>f.endsWith('.mp4')),videoTotal=videos.reduce((s,v)=>s+v.bytes,0);
const fonts=await sized('assets',f=>f.endsWith('.woff2')),fontTotal=fonts.reduce((s,v)=>s+v.bytes,0);
const imageTotal=stills.reduce((s,i)=>s+i.bytes,0);
assert.ok(jsGzip<=BUDGET.jsGzip,`JS gzip ${jsGzip} > ${BUDGET.jsGzip}`);
assert.equal(evidence.containsThree,false,'three.js must not be in the portfolio build');
for(const i of stills)assert.ok(i.bytes<=BUDGET.image,`${i.f} ${i.bytes} B > ${BUDGET.image}`);
assert.ok(imageTotal<=BUDGET.images,`images ${imageTotal} > ${BUDGET.images}`);
assert.equal(videos.length,VIDEOS.length,'demo video count');for(const v of videos)assert.ok(v.bytes<=BUDGET.video,`${v.f} ${v.bytes} B > ${BUDGET.video}`);
assert.ok(videoTotal<=BUDGET.videos,`videos ${videoTotal} > ${BUDGET.videos}`);
assert.equal(fonts.length,2,'two bundled fonts');assert.ok(fontTotal<=BUDGET.fonts,`fonts ${fontTotal} > ${BUDGET.fonts}`);
report.checks.budgets={jsGzipBytes:jsGzip,jsFiles:js.length,imageBytes:imageTotal,images:stills.length,videoBytes:videoTotal,videos:videos.length,fontBytes:fontTotal,containsThree:false,budget:BUDGET};

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port',String(port)],{env:{...process.env,STUDIO_CLIENT:id},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',v=>{log+=v;});server.stderr.on('data',v=>{log+=v;});
const browser=await chromium.launch();
const settled=()=>{const all=[...document.querySelectorAll('[data-viz-settled]')];return all.length>=6&&all.every(e=>e.getAttribute('data-viz-settled')==='true');};
async function open({width=1440,height=900,scheme='light',reduced=false,query=''}={}){
  const page=await browser.newPage({viewport:{width,height},colorScheme:scheme,reducedMotion:reduced?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.type()+': '+m.text());});
  const failed=[];page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  await page.goto(url+query);await page.getByTestId('portfolio').waitFor({timeout:30000});
  await page.waitForFunction(settled,null,{timeout:15000});
  return {page,errors,failed};
}
/** Load every still (lazy ones too) and verify it decoded. */
async function images(page){
  return page.evaluate(async()=>{const imgs=[...document.querySelectorAll('.pf img')];for(const i of imgs)i.loading='eager';await Promise.all(imgs.map(i=>i.decode().catch(()=>null)));return imgs.map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0,w:i.naturalWidth}));});
}
const hscroll=page=>page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:document.documentElement.clientWidth,wide:[...document.querySelectorAll('.pf *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+0.5).slice(0,5).map(e=>e.className||e.tagName)}));
try{
  let ready=false;for(let i=0;i<150&&!ready;i++){try{ready=(await fetch(url)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Preview failed: '+log);
  // 2. Desktop smoke: content, numbers, images, theme field.
  {const {page,errors,failed}=await open();
    assert.equal(await page.locator('.pf-card').count(),CARDS);
    assert.equal(await page.getByTestId('kpi-clients').getAttribute('data-value'),String(STATS.clients.count));
    assert.equal(await page.getByTestId('kpi-commits').getAttribute('data-value'),String(STATS.git.commits));
    assert.equal(await page.getByTestId('viz-budget').getAttribute('data-value'),String(STATS.bundles.vizCoreGzipBytes));
    assert.equal(await page.locator('[data-testid=chart-bundles] rect.viz-mark, [data-testid=chart-bundles] .viz-mark').count()>0,true,'bundle bars missing');
    assert.equal(await page.locator('[data-testid=work-engineering] img').count(),0,'private card must not show an image');
    const imgs=await images(page);assert.equal(imgs.length,IMAGES);for(const i of imgs)assert.ok(i.ok,'image did not load: '+i.src);
    assert.equal(await page.getByTestId('portfolio').getAttribute('data-theme-mode'),'light');
    await page.getByTestId('theme-toggle').click();assert.equal(await page.getByTestId('portfolio').getAttribute('data-theme-mode'),'light');
    await page.getByTestId('theme-toggle').click();assert.equal(await page.getByTestId('portfolio').getAttribute('data-theme-mode'),'dark');
    await page.waitForFunction(settled);
    await page.getByRole('button',{name:'System'}).click();
    // Demo videos: nothing is fetched or created before a click; a click plays muted, inline, from our origin.
    assert.equal(await page.locator('video').count(),0,'no <video> before a click');
    const played={};
    for(const id of VIDEOS){
      await page.getByTestId('play-'+id).click();
      const v=page.getByTestId('video-'+id);await v.waitFor();
      await page.waitForFunction(i=>{const e=document.querySelector(`[data-testid=video-${i}]`);return e&&e.readyState>=2&&e.currentTime>0.2&&!e.paused;},id,{timeout:20000});
      played[id]=await v.evaluate(e=>({muted:e.muted,inline:e.playsInline,width:e.videoWidth,height:e.videoHeight,src:new URL(e.currentSrc).origin===location.origin}));
      assert.equal(played[id].muted,true);assert.equal(played[id].src,true);assert.ok(played[id].height<=720&&played[id].width>0,'video size '+JSON.stringify(played[id]));
      await v.evaluate(e=>e.pause());
    }
    assert.deepEqual(errors,[],'console errors: '+errors.join(' | '));assert.deepEqual(failed,[],'failed requests: '+failed.join(' | '));
    report.checks.desktop={cards:CARDS,images:imgs.length,videos:played,themeCycle:'auto>light>dark',errors:0};await page.close();}
  // 3. 390 px: no horizontal scroll in either theme, images load.
  report.checks.mobile={};
  for(const scheme of ['light','dark']){const {page,errors,failed}=await open({width:390,height:844,scheme});
    await images(page);const h=await hscroll(page);
    assert.ok(h.doc<=h.view,`horizontal scroll at 390 px (${scheme}): ${h.doc} > ${h.view} ${JSON.stringify(h.wide)}`);
    assert.equal(await page.getByTestId('portfolio').getAttribute('data-theme-mode'),scheme);
    assert.deepEqual(errors,[],'console errors: '+errors.join(' | '));assert.deepEqual(failed,[]);
    report.checks.mobile[scheme]={scrollWidth:h.doc,clientWidth:h.view};await page.close();}
  // 4. Reduced motion: nothing animates, everything settled on first check.
  {const {page}=await open({reduced:true});assert.equal(await page.locator('.pf[data-viz-reduced=true]').count(),1);
    await page.waitForTimeout(600);assert.equal(await page.locator('video').count(),0,'reduced motion: no video starts on its own');
    report.checks.reducedMotion=true;await page.close();}
  // 5. Captures twice per (theme, width): identical bytes.
  await mkdir(out,{recursive:true});report.checks.captures={};
  for(const [scheme,width] of [['light',1440],['dark',1440],['light',390],['dark',390]]){
    const hashes=[];
    for(let k=0;k<2;k++){const {page}=await open({width,height:900,scheme,query:'?capture=1'});await images(page);await page.evaluate(()=>document.fonts.ready);
      const png=await page.screenshot({fullPage:true,animations:'disabled'});hashes.push(sha(png));if(k===0)await writeFile(path.join(out,`${scheme}-${width}.png`),png);await page.close();}
    assert.equal(hashes[0],hashes[1],`capture ${scheme}-${width} differs between runs`);
    report.checks.captures[`${scheme}-${width}`]=hashes[0];
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Portfolio OK: JS ${jsGzip} B gz, images ${imageTotal} B, videos ${videoTotal} B (${videos.length}, played on click), fonts ${fontTotal} B, desktop + 390 px light/dark, reduced motion, 4 captures stable twice.`);
}finally{await browser.close();server.kill();}

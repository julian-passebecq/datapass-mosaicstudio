/** Deterministic target-state capture, not a second animation or task runtime. */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {mkdir,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDevArguments} from './client-dev.mjs';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function parseCaptureArguments(args){
  const [id,...flags]=args;parseDevArguments([id]);
  const options={id,width:1440,height:1000,port:4179};const seen=new Set();
  for(let i=0;i<flags.length;i++){
    const flag=flags[i];if(!['--state','--page','--out','--width','--height','--port'].includes(flag)||seen.has(flag))throw new Error('Unknown or repeated capture option: '+flag);seen.add(flag);
    const value=flags[++i];if(!value||value.startsWith('--'))throw new Error('Missing value for '+flag);
    if(['--width','--height','--port'].includes(flag)){if(!/^\d+$/.test(value))throw new Error('Capture dimensions and port must be integers');options[flag.slice(2)]=Number(value);}
    else options[flag.slice(2)]=value;
  }
  if(!options.out)throw new Error('Usage: client:capture -- <id> --out <new-directory> [--state inputs.json] [--page page-id] [--width 1440] [--height 1000] [--port 4179]');
  if(options.width<320||options.width>2560||options.height<240||options.height>2160||options.width*options.height>5529600)throw new Error('Capture viewport must be 320..2560 by 240..2160 pixels');
  parseDevArguments([id,'--port',String(options.port)]);
  if(options.page&&!/^[a-z][a-z0-9-]{0,59}$/.test(options.page))throw new Error('Invalid capture page id');
  return options;
}
async function hashFiles(directory,relative=''){
  const result=[];
  for(const entry of (await readdir(path.join(directory,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const name=path.posix.join(relative,entry.name),file=path.join(directory,name);
    if(entry.isSymbolicLink())throw new Error('Capture build contains a symbolic file: '+name);
    if(entry.isDirectory())result.push(...await hashFiles(directory,name));
    else if(entry.isFile()){const bytes=await readFile(file);result.push({path:name,bytes:bytes.length,sha256:sha256(bytes)});}
  }
  return result;
}
function sourceReceipt(){
  const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}),status=spawnSync('git',['status','--porcelain'],{encoding:'utf8'});
  return {headSha:head.status===0?head.stdout.trim():null,workingTreeDirty:status.status===0?status.stdout.trim().length>0:null};
}
/** Internal acceptance entry: caller supplies a freshly built selected target. CLI always builds. */
export async function captureBuiltClient(options){
  const out=path.resolve(options.out),buildDirectory=path.resolve('dist-clients',options.id);
  const build=JSON.parse(await readFile(path.join(buildDirectory,'studio-build.json'),'utf8'));
  if(build.format!=='datapass.client-build'||build.version!==1||build.client!==options.id)throw new Error('Capture requires the matching isolated client build, not the workbench or another client.');
  const [{loadClient},{SiteRuntime},{preview},{chromium}]=await Promise.all([
    import('./load-client.mjs'),import('../src/framework/runtime.ts'),import('vite'),import('playwright')]);
  const runtime=new SiteRuntime(await loadClient(options.id));
  let state;
  if(options.state){
    const stat=await lstat(options.state);if(!stat.isFile()||stat.size>65536)throw new Error('Capture state must be a regular JSON file no larger than 64 KiB');
    state=runtime.review(await readFile(options.state,'utf8'));
    if(options.page&&options.page!==state.page)throw new Error('--page conflicts with the supplied saved state; edit the state explicitly.');
  }else state=runtime.save(options.page||runtime.manifest.pages[0].id);
  const stateText=JSON.stringify(state,null,2)+'\n',files=await hashFiles(buildDirectory),source=sourceReceipt();
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out); // Deliberately refuses overwrite.
  let server,browser;
  const errors=[],requests=[],external=[];
  try{
    await writeFile(path.join(out,'state.json'),stateText);
    server=await preview({configFile:false,logLevel:'silent',root:process.cwd(),build:{outDir:buildDirectory},preview:{host:'127.0.0.1',port:options.port,strictPort:true}});
    const origin=`http://127.0.0.1:${options.port}`;
    browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:options.width,height:options.height},deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light',locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
    await context.route('**/*',async route=>{const url=route.request().url();if(/^https?:/.test(url)&&new URL(url).origin!==origin){external.push(url);await route.abort('blockedbyclient');}else await route.continue();});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('request',request=>{if(request.url().startsWith(origin))requests.push({path:new URL(request.url()).pathname,type:request.resourceType()});});
    await page.goto(origin+'/?app='+options.id+'&page='+state.page,{waitUntil:'networkidle'});
    await page.locator(`[data-app-id="${options.id}"]`).waitFor();
    await page.getByLabel('Restore saved site inputs',{exact:true}).setInputFiles({name:'capture-state.json',mimeType:'application/json',buffer:Buffer.from(stateText)});
    await page.getByRole('button',{name:'Apply saved inputs',exact:true}).click();
    const waitForReady=async()=>{
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>!!document.querySelector('[data-capture-state=error]')||
        [...document.querySelectorAll('.site-render-status')].some(node=>node.textContent==='3D unavailable')||
        !document.querySelector('.site-loading,.model-loading')&&
        [...document.querySelectorAll('[data-capture-state]')].every(node=>node.getAttribute('data-capture-state')==='ready')&&
        [...document.querySelectorAll('[data-animating]')].every(node=>node.getAttribute('data-animating')!=='true')&&
        [...document.querySelectorAll('.site-render-status')].every(node=>node.textContent==='3D ready')&&
        [...document.querySelectorAll('.site-model[data-view=model]')].every(node=>node.querySelector('canvas[data-renderer=three-webgl2]'))&&
        [...document.images].every(image=>image.complete),{},{timeout:20000});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    await waitForReady();
    if(await page.locator('.site-notice.error,[data-capture-state=error]').count()||await page.locator('.site-render-status').filter({hasText:'3D unavailable'}).count()||await page.getByRole('heading',{name:'Site component unavailable',exact:true}).count())throw new Error('The client has a visible failure; no successful capture receipt will be emitted.');
    const brokenImages=await page.evaluate(()=>[...document.images].filter(image=>image.src&&image.naturalWidth===0).map(image=>image.src));
    if(brokenImages.length||errors.length||external.length)throw new Error('Capture did not settle cleanly: '+JSON.stringify({brokenImages,errors,external}));
    // Verify the ACTUAL UI state, not only the requested state. Export goes through the normal host port.
    await page.locator('.site-session summary').click();const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export inputs',exact:true}).click();
    const actual=runtime.review(await readFile(await (await download).path(),'utf8'));
    if(!isDeepStrictEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(state))))throw new Error('Rendered client state differs from the requested saved state');
    await page.locator('.site-session summary').click();await page.locator('.site-page-heading h1').focus();
    // UI export/focus may expose late lazy work; observe renderer state again at capture.
    await waitForReady();
    const renderers=await page.evaluate(()=>({models:[...document.querySelectorAll('.site-model[data-view=model]')].map(node=>{
      const viewport=node.querySelector('.studio-scene-viewport'),canvas=node.querySelector('canvas[data-renderer=three-webgl2]'),rect=canvas?.getBoundingClientRect();
      return {selection:node.getAttribute('data-selection'),camera:viewport?.getAttribute('data-camera'),status:node.querySelector('.site-render-status')?.textContent,
        canvas:canvas?{width:canvas.width,height:canvas.height,animating:canvas.getAttribute('data-animating'),inViewport:!!rect&&rect.width>0&&rect.height>0&&rect.top>=0&&rect.left>=0&&rect.bottom<=innerHeight&&rect.right<=innerWidth}:null};
    })}));
    if(renderers.models.some(model=>model.status!=='3D ready'||!model.canvas||model.canvas.animating!=='false'))throw new Error('The selected model renderer is not ready for capture');
    if(await page.locator('.site-notice.error,[data-capture-state=error]').count())throw new Error('The client became unavailable before capture');
    const screenshot=await page.screenshot({path:path.join(out,'capture.png'),animations:'disabled',caret:'hide',fullPage:false});
    if(errors.length||external.length)throw new Error('Capture produced a late browser or external-request failure: '+JSON.stringify({errors,external}));
    const metadata={format:'datapass.visual-capture',version:1,status:'captured',clientId:options.id,appVersion:runtime.manifest.version,page:state.page,
      source,build:{...build,files,sha256:sha256(JSON.stringify(files))},state:{file:'state.json',sha256:sha256(stateText),roundTripVerified:true},
      viewport:{width:options.width,height:options.height,deviceScaleFactor:1},browser:browser.version(),node:process.version,
      reducedMotion:true,locale:'en-US',timezone:'UTC',fontsReady:true,renderers,requests,external,errors,
      screenshot:{file:'capture.png',bytes:screenshot.length,sha256:sha256(screenshot)},
      limits:['Fixed target-state viewport, not full-page/video capture.','No claim of pixel identity across browsers, OS fonts or GPUs.','Custom asynchronous visuals must publish data-capture-state=busy/ready/error.','Capture does not press task/run controls; trusted custom source still owns its effects.','Embedded data and saved input values must be reviewed before sharing.']};
    await writeFile(path.join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
    return metadata;
  }catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({format:'datapass.visual-capture',version:1,status:'failed',clientId:options.id,message:String(error.message||error),source,errors,external},null,2)+'\n');throw error;}
  finally{await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const options=parseCaptureArguments(process.argv.slice(2));
    try{await lstat(options.out);throw new Error('Capture output already exists; choose a new directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
    const build=spawnSync(process.execPath,['--experimental-strip-types','scripts/build-client.mjs',options.id],{stdio:'inherit'});
    if(build.status!==0)throw new Error('Selected client build failed; no capture performed.');
    const metadata=await captureBuiltClient(options);console.log(JSON.stringify({format:metadata.format,version:1,clientId:metadata.clientId,out:path.resolve(options.out),screenshotSha256:metadata.screenshot.sha256}));
  }catch(error){console.error('client:capture: '+String(error.message||error));process.exitCode=1;}
}

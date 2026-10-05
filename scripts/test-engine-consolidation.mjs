import {testDev} from '../tests/engine-browser/dev.mjs';
import {testContent} from '../tests/engine-browser/content.mjs';
import {testModel} from '../tests/engine-browser/model.mjs';
import {testReplay} from '../tests/engine-browser/replay.mjs';
import {testCapture} from '../tests/engine-browser/capture.mjs';
/** End-to-end authoring and cross-consumer qualification. No deployment or snapshot blessing. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,rm,cp,lstat} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {preview} from 'vite';
import {chromium,expect as baseExpect} from '@playwright/test';
import {scaffoldClient} from './scaffold-client.mjs';
import {loadClient} from './load-client.mjs';
import {contextDocument,readClientProfile} from './client-context.mjs';
import {planCapabilities} from '../src/framework/capabilities.ts';
import {addD3Geometry,addPlainPage,addModelStoryConsumer,addReplayGraphConsumer} from '../tests/engine-fixtures.mjs';
const expect=baseExpect.configure({timeout:15000});
const sourceOnly=process.argv.includes('--source-only');
if(process.argv.slice(2).some(arg=>arg!=='--source-only'))throw new Error('Only --source-only is supported; it is NOT browser qualification.');
const output=path.resolve(process.env.ENGINE_EVIDENCE_DIR||'qa/engine-consolidation');
const prefix='engine-acceptance-',id=name=>prefix+name,owned=[];
const families=['content','knowledge','analytics','spatial','replay'];
const targets=[...families.map(family=>({name:family,family})),{name:'motion',family:'content',motion:true},{name:'foundation',family:'analytics',foundation:true},{name:'model',family:'spatial',model:true}];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();};
const report={format:'datapass.engine-qualification',version:1,status:'running',sourceOnly,sourceSha:git(['rev-parse','HEAD']),treeSha:git(['rev-parse','HEAD^{tree}']),dirtyBefore:git(['status','--porcelain']).length>0,node:process.version,platform:process.platform,ciRun:process.env.GITHUB_RUN_ID||null,checks:[],clients:[],host:[],captures:[]};
if(process.env.GITHUB_SHA)assert.equal(report.sourceSha,process.env.GITHUB_SHA,'Qualification must use the exact checked-out SHA');
await mkdir(path.dirname(output),{recursive:true});await mkdir(output); // Preserve earlier evidence.
async function inventory(root,relative=''){
  const files=[];for(const entry of (await readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=path.posix.join(relative,entry.name);assert.ok(!entry.isSymbolicLink(),'No symbolic fixture files');if(entry.isDirectory())files.push(...await inventory(root,name));else {const bytes=await readFile(path.join(root,name));files.push({path:name,bytes:bytes.length,sha256:sha(bytes)});}}
  return files;
}
const sourceBefore=sha(JSON.stringify(await inventory('src')));
async function step(name,fn){const start=Date.now();try{await fn();report.checks.push({name,status:'passed',ms:Date.now()-start});console.log('PASS '+name);}catch(error){report.checks.push({name,status:'failed',ms:Date.now()-start,error:String(error.stack||error)});if(activePage&&!activePage.isClosed())await snapshot(activePage,'failure-'+report.checks.length,false).catch(()=>{});throw error;}finally{await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');}}
function command(args,name,timeout=180000){const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout,env:process.env,maxBuffer:20*1024*1024});return writeFile(path.join(output,name+'.log'),(result.stdout||'')+(result.stderr||'')).then(()=>{assert.equal(result.status,0,`${name} failed: ${result.error||result.stderr}\n${result.stdout}`);});}
async function eventually(predicate,message,timeout=25000){const start=Date.now();while(Date.now()-start<timeout){if(await predicate())return;await delay(100);}throw new Error(message);}
let browser,activePage;
async function startDev(clientId){
  const events=[],child=spawn(process.execPath,['--experimental-strip-types','scripts/client-dev.mjs',clientId,'--port','5178','--json'],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',pending='';child.stdout.on('data',data=>{stdout+=data;pending+=data;for(;;){const index=pending.indexOf('\n');if(index<0)break;const line=pending.slice(0,index);pending=pending.slice(index+1);try{const event=JSON.parse(line);if(event.format==='datapass.client-host')events.push(event);}catch{}}});child.stderr.on('data',data=>{stderr+=data;});
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.once('error',error=>{stderr+=String(error);});
  return {child,events,exit,get stdout(){return stdout;},get stderr(){return stderr;},async close(){
    // Windows has no catchable SIGTERM (kill is TerminateProcess), so ask for the same graceful stop through stdin EOF, as a closing terminal does.
    if(child.exitCode===null&&child.signalCode===null){if(process.platform==='win32')child.stdin.end();else child.kill('SIGTERM');}const result=await Promise.race([exit,delay(8000).then(()=>{child.kill('SIGKILL');throw new Error('Owned dev process did not terminate');})]);await writeFile(path.join(output,'dev.stdout.jsonl'),stdout);await writeFile(path.join(output,'dev.stderr.log'),stderr);report.host=events;return result;}};
}
async function pageContext({reduced='reduce',instrument=false,canvasFailure=false}={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:reduced,colorScheme:'light',locale:'en-US',timezoneId:'UTC'});
  const errors=[],requests=[];
  if(instrument)await context.addInitScript(()=>{const Native=ResizeObserver,owned=new Set();Reflect.set(window,'__engineOwnedObservers',owned);window.ResizeObserver=class extends Native{observe(target,options){if(target.hasAttribute('data-visual-size'))owned.add(this);super.observe(target,options);}disconnect(){owned.delete(this);super.disconnect();}};});
  if(canvasFailure)await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='2d'?null:Reflect.apply(original,this,[type,...args]);};});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});activePage=page;
  return {context,page,errors,requests};
}
async function served(clientId,fn,options={}){
  const server=await preview({configFile:false,logLevel:'silent',build:{outDir:path.resolve('dist-clients',clientId)},preview:{host:'127.0.0.1',port:4178,strictPort:true}});
  const scope=await pageContext(options);try{await scope.page.goto('http://127.0.0.1:4178/?app='+clientId,{waitUntil:'networkidle'});await scope.page.locator('[data-app-id="'+clientId+'"]').waitFor();await fn(scope);assert.deepEqual(scope.errors,[],'No unexpected browser errors');assert.deepEqual(scope.requests.filter(url=>!url.startsWith('http://127.0.0.1:4178/')),[],'No external requests');assert.ok(!scope.requests.some(url=>/\.wasm|duckdb|sql-parser/.test(url)),'No workbench database startup');}finally{await scope.context.close();activePage=null;await new Promise(resolve=>server.httpServer.close(resolve));}}
async function snapshot(page,name,fullPage=true){await page.screenshot({path:path.join(output,name+'.png'),fullPage,animations:'disabled'});}
try{
  await step('fresh additive composition across five families and three addons',async()=>{
    for(const target of targets){try{await lstat('clients/'+id(target.name));throw new Error('Refusing an existing acceptance client: '+id(target.name));}catch(error){if(error.code!=='ENOENT')throw error;}}
    for(const target of targets){await scaffoldClient({id:id(target.name),title:'Engine acceptance / '+target.name,custom:true,...target});owned.push(id(target.name));const definition=await loadClient(id(target.name)),plan=planCapabilities(definition);assert.equal(plan.warnings.length,0);if(!['model','spatial'].includes(target.name))assert.ok(!plan.capabilities.includes('spatial'));
      const guide=contextDocument(id(target.name),definition,await readClientProfile(id(target.name)),(await readdir('clients/'+id(target.name))).sort());assert.ok(Buffer.byteLength(guide)<16384);await writeFile(path.join(output,target.name+'-context.md'),guide);}
    await addD3Geometry(id('content'));await addPlainPage(id('content'));await addModelStoryConsumer(id('model'));await addReplayGraphConsumer(id('replay'));
    await writeFile('clients/'+id('content')+'/publication.json',JSON.stringify({format:'datapass.publication',version:1,visibility:'preview',language:'en',title:'Engine preview metadata'})+'\n');
    for(const name of ['model','replay'])await loadClient(id(name));
  });
  await step('strict typecheck includes the real generated custom consumers',()=>command(['node_modules/typescript/bin/tsc','--noEmit'],'generated-typecheck'));
  await step('generated compositions satisfy the original visual engine contracts',()=>command(['scripts/check-visuals.mjs'],'generated-visual-contracts'));
  if(!sourceOnly){
    browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
    try{await testDev({step,expect,id,snapshot,output,report,startDev,eventually,pageContext});}catch(error){(report.scopeFailures??=[]).push({name:'dev',error:String(error.stack||error)});console.error('dev scope: '+String(error.message||error));}
    activePage=null;
    await step('ready receipts retain immediate source and publication edits through three restarts',()=>command(['--experimental-strip-types','tests/engine-host-watch.mjs'],'immediate-restart-watch',330000));
    await step('eight selected builds retain explicit optional-engine boundaries',async()=>{
      for(const target of targets){const clientId=id(target.name);await command(['--experimental-strip-types','scripts/build-client.mjs',clientId],target.name+'-build');const files=await inventory('dist-clients/'+clientId),build=JSON.parse(await readFile('dist-clients/'+clientId+'/studio-build.json','utf8'));assert.equal(build.client,clientId);assert.ok(!files.some(file=>/\.wasm$|duckdb|sql-parser/.test(file.path)));if(!['spatial','model'].includes(target.name))assert.equal(build.containsThree,false);
        const js=files.filter(file=>file.path.endsWith('.js'));const gzip=(await Promise.all(js.map(async file=>gzipSync(await readFile('dist-clients/'+clientId+'/'+file.path)).byteLength))).reduce((a,b)=>a+b,0);assert.ok(gzip<=2*1024*1024);if(target.name==='content')assert.ok(gzip<250000,'Light custom D3/Canvas client exceeds its explicit 250 KB gzip envelope');report.clients.push({id:clientId,capabilities:build.capabilities,containsThree:build.containsThree,javascriptGzipBytes:gzip,files});}
    });
    const browserContext={served,step,expect,id,snapshot,output,report,sha};
    for(const [name,run] of [['content',testContent],['model',testModel],['replay',testReplay],['capture',testCapture]]){try{await run(browserContext);}catch(error){(report.scopeFailures??=[]).push({name,error:String(error.stack||error)});console.error(name+' scope: '+String(error.message||error));}}
    if(report.scopeFailures?.length)throw new Error('Independent browser scopes failed; inspect checks and scopeFailures.');
  }
  await step('client authoring leaves framework source unchanged and preserves exact fixtures',async()=>{assert.equal(sha(JSON.stringify(await inventory('src'))),sourceBefore);for(const client of owned){await cp('clients/'+client,path.join(output,'fixtures',client),{recursive:true});}report.fixtureFiles=await inventory(path.join(output,'fixtures'));report.fixtureSha256=sha(JSON.stringify(report.fixtureFiles));report.sourceUnchanged=true;});
  report.status=sourceOnly?'source-only':'passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);if(activePage&&!activePage.isClosed())await snapshot(activePage,'failure',false).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await browser?.close();for(const client of owned){await cp('clients/'+client,path.join(output,'fixtures',client),{recursive:true});await rm('clients/'+client,{recursive:true,force:true});}if(owned.length){report.fixtureFiles=await inventory(path.join(output,'fixtures'));report.fixtureSha256=sha(JSON.stringify(report.fixtureFiles));}report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,sourceSha:report.sourceSha,output}));}

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function testDev({step,expect,id,snapshot,output,report,startDev,eventually,pageContext}){
  let dev;
  try{
    await step('selected dev host exposes exact loopback URL and owns only its process',async()=>{
      dev=await startDev(id('content'));await eventually(()=>dev.events.some(event=>event.status==='ready'),'Dev did not become ready: '+dev.stderr);
      const ready=dev.events.find(event=>event.status==='ready');assert.equal(ready.url,'http://127.0.0.1:5178/?app='+id('content'));assert.deepEqual(ready.capabilities,[]);assert.equal((await fetch(ready.url)).status,200);
      const second=spawnSync(process.execPath,['--experimental-strip-types','scripts/client-dev.mjs',id('content'),'--port','5178','--json'],{encoding:'utf8',timeout:60000});assert.equal(second.status,1);assert.ok(second.stdout.includes('"status":"error"'));assert.equal((await fetch(ready.url)).status,200);await writeFile(path.join(output,'busy-port.log'),second.stdout+second.stderr);
    });
    const customFile='clients/'+id('content')+'/ClientNote.tsx',starterFile='clients/'+id('content')+'/starter.ts',publicationFile='clients/'+id('content')+'/publication.json';
    const originalCustom=await readFile(customFile,'utf8'),originalStarter=await readFile(starterFile,'utf8'),originalPublication=await readFile(publicationFile,'utf8');
    try{
      const scope=await pageContext();try{
        await scope.page.goto('http://127.0.0.1:5178/?app='+id('content'));await expect(scope.page.getByRole('heading',{name:'Client-owned component',exact:true})).toBeVisible();
        await step('custom TSX edits use genuine Vite HMR without a second server',async()=>{await writeFile(customFile,originalCustom.replace('Client-owned component','HMR verified component'));await expect(scope.page.getByRole('heading',{name:'HMR verified component',exact:true})).toBeVisible();assert.deepEqual(scope.errors,[]);await snapshot(scope.page,'dev-hmr');});
        await step('capability changes restart the same selected Vite host',async()=>{const start=dev.events.length;await writeFile(starterFile,originalStarter.replace('clientNote:[]',"clientNote:['charts']"));await eventually(()=>dev.events.slice(start).some(event=>event.status==='ready'&&event.capabilities.includes('charts')),'Capability restart did not settle');await expect(scope.page.getByRole('heading',{name:'HMR verified component',exact:true})).toBeVisible();});
        await step('publication changes refresh build-time metadata in the same browser',async()=>{const start=dev.events.length;await writeFile(publicationFile,originalPublication.replace('Engine preview metadata','Updated preview metadata'));await eventually(()=>dev.events.slice(start).some(event=>event.status==='ready'),'Publication refresh did not settle');await expect(scope.page.locator('meta[property="og:title"]')).toHaveAttribute('content','Updated preview metadata');});
        await step('invalid source produces an invalid receipt and a subsequent save recovers',async()=>{const start=dev.events.length;await writeFile(customFile,originalCustom+'\nexport const invalid = ;\n');await eventually(()=>dev.events.slice(start).some(event=>event.status==='invalid'),'Invalid source was not reported');await writeFile(customFile,originalCustom);await expect(scope.page.getByRole('heading',{name:'Client-owned component',exact:true})).toBeVisible();await expect(scope.page.locator('vite-error-overlay')).toHaveCount(0);report.expectedInvalidSourceDiagnostics=scope.errors.slice();});
        await step('plain source exports cannot bypass semantic validation during HMR',async()=>{const start=dev.events.length;await writeFile(starterFile,originalStarter.replace('export default defineApp(','const original=defineApp(')+"\nexport default {...original,manifest:{...original.manifest,fields:original.manifest.fields.map(field=>field.id==='custom-selection'?{...field,default:'UNDECLARED'}:field)}};\n");await eventually(()=>dev.events.slice(start).some(event=>event.status==='invalid'&&event.message.includes('unknown option')),'Invalid semantic default was reported ready');const recovery=dev.events.length;await writeFile(starterFile,originalStarter);await eventually(()=>dev.events.slice(recovery).some(event=>event.status==='ready'),'Semantic recovery did not settle');await expect(scope.page.getByRole('heading',{name:'Client-owned component',exact:true})).toBeVisible();});
      }finally{await scope.context.close();}
    }finally{await writeFile(customFile,originalCustom);await writeFile(starterFile,originalStarter);await writeFile(publicationFile,originalPublication);}
    await step('SIGTERM publishes stopped and leaves no listening dev process',async()=>{const result=await dev.close();assert.ok(result.code===0||result.code===143||result.signal==='SIGTERM');assert.equal(dev.events.at(-1).status,'stopped');const descriptor=JSON.parse(await readFile(dev.events.at(-1).descriptor,'utf8'));assert.equal(descriptor.status,'stopped');await assert.rejects(()=>fetch('http://127.0.0.1:5178'));dev=null;});
  }finally{await dev?.close();}
}

/** End-to-end acceptance: selected-client builds and a newly scaffolded TSX client.
 * Does not deploy or modify framework source. Compiled test clients remain artifacts.
 */
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {scaffoldClient} from './scaffold-client.mjs';
async function files(dir){let result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await files(full));else if(entry.isFile())result.push(full);}return result;}
async function digest(dir){const h=createHash('sha256');for(const f of (await files(dir)).sort()){h.update(f);h.update(await readFile(f));}return h.digest('hex');}
const before=await digest('src'),report=[];
const fresh='acceptance-fresh',knowledge='acceptance-knowledge',spatial='acceptance-spatial';for(const id of [fresh,knowledge,spatial])if(existsSync('clients/'+id))throw new Error('Refusing to replace existing acceptance client: '+id);
await mkdir('qa/client-builds',{recursive:true});
let browser;
try{
  await scaffoldClient({id:fresh,title:'Fresh scaffold acceptance',custom:true});
  await scaffoldClient({id:knowledge,title:'Fresh knowledge acceptance',template:'knowledge'});
  await scaffoldClient({id:spatial,title:'Fresh spatial acceptance',template:'spatial'});
  browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const id of ['operations-reference','wind-reference','architecture-reference','experience-reference',fresh,knowledge,spatial]){
    const built=spawnSync(process.execPath,['--experimental-strip-types','scripts/build-client.mjs',id],{encoding:'utf8',timeout:180000,env:process.env});
    await writeFile('qa/client-builds/'+id+'-build.log',(built.stdout||'')+(built.stderr||''));
    if(built.status!==0)throw new Error('Client build failed: '+id+'\n'+built.stderr+'\n'+built.stdout);
    const root=path.join('dist-clients',id),all=await files(root),js=all.filter(f=>f.endsWith('.js'));
    assert.ok(!all.some(f=>/\.wasm$|duckdb|sql-parser/.test(f)),'Client build accidentally includes database assets');
    const contents=(await Promise.all(js.map(f=>readFile(f,'utf8')))).join('\n');
    const titles={'operations-reference':'Operations / reference app','wind-reference':'Wind / reference app','architecture-reference':'Architecture / reference app','experience-reference':'Experience / reference app',[fresh]:'Fresh scaffold acceptance',[knowledge]:'Fresh knowledge acceptance',[spatial]:'Fresh spatial acceptance'};
    for(const [other,title] of Object.entries(titles))if(other!==id)assert.ok(!contents.includes(title),'Unexpected other-client payload: '+other+' in '+id);
    if(id==='operations-reference'||id===knowledge)assert.ok(!all.some(f=>/Scene3D|SceneViewport|Architecture-/.test(f)),'Basic data app includes an unused 3D/architecture chunk');
    const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.client.config.ts','--strictPort','--port','4174'],{env:{...process.env,STUDIO_CLIENT:id},stdio:['ignore','pipe','pipe']});
    let output='';server.stdout.on('data',v=>{output+=v;});server.stderr.on('data',v=>{output+=v;});
    const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    try{
      let ready=false;for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:4174');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
      assert.ok(ready,'Target preview failed: '+output);
      const response=await page.goto('http://127.0.0.1:4174');assert.ok(response.headers()['content-security-policy'].includes("script-src 'self'"));
      await page.locator('.studio-site[data-app-id="'+id+'"]').waitFor();
      if(id==='wind-reference'){await page.getByText('3D ready',{exact:true}).waitFor();await page.getByRole('button',{name:'Next shared scene'}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=scene3d]')?.getAttribute('data-selection')==='rotor');}
      else if(id==='experience-reference'||id===spatial){await page.getByText('3D ready',{exact:true}).waitFor();await page.getByRole('group',{name:'Explorer views'}).getByRole('button',{name:'Library',exact:true}).click();await page.locator('.explorer-library').waitFor();}
      else if(id===knowledge){await page.getByTestId('explorer').waitFor();assert.equal(await page.getByTestId('explorer').getAttribute('data-view'),'library');assert.equal(await page.locator('canvas').count(),0);await page.locator('.explorer-library-card').first().click();await page.getByRole('article',{name:'Platform overview',exact:true}).waitFor();}
      else if(id==='architecture-reference')await page.locator('.arch-node').first().waitFor();
      else if(id===fresh)await page.getByRole('heading',{name:'Client-owned component',exact:true}).waitFor();
      else await page.getByTestId('metric-observation-count').waitFor();
      await page.screenshot({path:'qa/client-builds/'+id+'.png',fullPage:true});
      assert.deepEqual(errors,[],'Target browser errors');assert.deepEqual(requests.filter(r=>!r.startsWith('http://127.0.0.1:4174/')),[],'Unexpected network');
      assert.ok(!requests.some(r=>/\.wasm|\/duckdb\//.test(r)),'Client initialized DuckDB');
      const gzipBytes=(await Promise.all(js.map(async f=>gzipSync(await readFile(f)).byteLength))).reduce((a,b)=>a+b,0);
      const totalBytes=(await Promise.all(all.map(async f=>(await readFile(f)).byteLength))).reduce((a,b)=>a+b,0);
      assert.ok(gzipBytes<=2*1024*1024,'Selected-client JavaScript exceeds 2 MiB gzip budget; inspect payload');
      report.push({id,files:all.length,javascriptFiles:js.length,javascriptGzipBytes:gzipBytes,totalBytes,requests:requests.length,status:'passed'});
      console.log('Target client passed: '+id+' / JS gzip '+gzipBytes+' bytes');
    }finally{await context.close();server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},3000).unref();});await writeFile('qa/client-builds/'+id+'-preview.log',output);}
  }
  assert.equal(await digest('src'),before,'Client creation/build changed framework source');
}finally{await browser?.close();for(const id of [fresh,knowledge,spatial])await rm('clients/'+id,{recursive:true,force:true});await writeFile('qa/client-builds/results.json',JSON.stringify({sourceUnchanged:await digest('src')===before,clients:report},null,2)+'\n');}

/** Browser smoke for bridge level 2.5 (live file, producer-agnostic). `npm run test:artifact-watch`
 * Starts `client:dev python-wind-reference` on a free loopback port, opens "Live file" mode, sorts the table, then:
 * a producer rewrite (py/examples/live_slider.py) appears in < 2 s with the sort kept; an invalid file shows the
 * error toast and keeps the last valid result; a valid rewrite clears it. Removes the demo file at the end.
 */
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const client='python-wind-reference',id='wind-aep-live-file';
const target=path.resolve('clients',client,'public','artifacts',id+'.json');
const python=['python','python3','py'].find(cmd=>spawnSync(cmd,['--version'],{encoding:'utf8'}).status===0);
if(!python){console.error('SKIP: python not on PATH');process.exit(0);}
const produce=k=>{const run=spawnSync(python,['py/examples/live_slider.py','--count','1','--values',String(k)],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);};
const runId=k=>'run-k'+k.toFixed(2).replace('.','-');
const freePort=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});

produce(2.0);
const port=await freePort();
const dev=spawn(process.execPath,['--experimental-strip-types','scripts/client-dev.mjs',client,'--port',String(port),'--json'],{stdio:['pipe','pipe','pipe']});
let out='',err='';dev.stderr.on('data',d=>{err+=d;});
const ready=new Promise((resolve,reject)=>{
  dev.stdout.on('data',d=>{out+=d;for(const line of out.split('\n')){try{const s=JSON.parse(line);if(s.status==='ready')resolve(s.url);if(s.status==='error'||s.status==='invalid')reject(new Error(s.message));}catch{}}});
  dev.once('exit',code=>reject(new Error('client:dev exited '+code+'\n'+err.slice(-2000))));
});
const stopDev=()=>new Promise(resolve=>{if(dev.exitCode!==null||dev.signalCode!==null){resolve();return;}const timer=setTimeout(()=>dev.kill(),8000);dev.once('exit',()=>{clearTimeout(timer);resolve();});dev.stdin.end();});
const browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{})});
try{
  const url=await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('client:dev not ready in 240 s\n'+err.slice(-2000))),240000))]);
  const page=await browser.newPage(),errors=[];
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'&file=1',{waitUntil:'domcontentloaded',timeout:180000});
  const source=page.locator(`[data-testid="artifact-source"][data-artifact-id="${id}"]`);
  await page.waitForFunction(run=>document.querySelector('[data-testid="artifact-source"]')?.dataset.runId===run,runId(2.0),{timeout:180000});
  await page.getByTestId('artifact-live-badge').waitFor();
  // View state: sort the table by annual energy, descending.
  const header=page.locator('[data-representation="table"] th',{hasText:'Annual energy'});
  await header.getByRole('button').click();await header.getByRole('button').click();
  assert.equal(await header.getAttribute('aria-sort'),'descending');
  const metric=()=>page.locator('[data-representation="aep-8"]').innerText();
  const metric1=await metric(),badge1=await page.getByTestId('artifact-live-badge').getAttribute('data-updated-at');

  produce(2.8);const t0=Date.now();
  await page.waitForFunction(run=>document.querySelector('[data-testid="artifact-source"]')?.dataset.runId===run,runId(2.8),{timeout:5000,polling:20});
  const elapsed=Date.now()-t0;
  assert.ok(elapsed<2000,`update took ${elapsed} ms`);
  assert.notEqual(await metric(),metric1,'metric did not change');
  assert.equal(await header.getAttribute('aria-sort'),'descending','table sort lost on update');
  assert.notEqual(await page.getByTestId('artifact-live-badge').getAttribute('data-updated-at'),badge1);

  // An invalid rewrite: toast, last valid result kept.
  await writeFile(target+'.bad.tmp','{"format":"datapass.artifact","version":1,"id":"'+id+'"}\n');await rename(target+'.bad.tmp',target);
  const toast=page.getByTestId('artifact-live-error');
  await toast.waitFor({timeout:5000});
  assert.match(await toast.innerText(),/validation/);
  assert.equal(await source.getAttribute('data-run-id'),runId(2.8));
  assert.equal(await page.getByTestId('artifact-fallback-banner').count(),0);
  assert.equal(await header.getAttribute('aria-sort'),'descending');

  produce(2.4);
  await page.waitForFunction(run=>document.querySelector('[data-testid="artifact-source"]')?.dataset.runId===run,runId(2.4),{timeout:5000});
  await toast.waitFor({state:'detached',timeout:5000});
  assert.deepEqual(errors,[],'console errors');
  console.log(`Artifact watch smoke OK: rewrite shown in ${elapsed} ms, sort kept, invalid file -> toast + last valid kept`);
}finally{await browser.close();await stopDev();await rm(target,{force:true});}

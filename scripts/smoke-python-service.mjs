/** Browser smoke for bridge level 3 (live FastAPI service). Run after: npm run build:client -- python-wind-reference
 * Starts py/service/app.py on a free loopback port, serves dist-clients/python-wind-reference with a CSP that
 * allows that one service origin, then: change an input -> new runId and metric; stop the service -> fallback banner.
 * Python: .venv (pip install -r py/service/requirements.txt) or a python with fastapi on PATH.
 */
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const root=path.resolve('dist-clients','python-wind-reference');
const python=[path.join('.venv','Scripts','python.exe'),path.join('.venv','bin','python'),'python','python3']
  .find(cmd=>(!cmd.includes(path.sep)||existsSync(cmd))&&spawnSync(cmd,['-c','import fastapi,uvicorn'],{encoding:'utf8'}).status===0);
if(!python){console.error('SKIP: no python with fastapi+uvicorn (pip install -r py/service/requirements.txt)');process.exit(0);}
const freePort=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain'};

const servicePort=await freePort(),serviceOrigin=`http://127.0.0.1:${servicePort}`;
const csp=`default-src 'self'; script-src 'self'; connect-src 'self' ${serviceOrigin}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'`;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp});res.end(body);}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const pageOrigin=`http://127.0.0.1:${server.address().port}`;

let service=spawn(python,['py/service/app.py','--port',String(servicePort)],{env:{...process.env,DATAPASS_SERVICE_ORIGINS:pageOrigin},stdio:['ignore','ignore','pipe']});
let serviceErr='';service.stderr.on('data',d=>{serviceErr+=d;});
const stopService=()=>new Promise(resolve=>{if(!service||service.exitCode!==null||service.signalCode!==null){resolve();return;}service.once('exit',resolve);service.kill();});
const browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{})});
try{
  for(let i=0;;i++){
    try{if((await fetch(serviceOrigin+'/health')).ok)break;}catch{}
    if(i>100||service.exitCode!==null)throw new Error('service did not start: '+serviceErr);
    await new Promise(r=>setTimeout(r,100));
  }
  const page=await browser.newPage(),errors=[];
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text()))errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${pageOrigin}/?live=1&service=${encodeURIComponent(serviceOrigin)}`);
  const source=page.locator('[data-testid="artifact-source"][data-artifact-id="wind-aep-live"]');
  await source.waitFor({timeout:30000});
  const metric=()=>page.locator('[data-representation="aep"]').innerText();
  const run1=await source.getAttribute('data-run-id'),metric1=await metric();
  assert.match(run1,/^run-[0-9a-f]{16}$/);assert.match(await page.getByTestId('artifact-provenance').innerText(),/127\.0\.0\.1:\d+\/compute\/wind-reference/);

  await page.getByTestId('input-c').fill('10');
  await page.waitForFunction(previous=>{const s=document.querySelector('[data-testid="artifact-source"][data-artifact-id="wind-aep-live"]');return s&&s.dataset.runId!==previous&&s.getAttribute('aria-busy')!=='true';},run1,{timeout:30000});
  const metric2=await metric();
  assert.notEqual(metric2,metric1,'metric did not change with c');
  assert.equal(await page.getByTestId('artifact-fallback-banner').count(),0);

  await stopService();
  await page.getByTestId('input-hubHeight').fill('150');
  const banner=page.getByTestId('artifact-fallback-banner');
  await banner.waitFor({timeout:30000});
  assert.match(await banner.innerText(),/unreachable/);
  await page.locator('[data-testid="artifact-source"][data-artifact-id="wind-aep-weibull"]').waitFor({timeout:30000});
  assert.deepEqual(errors,[],'console errors');
  console.log(`Live service smoke OK: metric ${metric1.replace(/\s+/g,' ')} -> ${metric2.replace(/\s+/g,' ')}, fallback banner when stopped`);
}finally{await browser.close();server.close();await stopService();}

#!/usr/bin/env node
/**
 * Static-host check for the built workbench: serves dist/ with the headers from dist/_headers (as Netlify or
 * Cloudflare Pages would apply them, not the vite preview copy), starts the py/service runtime on loopback, and
 * connects the workbench to it through the explicit consent, as a user does.
 *
 *   npm run build && node scripts/smoke-static-headers.mjs [--dist dist] [--port 24320] [--rport 24821] [--python python]
 *
 * Passes when: the page's CSP response header equals dist/_headers, the runtime bar reaches "connected", a loopback
 * WebSocket (the Jupyter kernel channel) raises no CSP violation, and a non-loopback fetch IS blocked by CSP.
 * Ports must be above 20000. Nothing is installed, published or written outside a temp folder.
 */
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createReadStream,existsSync,readFileSync,statSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {parseHeadersFile} from './workbench-headers.mjs';

const args=process.argv.slice(2),opt={dist:'dist',port:24320,rport:24821,python:'python'};
for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!(k in opt)||args[i+1]===undefined){console.error('Usage: see the header of scripts/smoke-static-headers.mjs');process.exit(2);}opt[k]=args[i+1];}
opt.port=Number(opt.port);opt.rport=Number(opt.rport);
if(!(opt.port>20000&&opt.rport>20000))throw new Error('Use ports above 20000');
const ORIGIN=`http://127.0.0.1:${opt.port}`,RORIGIN=`http://127.0.0.1:${opt.rport}`,root=path.resolve(opt.dist);
const fail=m=>{throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
if(!existsSync(path.join(root,'index.html'))||!existsSync(path.join(root,'_headers')))fail('Build first: '+root+' needs index.html and _headers');
const rules=parseHeadersFile(readFileSync(path.join(root,'_headers'),'utf8'));
if(Object.keys(rules).join()!=='/*')fail('Expected a single /* rule in _headers, got '+Object.keys(rules).join());
const headers=rules['/*'];

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.parquet':'application/octet-stream','.glb':'model/gltf-binary'};
const web=http.createServer((req,res)=>{
  let rel=decodeURIComponent(new URL(req.url,ORIGIN).pathname);if(rel.endsWith('/'))rel+='index.html';
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()||path.basename(file)==='_headers'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]??'application/octet-stream',...headers,'Cache-Control':'no-store'});
  createReadStream(file).pipe(res);
});
await new Promise((ok,ko)=>{web.once('error',ko);web.listen(opt.port,'127.0.0.1',ok);});

const token='sh-'+randomBytes(12).toString('hex');let log='';
const runtime=spawn(opt.python,['py/service/app.py','--port',String(opt.rport),'--workbench-origin',ORIGIN],{env:{...process.env,DATAPASS_RUNTIME_TOKEN:token,DATAPASS_SERVICE_ORIGINS:ORIGIN},stdio:['ignore','pipe','pipe']});
runtime.stdout.on('data',d=>{log+=d;});runtime.stderr.on('data',d=>{log+=d;});
const stopRuntime=()=>{if(runtime.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(runtime.pid),'/T','/F']);else runtime.kill();}};

let browser,ok=false;
try{
  let up=false;for(let i=0;i<160&&!up;i++){try{up=(await fetch(RORIGIN+'/health')).ok;}catch{await pause(250);}}
  if(!up)fail('runtime did not start: '+log.slice(-800));
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const violations=[];
  await page.exposeFunction('__cspViolation',v=>violations.push(v));
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.__cspViolation?.({directive:e.effectiveDirective,blocked:e.blockedURI})));
  const response=await page.goto(`${ORIGIN}/?workspace=blank#runtime=${encodeURIComponent(RORIGIN)}&token=${token}`,{waitUntil:'domcontentloaded'});
  const served=response.headers()['content-security-policy'];
  if(served!==headers['Content-Security-Policy'])fail('served CSP differs from dist/_headers');
  console.log('csp',served);
  await page.getByTestId('runtime-state').filter({hasText:'DuckDB ready'}).waitFor({timeout:120000});
  const consent=page.getByTestId('runtime-consent').getByRole('button',{name:'Connect'});
  await consent.waitFor({timeout:30000});await consent.click();
  await page.locator('[data-testid="runtime-bar"][data-status="connected"]').waitFor({timeout:30000});
  console.log('ok runtime connected through the consent at',RORIGIN);
  // Loopback WebSocket (the paired Jupyter kernel channel): the runtime has no ws route, so the socket closes,
  // but CSP must not be the reason. Then a non-loopback origin must be refused by CSP.
  await page.evaluate(port=>new Promise(r=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws-probe`);ws.onclose=ws.onerror=()=>r();setTimeout(r,3000);}),opt.rport);
  await page.evaluate(()=>fetch('http://192.0.2.1:9/csp-probe').catch(()=>{}));
  await pause(500);
  const loopbackBlocked=violations.filter(v=>/^(https?|wss?):\/\/(127\.0\.0\.1|localhost)[:/]/.test(v.blocked));
  if(loopbackBlocked.length)fail('CSP blocked loopback: '+JSON.stringify(loopbackBlocked));
  if(!violations.some(v=>v.directive==='connect-src'&&v.blocked.startsWith('http://192.0.2.1')))fail('CSP did not block a non-loopback connect: '+JSON.stringify(violations));
  console.log('ok loopback ws not blocked by CSP; non-loopback fetch blocked by connect-src');
  ok=true;
}finally{
  await browser?.close();stopRuntime();await new Promise(r=>web.close(()=>r()));web.closeAllConnections?.();
}
console.log(ok?'PASS static _headers check':'FAIL');
process.exit(ok?0:1);

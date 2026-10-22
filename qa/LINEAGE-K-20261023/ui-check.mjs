/** LINEAGE-K real UI check (manual QA evidence, not part of npm test).
 * Phase 1  `node qa/LINEAGE-K-20261023/ui-check.mjs export <marimoUrl>`
 *   Drives the real marimo app (`marimo run py/notebooks/wind_reference.py`): waits for the default k=2 export,
 *   moves the "Weibull shape k" slider to 2.7 with the keyboard and waits for the notebook to rewrite the artifact.
 * Phase 2  `node qa/LINEAGE-K-20261023/ui-check.mjs reopen` (after stopping marimo and `npm run build:client -- python-wind-reference`)
 *   Serves dist-clients/python-wind-reference with the production CSP, reopens the saved artifact on the Annual energy and
 *   Lineage pages and records every request: the saved result must render without any kernel/service/task call.
 * Evidence is appended to qa/LINEAGE-K-20261023/evidence.json (relative paths only).
 */
import {createServer} from 'node:http';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const ART='clients/python-wind-reference/public/artifacts/wind-aep-weibull.json';
const EVIDENCE='qa/LINEAGE-K-20261023/evidence.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const summary=async file=>{const raw=await readFile(file),a=JSON.parse(raw);const k=a.provenance.inputs.find(i=>i.id==='k')?.value;
  return {file,sha256:sha(raw),title:a.title,declaredK:k,source:a.provenance.source,inputHash:a.provenance.inputHash,rows:a.payload.rows.length,aep8:a.payload.rows.find(r=>r.meanSpeed===8)?.aep};};
const load=async()=>{try{return JSON.parse(await readFile(EVIDENCE,'utf8'));}catch{return {};}};
const save=async e=>writeFile(EVIDENCE,JSON.stringify(e,null,2)+'\n');
const until=async(fn,ms,what)=>{const end=Date.now()+ms;for(;;){const v=await fn();if(v)return v;if(Date.now()>end)throw new Error('timeout: '+what);await new Promise(r=>setTimeout(r,250));}};
const phase=process.argv[2];
const browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{})});
const evidence=await load();
try{
  if(phase==='export'){
    const url=process.argv[3];assert.ok(url,'marimo url required');
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(url);
    await page.getByText('Wrote artifact').first().waitFor({timeout:90000});
    const def=await until(async()=>{const s=await summary(ART);return s.declaredK===2?s:null;},30000,'default export');
    const before=(await stat(ART)).mtimeMs;
    const slider=page.getByRole('slider').first();await slider.waitFor();
    await slider.focus();
    for(let i=0;i<7;i++)await page.keyboard.press('ArrowRight');
    const uiValue=await slider.getAttribute('aria-valuenow');
    const changed=await until(async()=>{if((await stat(ART)).mtimeMs===before)return null;const s=await summary(ART);return s.declaredK===2.7?s:null;},90000,'k=2.7 export');
    await page.getByText('Wrote artifact').first().waitFor();
    assert.equal(Number(uiValue),2.7,'slider value');
    assert.match(changed.title,/Weibull k=2\.7\)$/);assert.match(changed.source,/Weibull k=2\.7\.$/);
    assert.notEqual(changed.inputHash,def.inputHash,'inputHash must change with k');
    assert.notEqual(changed.aep8,def.aep8,'rows must change with k');
    evidence.export={driver:'marimo run (real app UI), keyboard ArrowRight x7 on the Weibull shape k slider',sliderAriaValueNow:Number(uiValue),
      default:{...def,file:ART},changed:{...changed,file:ART},checks:{rowsChanged:true,titleChanged:true,declaredKChanged:true,inputHashChanged:true}};
    await save(evidence);console.log('export ok',JSON.stringify({def:def.inputHash.slice(0,12),changed:changed.inputHash.slice(0,12)}));
  }else if(phase==='reopen'){
    const root=path.resolve('dist-clients','python-wind-reference');
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain'};
    const csp="default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
    const served=[];
    const server=createServer(async(req,res)=>{
      const url=new URL(req.url,'http://x'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      served.push(req.method+' '+url.pathname);
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp});res.end(body);}
      catch{res.writeHead(404).end();}
    });
    await new Promise(r=>server.listen(20432,'127.0.0.1',r));
    const base='http://127.0.0.1:20432/';
    const saved=await summary(ART);const builtSha=sha(await readFile(path.join(root,'artifacts','wind-aep-weibull.json')));
    assert.equal(builtSha,saved.sha256,'built client must carry the exported artifact unchanged');
    const mtime=(await stat(ART)).mtimeMs;
    const page=await browser.newPage({viewport:{width:1440,height:960}}),requests=[],sockets=[],errors=[];
    page.on('request',r=>requests.push(r.method()+' '+r.url().replace(base,'/')));page.on('websocket',w=>sockets.push(w.url()));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base);
    const src=page.getByTestId('artifact-source');await src.waitFor({timeout:30000});
    await src.locator('table tbody tr').first().waitFor({timeout:30000});
    const resultText=await page.locator('main').innerText();
    await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Lineage',exact:true}).click();
    await page.getByTestId('lineage').waitFor({timeout:30000});
    const heading=await page.getByTestId('lineage-explorer').locator('h3').innerText();
    const kNode=await page.locator('[data-testid="lineage-node"][data-node-id="input:k"]').getAttribute('aria-label');
    const artNode=await page.locator('[data-testid="lineage-node"][data-node-id="artifact:wind-aep-weibull"]').getAttribute('aria-label');
    await page.waitForTimeout(1000);
    assert.match(heading,/Weibull k=2\.7\)$/);
    assert.match(kNode,/2\.7/);
    assert.ok(artNode.includes(saved.inputHash.slice(0,12)),'artifact node shows the saved input hash');
    assert.ok(resultText.includes('Weibull k=2.7'),'result page shows the saved title');
    const nonStatic=requests.filter(r=>!/^GET \/(index\.html)?(assets\/|artifacts\/|sources\/|[^/]*\.(js|css|svg|json|txt|ico)$|$)/.test(r));
    assert.deepEqual(nonStatic,[],'only static GETs of the built site');
    assert.deepEqual(sockets,[],'no websocket (kernel) connection');
    assert.ok(!requests.some(r=>/compute|kernel|tasks?|runs?\b|:8765|:20431/.test(r)),'no compute/kernel/task request');
    assert.equal((await stat(ART)).mtimeMs,mtime,'saved artifact not rewritten on reopen');
    assert.deepEqual(errors,[],'console errors');
    server.close();
    evidence.reopen={viewer:'built python-wind-reference client (dist-clients) under the production CSP; marimo server stopped before reopen',
      builtArtifactSha256:builtSha,lineageHeading:heading,lineageInputK:kNode,lineageArtifactNode:artNode,
      requests,websockets:sockets,consoleErrors:errors,checks:{declaredK27:true,title27:true,inputHashShown:true,inputHashDiffersFromDefault:saved.inputHash!==evidence.export?.default?.inputHash,noKernelOrTaskCall:true,artifactNotRewritten:true}};
    await save(evidence);console.log('reopen ok',requests.length,'requests');
  }else throw new Error('phase must be export or reopen');
}finally{await browser.close();}

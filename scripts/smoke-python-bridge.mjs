/** Browser smoke for the Python bridge proof. Run after: npm run build:client -- python-wind-reference
 * Serves dist-clients/python-wind-reference with the production CSP, checks the page and the console.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const root=path.resolve('dist-clients','python-wind-reference');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain'};
const csp="default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':csp});res.end(body);}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{})});
try{
  const page=await browser.newPage(),errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base);
  const source=page.getByTestId('artifact-source');
  await source.waitFor({timeout:30000});
  assert.equal(await source.getAttribute('data-artifact-id'),'wind-aep-weibull');
  await source.locator('table tbody tr').first().waitFor({timeout:30000});
  assert.ok((await source.locator('table tbody tr').count())>=5,'table rows missing');
  const provenance=await page.getByTestId('artifact-provenance').innerText();
  assert.match(provenance,/computed/);assert.match(provenance,/ILLUSTRATIVE/);assert.match(provenance,/artifacts\/wind-aep-weibull\.json/);
  const text=await source.innerText();assert.match(text,/AEP at 8 m\/s mean/);
  assert.equal(await page.getByTestId('artifact-error').count(),0);
  assert.deepEqual(errors,[],'console errors');
  console.log('Python bridge smoke OK: table + metric + provenance, no console errors');
}finally{await browser.close();server.close();}

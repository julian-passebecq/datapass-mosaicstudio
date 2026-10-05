/** Browser smoke for the artifact lineage view. Run after: npm run build:client -- python-wind-reference
 * Serves dist-clients/python-wind-reference with the production CSP, opens the Lineage page and checks:
 * click value -> path highlighted; click evidence -> exact lines highlighted; keyboard; 390 px list fallback.
 */
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
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
const model=(await readFile('py/wind_reference_model.py','utf8')).replace(/\r\n/g,'\n').split('\n');
const browser=await chromium.launch({...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{})});
await mkdir('qa',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base);
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Lineage',exact:true}).click();
  const graph=page.getByTestId('lineage');await graph.waitFor({timeout:30000});
  const node=id=>page.locator(`[data-testid="lineage-node"][data-node-id="${id}"]`);
  assert.ok(await page.getByTestId('lineage-node').count()>=10,'graph nodes missing');
  assert.equal(await page.getByTestId('source-panel').getAttribute('data-state'),'empty');

  // 1. click a displayed value: its path lights up, unrelated inputs stay dim, its first citation opens.
  await page.locator('[data-testid="lineage-value"][data-node-id="value:aep-8"]').click();
  assert.equal(await graph.getAttribute('data-selected'),'value:aep-8');
  for(const id of ['value:aep-8','rep:aep-8','artifact:wind-aep-weibull','producer','input:k','input:ratedPower'])assert.equal(await node(id).getAttribute('data-in-path'),'true',id);
  for(const id of ['input:means','rep:table','value:cf-8'])assert.equal(await node(id).getAttribute('data-in-path'),'false',id);
  assert.ok(await page.locator('.lineage-edge[data-in-path=true]').count()>=5);
  const panel=page.getByTestId('source-panel');
  assert.equal(await panel.getAttribute('data-state'),'open');
  const start=Number(await panel.getAttribute('data-start')),end=Number(await panel.getAttribute('data-end'));
  assert.equal(await page.getByTestId('source-line-highlight').count(),end-start+1);
  assert.match(await page.getByTestId('source-line-highlight').first().innerText(),/def annual_energy_mwh/);
  await page.screenshot({path:'qa/lineage-value.png',fullPage:true});

  // 2. click an evidence chip: the panel shows exactly that line of the cited file, scrolled into view.
  await page.getByTestId('evidence-chip').filter({hasText:'Rated power constant'}).click();
  const line=model.findIndex(l=>l.startsWith('RATED_KW ='))+1;
  assert.equal(await panel.getAttribute('data-start'),String(line));assert.equal(await panel.getAttribute('data-end'),String(line));
  assert.equal(await page.getByTestId('source-line-highlight').count(),1);
  assert.equal((await page.getByTestId('source-line-highlight').locator('code').innerText()).trim(),model[line-1].trim());
  const box=await page.locator('.lineage-source-lines').boundingBox(),mark=await page.getByTestId('source-line-highlight').boundingBox();
  assert.ok(mark.y>=box.y&&mark.y+mark.height<=box.y+box.height,'highlighted line not scrolled into view');

  // 3. keyboard: arrows move along the graph, Enter selects.
  await node('value:cf-8').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-node-id')),'rep:cf-8');
  await page.keyboard.press('Enter');assert.equal(await graph.getAttribute('data-selected'),'rep:cf-8');
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-node-id')),'artifact:wind-aep-weibull');
  assert.deepEqual(errors,[],'console errors');

  // 4. 390 px: the graph collapses to a list, no horizontal page scroll, evidence still opens its lines.
  const phone=await browser.newPage({viewport:{width:390,height:844}}),phoneErrors=[];
  phone.on('console',m=>{if(m.type()==='error')phoneErrors.push(m.text());});phone.on('pageerror',e=>phoneErrors.push(String(e)));
  await phone.goto(base+'?page=lineage');await phone.getByTestId('lineage').waitFor({timeout:30000});
  assert.equal(await phone.locator('.lineage-svg').isVisible(),false);
  assert.ok(await phone.getByTestId('lineage-item').first().isVisible());
  await phone.locator('[data-testid="lineage-item"][data-kind="evidence"]').first().click();
  assert.equal(await phone.getByTestId('source-panel').getAttribute('data-state'),'open');
  assert.ok(await phone.getByTestId('source-line-highlight').count()>=1);
  const overflow=await phone.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=0,'horizontal page scroll at 390 px: '+overflow);
  await phone.screenshot({path:'qa/lineage-390.png',fullPage:true});
  assert.deepEqual(phoneErrors,[],'console errors at 390 px');
  console.log('Artifact lineage smoke OK: value path, exact evidence lines, keyboard, 390 px list, no console errors');
}finally{await browser.close();server.close();}

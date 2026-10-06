import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const start=async(page:Page,query='')=>{await page.goto('/?app=experience-reference'+query);await expect(page.getByTestId('explorer')).toBeVisible();};
const button=(page:Page,name:string)=>page.getByRole('button',{name,exact:true});
const outline=(page:Page,name:string)=>page.getByRole('navigation',{name:'Component outline'}).getByRole('button',{name:'Explore '+name,exact:true});
const facets=(page:Page,name:string)=>page.getByRole('group',{name:'Context facets'}).getByRole('button',{name,exact:true});
const views=(page:Page,name:string)=>page.getByRole('group',{name:'Explorer views'}).getByRole('button',{name,exact:true});
let errors:string[]=[],external:string[]=[],wasm:string[]=[];
test.beforeEach(async({page})=>{errors=[];external=[];wasm=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4173/'))external.push(r.url());if(/\.wasm(?:\?|$)|\/duckdb\//.test(r.url()))wasm.push(r.url());});});
test.afterEach(async({},info)=>{await info.attach('explorer-diagnostics',{body:JSON.stringify({errors,external,wasm},null,2),contentType:'application/json'});expect(errors).toEqual([]);expect(external).toEqual([]);expect(wasm).toEqual([]);});
test('spatial focus, facets, map and library share one selected identity',async({page},info)=>{
  await start(page);await expect(page.locator('.site-render-status')).toHaveText('3D ready');await expect(page.locator('.studio-scene-anchors button')).toHaveCount(4);
  await expect(page.getByTestId('metric-context-component-count')).toContainText('8');
  await page.screenshot({path:info.outputPath('explorer-spatial-overview.png'),fullPage:true});
  await outline(page,'Cloud platform').click();await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','cloud');await expect(page.locator('.studio-scene-viewport')).toHaveAttribute('data-camera','cloud-front');
  await expect(page.getByTestId('metric-context-component-count')).toContainText('2');
  await facets(page,'Projects').click();await expect(page.locator('.studio-scene-viewport')).toHaveAttribute('data-camera','cloud-side');
  await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveAttribute('data-animating','false');
  await expect(page.getByRole('complementary',{name:'Context details'})).toContainText('Ingestion project / approach');
  await page.screenshot({path:info.outputPath('explorer-spatial-focus.png'),fullPage:true});
  await views(page,'Map').click();await expect(page.locator('.explorer-map-node')).toHaveCount(8);await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','cloud');await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('explorer-map.png'),fullPage:true});
  await views(page,'Library').click();await expect(page.locator('.explorer-library')).toContainText('Ingestion project / approach');await expect(page.getByTestId('explorer')).toHaveAttribute('data-facet','projects');
  await page.locator('.explorer-library-card').first().click();await expect(page.getByRole('article',{name:'Ingestion project / approach'})).toBeVisible();await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','pipeline');await expect(page.getByTestId('explorer')).toHaveAttribute('data-level','evidence');
  await page.screenshot({path:info.outputPath('explorer-library-document.png'),fullPage:true});
});
test('local search opens inert code evidence and respects the domain filter',async({page})=>{
  await start(page);const search=page.getByRole('searchbox',{name:'Search components and documents'});
  await search.fill('COUNT(*)');await expect(page.getByRole('list',{name:'Search results'}).getByRole('button')).toHaveCount(4);
  await page.getByRole('list',{name:'Search results'}).getByRole('button',{name:/Ingestion project/}).click();
  await expect(page.getByRole('article',{name:'Ingestion project / evidence notes'})).toContainText('SELECT source_id');await expect(page.getByTestId('explorer')).toHaveAttribute('data-facet','evidence');
  await page.getByLabel('Explorer domain').selectOption('analytics');await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','overview');
  await search.fill('ingestion');await expect(page.locator('.explorer-search-results')).toContainText('No matching content.');await page.keyboard.press('Escape');await expect(search).toHaveValue('');
  await page.keyboard.press('Control+k');await expect(search).toBeFocused();
});
test('selecting a project is not opening it; explicit action preserves context on return',async({page})=>{
  await start(page);await outline(page,'Cloud platform').click();await outline(page,'Ingestion project').click();
  await expect(page).not.toHaveURL(/page=implementation/);await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','pipeline');
  await button(page,'Open architecture walkthrough').click();await expect(page).toHaveURL(/page=implementation/);await expect(page.locator('.arch-node')).toHaveCount(8);
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'A system you can explore',exact:true}).click();
  await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','pipeline');
});
test('presentation links round trip only allowed view state and invalid links stay atomic',async({page})=>{
  await start(page);await outline(page,'Data models').click();await facets(page,'Evidence').click();await views(page,'Library').click();
  await button(page,'Share this explorer view').click();const link=await page.getByLabel('Presentation link',{exact:true}).inputValue();expect(link).toContain('view-system-atlas-focus=models');expect(link).not.toContain('SELECT');
  await page.goto(link);await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','models');await expect(page.getByTestId('explorer')).toHaveAttribute('data-view','library');
  await outline(page,'Automation').click();await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Explain a transformation',exact:true}).click();
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'A system you can explore',exact:true}).click();await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','automation');
  await page.goto(link.replace('view-system-atlas-focus=models','view-system-atlas-focus=unknown'));
  await expect(page.getByRole('alert')).toContainText('View link was not applied');await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','overview');
});
test('reviewed restore retains a document, while inconsistent state is rejected',async({page})=>{
  await start(page);await outline(page,'Business intelligence').click();await facets(page,'Projects').click();await views(page,'Library').click();await page.locator('.explorer-library-card').first().click();
  await page.locator('.site-session summary').click();const download=page.waitForEvent('download');await button(page,'Export inputs').click();const saved=JSON.parse(await readFile((await(await download).path())!,'utf8'));expect(saved.values['atlas-document']).toBe('reporting-case');
  await button(page,'Reset inputs').click();await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','overview');
  await page.getByLabel('Restore saved site inputs').setInputFiles({name:'state.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await button(page,'Apply saved inputs').click();
  await expect(page.getByRole('article',{name:'Reporting project / approach'})).toBeVisible();
  saved.values['atlas-focus']='cloud';await page.getByLabel('Restore saved site inputs').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await expect(page.getByRole('alert')).toContainText('disagree');await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','reporting');
});
test('native scroll tour visits authored stops and direct selection pauses it',async({page},info)=>{
  await start(page);await expect(button(page,'Start scroll tour')).toBeEnabled();await button(page,'Start scroll tour').click();
  const visit=async(progress:number)=>{await page.locator('.explorer-tour-track').evaluate((element,p)=>{const stage=element.querySelector('.explorer-stage')!;const top=element.getBoundingClientRect().top+scrollY;window.scrollTo(0,top+(element.getBoundingClientRect().height-stage.getBoundingClientRect().height)*p-16);},progress);};
  await visit(.26);await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','cloud');
  await visit(.76);await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','models');
  await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveAttribute('data-animating','false');
  await page.screenshot({path:info.outputPath('explorer-scroll-tour.png')});
  await outline(page,'Automation').click();await expect(button(page,'Resume scroll tour')).toBeVisible();await visit(.49);await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','automation');
  await button(page,'Exit tour').click();await expect(page.locator('.explorer-tour-track')).not.toHaveClass(/guided/);
});
test('reduced motion has manual traversal and no scroll capture',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await start(page);await expect(button(page,'Start scroll tour')).toBeDisabled();await button(page,'Next explorer stop').click();
  await expect(page.getByTestId('explorer')).toHaveAttribute('data-focus','cloud');await expect(page.locator('canvas[data-renderer=three-webgl2]')).toHaveAttribute('data-animating','false');
  const y=await page.evaluate(()=>scrollY);await page.locator('.site-scene-canvas').hover();await page.mouse.wheel(0,150);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(y);
});
test('narrow view exposes outline, documents and context without clipping controls',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await start(page);await expect(button(page,'Start scroll tour')).toBeDisabled();await outline(page,'Cloud platform').click();
  await expect(page.getByRole('complementary',{name:'Context details'})).toContainText('Cloud platform');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await views(page,'Library').click();await page.locator('.explorer-library-card').first().click();await expect(page.locator('.explorer-document')).toBeVisible();
  await page.screenshot({path:info.outputPath('explorer-mobile-library.png'),fullPage:true});
});
test('WebGL unavailability leaves a useful map, outline and evidence path',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind:string,...args:unknown[]){if(kind==='webgl2')return null;return Reflect.apply(original,this,[kind,...args]);} as typeof original;});
  await start(page);await expect(page.locator('.site-render-status')).toHaveText('3D unavailable');await outline(page,'Cloud platform').click();await views(page,'Map').click();await expect(page.locator('.explorer-map-node')).toHaveCount(8);
  await facets(page,'Evidence').click();await views(page,'Library').click();await expect(page.locator('.explorer-library')).toContainText('Ingestion project / evidence notes');
});
test('ConceptMotion explanation is client-owned, semantic, step-based and restorable',async({page},info)=>{
  await page.goto('/?app=experience-reference&page=method');const explanation=page.locator('.site-explanation');await expect(explanation).toHaveAttribute('data-engine','conceptmotion');await expect(explanation.locator('svg')).toHaveCount(1);
  await button(page,'Next explanation frame').click();await expect(explanation).toHaveAttribute('data-frame','1');await expect(page.locator('.site-explanation-caption')).toContainText('Move the smallest key');
  await button(page,'Next explanation frame').click();await expect(explanation).toHaveAttribute('data-frame','2');await page.screenshot({path:info.outputPath('explorer-transformation.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'A system you can explore',exact:true}).click();await page.getByRole('navigation',{name:'Site pages'}).getByRole('button',{name:'Explain a transformation',exact:true}).click();await expect(page.locator('.site-explanation')).toHaveAttribute('data-frame','2');
  await page.getByText('Read the steps without animation',{exact:true}).click();await expect(page.locator('.site-explanation li')).toHaveCount(4);expect(await page.locator('iframe,textarea,.monaco-editor').count()).toBe(0);
});

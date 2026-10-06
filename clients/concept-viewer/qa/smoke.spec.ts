import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';

const EXAMPLES=['forecast-app','cloud-data-platform','datapass-stack'];
const CAPTURES=path.resolve('clients/concept-viewer/qa/captures');
const open=async(page:Page,query='')=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?app=concept-viewer'+query,{timeout:180000});
  await expect(page.getByTestId('concept-viewer')).toBeVisible({timeout:180000});
  return errors;
};
/** Every <text> box (real font metrics) inside the canvas; card text inside its card; layer text inside the gutter. */
const clipped=(page:Page,selector:string)=>page.locator(selector).evaluate((root:SVGSVGElement)=>{
  const vb=root.viewBox.baseVal,out:string[]=[],eps=.5;
  const inside=(b:DOMRect,c:{x:number;y:number;width:number;height:number})=>b.x>=c.x-eps&&b.y>=c.y-eps&&b.x+b.width<=c.x+c.width+eps&&b.y+b.height<=c.y+c.height+eps;
  const firstCard=Math.min(...[...root.querySelectorAll<SVGGraphicsElement>('[data-card]')].map(c=>c.getBBox().x));
  for(const t of root.querySelectorAll<SVGTextElement>('text')){
    const b=t.getBBox();if(!b.width)continue;
    if(!inside(b,vb))out.push('canvas: '+t.textContent);
    const card=t.closest('[data-node]')?.querySelector<SVGGraphicsElement>('[data-card]');
    if(card&&['node','kind'].includes(t.dataset.text??'')&&!inside(b,card.getBBox()))out.push('card: '+t.textContent);
    if(['layer','layer-role'].includes(t.dataset.text??'')&&b.x+b.width>firstCard)out.push('gutter: '+t.textContent);
  }
  return out;
});

for(const id of EXAMPLES)test(`${id}: three renderings from one file, labels never clip, captures`,async({page})=>{
  const errors=await open(page,`&spec=examples/${id}.concept.json&view=isometric`);
  const viewer=page.getByTestId('concept-viewer');
  await expect(viewer).toHaveAttribute('data-spec',id);
  await expect(page.locator('[data-testid=concept-isometric] svg[data-renderer=framework-motion-v2]')).toBeVisible();
  expect(await clipped(page,'[data-testid=concept-isometric] svg')).toEqual([]);
  await page.screenshot({path:path.join(CAPTURES,`${id}.isometric.png`)});
  await page.getByRole('button',{name:'Layer cake 2D',exact:true}).click();
  await expect(page.locator('[data-testid=concept-layered] svg[data-representation=layered]')).toBeVisible();
  expect(await clipped(page,'[data-testid=concept-layered] svg')).toEqual([]);
  await page.screenshot({path:path.join(CAPTURES,`${id}.layered.png`)});
  const nodeId=await page.locator('[data-testid=concept-layered] [data-node]').nth(1).getAttribute('data-node');
  await page.locator(`[data-testid=concept-layered] [data-node="${nodeId}"]`).click();
  await expect(viewer).toHaveAttribute('data-selection',nodeId!);
  await expect(page.getByTestId('atlas-details')).toHaveAttribute('data-node',nodeId!);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'3D scene',exact:true}).click();
  await expect(page.locator('canvas[data-renderer=concept-webgl2]')).toBeVisible({timeout:120000});
  await page.waitForFunction(()=>(window as unknown as {__conceptStage?:{settled():boolean}}).__conceptStage?.settled(),null,{timeout:60000});
  await page.waitForTimeout(400);
  const labels=await page.locator('.aa-label').evaluateAll(els=>els.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));
  expect(labels).toEqual([]);
  await page.screenshot({path:path.join(CAPTURES,`${id}.3d.png`)});
  expect(errors).toEqual([]);
});

test('a dropped invalid file is rejected with its issues and the current spec stays',async({page})=>{
  const errors=await open(page);
  await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-spec','forecast-app');
  const bad=JSON.stringify({format:'datapass.concept-spec',version:1,id:'bad',title:'Bad',provenance:'synthetic',note:'x',layers:[{id:'a',label:'A',height:0}],domains:[{id:'d',label:'D'}],nodes:[{id:'n',kind:'spaceship',layer:'a',domain:'d',label:'N'}],flows:[]});
  await page.getByTestId('concept-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(bad)});
  await expect(page.getByTestId('concept-problem')).toContainText('unknown node kind "spaceship"');
  await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-spec','forecast-app');
  const good=JSON.stringify({format:'datapass.concept-spec',version:1,id:'mini',title:'Mini app',provenance:'synthetic',note:'Synthetic.',layers:[{id:'a',label:'Data',height:0},{id:'b',label:'Apps',height:1}],domains:[{id:'d',label:'Main'}],nodes:[{id:'db',kind:'sql-db',layer:'a',domain:'d',label:'DB'},{id:'ui',kind:'app',layer:'b',domain:'d',label:'UI'}],flows:[{id:'f',from:'db',to:'ui',kind:'data',label:'Rows'}]});
  // Drag and drop goes through the same parser.
  await page.evaluate(text=>{const dt=new DataTransfer();dt.items.add(new File([text],'mini.json',{type:'application/json'}));for(const type of ['dragenter','drop'])window.dispatchEvent(new DragEvent(type,{dataTransfer:dt,bubbles:true,cancelable:true}));},good);
  await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-spec','mini');
  await expect(page.getByTestId('concept-viewer')).toHaveAttribute('data-source','mini.json');
  await expect(page.getByTestId('concept-problem')).toHaveCount(0);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:/Layer cake SVG/}).click();
  expect((await download).suggestedFilename()).toBe('mini.layered.svg');
  expect(errors).toEqual([]);
});

test('film: virtual clock seek renders an exact frame and ends on the layer cake',async({page})=>{
  const errors=await open(page,'&spec=examples/forecast-app.concept.json&film=1&paused=1&chrome=0&t=0');
  await page.waitForFunction(()=>!!(window as unknown as {__conceptFilm?:unknown}).__conceptFilm,null,{timeout:180000});
  const seek=(t:number)=>page.evaluate(t=>(window as unknown as {__conceptFilm:{seek(t:number):Promise<number>}}).__conceptFilm.seek(t),t);
  expect(await seek(21.5)).toBe(21.5);
  await expect(page.getByTestId('atlas-film')).toHaveAttribute('data-film-t','21.5000');
  await expect(page.locator('.aa-film-panel [data-node=data-model]')).toBeVisible();
  await page.screenshot({path:path.join(CAPTURES,'forecast-app.film-21.5s.png')});
  await seek(27.5);
  await expect(page.locator('.aa-film-diagram svg[data-representation=layered]')).toBeVisible();
  await page.screenshot({path:path.join(CAPTURES,'forecast-app.film-27.5s.png')});
  expect(errors).toEqual([]);
});

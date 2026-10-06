import {test,expect,type Page} from '@playwright/test';
/** Visual-capture parity (CHART-N1b): the 3 reference chart blocks drawn by both renderers, light
 * and dark, under the deterministic capture clock (`?capture=1`, reduced motion). Compared
 * structurally, not by pixels: bar orientation, rank / value / rank-change labels, line focus rule,
 * focus point and direct end label. Both renderers expose the same `data-mark` keys.
 * Captures are written next to the test results for review.
 */
const BLOCKS=[
  {app:'operations-reference',page:'overview',block:'regional-chart',mark:'bar'},
  {app:'wind-reference',page:'economics',block:'sensitivity-chart',mark:'line'},
  {app:'experience-reference',page:'signals',block:'coverage-chart',mark:'bar'},
] as const;
type Box={x:number;y:number;width:number;height:number};
/** Every mark of one block, by `data-mark` key, in screen geometry. */
async function marks(page:Page,block:string){
  return page.locator(`[data-block="${block}"]`).evaluate(root=>{
    const out:Record<string,{box:Box;text:string}[]>={};
    for(const el of root.querySelectorAll('svg [data-mark]')){
      const key=el.getAttribute('data-mark')!,r=el.getBoundingClientRect();
      if(r.width===0&&r.height===0&&el.tagName!=='line')continue;
      (out[key]??=[]).push({box:{x:r.x,y:r.y,width:r.width,height:r.height},text:(el.textContent||'').trim()});
    }
    return out;
  });
}
/** Horizontal bars share their left edge and differ in top; vertical bars share their bottom. */
function orientation(bars:{box:Box}[]){
  const same=(values:number[])=>Math.max(...values)-Math.min(...values)<=1.5;
  if(same(bars.map(b=>b.box.x))&&!same(bars.map(b=>b.box.y)))return 'horizontal';
  if(same(bars.map(b=>b.box.y+b.box.height))&&!same(bars.map(b=>b.box.x)))return 'vertical';
  return 'unknown';
}
const ink=(texts:{box:Box}[],x:number)=>texts.filter(t=>t.box.x>=x-1).length;

let errors:string[]=[];
test.use({reducedMotion:'reduce'});
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
test.afterEach(async()=>{expect(errors).toEqual([]);});

for(const ref of BLOCKS)for(const mode of ['light','dark'] as const){
  test(`capture parity: ${ref.app}/${ref.block} (${mode})`,async({page},info)=>{
    const seen:Record<string,Awaited<ReturnType<typeof marks>>>={};
    for(const renderer of ['vizforge','viz'] as const){
      await page.goto(`/?app=${ref.app}&page=${ref.page}&capture=1&theme=${mode}${renderer==='viz'?'&viz-chart=1':''}`);
      const block=page.locator(`[data-block="${ref.block}"]`);
      if(renderer==='viz'){
        await expect(block.locator('.dp-viz')).toHaveAttribute('data-viz-theme',mode);
        await expect(block.locator('.dp-viz')).toHaveAttribute('data-viz-capture','true');
        await expect(block.locator('svg[data-viz-settled]')).toHaveAttribute('data-viz-settled','true');
      }else{
        await expect(block.locator(`.site-viz[data-theme="${mode}"] svg [data-mark]`).first()).toBeAttached();
        await expect.poll(()=>block.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
      }
      seen[renderer]=await marks(page,ref.block);
      await block.screenshot({path:info.outputPath(`${ref.block}-${renderer}-${mode}.png`)});
    }
    const vf=seen.vizforge!,vz=seen.viz!;
    if(ref.mark==='bar'){
      expect(vf.bar?.length).toBeGreaterThan(1);
      expect(vz.bar?.length).toBe(vf.bar!.length);
      expect(orientation(vf.bar!)).toBe('horizontal');
      expect(orientation(vz.bar!)).toBe('horizontal');
      await expect(page.locator(`[data-block="${ref.block}"] svg[data-orientation]`)).toHaveAttribute('data-orientation','horizontal');
      // Same rank order, labels and rank-change text, one label/value/rank/delta per bar.
      for(const key of ['rank','delta','label','value'])expect(vz[key]?.length,key).toBe(vf.bar!.length);
      // Read top to bottom: DOM order is not drawing order in VizForge.
      const column=(texts:{box:Box;text:string}[])=>[...texts].sort((a,b)=>a.box.y-b.box.y).map(t=>t.text);
      for(const key of ['rank','delta','label'])expect(column(vz[key]!),key).toEqual(column(vf[key]!));
      // Rank changes sit right of every bar, ranks left of every bar.
      for(const s of [vf,vz]){const right=Math.max(...s.bar!.map(b=>b.box.x+b.box.width)),left=Math.min(...s.bar!.map(b=>b.box.x));expect(ink(s.delta!,right)).toBe(s.delta!.length);expect(s.rank!.every(t=>t.box.x+t.box.width<=left+1)).toBe(true);}
    }else{
      for(const s of [vf,vz]){
        expect(s.line?.length).toBe(1);expect(s['focus-point']?.length).toBe(1);expect(s['focus-time']?.length).toBe(1);
        expect(s.label?.length).toBe(1);expect(s.value?.length).toBe(1);
        // The focus point sits on the line's last (rightmost) point; the end label is right of the plot.
        const line=s.line![0]!.box,point=s['focus-point']![0]!.box,cx=point.x+point.width/2;
        expect(Math.abs(cx-(line.x+line.width))).toBeLessThanOrEqual(3);
        expect(s.label![0]!.box.x).toBeGreaterThanOrEqual(line.x+line.width);
      }
    }
  });
}

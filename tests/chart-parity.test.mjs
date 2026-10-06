/** Structural parity: viz path (planChart) vs the pinned VizForge layout, for every chart block of
 * the public reference clients. Compared: series count, mark count and scale domains.
 * VizForge domains are recovered from its own geometry (axis tick positions inverted at the
 * range ends given by its createLayoutContext), not re-implemented, so a change in either path fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {loadClient} from '../scripts/load-client.mjs';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {chartInput} from '../src/framework/chart-input.ts';
import {withSiteChartTheme} from '../src/framework/visual-theme.ts';
import {planChart,planSummary} from '../src/framework/viz/chart-plan.ts';

const REFERENCE=['wind-reference','operations-reference','architecture-reference','experience-reference','energy-replay-reference','motion-reference','foundation-reference','model-reference'];
const WIDTH=900;// desktop layout in VizForge (phone below 540 px)
await mkdir('.generated',{recursive:true});
const entry=path.resolve('.generated/chart-parity-entry.ts'),output=path.resolve('.generated/chart-parity-vizforge.mjs');
await writeFile(entry,["export {parseVisualization} from '../.upstream/vizforge/src/core/spec.ts';","export {layoutChart} from '../.upstream/vizforge/src/renderers/layout.ts';","export {createLayoutContext} from '../.upstream/vizforge/src/renderers/layout-shared.ts';",''].join('\n'));
await build({entryPoints:[entry],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const vf=await import(pathToFileURL(output).href);

/** A linear scale from two (value, pixel) ticks, inverted at the range ends. */
function domainFromTicks(ticks,rangeStart,rangeEnd){
  const sorted=[...ticks].sort((a,b)=>a.value-b.value);
  assert.ok(sorted.length>=2,'need two axis ticks to recover a VizForge domain');
  const a=sorted[0],b=sorted.at(-1),k=(b.px-a.px)/(b.value-a.value),invert=px=>a.value+(px-a.px)/k;
  return [invert(rangeStart),invert(rangeEnd)];
}
const ticksOf=(layout,prefix,attr,offset=0)=>layout.decorations.filter(d=>d.key.startsWith(prefix)).map(d=>({value:Number(d.key.slice(prefix.length)),px:Number(d.attrs[attr])-offset}));
const vertices=d=>(String(d).match(/[ML]/g)||[]).length;

/** VizForge structure: series, marks and domains, read from the layout it would draw. */
export function vizforgeSummary(input){
  const spec=vf.parseVisualization(input),layout=vf.layoutChart(spec,undefined,WIDTH),ctx=vf.createLayoutContext(spec,undefined,WIDTH);
  if(spec.type==='ranking'){
    const bars=layout.entities.flatMap(e=>e.marks.filter(m=>m.key==='bar'));
    // ranking.ts: x range [barLeft, width - 78] on desktop; barLeft is every bar's x.
    const barLeft=Number(bars[0].attrs.x);
    return {mark:'bar',series:1,marks:bars.length,domains:{y:domainFromTicks(ticksOf(layout,'grid-','x1'),barLeft,layout.width-78)}};
  }
  if(spec.type==='time-series'){
    const lines=layout.entities.map(e=>e.marks.find(m=>m.key==='line'));
    return {mark:'line',series:layout.entities.length,marks:lines.reduce((n,l)=>n+vertices(l.attrs.d),0),domains:{
      x:domainFromTicks(ticksOf(layout,'xtick-','x'),ctx.left,ctx.right),
      y:domainFromTicks(ticksOf(layout,'ytick-','y',4),ctx.bottom,ctx.top)}};
  }
  if(spec.type==='scatter'){
    const bubbles=layout.entities.flatMap(e=>e.marks.filter(m=>m.key==='bubble'));
    return {mark:'point',series:1,marks:bubbles.length,domains:{
      x:domainFromTicks(ticksOf(layout,'xtick-','x'),ctx.left+10,ctx.right-10),
      y:domainFromTicks(ticksOf(layout,'ytick-','y',4),ctx.bottom-10,ctx.top+15)}};
  }
  throw new Error('Unexpected VizForge family '+spec.type);
}
function close(actual,expected,label){
  for(const axis of Object.keys(expected)){
    assert.ok(actual[axis],label+': viz path has no '+axis+' domain');
    for(const i of [0,1]){const a=actual[axis][i],e=expected[axis][i];assert.ok(Math.abs(a-e)<=1e-6*Math.max(1,Math.abs(e)),`${label}: ${axis} domain ${actual[axis]} vs VizForge ${expected[axis]}`);}
  }
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),label+': same axes');
}
function* charts(manifest){for(const page of manifest.pages)for(const section of page.sections)for(const block of section.blocks)if(block.type==='chart')yield block;}

const definitions=new Map();
for(const id of REFERENCE)definitions.set(id,await loadClient(id));
/** Extra states so parity is not only checked on the default rows. */
const STATES={'operations-reference':[{},{region:'North'},{minimum:70000}],'wind-reference':[{},{discount:8}]};

test('structural parity: every reference chart block gives the same series, marks and domains on both paths',()=>{
  let compared=0;const seen=new Set();
  for(const [id,definition] of definitions){
    for(const state of STATES[id]||[{}]){
      const runtime=new SiteRuntime(definition);
      for(const [field,value] of Object.entries(state))runtime.set(field,value);
      for(const block of charts(runtime.manifest)){
        const dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset),rows=runtime.dataset(block.dataset),label=`${id}/${block.id} ${JSON.stringify(state)}`;
        const input=chartInput(block,dataset,rows);
        if(!input.input){assert.ok(!rows.length||input.note,label+': VizForge refused without a note');continue;}
        const expected=vizforgeSummary(withSiteChartTheme(input.input,runtime.manifest.theme)),actual=planSummary(planChart(block,dataset,rows));
        assert.equal(actual.mark,expected.mark,label+': mark');
        assert.equal(actual.series,expected.series,label+': series count');
        assert.equal(actual.marks,expected.marks,label+': mark count');
        close(actual.domains,expected.domains,label);
        compared++;seen.add(id+'/'+block.id);
      }
    }
  }
  // The three reference chart blocks known today; a new one is picked up automatically.
  for(const key of ['operations-reference/regional-chart','wind-reference/sensitivity-chart','experience-reference/coverage-chart'])assert.ok(seen.has(key),'compared '+key);
  assert.ok(compared>=6,'compared '+compared+' chart states');
});

test('structural parity also holds for a scatter and a flat series (synthetic, both families)',()=>{
  const dataset={id:'d',title:'Synthetic',description:'Synthetic',provenance:'synthetic',rowKey:'id',columns:[{id:'id',label:'ID',type:'string'},{id:'x',label:'X',type:'number'},{id:'y',label:'Y',type:'number'}]};
  const cases=[
    [{id:'s',type:'chart',dataset:'d',kind:'scatter',x:'x',y:'y'},[{id:'a',x:1,y:3},{id:'b',x:4,y:-2},{id:'c',x:9,y:7.5}]],
    [{id:'l',type:'chart',dataset:'d',kind:'line',x:'x',y:'y'},[{id:'a',x:2,y:5},{id:'b',x:3,y:5},{id:'c',x:7,y:5}]],
    [{id:'b',type:'chart',dataset:'d',kind:'bar',x:'id',y:'y'},[{id:'a',x:0,y:0.2},{id:'b',x:0,y:0.6}]],
  ];
  for(const [block,rows] of cases){
    const expected=vizforgeSummary(chartInput(block,dataset,rows).input),actual=planSummary(planChart(block,dataset,rows));
    assert.equal(actual.series,expected.series,block.id);assert.equal(actual.marks,expected.marks,block.id);close(actual.domains,expected.domains,block.id);
  }
});

test('VizForge extras: ranking rank/rank change and line focus point match on every reference block',()=>{
  let ranked=0,lined=0;
  for(const [id,definition] of definitions){
    for(const state of STATES[id]||[{}]){
      const runtime=new SiteRuntime(definition);
      for(const [field,value] of Object.entries(state))runtime.set(field,value);
      for(const block of charts(runtime.manifest)){
        const dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset),rows=runtime.dataset(block.dataset),label=`${id}/${block.id} ${JSON.stringify(state)}`;
        const input=chartInput(block,dataset,rows);if(!input.input)continue;
        const spec=vf.parseVisualization(withSiteChartTheme(input.input,runtime.manifest.theme)),layout=vf.layoutChart(spec,undefined,WIDTH),plan=planChart(block,dataset,rows);
        const text=(e,key)=>e.marks.find(m=>m.key===key)?.text;
        if(spec.type==='ranking'){
          // VizForge ranking bars run along X (width carries the value): horizontal, like the viz plan.
          assert.equal(plan.orientation,'horizontal',label);
          for(const e of layout.entities){const r=plan.ranks.get(e.id);assert.ok(r,label+': rank for '+e.id);assert.equal(String(r.rank).padStart(2,'0'),text(e,'rank'),label+': rank '+e.id);assert.equal(r.delta,text(e,'delta'),label+': delta '+e.id);}
          assert.equal(plan.ranks.size,layout.entities.length,label);ranked++;
        }
        if(spec.type==='time-series'){
          // VizForge draws a focus point and an end label at each series' last point; the viz overlay uses the plan's last point.
          for(const [i,e] of layout.entities.entries()){assert.ok(e.marks.some(m=>m.key==='focus-point'),label);assert.ok(text(e,'label'),label);assert.ok(plan.lines[i].points.length,label);}
          assert.equal(plan.lines.length,layout.entities.length,label);lined++;
        }
      }
    }
  }
  assert.ok(ranked>=3&&lined>=1,`compared ${ranked} rankings and ${lined} lines`);
});

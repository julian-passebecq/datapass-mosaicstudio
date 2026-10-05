/** Chart block through the viz kit (behind `vizChartEnabled()`, default off). Loaded lazily so the
 * legacy VizForge path pays nothing while the flag is off.
 * The legacy `{kind,x,y}` block is translated by `fromLegacyChart`, validated against the
 * dataset's columns, then routed by mark count (SVG bars/lines, Canvas points).
 * Not yet covered (the flag stays off until they are): series/colour encodings in the block
 * contract, sort/stack options, more than one y, selection fields, and visual parity tests
 * against the VizForge captures.
 */
import {useMemo} from 'react';
import type {Block,Column,Rows} from '../types';
import {useDataset,useRuntime,useReducedMotion} from '../hooks';
import {VizRoot,BarChart,LineChart,parseChartSpec,fromLegacyChart,routeSpec,missingEncoded,ChartSpecError} from '../viz/index.ts';
import {Scatter} from '../viz/Scatter.tsx';
import {pointCloud} from '../viz/canvas.ts';

export default function ChartViz({block}:{block:Extract<Block,{type:'chart'}>}){
  const runtime=useRuntime(),result=useDataset(block.dataset),reduced=useReducedMotion(),dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset)!;
  const mode=runtime.manifest.theme.mode==='dark'?'dark':'light';
  const planned=useMemo(()=>{
    try{
      const spec=parseChartSpec(fromLegacyChart(block),{columns:dataset.columns});
      const rows=(result.rows||[]) as Rows;
      return {spec,rows:rows.filter(r=>r[block.x]!==null&&r[block.x]!==undefined&&r[block.y]!==null&&r[block.y]!==undefined),missing:missingEncoded(spec,rows),route:routeSpec(spec,rows),error:null};
    }catch(e){return {error:e instanceof ChartSpecError?e.issues.join('; '):String(e)};}
  },[block,dataset,result.rows]);
  if(result.error||planned.error)return <div className="site-notice" role="status">{result.error||planned.error}</div>;
  const {spec,rows,missing,route}=planned as Exclude<typeof planned,{spec?:undefined}>;
  if(!rows.length)return <div className="site-notice" role="status">No rows to plot.</div>;
  const xCol=dataset.columns.find(c=>c.id===block.x) as Column,yCol=dataset.columns.find(c=>c.id===block.y) as Column;
  const format={unit:block.unit||yCol.unit};
  const label=(block.title||yCol.label+' by '+xCol.label);
  let chart;
  if(spec.mark==='bar'){
    const categories=rows.map((r,i)=>({key:String(r[dataset.rowKey]??i),label:String(r[block.x])}));
    const byKey=new Map(categories.map((c,i)=>[c.key,Number(rows[i]![block.y])]));
    chart=<BarChart categories={categories} series={[{key:block.y,label:yCol.label,color:'var(--dp-viz-accent)'}]} value={c=>byKey.get(c)??0} mode="grouped" format={format} label={label} testId={'chart-'+block.id}/>;
  }else if(spec.mark==='line'){
    const numeric=xCol.type==='number',points=rows.map((r,i)=>({x:numeric?Number(r[block.x]):i,y:Number(r[block.y])}));
    chart=<LineChart series={[{key:block.y,label:yCol.label,color:'var(--dp-viz-accent)',points}]} xFormat={numeric?undefined:i=>String(rows[i]?.[block.x]??'')} format={format} label={label} testId={'chart-'+block.id}/>;
  }else{
    const cloud=pointCloud(rows.map(r=>Number(r[block.x])),rows.map(r=>Number(r[block.y])));
    chart=<Scatter cloud={cloud} xLabel={xCol.label} yLabel={yCol.label} label={label} testId={'chart-'+block.id}/>;
  }
  return <VizRoot mode={mode} reducedMotion={reduced} className="site-viz" data-viz-route={route.renderer}>
    <div style={{height:300}}>{chart}</div>
    {missing>0&&<p className="site-notice" role="status">{missing} row{missing>1?'s':''} with missing values not drawn.</p>}
  </VizRoot>;
}

/** Chart block through the viz kit: `renderer: 'viz'` on the block, or every chart while the
 * `viz-chart` flag is on (see chart-flag.ts). Loaded lazily so the VizForge path pays nothing.
 * `planChart` turns the block into categories/series, keyed values and VizForge-equivalent
 * domains (structural parity: tests/chart-parity.test.mjs); this file only renders the plan.
 * Bars and lines are SVG; points are SVG up to RENDER_LIMITS.svg marks, Canvas beyond.
 * Selection follows the other blocks: one declared view field, semantic keys, runtime.applyCue.
 */
import {useCallback,useMemo} from 'react';
import type {Block,Field} from '../types';
import {useDataset,useRuntime,useSiteState,useReducedMotion} from '../hooks';
import {VizRoot,BarChart,LineChart,Legend,chooseRenderer,cat} from '../viz/index.ts';
import {PointChart} from '../viz/Points.tsx';
import {RankMarks,LineEndMarks,RANK_MARGIN,END_LABEL_WIDTH} from '../viz/chart-marks.tsx';
import {planChart,ChartPlanError,type ChartPlan} from '../viz/chart-plan.ts';
import {Scatter} from '../viz/Scatter.tsx';
import {pointCloud} from '../viz/canvas.ts';
import {parseMulti,toggleMulti,parseInterval,encodeInterval} from '../selection.ts';

type ChartBlock=Extract<Block,{type:'chart'}>;
/** Selection over one view field: select/multi → a key set, interval → [lo, hi] on X. */
function useChartSelection(fieldId:string|undefined){
  const runtime=useRuntime(),snapshot=useSiteState();
  const field:Field|undefined=fieldId?runtime.manifest.fields.find(f=>f.id===fieldId):undefined;
  const raw=fieldId?snapshot.values[fieldId]:undefined;
  const state=useMemo(()=>{
    if(!field)return {keys:null,interval:null};
    if(field.type==='interval')return {keys:null,interval:parseInterval(field,raw??null)};
    return {keys:new Set(field.type==='multi'?parseMulti(field,raw):[String(raw)]),interval:null};
  },[field,raw]);
  const select=useCallback((key:string,additive:boolean)=>{
    if(!field||!field.options?.some(o=>o.value===key))return;// only declared semantic keys
    const current=String(runtime.getSnapshot().values[field.id]);
    runtime.applyCue({[field.id]:field.type==='multi'?toggleMulti(field,current,key,additive):key});
  },[runtime,field]);
  const brush=useCallback((interval:[number,number]|null)=>{if(field?.type==='interval')runtime.applyCue({[field.id]:encodeInterval(field,interval)});},[runtime,field]);
  return {field,...state,select:field&&field.type!=='interval'?select:undefined,brush:field?.type==='interval'?brush:undefined};
}
/** Keep only selected keys this chart shows: a select field's default ('All') dims nothing. */
const visible=(keys:ReadonlySet<string>|null,shown:Iterable<string>)=>{if(!keys)return null;const out=new Set<string>();for(const k of shown)if(keys.has(k))out.add(k);return out;};

export default function ChartViz({block}:{block:ChartBlock}){
  const runtime=useRuntime(),result=useDataset(block.dataset),reduced=useReducedMotion(),dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset)!;
  const mode=runtime.manifest.theme.mode==='dark'?'dark':'light';
  const selection=useChartSelection(block.selection);
  const planned=useMemo(():{plan:ChartPlan;error:null}|{plan:null;error:string}=>{
    try{return {plan:planChart(block,dataset,result.rows||[]),error:null};}
    catch(e){return {plan:null,error:e instanceof ChartPlanError?e.message:String(e)};}
  },[block,dataset,result.rows]);
  if(result.error||planned.error)return <div className="site-notice" role="status">{result.error||planned.error}</div>;
  const plan=planned.plan!;
  if(!plan.marks)return <div className="site-notice" role="status">No rows to plot.</div>;
  const {x:xCol,y:yCol,y2:y2Col}=plan.columns,format={unit:block.unit||yCol.unit};
  const label=block.title||yCol.label+' by '+xCol.label,testId='chart-'+block.id;
  const color=(i:number)=>plan.series.length>1?cat(i):'var(--dp-viz-accent)';
  const legend=plan.series.map((s,i)=>({key:s.key,label:s.label,color:color(i)}));
  let chart,renderer='svg';
  if(plan.mark==='bar'){
    const selected=visible(selection.keys,plan.categories.map(c=>c.key));
    // A ranking (horizontal, one series) also gets the VizForge rank, value and rank-change labels.
    const ranks=plan.orientation==='horizontal'?plan.ranks:null,key=plan.series[0]!.key;
    chart=<BarChart categories={plan.categories} series={legend} value={plan.value} mode={plan.stack} orientation={plan.orientation} domain={plan.domains.y} format={format} label={label} testId={testId} selected={selected} onSelect={selection.select}
      margin={ranks?RANK_MARGIN:undefined} overlay={ranks?g=><RankMarks g={g} categories={plan.categories} ranks={ranks} total={c=>plan.value(c,key)} format={format}/>:undefined}/>;
  }else if(plan.mark==='line'){
    const highlight=visible(selection.keys,plan.series.map(s=>s.key));
    const lines=plan.lines.map((l,i)=>({...l,color:color(i)})),y2Format=y2Col?{unit:y2Col.unit}:undefined,axis2=y2Col?52:0;
    // VizForge time-series extras: focus rule + focus point at the latest X, direct end labels.
    chart=<LineChart series={lines} xDomain={plan.domains.x} domain={plan.domains.y} y2Domain={plan.domains.y2} format={format} y2Format={y2Format} label={label} testId={testId} highlight={highlight}
      margin={{right:axis2+END_LABEL_WIDTH}} overlay={g=><LineEndMarks g={g} series={lines} format={format} y2Format={y2Format} x2={g.w+axis2}/>}/>;
  }else{
    renderer=chooseRenderer(plan.marks);
    chart=renderer==='svg'
      ?<PointChart points={plan.points} xDomain={plan.domains.x} yDomain={plan.domains.y} xLabel={xCol.label} yLabel={yCol.label} format={format} xFormat={{unit:xCol.unit}} label={label} testId={testId} brush={selection.interval} onBrush={selection.brush}/>
      :<Scatter cloud={pointCloud(plan.points.map(p=>p.x),plan.points.map(p=>p.y))} xDomain={plan.domains.x} yDomain={plan.domains.y} xLabel={xCol.label} yLabel={yCol.label} label={label} testId={testId}
        brush={selection.interval?{x:selection.interval,y:plan.domains.y}:null} onBrush={selection.brush?b=>selection.brush!(b?[b.x[0],b.x[1]]:null):undefined}/>;
  }
  const legendSelect=plan.mark==='line'?selection.select:undefined;
  return <VizRoot mode={mode} reducedMotion={reduced} className="site-viz" data-theme={mode} data-viz-route={renderer} data-chart-renderer="viz">
    {plan.series.length>1&&<Legend items={legend} active={legendSelect?visible(selection.keys,plan.series.map(s=>s.key)):null} onToggle={legendSelect}/>}
    <div style={{height:300}}>{chart}</div>
    {plan.missing>0&&<p className="site-notice" role="status">{plan.missing} row{plan.missing>1?'s':''} with missing values not drawn.</p>}
  </VizRoot>;
}

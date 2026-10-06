/** Chart block → render plan for the viz path (pure: no React, no DOM).
 * The plan holds categories/series, the keyed values, one domain per axis and the mark count.
 * Domain rules follow the VizForge families the legacy block maps to, so both paths agree on
 * scales (structural parity, tests/chart-parity.test.mjs):
 * - bar (VizForge ranking): value domain [min(0, lo), max(1, hi)], not niced;
 * - line (VizForge time-series): x = extent of X, y = extent with zero, niced;
 * - scatter (VizForge scatter): x and y = extent with zero, niced.
 * Missing encoded values are counted and never drawn as zero.
 */
import {scaleLinear} from './scales.ts';
import type {ChartVizOptions,Column,Dataset,Rows,Scalar} from '../types.ts';

export type ChartPlanBlock={id:string;title?:string;x:string;y:string;kind:'bar'|'line'|'scatter';unit?:string}&ChartVizOptions;
export type Domain=readonly [number,number];
export type PlanSeries={key:string;label:string;axis:'y'|'y2'};
type Common={missing:number;marks:number;series:PlanSeries[];columns:{x:Column;y:Column;y2?:Column}};
export type BarPlan=Common&{mark:'bar';categories:{key:string;label:string}[];value:(category:string,series:string)=>number;stack:'stacked'|'grouped';domains:{y:Domain}};
export type LinePlan=Common&{mark:'line';lines:(PlanSeries&{points:{x:number;y:number}[]})[];domains:{x:Domain;y:Domain;y2?:Domain}};
export type PointPlan=Common&{mark:'point';points:{key:string;x:number;y:number}[];domains:{x:Domain;y:Domain}};
export type ChartPlan=BarPlan|LinePlan|PointPlan;
export class ChartPlanError extends Error {}

const SEP='\u0000';
const present=(v:Scalar|undefined)=>v!==null&&v!==undefined&&v!=='';
const finite=(v:Scalar|undefined)=>typeof v==='number'&&Number.isFinite(v);
/** VizForge `domain()`: extent, optionally including zero; a flat extent is widened by 10 % (or 1). */
export function extentDomain(values:readonly number[],zero=false):Domain{
  if(!values.length)return [0,1];
  let lo=Math.min(...values),hi=Math.max(...values);
  if(zero){lo=Math.min(lo,0);hi=Math.max(hi,0);}
  if(lo===hi)return [lo-(lo?Math.abs(lo)*0.1:1),hi+(hi?Math.abs(hi)*0.1:1)];
  return [lo,hi];
}
const nice=(d:Domain):Domain=>scaleLinear().domain([d[0],d[1]]).nice().domain() as unknown as Domain;

export function planChart(block:ChartPlanBlock,dataset:Pick<Dataset,'rowKey'|'columns'>,rows:Rows):ChartPlan{
  const col=(id:string|undefined)=>id===undefined?undefined:dataset.columns.find(c=>c.id===id);
  const x=col(block.x),y=col(block.y),y2=col(block.y2),seriesCol=col(block.series);
  if(!x||!y||y.type!=='number')throw new ChartPlanError('Invalid chart encoding types');
  if(block.y2!==undefined&&(!y2||y2.type!=='number'))throw new ChartPlanError('chart.y2 must be a numeric column');
  if(block.series!==undefined&&!seriesCol)throw new ChartPlanError('chart.series must be a column');
  const encoded=[block.x,block.y,block.y2,block.series].filter((f):f is string=>f!==undefined);
  const complete=rows.filter(r=>encoded.every(f=>present(r[f])));
  const missing=rows.length-complete.length,columns={x,y,...(y2?{y2}:{})};
  for(const r of complete)for(const f of [block.y,block.y2])if(f!==undefined&&!finite(r[f]))throw new ChartPlanError(`Column "${f}" holds a non-numeric value`);
  const seriesOf=(r:Rows[number])=>block.series!==undefined?String(r[block.series]):block.y;
  const seriesKeys=[...new Set(complete.map(seriesOf))];
  const series:PlanSeries[]=block.series!==undefined?seriesKeys.map(key=>({key,label:key,axis:'y'})):[{key:block.y,label:y.label,axis:'y'},...(y2?[{key:y2.id,label:y2.label,axis:'y2' as const}]:[])];

  if(block.kind==='bar'){
    // Without a series a bar is one row (VizForge ranking: one entity per row key); with a series a
    // category is one X value and each (category, series) pair must be unique.
    const keyOf=(r:Rows[number],i:number)=>block.series!==undefined?String(r[block.x]):String(r[dataset.rowKey]??i);
    const values=new Map<string,number>(),labels=new Map<string,string>();
    complete.forEach((r,i)=>{
      const category=keyOf(r,i),k=category+SEP+seriesOf(r);
      if(values.has(k))throw new ChartPlanError(`Duplicate bar for "${String(r[block.x])}"${block.series!==undefined?' / '+seriesOf(r):''}. Aggregate the rows first.`);
      values.set(k,Number(r[block.y]));if(!labels.has(category))labels.set(category,String(r[block.x]));
    });
    const value=(c:string,s:string)=>values.get(c+SEP+s)??NaN;
    const stack=block.stack||'stacked',stacked=stack==='stacked'&&series.length>1;
    const total=(c:string)=>series.reduce((sum,s)=>sum+(Number.isFinite(value(c,s.key))?value(c,s.key):0),0);
    let categories=[...labels].map(([key,label])=>({key,label}));
    const sort=block.sort||'descending';
    if(sort!=='none'){const dir=sort==='descending'?-1:1;categories=categories.map((c,i)=>({c,i,t:total(c.key)})).sort((a,b)=>dir*(a.t-b.t)||a.c.label.localeCompare(b.c.label)||a.i-b.i).map(e=>e.c);}
    const all=stacked?categories.flatMap(c=>{let pos=0,neg=0;for(const s of series){const v=value(c.key,s.key);if(Number.isFinite(v)){if(v>=0)pos+=v;else neg+=v;}}return [pos,neg];}):[...values.values()];
    const lo=Math.min(0,...all),hi=Math.max(...all,0);
    const domain:Domain=hi>0||lo===0?[lo,Math.max(1,hi)]:[lo,0];
    return {mark:'bar',categories,series,value,stack,domains:{y:domain},marks:values.size,missing,columns};
  }
  if(x.type!=='number')throw new ChartPlanError(`${block.kind} needs a numeric X column`);
  if(block.kind==='line'){
    const lines=series.map(s=>({...s,points:complete.filter(r=>block.series===undefined||seriesOf(r)===s.key).map(r=>({x:Number(r[block.x]),y:Number(r[s.axis==='y2'?block.y2!:block.y])})).sort((a,b)=>a.x-b.x)}));
    for(const l of lines)for(let i=1;i<l.points.length;i++)if(l.points[i]!.x===l.points[i-1]!.x)throw new ChartPlanError(`Line "${l.label}" has two rows at X = ${l.points[i]!.x}. Aggregate duplicates first.`);
    const xs=lines.flatMap(l=>l.points.map(p=>p.x)),ys=(axis:'y'|'y2')=>lines.filter(l=>l.axis===axis).flatMap(l=>l.points.map(p=>p.y));
    const domains={x:extentDomain(xs),y:nice(extentDomain(ys('y'),true)),...(y2?{y2:nice(extentDomain(ys('y2'),true))}:{})};
    return {mark:'line',lines,series,domains,marks:lines.reduce((n,l)=>n+l.points.length,0),missing,columns};
  }
  const points=complete.map((r,i)=>({key:String(r[dataset.rowKey]??i),x:Number(r[block.x]),y:Number(r[block.y])}));
  if(points.some(p=>!Number.isFinite(p.x)))throw new ChartPlanError(`Column "${block.x}" holds a non-numeric value`);
  return {mark:'point',points,series,domains:{x:nice(extentDomain(points.map(p=>p.x),true)),y:nice(extentDomain(points.map(p=>p.y),true))},marks:points.length,missing,columns};
}
/** The structural summary the parity tests compare with VizForge. */
export function planSummary(plan:ChartPlan){return {mark:plan.mark,series:plan.series.length,marks:plan.marks,domains:plan.domains};}

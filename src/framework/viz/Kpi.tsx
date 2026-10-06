/** KPI card: count-up value, delta and a sparkline. Settles at the target value under capture. */
import {useMemo} from 'react';
import {line as d3line,area as d3area,curveMonotoneX} from 'd3-shape';
import {scaleLinear} from 'd3-scale';
import {useCountUp,settledAttr} from './react.tsx';
import {formatNumber} from './scales.ts';
import type {NumberFormat} from './svg.tsx';
export type KpiProps={label:string;value:number;format?:NumberFormat;delta?:number|null;deltaLabel?:string;spark?:readonly number[];color?:string;testId?:string};
export function Kpi({label,value,format,delta,deltaLabel,spark,color='var(--dp-viz-accent)',testId}:KpiProps){
  const shown=useCountUp(value);
  const paths=useMemo(()=>{
    if(!spark||spark.length<2)return null;
    const w=120,h=36,x=scaleLinear().domain([0,spark.length-1]).range([1,w-1]),lo=Math.min(...spark),hi=Math.max(...spark),y=scaleLinear().domain(lo===hi?[lo-1,hi+1]:[lo,hi]).range([h-2,2]);
    const pts=spark.map((v,i)=>[x(i),y(v)] as [number,number]);
    return {w,h,line:d3line().curve(curveMonotoneX)(pts)||'',area:d3area().curve(curveMonotoneX).y0(h)(pts)||'',last:pts[pts.length-1]!};
  },[spark]);
  const sign=delta===undefined||delta===null||!Number.isFinite(delta)?undefined:delta>=0?'up':'down';
  const gid='kpi-'+(testId||label).replace(/[^a-z0-9]/gi,'');
  return <div className="viz-kpi" data-testid={testId} data-viz-settled={settledAttr(shown.settled)} data-value={value} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12,height:'100%'}}>
    <div style={{display:'grid',gap:4,minWidth:0}}>
      <span className="viz-kpi-label">{label}</span>
      <span className="viz-kpi-value" aria-live="polite" aria-label={label+' '+formatNumber(value,format)}>{formatNumber(shown.value,format)}</span>
      {sign&&<span className="viz-kpi-delta" data-sign={sign}>{sign==='up'?'▲':'▼'} {Math.abs(delta!).toFixed(1)}%<span style={{color:'var(--dp-viz-ink-muted)',fontWeight:400}}> {deltaLabel||''}</span></span>}
    </div>
    {paths&&<svg width={paths.w} height={paths.h} aria-hidden="true" style={{flex:'none'}}>
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.35}/><stop offset="1" stopColor={color} stopOpacity={0}/></linearGradient></defs>
      <path d={paths.area} fill={`url(#${gid})`}/><path d={paths.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round"/>
      <circle cx={paths.last[0]} cy={paths.last[1]} r={3} fill={color} stroke="var(--dp-viz-surface)" strokeWidth={1.5}/>
    </svg>}
  </div>;
}

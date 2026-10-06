/** VizForge-only chart extras for the viz path, drawn as overlays on BarChart/LineChart.
 * Outside the core index (like Points.tsx): only the lazy ChartViz chunk loads them.
 * - Ranking bars (VizForge ranking.ts): zero-padded rank on the left, value at the bar end,
 *   rank change at the right edge.
 * - Lines (VizForge time.ts): focus-time rule at the latest X, a focus point on each series' last
 *   value, direct end labels (series label + last value) right of the plot, collisions resolved
 *   in pixel space only (data positions stay truthful).
 * Marks carry the same `data-mark` keys as VizForge so the capture parity test can compare both.
 */
import type {BarGeometry,LineSeries,NumberFormat} from './svg.tsx';
import {formatNumber} from './scales.ts';
import {v} from './tokens.ts';
import type {Rank} from './chart-plan.ts';

const short=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
/** Right margin a ranking needs for its rank change; left margin for rank + label. */
export const RANK_MARGIN={left:140,right:78} as const;// VizForge desktop: barLeft 140, barRight width - 78
/** Right margin for line end labels (added to a dual axis' own margin). */
export const END_LABEL_WIDTH=96;

export function RankMarks({g,categories,ranks,total,format}:{g:BarGeometry;categories:readonly {key:string}[];ranks:ReadonlyMap<string,Rank>;total:(key:string)=>number;format?:NumberFormat}){
  return <>{categories.map(c=>{
    const r=ranks.get(c.key);if(!r)return null;
    const y=g.band(c.key)+g.bandwidth/2,value=total(c.key);
    return <g key={c.key} data-key={c.key} fontSize={11}>
      <text data-mark="rank" x={8-g.m.left} y={y} dy="0.32em" fill={v('inkMuted')}>{String(r.rank).padStart(2,'0')}</text>
      <text data-mark="value" x={g.at(Math.max(0,value))+8} y={y} dy="0.32em" fill={v('ink')} fontWeight={600}>{formatNumber(value,{...format,unit:undefined})}</text>
      <text data-mark="delta" x={g.w+g.m.right-8} y={y} dy="0.32em" textAnchor="end" fill={v('inkMuted')}>{r.delta}</text>
    </g>;
  })}</>;
}

/** Focus rule, focus points and direct end labels for line series (colour per series). */
export function LineEndMarks({g,series,format,y2Format,x2}:{g:{x:(n:number)=>number;y:(s:LineSeries,n:number)=>number;w:number;h:number};series:readonly LineSeries[];format?:NumberFormat;y2Format?:NumberFormat;x2:number}){
  const ends=series.flatMap(s=>{const last=s.points[s.points.length-1];return last?[{s,last,py:g.y(s,last.y),ly:g.y(s,last.y)}]:[];});
  // Same collision pass as VizForge: push down by a fixed gap, then back up from the bottom.
  const gap=28,sorted=[...ends].sort((a,b)=>a.ly-b.ly);
  sorted.forEach((p,i)=>{p.ly=Math.max(4,p.ly,i?sorted[i-1]!.ly+gap:0);});
  for(let i=sorted.length-1;i>=0;i--)sorted[i]!.ly=Math.min(sorted[i]!.ly,i===sorted.length-1?g.h-12:sorted[i+1]!.ly-gap);
  const at=Math.max(...ends.map(e=>e.last.x)),fx=g.x(at);
  return <>
    <line data-mark="focus-time" x1={fx} x2={fx} y1={0} y2={g.h} stroke={v('inkMuted')} strokeDasharray="3 5" opacity={0.5}/>
    {ends.map(({s,last,py,ly})=><g key={s.key} data-series={s.key}>
      <circle data-mark="focus-point" cx={g.x(last.x)} cy={py} r={4} fill={s.color} stroke={v('surface')} strokeWidth={2}/>
      <text data-mark="label" x={x2+9} y={ly-4} fill={s.color} fontWeight={600} fontSize={12}>{short(s.label,14)}</text>
      <text data-mark="value" x={x2+9} y={ly+11} fill={v('inkMuted')} fontSize={10}>{formatNumber(last.y,s.axis==='y2'?y2Format:format)}</text>
    </g>)}
  </>;
}

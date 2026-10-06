/** Small scatter on SVG (keyed circles, tooltip, X interval brush). Outside the core index like
 * Scatter.tsx: only the chart block's viz path loads it; Canvas Scatter takes over above RENDER_LIMITS.svg.
 */
import {useMemo,useState,type PointerEvent} from 'react';
import {scaleLinear,formatNumber,tickCount,inner,type Margin} from './scales.ts';
import {useMarkTransition,settledAttr} from './react.tsx';
import {useTooltip} from './Tooltip.tsx';
import {v} from './tokens.ts';
import {useSize,YAxis,type NumberFormat} from './svg.tsx';

export type PointProps={points:readonly {key:string;x:number;y:number}[];xDomain:readonly [number,number];yDomain:readonly [number,number];xLabel:string;yLabel:string;format?:NumberFormat;xFormat?:NumberFormat;label?:string;testId?:string;
  /** X interval brush: reported once per gesture on pointer up; a click without drag clears it. */
  brush?:readonly [number,number]|null;onBrush?:(interval:[number,number]|null)=>void};
export function PointChart(props:PointProps){
  const {ref,width,height,ready}=useSize();
  return <div ref={ref} className="viz-chart">{ready&&<PointSvg {...props} width={width} height={height}/>}</div>;
}
function PointSvg({points,xDomain,yDomain,xLabel,yLabel,format,xFormat,label,testId,brush,onBrush,width,height}:PointProps&{width:number;height:number}){
  const tooltip=useTooltip(),[drag,setDrag]=useState<[number,number]|null>(null);
  const m:Margin={top:10,right:12,bottom:34,left:52},{w,h}=inner(width,height,m);
  const x=useMemo(()=>scaleLinear().domain([xDomain[0],xDomain[1]]).range([0,w]),[xDomain,w]),y=useMemo(()=>scaleLinear().domain([yDomain[0],yDomain[1]]).range([h,0]),[yDomain,h]);
  const marks=useMemo(()=>points.map(p=>({key:p.key,datum:p,attrs:{cx:x(p.x),cy:y(p.y),r:4}})),[points,x,y]);
  const t=useMarkTransition(marks,{enter:mk=>({...mk.attrs,r:0}),exit:mk=>({...mk.attrs,r:0})});
  const inside=(p:{x:number})=>!brush||(p.x>=brush[0]&&p.x<=brush[1]);
  const at=(e:PointerEvent<SVGRectElement>)=>Math.max(0,Math.min(w,e.clientX-(e.currentTarget as SVGRectElement).getBoundingClientRect().left));
  const shown=drag?[Math.min(drag[0],drag[1]),Math.max(drag[0],drag[1])]:brush?[x(brush[0]),x(brush[1])]:null;
  return <svg width={width} height={height} role="img" aria-label={label||'Scatter plot'} data-testid={testId} data-viz-settled={settledAttr(t.settled)} data-viz-renderer="svg" data-marks={points.length} data-series={1} data-domain-x={x.domain().join(':')} data-domain-y={y.domain().join(':')}>
    <g transform={`translate(${m.left},${m.top})`}>
      <YAxis scale={y} width={w} ticks={tickCount(h,48)} fmt={n=>formatNumber(n,{...format,digits:undefined,unit:undefined})}/>
      <g className="viz-axis" aria-hidden="true" transform={`translate(0,${h})`}>{x.ticks(tickCount(w,72)).map(tk=><text key={tk} x={x(tk)} y={16} textAnchor="middle">{formatNumber(tk,{...xFormat,digits:undefined,unit:undefined})}</text>)}<text x={w/2} y={30} textAnchor="middle">{xLabel}</text></g>
      <text className="viz-axis" x={0} y={-2} aria-hidden="true">{yLabel}</text>
      {shown&&<rect className="viz-brush" x={shown[0]} y={0} width={Math.max(1,shown[1]-shown[0])} height={h} fill={v('accent')} opacity={0.12} pointerEvents="none"/>}
      <g>{t.marks.map(mk=><circle key={mk.key} className="viz-mark-shape" data-key={mk.key} cx={mk.attrs.cx} cy={mk.attrs.cy} r={mk.attrs.r} fill={v('accent')} fillOpacity={inside(mk.datum)?0.75:0.2} opacity={mk.opacity} pointerEvents="none"/>)}</g>
      <rect x={0} y={0} width={w} height={h} fill="transparent" style={onBrush?{cursor:'crosshair',touchAction:'none'}:undefined}
        onPointerDown={onBrush?e=>{(e.currentTarget as SVGRectElement).setPointerCapture?.(e.pointerId);const p=at(e);setDrag([p,p]);}:undefined}
        onPointerMove={e=>{if(drag){const p=at(e);setDrag([drag[0],p]);return;}const r=(e.currentTarget as SVGRectElement).getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;let best=-1,dist=144;points.forEach((p,i)=>{const d=(x(p.x)-px)**2+(y(p.y)-py)**2;if(d<dist){dist=d;best=i;}});if(best<0){tooltip.hide();return;}const p=points[best]!;tooltip.show({x:e.clientX,y:e.clientY,title:p.key,rows:[{label:xLabel,value:formatNumber(p.x,xFormat)},{label:yLabel,value:formatNumber(p.y,format)}]});}}
        onPointerUp={()=>{if(!drag||!onBrush)return;const lo=Math.min(drag[0],drag[1]),hi=Math.max(drag[0],drag[1]);setDrag(null);onBrush(hi-lo<3?null:[x.invert(lo),x.invert(hi)]);}}
        onPointerLeave={()=>tooltip.hide()}/>
    </g>
  </svg>;
}

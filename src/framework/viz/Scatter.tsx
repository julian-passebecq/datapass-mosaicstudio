/** Dense scatter: Canvas 2D points + SVG overlay for axes, hover and an interval brush.
 * The brush reports data-space intervals once per animation frame (never per pointer event).
 */
import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {fittedLinear,formatNumber,inner,scaleLinear,tickCount,type Margin} from './scales.ts';
import {buildIndex,drawPoints,nearest,prepareCanvas,type PointCloud} from './canvas.ts';
import {useSize,type NumberFormat} from './svg.tsx';
import {useTooltip} from './Tooltip.tsx';
import {resolveVars} from './tokens.ts';
import type {Interval} from '../selection.ts';
export type Brush={x:Interval;y:Interval}|null;
export type ScatterProps={
  cloud:PointCloud;
  /** 0 = context (filtered out by other visuals), 1 = active, 2 = inside brush. */
  state?:(i:number)=>0|1|2;stateKey?:unknown;
  brush?:Brush;onBrush?:(brush:Brush)=>void;
  xLabel:string;yLabel:string;xFormat?:NumberFormat;yFormat?:NumberFormat;describe?:(i:number)=>{title:string;rows:{label:string;value:string}[]};
  xDomain?:readonly [number,number];yDomain?:readonly [number,number];themeKey?:string;label?:string;testId?:string;margin?:Partial<Margin>;
};
export function Scatter(props:ScatterProps){
  const {ref,width,height,ready}=useSize();
  return <div ref={ref} className="viz-chart">{ready&&<ScatterView {...props} width={width} height={height}/>}</div>;
}
function ScatterView({xDomain,yDomain,cloud,state,stateKey,brush,onBrush,xLabel,yLabel,xFormat,yFormat,describe,themeKey,label,testId,margin,width,height}:ScatterProps&{width:number;height:number}){
  const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null),tooltip=useTooltip();
  const m:Margin={top:10,right:12,bottom:34,left:52,...margin},{w,h}=inner(width,height,m);
  const sx=useMemo(()=>xDomain?scaleLinear().domain(xDomain).range([0,w]):fittedLinear(cloud.x,[0,w],0.02),[cloud,w,xDomain]),sy=useMemo(()=>yDomain?scaleLinear().domain(yDomain).range([h,0]):fittedLinear(cloud.y,[h,0],0.02),[cloud,h,yDomain]);
  const index=useMemo(()=>buildIndex(cloud),[cloud]);
  const [paint,setPaint]=useState<{ms:number;counts:number[]}|null>(null),[drag,setDrag]=useState<{x0:number;y0:number;x1:number;y1:number}|null>(null),[hover,setHover]=useState(-1);
  useEffect(()=>{
    const el=canvas.current;if(!el||!host.current)return;
    const t0=performance.now();
    const vars=resolveVars(host.current,['--dp-viz-ink-muted','--dp-viz-categorical-1','--dp-viz-accent']);
    const ctx=prepareCanvas(el,{width:w,height:h,dpr:globalThis.devicePixelRatio||1});
    const dense=cloud.length>20000;
    const counts=drawPoints(ctx,cloud,sx,sy,[
      {color:vars['--dp-viz-ink-muted']||'gray',alpha:dense?0.10:0.2,size:dense?1.6:2.5},
      {color:vars['--dp-viz-categorical-1']||'blue',alpha:dense?0.32:0.6,size:dense?2:3},
      {color:vars['--dp-viz-accent']||'teal',alpha:dense?0.55:0.85,size:dense?2:3},
    ],state||(()=>1));
    setPaint({ms:Math.round(performance.now()-t0),counts});
  },[cloud,sx,sy,w,h,state,stateKey,themeKey]);
  const pending=useRef<Brush|undefined>(undefined),raf=useRef(0);
  const emit=(b:Brush)=>{pending.current=b;if(raf.current)return;raf.current=requestAnimationFrame(()=>{raf.current=0;const v=pending.current;pending.current=undefined;if(v!==undefined)onBrush?.(v);});};
  useEffect(()=>()=>cancelAnimationFrame(raf.current),[]);
  const local=(e:PointerEvent)=>{const r=(e.currentTarget as SVGRectElement).getBoundingClientRect();return {px:Math.max(0,Math.min(w,e.clientX-r.left)),py:Math.max(0,Math.min(h,e.clientY-r.top))};};
  const toBrush=(d:{x0:number;y0:number;x1:number;y1:number}):Brush=>({x:[sx.invert(Math.min(d.x0,d.x1)),sx.invert(Math.max(d.x0,d.x1))],y:[sy.invert(Math.max(d.y0,d.y1)),sy.invert(Math.min(d.y0,d.y1))]});
  const onDown=(e:PointerEvent<SVGRectElement>)=>{if(!onBrush)return;(e.currentTarget as Element).setPointerCapture?.(e.pointerId);const {px,py}=local(e);setDrag({x0:px,y0:py,x1:px,y1:py});setHover(-1);tooltip.hide();};
  const onMove=(e:PointerEvent<SVGRectElement>)=>{
    const {px,py}=local(e);
    if(drag){const d={...drag,x1:px,y1:py};setDrag(d);if(Math.abs(d.x1-d.x0)>3&&Math.abs(d.y1-d.y0)>3)emit(toBrush(d));return;}
    const rx=Math.abs(sx.invert(6)-sx.invert(0)),i=nearest(index,sx.invert(px),sy.invert(py),rx);
    setHover(i);
    if(i>=0&&describe){const d=describe(i);tooltip.show({x:e.clientX,y:e.clientY,title:d.title,rows:d.rows});}else tooltip.hide();
  };
  const onUp=(e:PointerEvent<SVGRectElement>)=>{if(!drag)return;const {px,py}=local(e),d={...drag,x1:px,y1:py};setDrag(null);if(Math.abs(d.x1-d.x0)<=3||Math.abs(d.y1-d.y0)<=3)emit(null);else emit(toBrush(d));};
  const shown=drag&&Math.abs(drag.x1-drag.x0)>3?{x:Math.min(drag.x0,drag.x1),y:Math.min(drag.y0,drag.y1),w:Math.abs(drag.x1-drag.x0),h:Math.abs(drag.y1-drag.y0)}:brush?{x:sx(brush.x[0]),y:sy(brush.y[1]),w:sx(brush.x[1])-sx(brush.x[0]),h:sy(brush.y[0])-sy(brush.y[1])}:null;
  const fx=(n:number)=>formatNumber(n,{...xFormat,unit:undefined}),fy=(n:number)=>formatNumber(n,{...yFormat,unit:undefined});
  return <div ref={host} style={{position:'relative',width,height}} data-testid={testId} data-viz-settled={paint?'true':'false'} data-viz-renderer="canvas" data-marks={cloud.length} data-first-paint-ms={paint?.ms} data-brushed={paint?.counts[2]??0} data-active={paint?.counts[1]??0} role="img" aria-label={(label||'Scatter')+`: ${cloud.length.toLocaleString('en-US')} points`+(paint?`, ${paint.counts[2]} in brush`:'')}>
    <svg width={width} height={height} style={{position:'absolute',inset:0}} aria-hidden="true"><g className="viz-grid" transform={`translate(${m.left},${m.top})`}>{sy.ticks(tickCount(h,48)).map(t=><line key={t} x1={0} x2={w} y1={Math.round(sy(t))+.5} y2={Math.round(sy(t))+.5}/>)}{sx.ticks(tickCount(w,80)).map(t=><line key={t} y1={0} y2={h} x1={Math.round(sx(t))+.5} x2={Math.round(sx(t))+.5}/>)}</g></svg>
    <canvas ref={canvas} style={{position:'absolute',left:m.left,top:m.top}} aria-hidden="true"/>
    <svg width={width} height={height} style={{position:'absolute',inset:0}}>
      <g transform={`translate(${m.left},${m.top})`}>
        <g className="viz-axis" aria-hidden="true">{sy.ticks(tickCount(h,48)).map(t=><text key={t} x={-8} y={sy(t)} dy="0.32em" textAnchor="end">{fy(t)}</text>)}</g>
        <g className="viz-axis" aria-hidden="true" transform={`translate(0,${h})`}>{sx.ticks(tickCount(w,80)).map(t=><text key={t} x={sx(t)} y={16} textAnchor="middle">{fx(t)}</text>)}<text className="viz-label" x={w} y={30} textAnchor="end">{xLabel}</text></g>
        <text className="viz-label" transform="rotate(-90)" x={0} y={-40} textAnchor="end">{yLabel}</text>
        {hover>=0&&!drag&&<circle cx={sx(cloud.x[hover]!)} cy={sy(cloud.y[hover]!)} r={5} fill="none" stroke="var(--dp-viz-ink)" strokeWidth={1.5} pointerEvents="none"/>}
        {shown&&<rect className="viz-brush" data-testid={testId?testId+'-brush':undefined} x={shown.x} y={shown.y} width={Math.max(0,shown.w)} height={Math.max(0,shown.h)} pointerEvents="none" rx={2}/>}
        <rect x={0} y={0} width={w} height={h} fill="transparent" style={{cursor:onBrush?'crosshair':'default',touchAction:'none'}} data-testid={testId?testId+'-surface':undefined}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={()=>{if(!drag){setHover(-1);tooltip.hide();}}}/>
      </g>
    </svg>
  </div>;
}

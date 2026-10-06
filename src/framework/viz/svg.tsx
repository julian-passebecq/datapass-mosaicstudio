/** SVG renderers: d3 computes scales and shapes, React owns the DOM, marks are keyed and
 * interpolated by useMarkTransition. Every chart exposes data-viz-settled for capture.
 */
import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent,type MouseEvent,type ReactNode} from 'react';
import {arc as d3arc,area as d3area,line as d3line,curveMonotoneX,pie as d3pie} from 'd3-shape';
import {bisector} from 'd3-array';
import {scaleBand,scaleLinear,zeroLinear,fittedLinear,formatNumber,tickCount,inner,type Margin} from './scales.ts';
import {useMarkTransition,settledAttr,type Mark} from './react.tsx';
import {useTooltip,type TooltipRow} from './Tooltip.tsx';
import {cat,v} from './tokens.ts';

export function useSize<T extends HTMLElement=HTMLDivElement>(){
  const [element,setElement]=useState<T|null>(null),[size,setSize]=useState({width:0,height:0});
  const ref=useCallback((node:T|null)=>setElement(node),[]);
  useEffect(()=>{
    if(!element)return;
    const update=(w:number,h:number)=>setSize(o=>o.width===Math.round(w)&&o.height===Math.round(h)?o:{width:Math.round(w),height:Math.round(h)});
    const r=element.getBoundingClientRect();update(r.width,r.height);
    if(typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(e=>{const c=e[0]?.contentRect;if(c)update(c.width,c.height);});ro.observe(element);return()=>ro.disconnect();
  },[element]);
  return {ref,...size,ready:size.width>0&&size.height>0};
}
export type NumberFormat={digits?:number;unit?:string;prefix?:string;compact?:boolean};
type Selectable={selected?:ReadonlySet<string>|null;onSelect?:(key:string,additive:boolean)=>void};
const dimmed=(selected:ReadonlySet<string>|null|undefined,key:string)=>!!selected&&selected.size>0&&!selected.has(key);
const isAdditive=(e:MouseEvent|KeyboardEvent)=>e.ctrlKey||e.metaKey||e.shiftKey;
function activate(onSelect:Selectable['onSelect'],key:string){return {onClick:(e:MouseEvent)=>onSelect?.(key,isAdditive(e)),onKeyDown:(e:KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(key,isAdditive(e));}}};}

export function YAxis({scale,width,ticks,fmt}:{scale:ReturnType<typeof scaleLinear<number>>;width:number;ticks:number;fmt:(n:number)=>string}){
  return <g className="viz-axis viz-grid" aria-hidden="true">{scale.ticks(ticks).map(t=><g key={t} transform={`translate(0,${Math.round(scale(t))+.5})`}><line x1={0} x2={width}/><text x={-8} dy="0.32em" textAnchor="end">{fmt(t)}</text></g>)}</g>;
}
export function Legend({items,active,onToggle}:{items:{key:string;label:string;color:string}[];active?:ReadonlySet<string>|null;onToggle?:(key:string,additive:boolean)=>void}){
  return <ul className="viz-legend" aria-label="Legend">{items.map(it=><li key={it.key}>{onToggle?<button type="button" aria-pressed={!active||active.size===0||active.has(it.key)} onClick={e=>onToggle(it.key,isAdditive(e))}><i style={{background:it.color}}/>{it.label}</button>:<><i style={{background:it.color}}/>{it.label}</>}</li>)}</ul>;
}

/* ---------- Bar: clustered / stacked, vertical or horizontal, any number of categories ---------- */
/** Plot geometry handed to an overlay: category band start, value position, inner size, margin. */
export type BarGeometry={band:(key:string)=>number;bandwidth:number;at:(n:number)=>number;w:number;h:number;m:Margin};
export type BarProps=Selectable&{
  categories:readonly {key:string;label:string}[];series:readonly {key:string;label:string;color?:string}[];
  value:(category:string,series:string)=>number;mode?:'stacked'|'grouped';format?:NumberFormat;margin?:Partial<Margin>;label?:string;testId?:string;
  /** Fixed value domain (e.g. from planChart); otherwise zero-based and niced from the values. */
  domain?:readonly [number,number];
  /** Horizontal: categories down the Y axis, values along X (VizForge ranking). Default vertical. */
  orientation?:'vertical'|'horizontal';
  /** Extra non-interactive marks drawn in plot coordinates (ranks, deltas, value labels). */
  overlay?:(g:BarGeometry)=>ReactNode;
};
type BarDatum={category:string;series:string;value:number};
export function BarChart(props:BarProps){
  const {ref,width,height,ready}=useSize();
  return <div ref={ref} className="viz-chart">{ready&&<BarSvg {...props} width={width} height={height}/>}{!ready&&<div data-viz-settled="false"/>}</div>;
}
function BarSvg({categories,series,value,mode='stacked',format,selected,onSelect,margin,label,testId,domain,orientation,overlay,width,height}:BarProps&{width:number;height:number}){
  const tooltip=useTooltip(),hz=orientation==='horizontal',many=!hz&&categories.length>16;
  const m:Margin={top:8,right:8,bottom:many?40:24,left:hz?96:48,...margin},{w,h}=inner(width,height,m);
  const fmt=(n:number)=>formatNumber(n,format);
  // Band axis: X when vertical, Y when horizontal. Value axis: Y up, or X to the right.
  const {marks,x,y}=useMemo(()=>{
    const x=scaleBand<string>().domain(categories.map(c=>c.key)).range([0,hz?h:w]).paddingInner(categories.length>30?0.18:0.28).paddingOuter(0.1);
    const totals=categories.map(c=>series.reduce((s,se)=>s+Math.max(0,value(c.key,se.key)),0));
    const values=mode==='stacked'?[...totals,...categories.map(c=>series.reduce((s,se)=>s+Math.min(0,value(c.key,se.key)),0))]:categories.flatMap(c=>series.map(se=>value(c.key,se.key)));
    const range:[number,number]=hz?[0,w]:[h,0],y=domain?scaleLinear().domain([domain[0],domain[1]]).range(range):zeroLinear(values,range);
    const inner=scaleBand<string>().domain(series.map(s=>s.key)).range([0,x.bandwidth()]).paddingInner(series.length>1?0.12:0);
    const out:Mark<BarDatum>[]=[];
    for(const c of categories){
      let pos=0,neg=0;
      series.forEach(se=>{
        const val=value(c.key,se.key);if(!Number.isFinite(val))return;
        let b0:number,bw:number,v0:number,v1:number;
        if(mode==='stacked'){b0=x(c.key)!;bw=x.bandwidth();if(val>=0){v0=pos;pos+=val;v1=pos;}else{v0=neg;neg+=val;v1=neg;}}
        else{b0=x(c.key)!+inner(se.key)!;bw=inner.bandwidth();v0=0;v1=val;}
        const p0=y(Math.min(v0,v1)),p1=y(Math.max(v0,v1)),lo=Math.min(p0,p1),len=Math.abs(p1-p0);
        // 2px surface gap between stacked segments.
        const gap=mode==='stacked'&&series.length>1?1:0;
        out.push({key:c.key+'\u0000'+se.key,datum:{category:c.key,series:se.key,value:val},attrs:hz?{x:lo+gap,w:Math.max(0,len-gap*2),y:b0,h:bw}:{x:b0,w:bw,y:lo+gap,h:Math.max(0,len-gap*2)}});
      });
    }
    return {marks:out,x,y};
  },[categories,series,value,mode,w,h,domain,hz]);
  const base=y(0);
  const collapse=(mk:Mark<BarDatum>)=>({...mk.attrs,...(hz?{x:base,w:0}:{y:base,h:0})}),t=useMarkTransition(marks,{enter:collapse,exit:collapse});
  const colorOf=new Map(series.map((s,i)=>[s.key,s.color||cat(i)])),labelOf=new Map(categories.map(c=>[c.key,c.label]));
  const showTip=(e:MouseEvent,category:string)=>{
    const rows:TooltipRow[]=series.map(se=>({label:se.label,value:fmt(value(category,se.key)),color:colorOf.get(se.key)}));
    if(series.length>1&&mode==='stacked')rows.push({label:'Total',value:fmt(series.reduce((s,se)=>s+value(category,se.key),0))});
    tooltip.show({x:e.clientX,y:e.clientY,title:labelOf.get(category)||category,rows});
  };
  const step=hz?1:Math.max(1,Math.ceil(categories.length/Math.max(1,Math.floor(w/(many?28:56))))),tickFmt=(n:number)=>formatNumber(n,{...format,digits:undefined,unit:undefined});
  const hit=(c:{key:string})=>(x(c.key)??0)-x.step()*x.paddingInner()/2,line=Math.round(base)+.5;
  return <svg width={width} height={height} role="img" aria-label={label||'Bar chart'} data-testid={testId} data-viz-settled={settledAttr(t.settled)} data-viz-renderer="svg" data-orientation={hz?'horizontal':'vertical'} data-marks={marks.length} data-series={series.length} data-domain-y={y.domain().join(':')}>
    <g transform={`translate(${m.left},${m.top})`}>
      {hz?<g className="viz-axis viz-grid" aria-hidden="true">{y.ticks(tickCount(w,80)).map(n=><g key={n} transform={`translate(${Math.round(y(n))+.5},0)`}><line y1={0} y2={h}/><text y={h+16} textAnchor="middle">{tickFmt(n)}</text></g>)}</g>
        :<YAxis scale={y} width={w} ticks={tickCount(h,48)} fmt={tickFmt}/>}
      <g>{t.marks.map(mk=>{const a=mk.attrs,r=Math.min(4,hz?a.h!/2:a.w!/2,hz?a.w!:a.h!),pos=mk.datum.value>=0;return <path key={mk.key} className="viz-mark-shape" data-mark="bar" d={hz?roundedEnd(a.y!,a.x!,a.h!,a.w!,pos?r:0,1):roundedEnd(a.x!,a.y!,a.w!,a.h!,pos?r:0)} fill={colorOf.get(mk.datum.series)} opacity={mk.opacity*(dimmed(selected,mk.datum.category)?0.28:1)} pointerEvents="none"/>;})}</g>
      <line className="viz-baseline" {...hz?{x1:line,x2:line,y1:0,y2:h}:{x1:0,x2:w,y1:line,y2:line}} stroke={v('axis')}/>
      <g>{categories.map(c=><rect key={c.key} className="viz-mark" data-key={c.key} role="button" tabIndex={0} aria-pressed={!!selected?.has(c.key)} aria-label={c.label+': '+fmt(series.reduce((s,se)=>s+value(c.key,se.key),0))} {...hz?{x:0,width:w,y:hit(c),height:x.step()}:{x:hit(c),width:x.step(),y:0,height:h}} fill="transparent" onMouseMove={e=>showTip(e,c.key)} onMouseLeave={()=>tooltip.hide()} onBlur={()=>tooltip.hide()} {...activate(onSelect,c.key)}/>)}</g>
      <g className="viz-axis" aria-hidden="true" transform={hz?undefined:`translate(0,${h})`}>{categories.map((c,i)=>{if(i%step)return null;const mid=(x(c.key)??0)+x.bandwidth()/2;return <text key={c.key} data-mark="label" {...hz?{x:-10,y:mid,dy:'0.32em',textAnchor:'end'}:{x:mid,y:14,textAnchor:many?'end':'middle',transform:many?`rotate(-40 ${mid} 14)`:undefined}} fontWeight={selected?.has(c.key)?600:undefined}>{c.label}</text>;})}</g>
      {overlay&&<g pointerEvents="none">{overlay({band:k=>x(k)??0,bandwidth:x.bandwidth(),at:y,w,h,m})}</g>}
    </g>
  </svg>;
}
/** Bar path with its value end rounded: the top (vertical) or, with `flip`, the right end
 * (horizontal: b/l are the band start/size, v/len the value start/length). */
function roundedEnd(b:number,v:number,l:number,len:number,r:number,flip?:1){
  if(len<=0||l<=0)return '';
  r=Math.max(0,Math.min(r,l/2,len));
  return flip
    ?`M${v},${b}H${v+len-r}Q${v+len},${b} ${v+len},${b+r}V${b+l-r}Q${v+len},${b+l} ${v+len-r},${b+l}H${v}Z`
    :`M${b},${v+len}V${v+r}Q${b},${v} ${b+r},${v}H${b+l-r}Q${b+l},${v} ${b+l},${v+r}V${v+len}Z`;
}
/* ---------- Line / area, multi-series, hover crosshair ---------- */
/** `axis: 'y2'` draws the series against a second, right-hand axis (dual axis; not stacked). */
export type LineSeries={key:string;label:string;color?:string;axis?:'y'|'y2';points:readonly {x:number;y:number}[]};
export type LineProps={series:readonly LineSeries[];area?:boolean|'stacked';xFormat?:(x:number)=>string;format?:NumberFormat;y2Format?:NumberFormat;label?:string;testId?:string;margin?:Partial<Margin>;highlight?:ReadonlySet<string>|null;onSelect?:(key:string,additive:boolean)=>void;zero?:boolean;
  /** Fixed domains (e.g. from planChart); otherwise derived from the points. */
  xDomain?:readonly [number,number];domain?:readonly [number,number];y2Domain?:readonly [number,number];
  /** Extra non-interactive marks in plot coordinates (end labels, focus point); `y` follows the series axis. */
  overlay?:(g:{x:(n:number)=>number;y:(s:LineSeries,n:number)=>number;w:number;h:number})=>ReactNode};
export function LineChart(props:LineProps){
  const {ref,width,height,ready}=useSize();
  return <div ref={ref} className="viz-chart">{ready&&<LineSvg {...props} width={width} height={height}/>}</div>;
}
function LineSvg({series,area,xFormat=String,format,y2Format,label,testId,margin,highlight,width,height,zero,xDomain,domain,y2Domain,overlay}:LineProps&{width:number;height:number}){
  const tooltip=useTooltip(),[hover,setHover]=useState<number|null>(null);
  const dual=series.some(s=>s.axis==='y2');
  const m:Margin={top:10,right:dual?52:12,bottom:24,left:48,...margin},{w,h}=inner(width,height,m);
  const fmtOf=(s:LineSeries)=>(n:number)=>formatNumber(n,s.axis==='y2'?y2Format:format);
  const xs=useMemo(()=>[...new Set(series.flatMap(s=>s.points.map(p=>p.x)))].sort((a,b)=>a-b),[series]);
  const stacked=area==='stacked'&&!dual;
  const {x,y,y2,marks,stacks}=useMemo(()=>{
    const x=scaleLinear().domain(xDomain?[xDomain[0],xDomain[1]]:[xs[0]??0,xs[xs.length-1]??1]).range([0,w]);
    const stacks=new Map<string,{x:number;y0:number;y1:number}[]>();
    if(stacked){const acc=new Map<number,number>();for(const s of series){stacks.set(s.key,s.points.map(p=>{const y0=acc.get(p.x)||0,y1=y0+p.y;acc.set(p.x,y1);return {x:p.x,y0,y1};}));}}
    const on=(axis:'y'|'y2')=>series.filter(s=>(s.axis||'y')===axis).flatMap(s=>s.points.map(p=>p.y));
    const all=stacked?[...stacks.values()].flatMap(a=>a.map(p=>p.y1)):on('y');
    const fit=(fixed:readonly [number,number]|undefined,values:number[])=>fixed?scaleLinear().domain([fixed[0],fixed[1]]).range([h,0]):stacked||area||zero?zeroLinear(values,[h,0]):fittedLinear(values,[h,0]);
    const y=fit(domain,all),y2=dual?fit(y2Domain,on('y2')):null;
    const marks:Mark<LineSeries>[]=series.map(s=>{const sy=s.axis==='y2'&&y2?y2:y,attrs:Record<string,number>={};(stacked?stacks.get(s.key)!:s.points.map(p=>({x:p.x,y0:0,y1:p.y}))).forEach((p,i)=>{attrs['x'+i]=x(p.x);attrs['a'+i]=sy(p.y1);attrs['b'+i]=sy(p.y0);});return {key:s.key,datum:s,attrs};});
    return {x,y,y2,marks,stacks};
  },[series,xs,w,h,stacked,area,zero,xDomain,domain,y2Domain,dual]);
  const scaleOf=(s:LineSeries)=>s.axis==='y2'&&y2?y2:y;
  const base=y(0);
  const t=useMarkTransition(marks,{enter:mk=>{const a:Record<string,number>={};for(const k in mk.attrs)a[k]=k[0]==='x'?mk.attrs[k]!:base;return a;}});
  const colorOf=(s:LineSeries,i:number)=>s.color||cat(i);
  const onMove=(e:MouseEvent<SVGRectElement>)=>{
    const r=(e.currentTarget as SVGRectElement).getBoundingClientRect(),xv=x.invert(e.clientX-r.left);
    const i=Math.min(xs.length-1,Math.max(0,bisector((d:number)=>d).center(xs,xv)));setHover(i);
    const at=xs[i]!;
    tooltip.show({x:e.clientX,y:e.clientY,title:xFormat(at),rows:series.map((s,si)=>({label:s.label,value:fmtOf(s)(s.points.find(p=>p.x===at)?.y??NaN),color:colorOf(s,si)}))});
  };
  return <svg width={width} height={height} role="img" aria-label={label||'Line chart'} data-testid={testId} data-viz-settled={settledAttr(t.settled)} data-viz-renderer="svg" data-marks={series.reduce((n,s)=>n+s.points.length,0)} data-series={series.length} data-domain-x={x.domain().join(':')} data-domain-y={y.domain().join(':')} data-domain-y2={y2?y2.domain().join(':'):undefined}>
    <defs>{series.map((s,i)=><linearGradient key={s.key} id={`g-${testId||'line'}-${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={colorOf(s,i)} stopOpacity={stacked?0.85:0.32}/><stop offset="1" stopColor={colorOf(s,i)} stopOpacity={stacked?0.55:0.02}/></linearGradient>)}</defs>
    <g transform={`translate(${m.left},${m.top})`}>
      <YAxis scale={y} width={w} ticks={tickCount(h,44)} fmt={n=>formatNumber(n,{...format,digits:undefined,unit:undefined})}/>
      {y2&&<g className="viz-axis viz-axis-y2" aria-hidden="true" transform={`translate(${w},0)`}>{y2.ticks(tickCount(h,44)).map(t=><text key={t} x={8} y={Math.round(y2(t))} dy="0.32em" textAnchor="start">{formatNumber(t,{...y2Format,digits:undefined,unit:undefined})}</text>)}</g>}
      <g className="viz-axis" aria-hidden="true" transform={`translate(0,${h})`}>{xs.filter((_,i)=>i%Math.max(1,Math.ceil(xs.length/Math.max(2,Math.floor(w/64))))===0).map(xv=><text key={xv} x={x(xv)} y={16} textAnchor="middle">{xFormat(xv)}</text>)}</g>
      {t.marks.map(mk=>{
        const s=mk.datum,i=series.findIndex(q=>q.key===s.key),n=s.points.length,pts=Array.from({length:n},(_,k)=>({x:mk.attrs['x'+k]!,a:mk.attrs['a'+k]!,b:mk.attrs['b'+k]!}));
        const lineD=d3line<{x:number;a:number}>().x(p=>p.x).y(p=>p.a).curve(curveMonotoneX)(pts)||'';
        const areaD=area?d3area<{x:number;a:number;b:number}>().x(p=>p.x).y0(p=>p.b).y1(p=>p.a).curve(curveMonotoneX)(pts)||'':'';
        const faded=highlight&&highlight.size>0&&!highlight.has(s.key);
        return <g key={mk.key} opacity={mk.opacity*(faded?0.25:1)} data-series={s.key}>{area&&<path d={areaD} fill={`url(#g-${testId||'line'}-${s.key})`} stroke={stacked?v('surface'):'none'} strokeWidth={stacked?1:0}/>}<path data-mark="line" d={lineD} fill="none" stroke={i>=0?colorOf(s,i):undefined} strokeWidth={2} strokeDasharray={s.axis==='y2'?'6 4':undefined} strokeLinejoin="round" strokeLinecap="round"/></g>;
      })}
      {hover!==null&&xs[hover]!==undefined&&<g pointerEvents="none"><line className="viz-crosshair" x1={x(xs[hover]!)} x2={x(xs[hover]!)} y1={0} y2={h}/>{series.map((s,si)=>{const p=stacked?stacks.get(s.key)?.find(q=>q.x===xs[hover]):s.points.find(q=>q.x===xs[hover]);if(!p)return null;const yy='y1' in p?p.y1:p.y;return <circle key={s.key} cx={x(xs[hover]!)} cy={scaleOf(s)(yy)} r={4} fill={colorOf(s,si)} stroke={v('surface')} strokeWidth={2}/>;})}</g>}
      {overlay&&<g pointerEvents="none">{overlay({x,y:(s,n)=>scaleOf(s)(n),w,h})}</g>}
      <rect x={0} y={0} width={w} height={h} fill="transparent" onMouseMove={onMove} onMouseLeave={()=>{setHover(null);tooltip.hide();}}/>
    </g>
  </svg>;
}

/* ---------- Donut ---------- */
export type DonutProps=Selectable&{slices:readonly {key:string;label:string;value:number;color?:string}[];format?:NumberFormat;center?:ReactNode;label?:string;testId?:string};
export function Donut(props:DonutProps){
  const {ref,width,height,ready}=useSize();
  return <div ref={ref} className="viz-chart">{ready&&<DonutSvg {...props} width={width} height={height}/>}</div>;
}
function DonutSvg({slices,format,center,selected,onSelect,label,testId,width,height}:DonutProps&{width:number;height:number}){
  const tooltip=useTooltip(),r=Math.max(10,Math.min(width,height)/2-6),ri=r*0.66;
  const total=slices.reduce((s,x)=>s+Math.max(0,x.value),0);
  const marks=useMemo(()=>{
    const arcs=d3pie<{key:string;value:number}>().sort(null).value(d=>Math.max(0,d.value)).padAngle(0.012)([...slices]);
    return arcs.map((a,i)=>({key:a.data.key,datum:{...slices[i]!,index:i},attrs:{a0:a.startAngle,a1:a.endAngle}}));
  },[slices]);
  const t=useMarkTransition(marks,{enter:mk=>({a0:mk.attrs.a0!,a1:mk.attrs.a0!}),exit:mk=>({a0:mk.attrs.a1!,a1:mk.attrs.a1!})});
  const path=d3arc<{a0:number;a1:number;o:number}>().innerRadius(ri).outerRadius(d=>d.o).startAngle(d=>d.a0).endAngle(d=>d.a1).cornerRadius(3);
  return <svg width={width} height={height} role="img" aria-label={label||'Donut chart'} data-testid={testId} data-viz-settled={settledAttr(t.settled)} data-viz-renderer="svg">
    <g transform={`translate(${width/2},${height/2})`}>
      {t.marks.map(mk=>{const s=mk.datum,sel=selected?.has(s.key);return <path key={mk.key} className="viz-mark" data-key={s.key} role="button" tabIndex={0} aria-pressed={!!sel} aria-label={`${s.label}: ${formatNumber(s.value,format)} (${total?Math.round(s.value/total*100):0}%)`}
        d={path({a0:mk.attrs.a0!,a1:mk.attrs.a1!,o:sel?r+4:r})||''} fill={s.color||cat(s.index)} opacity={mk.opacity*(dimmed(selected,s.key)?0.28:1)}
        onMouseMove={e=>tooltip.show({x:e.clientX,y:e.clientY,title:s.label,rows:[{label:'Value',value:formatNumber(s.value,format)},{label:'Share',value:(total?s.value/total*100:0).toFixed(1)+'%'}]})} onMouseLeave={()=>tooltip.hide()} {...activate(onSelect,s.key)}/>;})}
    </g>
    {center&&<foreignObject x={width/2-ri} y={height/2-ri} width={ri*2} height={ri*2} pointerEvents="none"><div style={{display:'grid',placeItems:'center',height:'100%',textAlign:'center'}}>{center}</div></foreignObject>}
  </svg>;
}

/* ---------- Heatmap (quantized sequential ramp, colour via CSS variables) ---------- */
export type HeatProps={rows:readonly {key:string;label:string}[];cols:readonly {key:string;label:string}[];value:(row:string,col:string)=>number;format?:NumberFormat;label?:string;testId?:string;selectedRows?:ReadonlySet<string>|null;onSelectRow?:(key:string,additive:boolean)=>void;steps?:number};
export function Heatmap(props:HeatProps){
  const {ref,width,height,ready}=useSize();
  return <div ref={ref} className="viz-chart">{ready&&<HeatSvg {...props} width={width} height={height}/>}</div>;
}
function HeatSvg({rows,cols,value,format,label,testId,selectedRows,onSelectRow,width,height,steps=13}:HeatProps&{width:number;height:number}){
  const tooltip=useTooltip(),m={top:4,right:4,bottom:22,left:64},{w,h}=inner(width,height,m);
  const x=scaleBand<string>().domain(cols.map(c=>c.key)).range([0,w]).padding(0.06),y=scaleBand<string>().domain(rows.map(r=>r.key)).range([0,h]).padding(0.08);
  const marks=useMemo(()=>{
    const vals=rows.flatMap(r=>cols.map(c=>value(r.key,c.key))).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals);
    return rows.flatMap(r=>cols.map(c=>{const val=value(r.key,c.key),q=hi>lo?Math.round((val-lo)/(hi-lo)*(steps-2))+1:Math.ceil(steps/2);return {key:r.key+'\u0000'+c.key,datum:{row:r,col:c,val,q:Math.min(steps,Math.max(1,q))},attrs:{o:1}};}));
  },[rows,cols,value,steps]);
  const t=useMarkTransition(marks,{enter:()=>({o:0}),duration:'normal'});
  return <svg width={width} height={height} role="img" aria-label={label||'Heatmap'} data-testid={testId} data-viz-settled={settledAttr(t.settled)} data-viz-renderer="svg">
    <g transform={`translate(${m.left},${m.top})`}>
      {t.marks.map(mk=>{const d=mk.datum;return <rect key={mk.key} x={x(d.col.key)} y={y(d.row.key)} width={x.bandwidth()} height={y.bandwidth()} rx={3} fill={`var(--dp-viz-sequential-${d.q})`} opacity={mk.attrs.o!*(selectedRows&&selectedRows.size&&!selectedRows.has(d.row.key)?0.28:1)}
        onMouseMove={e=>tooltip.show({x:e.clientX,y:e.clientY,title:`${d.row.label} · ${d.col.label}`,rows:[{label:'Value',value:formatNumber(d.val,format)}]})} onMouseLeave={()=>tooltip.hide()}/>;})}
      <g className="viz-axis" aria-hidden="true">{rows.map(r=><text key={r.key} x={-8} y={(y(r.key)??0)+y.bandwidth()/2} dy="0.32em" textAnchor="end" fontWeight={selectedRows?.has(r.key)?600:undefined}>{r.label}</text>)}</g>
      <g className="viz-axis" aria-hidden="true" transform={`translate(0,${h})`}>{cols.map((c,i)=>i%Math.max(1,Math.ceil(cols.length*30/Math.max(1,w)))?null:<text key={c.key} x={(x(c.key)??0)+x.bandwidth()/2} y={15} textAnchor="middle">{c.label}</text>)}</g>
      {onSelectRow&&rows.map(r=><rect key={r.key} className="viz-mark" role="button" tabIndex={0} aria-label={'Select '+r.label} aria-pressed={!!selectedRows?.has(r.key)} x={-m.left} y={y(r.key)} width={m.left-4} height={y.bandwidth()} fill="transparent" {...activate(onSelectRow,r.key)}/>)}
    </g>
  </svg>;
}

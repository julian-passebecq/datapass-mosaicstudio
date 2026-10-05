/** 3D marks for the viz kit: React wrappers around the lazy three.js engine.
 * - The engine chunk (`./engine.ts`, three.js) loads on first use only; this file stays small.
 * - Same tokens: colours are read from the live --dp-viz-* variables of the host.
 * - Same motion: value changes and camera tours are Motion tweens, so capture mode and reduced
 *   motion settle at once and a VirtualClock drives them frame by frame for recordings.
 * - Same selection: clicks and lassos call back with keys / point ids; the caller writes view fields.
 * - No WebGL (or `?webgl=0`): the caller's 2D equivalent renders with a short note.
 */
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {useMotion,settledAttr} from '../react.tsx';
import {useSize,type NumberFormat} from '../svg.tsx';
import {useTooltip,type TooltipRow} from '../Tooltip.tsx';
import {formatNumber} from '../scales.ts';
import {lerp} from '../motion.ts';
import {lassoSelect,niceMax,ramp,rgb} from './geometry.ts';
export {insidePolygon,lassoSelect,ramp} from './geometry.ts';
import {webglAvailable} from './detect.ts';
import {DEFAULT_POSE,TOUR,poseAt,type Pose} from './pose.ts';
import type {Engine,Kind,Label,Theme3D} from './engine.ts';
import './viz3d.css';

let enginePromise:Promise<typeof import('./engine.ts')>|null=null;
/** Load the three.js chunk once. */
export const loadEngine=()=>enginePromise||=import('./engine.ts');
const PALETTE=(name:string,n:number)=>Array.from({length:n},(_,i)=>`--dp-viz-${name}-${i+1}`);
function readTheme(el:Element):Theme3D{
  const s=getComputedStyle(el),g=(n:string,f:string)=>s.getPropertyValue(n).trim()||f;
  const list=(names:string[])=>names.map(n=>s.getPropertyValue(n).trim()).filter(Boolean);
  return {background:g('--dp-viz-surface','#ffffff'),floor:g('--dp-viz-surface-raised','#f5f5f5'),grid:g('--dp-viz-grid','#e0e0e0'),axis:g('--dp-viz-axis','#c7c7c7'),
    ink:g('--dp-viz-ink','#242424'),muted:g('--dp-viz-ink-muted','#616161'),accent:g('--dp-viz-accent','#0f6cbd'),categorical:list(PALETTE('categorical',8)),sequential:list(PALETTE('sequential',13))};
}
/** Resolve `var(--x)` against an element (WebGL cannot read CSS variables). */
function resolveColor(el:Element|null,color:string){const m=/^var\((--[^),]+)\)$/.exec(color.trim());return m&&el?getComputedStyle(el).getPropertyValue(m[1]!).trim()||color:color;}

type Shared={testId?:string;label:string;themeKey?:string;fallback:ReactNode;
  /** Increment to play the camera tour (keyframes on the motion clock). */
  tourKey?:number;onTourDone?:()=>void;
  /** Increment to tween back to the default view. */
  resetKey?:number;};

/** Engine lifecycle: lazy load, size, theme. `error` is set when WebGL is unavailable. */
function useEngine(kind:Kind,themeKey?:string){
  const {ref,width,height,ready}=useSize(),host=useRef<HTMLDivElement>(null);
  const [engine,setEngine]=useState<Engine|null>(null),[error,setError]=useState<string|null>(()=>webglAvailable()?null:'WebGL is unavailable');
  const [themed,setThemed]=useState(0);
  useEffect(()=>{
    if(error)return;let alive=true,made:Engine|null=null;
    loadEngine().then(m=>{if(!alive||!host.current)return;try{made=m.createEngine(host.current,kind);setEngine(made);}catch(e){setError(e instanceof Error?e.message:String(e));}},e=>{if(alive)setError(String(e));});
    return()=>{alive=false;made?.dispose();setEngine(null);};
  },[kind,error]);
  useLayoutEffect(()=>{if(engine&&ready)engine.resize(width,height,globalThis.devicePixelRatio||1);},[engine,width,height,ready]);
  useLayoutEffect(()=>{if(engine&&host.current){engine.setTheme(readTheme(host.current));setThemed(n=>n+1);}},[engine,themeKey]);
  return {ref,host,engine,error,ready,width,height,themed};
}
/** Camera: tour / reset tweens on the shared motion clock. Returns whether the camera is moving. */
function useCamera(engine:Engine|null,tourKey=0,resetKey=0,onTourDone?:()=>void){
  const motion=useMotion(),[moving,setMoving]=useState(false),done=useRef(onTourDone);done.current=onTourDone;
  useEffect(()=>{
    if(!engine||!tourKey)return;setMoving(true);
    const legs=TOUR.length-1,ms=motion.duration(1600);let leg=0,tween:{cancel():void}|null=null,alive=true;
    const next=()=>{
      if(!alive)return;if(leg>=legs){setMoving(false);done.current?.();return;}
      const from=leg;leg++;
      tween=motion.tween({duration:ms,curve:'standard',onFrame:t=>engine.setPose(poseAt(TOUR,(from+t)/legs)),onDone:()=>queueMicrotask(next)});
    };
    next();
    return()=>{alive=false;tween?.cancel();setMoving(false);};
  },[engine,tourKey,motion]);
  useEffect(()=>{
    if(!engine||!resetKey)return;const from=engine.getPose();setMoving(true);
    const tween=motion.tween({duration:'slow',curve:'decelerate',onFrame:t=>engine.setPose(poseAt([from,DEFAULT_POSE],t)),onDone:()=>setMoving(false)});
    return()=>{tween.cancel();setMoving(false);};
  },[engine,resetKey,motion]);
  return moving;
}
/** Tween a numeric array (values + scale) whenever the target changes. */
function useTweenedArray(target:Float64Array,max:number){
  const motion=useMotion(),shown=useRef<{values:Float64Array;max:number}|null>(null),[frame,setFrame]=useState<{values:Float64Array;max:number}>({values:target,max});
  const [animating,setAnimating]=useState(false);
  useLayoutEffect(()=>{
    const prev=shown.current,from=prev&&prev.values.length===target.length?prev:{values:new Float64Array(target.length),max};
    const ms=motion.duration('slow');
    if(ms===0){shown.current={values:target,max};setFrame(shown.current);setAnimating(false);return;}
    setAnimating(true);
    const tween=motion.tween({duration:ms,curve:'decelerate',onFrame:t=>{
      const values=new Float64Array(target.length);for(let i=0;i<target.length;i++)values[i]=lerp(from.values[i]!,target[i]!,t);
      shown.current={values,max:lerp(from.max,max,t)};setFrame(shown.current);
    },onDone:()=>{shown.current={values:target,max};setFrame(shown.current);setAnimating(false);}});
    return()=>{tween.cancel();};
  },[target,max,motion]);
  return {...frame,animating};
}
type HostProps=Record<`data-${string}`,string|number|undefined>&Partial<Record<'onPointerDown'|'onPointerMove'|'onPointerUp'|'onPointerLeave',(e:ReactPointerEvent<HTMLDivElement>)=>void>>&{className?:string};
function Frame({engine,error,shared,host,sizeRef,settled,marks,renderer='webgl',children,overlay,summary,hostProps}:{engine:Engine|null;error:string|null;shared:Shared;host:React.RefObject<HTMLDivElement|null>;sizeRef:(n:HTMLDivElement|null)=>void;settled:boolean;marks:number;renderer?:string;children?:ReactNode;overlay?:ReactNode;summary:string;hostProps?:HostProps}){
  if(error)return <div className="viz3d-fallback" data-testid={shared.testId} data-viz-fallback="true" data-viz-3d-error={error}>
    <p className="viz3d-note" role="note">3D needs WebGL, which is unavailable here: showing the 2D equivalent.</p>
    <div className="viz3d-fallback-body">{shared.fallback}</div>
  </div>;
  return <div ref={sizeRef} className="viz-chart viz3d">
    <div {...hostProps} ref={host} className={'viz3d-host'+(hostProps?.className?' '+hostProps.className:'')} data-testid={shared.testId} data-viz-renderer={renderer} data-viz-settled={settledAttr(!!engine,settled)} data-marks={marks} role="img" aria-label={shared.label+': '+summary}>
      {!engine&&<div className="viz-skeleton viz3d-loading" aria-hidden="true"/>}
      {overlay}
    </div>
    {children}
  </div>;
}
/** Distinguish a click from an orbit drag. */
function useClick(onClick:(e:ReactPointerEvent<HTMLDivElement>)=>void){
  const down=useRef<{x:number;y:number}|null>(null);
  return {
    onPointerDown:(e:ReactPointerEvent<HTMLDivElement>)=>{down.current={x:e.clientX,y:e.clientY};},
    onPointerUp:(e:ReactPointerEvent<HTMLDivElement>)=>{const d=down.current;down.current=null;if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)onClick(e);},
  };
}
const additive=(e:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean})=>e.ctrlKey||e.metaKey||e.shiftKey;
function expose(host:HTMLDivElement|null,engine:Engine|null,extra:Record<string,unknown>={}){if(host)(host as unknown as {__viz3d?:unknown}).__viz3d=engine?{engine,...extra}:undefined;}

/* ---------------- Columns: rows × cols grid of bars ---------------- */
export type Columns3DProps=Shared&{
  rows:readonly {key:string;label:string;color:string}[];cols:readonly {key:string;label:string}[];
  value:(row:string,col:string)=>number;format?:NumberFormat;valueLabel?:string;
  selected?:ReadonlySet<string>|null;onSelect?:(row:string,additive:boolean)=>void;
};
export function Columns3D(props:Columns3DProps){
  const {rows,cols,value,format,valueLabel='Value',selected,onSelect,themeKey,tourKey,resetKey,onTourDone}=props;
  const {ref,host,engine,error,themed}=useEngine('columns',themeKey),tooltip=useTooltip(),hover=useRef(-1);
  const target=useMemo(()=>{const out=new Float64Array(rows.length*cols.length);rows.forEach((r,i)=>cols.forEach((c,j)=>{out[i*cols.length+j]=Math.max(0,value(r.key,c.key));}));return out;},[rows,cols,value]);
  const max=useMemo(()=>niceMax(target.reduce((m,v)=>Math.max(m,v),0)),[target]);
  const shown=useTweenedArray(target,max),moving=useCamera(engine,tourKey,resetKey,onTourDone);
  const rowColors=useMemo(()=>rows.map(r=>resolveColor(host.current,r.color)),[rows,host,themed,engine]);
  const draw=useCallback(()=>{
    if(!engine)return;
    const heights=new Float64Array(shown.values.length),emphasis=new Uint8Array(heights.length),colors:string[]=[];
    rows.forEach((r,i)=>cols.forEach((_,j)=>{const k=i*cols.length+j;heights[k]=shown.values[k]!/(shown.max||1);emphasis[k]=selected&&selected.size&&!selected.has(r.key)?0:1;colors[k]=rowColors[i]!;}));
    engine.setColumns({rows:rows.length,cols:cols.length,heights,colors,emphasis,hover:hover.current});
  },[engine,shown,rows,cols,selected,rowColors]);
  useLayoutEffect(()=>{draw();},[draw,themed]);
  useLayoutEffect(()=>{
    if(!engine)return;const labels:Label[]=[];
    cols.forEach((c,j)=>labels.push({id:'c'+c.key,text:c.label,at:[(j+0.5)/cols.length,0,1.09]}));
    rows.forEach((r,i)=>labels.push({id:'r'+r.key,text:r.label,at:[1.03,0,(i+0.5)/rows.length],anchor:'start',kind:'title'}));
    for(let k=1;k<=4;k++)labels.push({id:'v'+k,text:formatNumber(shown.max*k/4,format),at:[-0.015,k/4,0],anchor:'end',kind:'value'});
    labels.push({id:'axis',text:valueLabel,at:[0,1.12,0],kind:'title'});
    engine.setLabels(labels);
  },[engine,cols,rows,shown.max,format,valueLabel]);
  useEffect(()=>expose(host.current,engine,{cell:(row:string,col:string)=>{const i=rows.findIndex(r=>r.key===row),j=cols.findIndex(c=>c.key===col),k=i*cols.length+j;return engine!.toClient([(j+0.5)/cols.length,Math.max(0.01,shown.values[k]!/(shown.max||1)-0.02),(i+0.5)/rows.length]);}}),[engine,host,rows,cols,shown]);
  const describe=(k:number)=>{const r=rows[Math.floor(k/cols.length)]!,c=cols[k%cols.length]!;return {r,c,v:target[k]!};};
  const onMove=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(!engine||e.buttons)return;const k=engine.pick(e.clientX,e.clientY);
    if(k!==hover.current){hover.current=k;draw();}
    if(k>=0){const {r,c,v}=describe(k);tooltip.show({x:e.clientX,y:e.clientY,title:`${r.label} · ${c.label}`,rows:[{label:valueLabel,value:formatNumber(v,format),color:r.color}]});}else tooltip.hide();
  };
  const click=useClick(e=>{if(!engine||!onSelect)return;const k=engine.pick(e.clientX,e.clientY);if(k>=0)onSelect(rows[Math.floor(k/cols.length)]!.key,additive(e));});
  const total=target.reduce((s,v)=>s+v,0);
  return <Frame engine={engine} error={error} shared={props} host={host} sizeRef={ref} settled={!shown.animating&&!moving} marks={target.length}
    summary={`${rows.length} × ${cols.length} columns, total ${formatNumber(total,format)}`}
    hostProps={{'data-total':Math.round(total),onPointerMove:onMove,onPointerLeave:()=>{tooltip.hide();if(hover.current>=0){hover.current=-1;draw();}},...click}}>
    {onSelect&&<ul className="viz3d-sr" aria-label={props.label+' selection'}>{rows.map(r=><li key={r.key}><button type="button" aria-pressed={!!selected?.has(r.key)} onClick={e=>onSelect(r.key,additive(e))}>{r.label}</button></li>)}</ul>}
  </Frame>;
}

/* ---------------- Surface: z = f(x, y) over a grid ---------------- */
export type Surface3DProps=Shared&{
  nx:number;ny:number;values:Float64Array;xDomain:readonly [number,number];yDomain:readonly [number,number];
  xLabel:string;yLabel:string;zLabel:string;format?:NumberFormat;xFormat?:(v:number)=>string;yFormat?:(v:number)=>string;
  /** Data-space region to keep bright (e.g. the 2D brush); the rest is dimmed. */
  highlight?:{x:readonly [number,number];y:readonly [number,number]}|null;
  wireframe?:boolean;
};
export function Surface3D(props:Surface3DProps){
  const {nx,ny,values,xDomain,yDomain,xLabel,yLabel,zLabel,format,xFormat=v=>v.toFixed(0),yFormat=v=>v.toFixed(0),highlight,wireframe=false,themeKey,tourKey,resetKey,onTourDone}=props;
  const {ref,host,engine,error,themed}=useEngine('surface',themeKey),tooltip=useTooltip();
  const max=useMemo(()=>niceMax(values.reduce((m,v)=>Math.max(m,v),0)),[values]);
  const shown=useTweenedArray(values,max),moving=useCamera(engine,tourKey,resetKey,onTourDone);
  const xAt=(i:number)=>xDomain[0]+(xDomain[1]-xDomain[0])*i/(nx-1),yAt=(j:number)=>yDomain[0]+(yDomain[1]-yDomain[0])*j/(ny-1);
  useLayoutEffect(()=>{
    if(!engine||!host.current)return;
    const theme=readTheme(host.current),bg=rgb(theme.background),z=new Float64Array(nx*ny),colors=new Float32Array(nx*ny*3);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i,t=shown.values[k]!/(shown.max||1);z[k]=t;
      let c=ramp(theme.sequential,0.12+0.88*Math.sqrt(t));
      const inside=!highlight||(xAt(i)>=highlight.x[0]&&xAt(i)<=highlight.x[1]&&yAt(j)>=highlight.y[0]&&yAt(j)<=highlight.y[1]);
      if(!inside)c=[lerp(c[0],bg[0],0.62),lerp(c[1],bg[1],0.62),lerp(c[2],bg[2],0.62)];
      colors.set(c,k*3);
    }
    engine.setSurface({nx,ny,z,colors,wireframe});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[engine,shown,nx,ny,highlight,wireframe,themed]);
  useLayoutEffect(()=>{
    if(!engine)return;const labels:Label[]=[];
    for(let k=0;k<=4;k++){const t=k/4;labels.push({id:'x'+k,text:xFormat(xDomain[0]+(xDomain[1]-xDomain[0])*t),at:[t,0,1.07]});labels.push({id:'y'+k,text:yFormat(yDomain[0]+(yDomain[1]-yDomain[0])*t),at:[1.03,0,t],anchor:'start'});}
    for(let k=1;k<=4;k++)labels.push({id:'z'+k,text:formatNumber(shown.max*k/4,format),at:[-0.015,k/4,0],anchor:'end',kind:'value'});
    labels.push({id:'xt',text:xLabel,at:[0.5,0,1.2],kind:'title'},{id:'yt',text:yLabel,at:[1.1,0,0.5],kind:'title',anchor:'start'},{id:'zt',text:zLabel,at:[0,1.12,0],kind:'title'});
    engine.setLabels(labels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[engine,shown.max,xDomain,yDomain,xLabel,yLabel,zLabel]);
  useEffect(()=>expose(host.current,engine),[engine,host]);
  const onMove=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(!engine||e.buttons)return;const k=engine.pick(e.clientX,e.clientY);
    if(k<0){tooltip.hide();return;}
    const i=k%nx,j=Math.floor(k/nx),dx=(xDomain[1]-xDomain[0])/(nx-1)/2,dy=(yDomain[1]-yDomain[0])/(ny-1)/2;
    tooltip.show({x:e.clientX,y:e.clientY,title:`${xLabel} ${xFormat(xAt(i)-dx)}–${xFormat(xAt(i)+dx)}`,rows:[{label:yLabel,value:`${yFormat(yAt(j)-dy)}–${yFormat(yAt(j)+dy)}`},{label:zLabel,value:formatNumber(values[k]!,format)}]});
  };
  return <Frame engine={engine} error={error} shared={props} host={host} sizeRef={ref} settled={!shown.animating&&!moving} marks={nx*ny}
    summary={`${nx} × ${ny} surface, peak ${formatNumber(values.reduce((m,v)=>Math.max(m,v),0),format)}`}
    hostProps={{'data-wireframe':wireframe?'true':'false','data-peak':Math.round(values.reduce((m,v)=>Math.max(m,v),0)),onPointerMove:onMove,onPointerLeave:()=>tooltip.hide()}}/>;
}

/* ---------------- Scatter: ≥100k points, orbit + screen-space lasso ---------------- */
export type Scatter3DProps=Shared&{
  x:ArrayLike<number>;y:ArrayLike<number>;z:ArrayLike<number>;
  xDomain:readonly [number,number];yDomain:readonly [number,number];zDomain:readonly [number,number];
  xLabel:string;yLabel:string;zLabel:string;xFormat?:(v:number)=>string;yFormat?:(v:number)=>string;zFormat?:(v:number)=>string;
  /** 0 = context (filtered out), 1 = active, 2 = selected. */
  state:(i:number)=>0|1|2;stateKey?:unknown;
  /** Categorical slot (0-based) for active points. */
  colorIndex:(i:number)=>number;
  mode?:'orbit'|'lasso';onLasso?:(ids:Uint32Array|null)=>void;
  describe?:(i:number)=>{title:string;rows:TooltipRow[]};
};
export function Scatter3D(props:Scatter3DProps){
  const {x,y,z,xDomain,yDomain,zDomain,xLabel,yLabel,zLabel,xFormat=v=>v.toFixed(0),yFormat=v=>v.toFixed(0),zFormat=v=>v.toFixed(0),state,stateKey,colorIndex,mode='orbit',onLasso,describe,themeKey,tourKey,resetKey,onTourDone}=props;
  const {ref,host,engine,error,themed}=useEngine('points',themeKey),tooltip=useTooltip(),moving=useCamera(engine,tourKey,resetKey,onTourDone);
  const n=x.length;
  const norm=useMemo(()=>{
    const nx=new Float32Array(n),ny=new Float32Array(n),nz=new Float32Array(n),f=(v:number,d:readonly [number,number])=>Math.max(0,Math.min(1,(v-d[0])/(d[1]-d[0]||1)));
    for(let i=0;i<n;i++){nx[i]=f(x[i]!,xDomain);ny[i]=f(y[i]!,yDomain);nz[i]=f(z[i]!,zDomain);}
    return {x:nx,y:ny,z:nz};
  },[x,y,z,n,xDomain,yDomain,zDomain]);
  const [counts,setCounts]=useState<[number,number,number]>([0,0,0]);
  useLayoutEffect(()=>{
    if(!engine||!host.current)return;
    const theme=readTheme(host.current),cats=theme.categorical.map(rgb),muted=rgb(theme.muted),accent=rgb(theme.accent),rgba=new Float32Array(n*4),bucket:[number[],number[],number[]]=[[],[],[]];
    const dense=n>20000;
    for(let i=0;i<n;i++){
      const s=state(i);bucket[s].push(i);
      const c=s===0?muted:s===2?accent:cats[colorIndex(i)%Math.max(1,cats.length)]||accent;
      rgba[i*4]=c[0];rgba[i*4+1]=c[1];rgba[i*4+2]=c[2];rgba[i*4+3]=s===0?(dense?0.05:0.15):s===2?0.9:(dense?0.42:0.7);
    }
    const order=new Uint32Array(n);let k=0;for(const b of bucket)for(const i of b)order[k++]=i;
    engine.setPoints({x:norm.x,y:norm.y,z:norm.z,rgba,order,size:dense?1.7:3});
    setCounts([bucket[0].length,bucket[1].length,bucket[2].length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[engine,norm,stateKey,themed]);
  useLayoutEffect(()=>{
    if(!engine)return;const labels:Label[]=[];
    for(let k=0;k<=4;k++){const t=k/4;labels.push({id:'x'+k,text:xFormat(xDomain[0]+(xDomain[1]-xDomain[0])*t),at:[t,0,1.07]});labels.push({id:'z'+k,text:zFormat(zDomain[0]+(zDomain[1]-zDomain[0])*t),at:[1.03,0,t],anchor:'start'});}
    // The value axis stands on the front-left edge: the cloud would hide a back edge.
    for(let k=0;k<=4;k++)labels.push({id:'y'+k,text:yFormat(yDomain[0]+(yDomain[1]-yDomain[0])*k/4),at:[-0.015,k/4,1],anchor:'end',kind:'value'});
    labels.push({id:'xt',text:xLabel,at:[0.5,0,1.2],kind:'title'},{id:'zt',text:zLabel,at:[1.1,0,0.5],kind:'title',anchor:'start'},{id:'yt',text:yLabel,at:[0,1.1,1],kind:'title'});
    engine.setLabels(labels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[engine,xDomain,yDomain,zDomain,xLabel,yLabel,zLabel]);
  useEffect(()=>{engine?.setOrbit(mode==='orbit');},[engine,mode]);
  useEffect(()=>expose(host.current,engine,{at:(i:number)=>engine!.toClient([norm.x[i]!,norm.y[i]!,norm.z[i]!])}),[engine,host,norm]);
  const [lasso,setLasso]=useState<[number,number][]|null>(null),raf=useRef(0);
  useEffect(()=>()=>cancelAnimationFrame(raf.current),[]);
  const local=(e:ReactPointerEvent<HTMLDivElement>):[number,number]=>{const r=host.current!.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  const onDown=(e:ReactPointerEvent<HTMLDivElement>)=>{if(mode!=='lasso')return;host.current?.setPointerCapture?.(e.pointerId);tooltip.hide();setLasso([local(e)]);};
  const onMove=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(lasso){const p=local(e),last=lasso[lasso.length-1]!;if(Math.hypot(p[0]-last[0],p[1]-last[1])>=3)setLasso([...lasso,p]);return;}
    if(!engine||e.buttons||!describe)return;
    const ex=e.clientX,ey=e.clientY;cancelAnimationFrame(raf.current);
    raf.current=requestAnimationFrame(()=>{const i=engine.pick(ex,ey);if(i>=0&&state(i)>0){const d=describe(i);tooltip.show({x:ex,y:ey,...d});}else tooltip.hide();});
  };
  const onUp=()=>{
    if(!lasso||!engine)return;const poly=lasso;setLasso(null);
    if(poly.length<3){onLasso?.(null);return;}
    onLasso?.(lassoSelect(engine.projectPoints(),poly,i=>state(i)>0));
  };
  return <Frame engine={engine} error={error} shared={props} host={host} sizeRef={ref} settled={!moving&&!lasso} marks={n}
    summary={`${n.toLocaleString('en-US')} points, ${counts[2].toLocaleString('en-US')} selected`}
    hostProps={{className:mode==='lasso'?'lasso':undefined,'data-mode':mode,'data-selected':counts[2],'data-active':counts[1]+counts[2],onPointerDown:onDown,onPointerMove:onMove,onPointerUp:onUp,onPointerLeave:()=>{if(!lasso)tooltip.hide();}}}
    overlay={lasso&&<svg className="viz3d-lasso" aria-hidden="true"><polygon points={lasso.map(p=>p.join(',')).join(' ')}/></svg>}/>;
}

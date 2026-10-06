/** React glue for the viz kit: one Motion per tree, theme tokens as CSS variables,
 * keyed enter/update/exit mark transitions, count-ups and the capture "settled" flag.
 */
import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {Motion,detectCapture,lerp,type Clock,type DurationName} from './motion.ts';
import {tokenVars,vizTokens,type TokenOverrides,type VizMode} from './tokens.ts';
import {TooltipProvider} from './Tooltip.tsx';
import './tokens.css';

const MotionContext=createContext<Motion|null>(null);
const useIso=typeof window==='undefined'?useEffect:useLayoutEffect;
function prefersReduced(){return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;}

/** Root of a viz tree: theme variables + motion controller. `capture` defaults to ?capture=1. */
export function VizRoot({mode,overrides,reducedMotion,capture,clock,className,style,children,...rest}:{mode:VizMode;overrides?:TokenOverrides;reducedMotion?:boolean;capture?:boolean;clock?:Clock;className?:string;style?:CSSProperties;children:ReactNode}&Record<`data-${string}`,string|undefined>){
  const reduced=reducedMotion??prefersReduced(),isCapture=capture??detectCapture();
  const motion=useMemo(()=>new Motion({reduced,capture:isCapture,clock}),[reduced,isCapture,clock]);
  const vars=useMemo(()=>tokenVars(vizTokens(mode,overrides)),[mode,overrides]);
  return <MotionContext.Provider value={motion}><div {...rest} className={'dp-viz'+(className?' '+className:'')} data-viz-theme={mode} data-viz-capture={isCapture?'true':undefined} data-viz-reduced={reduced?'true':undefined} style={{...vars,...style} as CSSProperties}><TooltipProvider>{children}</TooltipProvider></div></MotionContext.Provider>;
}
export function useMotion():Motion{
  const motion=useContext(MotionContext);
  const fallback=useMemo(()=>motion||new Motion({reduced:prefersReduced(),capture:detectCapture()}),[motion]);
  return fallback;
}

export type MarkAttrs=Record<string,number>;
export type Mark<D>={key:string;attrs:MarkAttrs;datum:D};
export type RenderedMark<D>=Mark<D>&{opacity:number;state:'enter'|'update'|'exit'};
type Frame<D>={from:Map<string,MarkAttrs>;to:Map<string,Mark<D>>;exit:Map<string,Mark<D>&{toAttrs:MarkAttrs}>;entering:Set<string>;t:number};
const mix=(a:MarkAttrs|undefined,b:MarkAttrs,t:number):MarkAttrs=>{if(!a||t>=1)return b;const out:MarkAttrs={};for(const k in b)out[k]=lerp(a[k]??b[k]!,b[k]!,t);return out;};

/** Keyed enter/update/exit interpolation. Enter grows from `enter(mark)` (e.g. the baseline),
 * update interpolates from what is currently drawn, exit collapses to `exit(mark)` and fades.
 * With a zero duration (reduced motion, capture) the target marks are returned directly.
 */
export function useMarkTransition<D>(marks:readonly Mark<D>[],options:{enter?:(m:Mark<D>)=>MarkAttrs;exit?:(m:Mark<D>)=>MarkAttrs;duration?:DurationName|number}={}):{marks:RenderedMark<D>[];settled:boolean}{
  const motion=useMotion(),ms=motion.duration(options.duration??'slow');
  const shown=useRef(new Map<string,MarkAttrs>()),optionsRef=useRef(options);optionsRef.current=options;
  const [frame,setFrame]=useState<Frame<D>|null>(null);
  useIso(()=>{
    const to=new Map(marks.map(m=>[m.key,m]));
    if(ms===0){shown.current=new Map(marks.map(m=>[m.key,m.attrs]));setFrame(null);return;}
    const from=new Map<string,MarkAttrs>(),exit=new Map<string,Mark<D>&{toAttrs:MarkAttrs}>(),enter=optionsRef.current.enter,exitFn=optionsRef.current.exit;
    const entering=new Set<string>();
    for(const m of marks){const prev=shown.current.get(m.key);if(!prev)entering.add(m.key);from.set(m.key,prev||(enter?enter(m):m.attrs));}
    if(frame)for(const[key,m]of frame.to)if(!to.has(key)){const attrs=shown.current.get(key)||m.attrs;exit.set(key,{...m,attrs,toAttrs:exitFn?exitFn({...m,attrs}):attrs});}
    const tween=motion.tween({duration:ms,onFrame:t=>{
      const next:Frame<D>={from,to,exit,entering,t};
      for(const m of marks)shown.current.set(m.key,mix(from.get(m.key),m.attrs,t));
      setFrame(next);
    },onDone:()=>{shown.current=new Map(marks.map(m=>[m.key,m.attrs]));setFrame({from,to,exit:new Map(),entering,t:1});}});
    return()=>tween.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[marks,ms,motion]);
  if(ms===0||!frame)return {marks:marks.map(m=>({...m,opacity:1,state:'update'})),settled:ms===0||!marks.length};
  const out:RenderedMark<D>[]=marks.map(m=>({...m,attrs:mix(frame.from.get(m.key),m.attrs,frame.t),opacity:frame.entering.has(m.key)?Math.min(1,frame.t*1.6):1,state:'update'}));
  for(const m of frame.exit.values())out.push({key:m.key,datum:m.datum,attrs:mix(m.attrs,m.toAttrs,frame.t),opacity:1-frame.t,state:'exit'});
  return {marks:out,settled:frame.t>=1&&frame.exit.size===0};
}

/** Count up from the previously shown value to `value` (first mount counts from 0). */
export function useCountUp(value:number,duration:DurationName|number='slow'):{value:number;settled:boolean}{
  const motion=useMotion(),ms=motion.duration(duration),shown=useRef(0),[current,setCurrent]=useState<number|null>(null);
  useIso(()=>{
    if(!Number.isFinite(value))return;
    if(ms===0){shown.current=value;setCurrent(null);return;}
    const from=shown.current;
    const tween=motion.tween({duration:ms,curve:'decelerate',onFrame:t=>{shown.current=lerp(from,value,t);setCurrent(t>=1?null:shown.current);}});
    return()=>tween.cancel();
  },[value,ms,motion]);
  return current===null?{value,settled:true}:{value:current,settled:false};
}
/** Mirror a chart's settled state into `data-viz-settled` (Playwright waits on it). */
export function settledAttr(...flags:boolean[]):'true'|'false'{return flags.every(Boolean)?'true':'false';}

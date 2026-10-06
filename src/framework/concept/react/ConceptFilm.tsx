import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pause,Play,X} from 'lucide-react';
import type {ConceptSpec} from '../schema.ts';
import {createStage,type Stage} from '../three/world.ts';
import {filmFrame,frameTime,defaultFocus,FILM_DURATION,FILM_FPS} from '../navigation.ts';
import {layerCakeSvg} from '../flat.ts';
import {NodeDetails} from './NodeDetails.tsx';

declare global{interface Window{__conceptFilm?:{duration:number;fps:number;seek(t:number):Promise<number>}}}
const clock=(t:number)=>t.toFixed(1).padStart(4,'0');

/**
 * Deterministic film on a virtual clock: every visible value is a pure function of t (navigation.ts filmFrame),
 * rendered on demand. Live playback only advances t; `window.__conceptFilm.seek(t)` renders an exact frame
 * (quantised to FILM_FPS) for recording. Ends on the flat layer cake of the same spec.
 */
export default function ConceptFilm({spec,start=0,autoplay=true,chrome=true,reduced,brand='CONCEPT SPEC',onClose}:{spec:ConceptSpec;start?:number;autoplay?:boolean;chrome?:boolean;reduced:boolean;brand?:string;onClose():void}){
  const host=useRef<HTMLDivElement>(null),overlay=useRef<HTMLDivElement>(null),stage=useRef<Stage|null>(null),waiters=useRef<{t:number;resolve(t:number):void}[]>([]);
  const [t,setT]=useState(()=>reduced?FILM_DURATION:frameTime(start)),[playing,setPlaying]=useState(autoplay&&!reduced),[nonce,setNonce]=useState(0),[error,setError]=useState('');
  const live=useRef(false);
  useEffect(()=>{
    try{stage.current=createStage(host.current!,overlay.current!,spec);setNonce(n=>n+1);}catch(e){setError(e instanceof Error?e.message:String(e));}
    const observer=new ResizeObserver(()=>{stage.current?.resize();setNonce(n=>n+1);});observer.observe(host.current!);
    return()=>{observer.disconnect();stage.current?.dispose();stage.current=null;};
  },[spec]);
  const frame=filmFrame(spec,t);
  useEffect(()=>{
    if(!stage.current)return;stage.current.render(t,frame.pose,{selection:frame.selection,layer:frame.layer});
    const ready=waiters.current.filter(w=>w.t===t);waiters.current=waiters.current.filter(w=>w.t!==t);ready.forEach(w=>w.resolve(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[t,nonce]);
  useEffect(()=>{
    if(!playing||reduced)return;let raf=0,previous=performance.now();live.current=true;
    const tick=(now:number)=>{if(!live.current)return;const dt=Math.min(.1,(now-previous)/1000);previous=now;setT(v=>{if(!live.current)return v;const n=v+dt;return n>FILM_DURATION+1.5?0:n;});raf=requestAnimationFrame(tick);};
    raf=requestAnimationFrame(tick);return()=>{live.current=false;cancelAnimationFrame(raf);};
  },[playing,reduced]);
  const seek=useCallback((value:number)=>{live.current=false;setPlaying(false);setT(frameTime(value));},[]);
  useEffect(()=>{
    window.__conceptFilm={duration:FILM_DURATION,fps:FILM_FPS,seek:(value:number)=>new Promise<number>(resolve=>{live.current=false;const target=frameTime(value);waiters.current.push({t:target,resolve});setPlaying(false);setT(target);setNonce(n=>n+1);})};
    return()=>{delete window.__conceptFilm;};
  },[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  const shown=Math.min(t,FILM_DURATION),focus=useMemo(()=>defaultFocus(spec),[spec]);
  const diagram=useMemo(()=>layerCakeSvg(spec,focus),[spec,focus]);
  const c=frame.caption;
  return <div className={'aa-film'+(chrome?'':' aa-film-clean')} role="region" aria-label="Concept film" data-testid="atlas-film" data-film-t={shown.toFixed(4)} data-playing={playing}>
    <div className="aa-film-canvas" ref={host}/>
    <div className="aa-overlay" ref={overlay} aria-hidden="true"/>
    {error&&<div className="aa-error" role="status">{error}</div>}
    <div className="aa-film-brand"><span className="aa-mark"><i/><i/><i/></span>{brand}<span className="aa-film-spec">{spec.title}</span></div>
    <div className="aa-film-caption" key={c.key} style={{opacity:c.opacity*(1-frame.diagram),transform:`translateY(${((1-c.opacity)*8).toFixed(2)}px)`}}>
      <span className="aa-eyebrow">{c.eyebrow}</span><h2>{c.title}</h2><p>{c.body}</p>
    </div>
    <div className="aa-film-panel" style={{opacity:frame.panel,transform:`translateX(${((1-frame.panel)*24).toFixed(1)}px)`}} aria-hidden={frame.panel<.5}>
      <NodeDetails spec={spec} id={focus}/>
    </div>
    <div className="aa-film-diagram" style={{opacity:frame.diagram,visibility:frame.diagram>.001?'visible':'hidden'}} aria-hidden={frame.diagram<.5} dangerouslySetInnerHTML={{__html:diagram}}/>
    <div className="aa-film-provenance">{spec.provenance.toUpperCase()} · SAME SPEC IN 3D AND 2D</div>
    {chrome&&<div className="aa-film-controls" role="group" aria-label="Film controls">
      <button onClick={()=>{if(t>=FILM_DURATION)setT(0);setPlaying(!playing);}} disabled={reduced} aria-label={playing?'Pause film':'Play film'}>{playing?<Pause size={14}/>:<Play size={14}/>}</button>
      <input type="range" aria-label="Film time" min={0} max={FILM_DURATION} step={1/FILM_FPS} value={shown} onChange={e=>seek(Number(e.target.value))}/>
      <span className="aa-film-time">{clock(shown)} / {clock(FILM_DURATION)}</span>
      <button onClick={onClose} aria-label="Close film"><X size={14}/></button>
    </div>}
  </div>;
}

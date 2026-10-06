import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pause,Play,X} from 'lucide-react';
import type {ArchSpec} from './spec';
import {createStage,type Stage} from './world';
import {filmFrame,frameTime,FILM_DURATION,FILM_FPS} from './navigation';
import {layeredSvg} from './svg';
import {NodeDetails} from './NodeDetails';

declare global{interface Window{__archFilm?:{duration:number;fps:number;seek(t:number):Promise<number>}}}
const clock=(t:number)=>t.toFixed(1).padStart(4,'0');

/** Autoplay film: every visible value is a pure function of t (navigation.ts filmFrame). Rendered on demand. */
export default function AtlasFilm({spec,start=0,autoplay=true,chrome=true,reduced,onClose}:{spec:ArchSpec;start?:number;autoplay?:boolean;chrome?:boolean;reduced:boolean;onClose():void}){
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
    window.__archFilm={duration:FILM_DURATION,fps:FILM_FPS,seek:(value:number)=>new Promise<number>(resolve=>{live.current=false;const target=frameTime(value);waiters.current.push({t:target,resolve});setPlaying(false);setT(target);setNonce(n=>n+1);})};
    return()=>{delete window.__archFilm;};
  },[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  const shown=Math.min(t,FILM_DURATION),focus=useMemo(()=>spec.nodes.find(n=>n.id===filmFrame(spec,21).selection)!,[spec]);
  const diagram=useMemo(()=>layeredSvg(spec,focus.id),[spec,focus]);
  const c=frame.caption;
  return <div className={'aa-film'+(chrome?'':' aa-film-clean')} role="region" aria-label="Architecture atlas film" data-testid="atlas-film" data-film-t={shown.toFixed(4)} data-playing={playing}>
    <div className="aa-film-canvas" ref={host}/>
    <div className="aa-overlay" ref={overlay} aria-hidden="true"/>
    {error&&<div className="aa-error" role="status">{error}</div>}
    <div className="aa-film-brand"><span className="aa-mark"><i/><i/><i/></span>ARCHITECTURE ATLAS<span className="aa-film-spec">{spec.title}</span></div>
    <div className="aa-film-caption" key={c.key} style={{opacity:c.opacity*(1-frame.diagram),transform:`translateY(${((1-c.opacity)*8).toFixed(2)}px)`}}>
      <span className="aa-eyebrow">{c.eyebrow}</span><h2>{c.title}</h2><p>{c.body}</p>
    </div>
    <div className="aa-film-panel" style={{opacity:frame.panel,transform:`translateX(${((1-frame.panel)*24).toFixed(1)}px)`}} aria-hidden={frame.panel<.5}>
      <NodeDetails spec={spec} id={focus.id}/>
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

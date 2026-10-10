import {useEffect,useRef,useState} from 'react';
import type {ConceptSpec} from '../schema.ts';
import {createStage,type Stage} from '../three/world.ts';
import {ambientInterval,navPose,transition,TRANSITION_MS,type Nav,type Pose} from '../navigation.ts';

declare global{interface Window{__conceptStage?:{settled():boolean;pose():Pose;pick(x:number,y:number):string|null}}}

/**
 * Live 3D concept scene (load it lazily: it pulls Three.js). Camera transitions are pure samples of
 * (from, to, elapsed); the rAF loop only supplies elapsed time and the icon clock. With reduced motion the
 * camera jumps and icons hold still.
 * Frames are drawn on demand: every frame during a camera transition, once after a resize or a selection/layer change,
 * and otherwise only for the ambient icon/bead motion at a budgeted rate (none with reduced motion). Rendering every
 * animation frame regardless of cost starved the page (and its host, when embedded) on software WebGL.
 */
export default function ConceptStage({spec,nav,reduced,onSelect,onStep,whole=false}:{spec:ConceptSpec;nav:Nav;reduced:boolean;onSelect(id:string):void;onStep(dir:'up'|'down'|'left'|'right'):void;whole?:boolean}){
  const host=useRef<HTMLDivElement>(null),overlay=useRef<HTMLDivElement>(null),stage=useRef<Stage|null>(null);
  const motion=useRef<{from:Pose;to:Pose;start:number}|null>(null),current=useRef<Pose|null>(null);
  const [error,setError]=useState('');
  const target=navPose(spec,nav);
  const targetKey=JSON.stringify(target);
  const viewRef=useRef({selection:nav.selection,layer:nav.layer});
  viewRef.current={selection:nav.selection,layer:nav.selection!=='none'?spec.layers.findIndex(l=>l.id===spec.nodes.find(n=>n.id===nav.selection)?.layer):nav.layer};
  /** Set when the next frame must be drawn even if nothing moves (new size, selection or layer). */
  const dirty=useRef(true);
  useEffect(()=>{dirty.current=true;},[viewRef.current.selection,viewRef.current.layer]);
  useEffect(()=>{
    // A new stage starts unsettled: the previous stage's flag must not describe labels that have not been placed yet.
    host.current!.dataset.settled='false';dirty.current=true;
    try{stage.current=createStage(host.current!,overlay.current!,spec,{fitAspect:whole?2:1.5});}catch(e){setError(e instanceof Error?e.message:String(e));return;}
    const pose=navPose(spec,nav);current.current=pose;motion.current={from:pose,to:pose,start:-1e9};
    const observer=new ResizeObserver(()=>{stage.current?.resize();dirty.current=true;});observer.observe(host.current!);
    let frame=0,last=-Infinity,interval=0,wasMoving=true;
    const tick=(now:number)=>{
      frame=requestAnimationFrame(tick);
      const m=motion.current!,moving=!reduced&&now-m.start<TRANSITION_MS;
      // The frame that ends a transition is drawn at the final pose before the stage reports itself settled.
      const due=moving||wasMoving||dirty.current||(!reduced&&now-last>=interval);
      if(!due)return;
      const started=performance.now(),pose=transition(m.from,m.to,now-m.start,reduced);current.current=pose;
      dirty.current=false;
      stage.current?.render(reduced?0:now/1000,pose,viewRef.current);
      last=now;interval=ambientInterval(performance.now()-started);wasMoving=moving;
      host.current!.dataset.settled=String(!moving);
    };
    frame=requestAnimationFrame(tick);
    window.__conceptStage={settled:()=>host.current?.dataset.settled==='true',pose:()=>current.current!,pick:(x,y)=>stage.current?.pick(x,y)??null};
    return()=>{cancelAnimationFrame(frame);observer.disconnect();stage.current?.dispose();stage.current=null;delete window.__conceptStage;};
    // The stage is rebuilt only for a new spec; navigation changes retarget the camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[spec,reduced,whole]);
  useEffect(()=>{
    if(!motion.current||!current.current)return;
    motion.current={from:current.current,to:target,start:performance.now()};dirty.current=true;
    if(host.current)host.current.dataset.settled='false';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[targetKey]);
  // Wheel: vertical = layers, horizontal or shift = domains. Accumulated and rate-limited so one notch = one step.
  useEffect(()=>{
    const el=host.current!.parentElement!;let acc=0,accX=0,last=0;
    const wheel=(e:WheelEvent)=>{
      e.preventDefault();const now=performance.now();
      const dx=e.shiftKey?e.deltaY:e.deltaX,dy=e.shiftKey?0:e.deltaY;acc+=dy;accX+=dx;
      if(now-last<380)return;
      if(Math.abs(acc)>=40){onStep(acc<0?'up':'down');last=now;acc=0;accX=0;}
      else if(Math.abs(accX)>=40){onStep(accX>0?'right':'left');last=now;acc=0;accX=0;}
    };
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[onStep]);
  const click=(e:React.MouseEvent)=>{const id=stage.current?.pick(e.clientX,e.clientY);if(id)onSelect(id);};
  return <div className="aa-3d" data-testid="atlas-3d">
    <div className="aa-canvas" ref={host} onClick={click} data-settled="false"/>
    <div className="aa-overlay" ref={overlay} aria-hidden="true" onClick={e=>{const id=(e.target as HTMLElement).closest<HTMLElement>('[data-node]')?.dataset.node;if(id)onSelect(id);}}/>
    {error&&<div className="aa-error" role="status">{error}</div>}
  </div>;
}

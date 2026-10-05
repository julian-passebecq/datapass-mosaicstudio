import {useEffect,useRef,useState} from 'react';
import type {ArchSpec} from './spec';
import {createStage,type Stage} from './world';
import {navPose,transition,TRANSITION_MS,type Nav,type Pose} from './navigation';

declare global{interface Window{__archAtlas?:{settled():boolean;pose():Pose;pick(x:number,y:number):string|null}}}

/**
 * Live 3D atlas. Camera transitions are pure samples of (from, to, elapsed); the rAF loop only supplies
 * elapsed time and the icon clock. With reduced motion the camera jumps and icons hold still.
 */
export default function AtlasStage({spec,nav,reduced,onSelect,onStep}:{spec:ArchSpec;nav:Nav;reduced:boolean;onSelect(id:string):void;onStep(dir:'up'|'down'|'left'|'right'):void}){
  const host=useRef<HTMLDivElement>(null),overlay=useRef<HTMLDivElement>(null),stage=useRef<Stage|null>(null);
  const motion=useRef<{from:Pose;to:Pose;start:number}|null>(null),current=useRef<Pose|null>(null);
  const [error,setError]=useState('');
  const target=navPose(spec,nav);
  const targetKey=JSON.stringify(target);
  useEffect(()=>{
    try{stage.current=createStage(host.current!,overlay.current!,spec);}catch(e){setError(e instanceof Error?e.message:String(e));return;}
    const pose=navPose(spec,nav);current.current=pose;motion.current={from:pose,to:pose,start:-1e9};
    const observer=new ResizeObserver(()=>{stage.current?.resize();});observer.observe(host.current!);
    let frame=0;
    const tick=(now:number)=>{
      const m=motion.current!,pose=transition(m.from,m.to,now-m.start,reduced);current.current=pose;
      stage.current?.render(reduced?0:now/1000,pose,viewRef.current);
      host.current!.dataset.settled=String(now-m.start>=TRANSITION_MS||reduced);
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    window.__archAtlas={settled:()=>host.current?.dataset.settled==='true',pose:()=>current.current!,pick:(x,y)=>stage.current?.pick(x,y)??null};
    return()=>{cancelAnimationFrame(frame);observer.disconnect();stage.current?.dispose();stage.current=null;delete window.__archAtlas;};
    // The stage is rebuilt only for a new spec; navigation changes retarget the camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[spec,reduced]);
  const viewRef=useRef({selection:nav.selection,layer:nav.layer});
  viewRef.current={selection:nav.selection,layer:nav.selection!=='none'?spec.layers.findIndex(l=>l.id===spec.nodes.find(n=>n.id===nav.selection)?.layer):nav.layer};
  useEffect(()=>{
    if(!motion.current||!current.current)return;
    motion.current={from:current.current,to:target,start:performance.now()};
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

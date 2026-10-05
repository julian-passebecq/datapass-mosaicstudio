import * as THREE from 'three';
import {useEffect,useRef,useState,useCallback,type CSSProperties} from 'react';
import {Pause,Play,RotateCcw,X} from 'lucide-react';
import {kits,getKit,getBOM,kitCost,type KitId} from './kits';
import {buildKitContent,studioEnvironment,fitShadow,type KitContent} from './brickContent';
import {filmFrame,FILM_DURATION,FILM_FPS,chapters,chapterAt,settledTime,frameTime} from './timeline';
import './film.css';

type Stage={render(t:number):void;resize():void;dispose():void};
declare global{interface Window{__fabricFilm?:{duration:number;fps:number;seek(t:number):Promise<number>}}}

/**
 * Autoplay product film. Its frame is a pure function of `t` (see timeline.ts) and is rendered on demand:
 * one WebGL render per `t` change, nothing in between. The shared SceneViewport tweens on wall-clock time and
 * cannot address an exact frame, so this lazily loaded, client-owned canvas exists only for the film and captures.
 */
function createStage(host:HTMLElement):Stage{
  const canvas=document.createElement('canvas');canvas.dataset.renderer='fabric-film-webgl2';canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
  if(!context)throw new Error('WebGL2 is unavailable. The kits remain available in the 2D gallery.');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');
  const environment=studioEnvironment(renderer);scene.environment=environment;scene.environmentIntensity=.62;
  scene.add(new THREE.HemisphereLight('#ffffff','#d6dbd3',.55));
  const key=new THREE.DirectionalLight('#fff6ec',2.7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0004;key.shadow.normalBias=.025;
  scene.add(key,key.target);
  const fill=new THREE.DirectionalLight('#e9f1ff',.55);fill.position.set(-14,9,-8);scene.add(fill);
  const camera=new THREE.PerspectiveCamera(30,1,.1,400);
  const contents=new Map<KitId,KitContent>(),stageBase=new Map<THREE.Material,number>();
  const ghostWhite=new THREE.Color('#f7f8f4'),ghostGlow=new THREE.Color('#f2f4ee'),scratch=new THREE.Color();
  for(const k of kits){const c=buildKitContent(k.id);scene.add(c.root);contents.set(k.id,c);c.stageMaterials.forEach(m=>stageBase.set(m,m.opacity));}
  host.appendChild(canvas);
  let size={width:1,height:1},last=0;
  function render(t:number){
    last=t;const frame=filmFrame(t);
    for(const [id,c] of contents){
      const kit=frame.kits[id];c.root.position.set(...kit.origin);
      c.stage.visible=kit.stage>.002;c.stageMaterials.forEach(m=>{m.opacity=stageBase.get(m)!*kit.stage;});
      let any=false;
      for(const [partId,h] of c.parts){
        const pose=kit.parts[partId];h.group.visible=pose.visible;if(!pose.visible)continue;any=true;
        h.group.position.set(h.part.position[0]+pose.offset[0],h.part.position[1]+pose.offset[1],h.part.position[2]+pose.offset[2]);
        const m=h.material,opacity=pose.opacity*(1-pose.ghost*.5);
        m.color.copy(scratch.copy(h.color).lerp(ghostWhite,pose.ghost));m.emissive.copy(ghostGlow);m.emissiveIntensity=pose.ghost*.45;
        m.opacity=opacity;const transparent=opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.depthWrite=opacity>.55;
        for(const child of h.group.children)child.castShadow=opacity>.5&&pose.ghost<.4;
      }
      c.root.visible=any||c.stage.visible;
    }
    const cam=frame.camera;
    camera.fov=cam.fov;camera.aspect=size.width/size.height;
    camera.setViewOffset(size.width,size.height,-cam.shift*size.width,0,size.width,size.height);
    camera.position.set(...cam.position);camera.lookAt(...cam.target);camera.updateProjectionMatrix();
    fitShadow(key,new THREE.Vector3(cam.target[0],0,cam.target[2]),Math.min(34,Math.max(8,cam.distance*.55)));
    renderer.render(scene,camera);
    canvas.dataset.filmT=frame.t.toFixed(4);canvas.dataset.chapter=frame.chapter;
  }
  function resize(){size={width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)};renderer.setSize(size.width,size.height,false);render(last);}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  return {render,resize,dispose(){observer.disconnect();contents.forEach(c=>c.dispose());environment.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();}};
}

const clock=(t:number)=>t.toFixed(1).padStart(4,'0');
export default function KitFilm({start=0,autoplay=true,chrome=true,reduced,onClose}:{start?:number;autoplay?:boolean;chrome?:boolean;reduced:boolean;onClose():void}){
  const host=useRef<HTMLDivElement>(null),stage=useRef<Stage|null>(null),waiters=useRef<{t:number;resolve:(t:number)=>void}[]>([]);
  const [t,setT]=useState(()=>settledTime(frameTime(start),reduced));
  const [playing,setPlaying]=useState(autoplay&&!reduced),[nonce,setNonce]=useState(0);
  const [error,setError]=useState(''),live=useRef(false);
  useEffect(()=>{
    try{stage.current=createStage(host.current!);setNonce(n=>n+1);}catch(e){setError(e instanceof Error?e.message:String(e));}
    return()=>{stage.current?.dispose();stage.current=null;};
  },[]);
  useEffect(()=>{if(!stage.current)return;stage.current.render(t);// A seek resolves only once its exact frame is on the canvas, never on a stale playback frame.
    const ready=waiters.current.filter(w=>w.t===t);waiters.current=waiters.current.filter(w=>w.t!==t);ready.forEach(w=>w.resolve(t));},[t,nonce]);
  useEffect(()=>{if(reduced){setPlaying(false);setT(v=>settledTime(v,true));}},[reduced]);
  useEffect(()=>{
    if(!playing||reduced)return;let frame=0,previous=performance.now();live.current=true;
    // `live` is cleared synchronously by a seek, so a tick already queued can never move t past the requested frame.
    const tick=(now:number)=>{if(!live.current)return;const dt=Math.min(.1,(now-previous)/1000);previous=now;setT(v=>{if(!live.current)return v;const n=v+dt;return n>FILM_DURATION+.6?0:n;});frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>{live.current=false;cancelAnimationFrame(frame);};
  },[playing,reduced]);
  const seek=useCallback((value:number)=>{live.current=false;setPlaying(false);setT(settledTime(frameTime(value),reduced));},[reduced]);
  useEffect(()=>{
    window.__fabricFilm={duration:FILM_DURATION,fps:FILM_FPS,seek:(value:number)=>new Promise<number>(resolve=>{live.current=false;const target=settledTime(frameTime(value),reduced);waiters.current.push({t:target,resolve});setPlaying(false);setT(target);setNonce(n=>n+1);})};
    return()=>{delete window.__fabricFilm;};
  },[reduced]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  const shown=Math.min(t,FILM_DURATION),frame=filmFrame(shown),caption=frame.caption,chapter=chapterAt(shown),panel=frame.panel;
  const kit=panel.mode==='kit'?getKit(panel.kit):null,bom=panel.mode==='kit'?getBOM(panel.kit):[];
  const togglePlay=()=>{if(t>=FILM_DURATION)setT(0);setPlaying(!playing);};
  return <div className={'fb-film'+(chrome?'':' fb-film-clean')} role="region" aria-label="Fabric Bricks build film" data-testid="kit-film" data-film-t={shown.toFixed(4)} data-chapter={chapter.id} data-playing={playing} data-reduced-motion={reduced}>
    <div className="fb-film-stage">
      <div className="fb-film-canvas" ref={host}/>
      {error&&<div className="fb-film-error" role="status">{error}</div>}
      <div className="fb-film-nav"><span className="fb-film-brand"><span className="fb-brand-mark"><i/><i/><i/></span>FABRIC BRICKS</span><span className="fb-film-pill">Kits</span>{kit&&<span className="fb-film-pill fb-film-pill-on">{kit.title}</span>}</div>
      <div className="fb-film-caption" key={caption.key} style={{opacity:caption.opacity,transform:`translateY(${((1-caption.opacity)*8).toFixed(2)}px)`}}>
        <span className="fb-eyebrow">{caption.eyebrow}</span><h2>{caption.title}</h2><p>{caption.body}</p>
        {panel.mode==='kit'&&<div className="fb-film-actions"><span className="fb-film-pill">♡ Add to build list</span><span className="fb-film-concept">Concept kit · {kit!.number}</span></div>}
        {caption.chip&&<span className="fb-film-chip"><i style={{background:bom.find(l=>panel.mode==='kit'&&l.id===panel.lot)?.color}}/>{caption.chip}<u>Show all</u></span>}
      </div>
      <div className="fb-film-provenance">SYNTHETIC · PROVISIONAL</div>
      <div className="fb-film-transport" role="group" aria-label="Film transport">
        <button className="fb-film-play" onClick={togglePlay} disabled={reduced} aria-label={playing?'Pause film':'Play film'} aria-pressed={playing}>{playing?<Pause size={13}/>:t>=FILM_DURATION?<RotateCcw size={13}/>:<Play size={13}/>}</button>
        {panel.mode==='kit'?<>
          <div className="fb-film-steps"><span><small>STEP {panel.step} OF 6</small><strong>{panel.stepName}</strong></span><span className="fb-film-track6">{[1,2,3,4,5,6].map(n=><i key={n} className={n<=panel.step?'on':''}/>)}</span></div>
          <small className="fb-film-plus">+{panel.stepParts} parts</small>
          <span className={'fb-film-pill'+(panel.exploded?' fb-film-pill-on':'')}>{panel.exploded?'Exploded':'Assembled'}</span>
        </>:<div className="fb-film-steps"><span><small>COLLECTION</small><strong>Six concept kits</strong></span><span className="fb-film-track6">{kits.map(k=><i key={k.id} className="on"/>)}</span></div>}
      </div>
      {chrome&&<div className="fb-film-controls" role="group" aria-label="Film controls">
        <div className="fb-film-track">
          <input type="range" aria-label="Film time" min={0} max={FILM_DURATION} step={1/FILM_FPS} value={shown} onChange={e=>seek(Number(e.target.value))}/>
          <div className="fb-film-chapters">{chapters.map(c=><button key={c.id} style={{left:(c.start/FILM_DURATION*100)+'%',width:((c.end-c.start)/FILM_DURATION*100)+'%'}} aria-current={chapter.id===c.id?'step':undefined} onClick={()=>seek(reduced?c.rest:c.start)} aria-label={'Jump to '+c.label}>{c.label}</button>)}</div>
        </div>
        <span className="fb-film-time">{clock(shown)} / {clock(FILM_DURATION)}</span>
        <button className="fb-film-close" onClick={onClose} aria-label="Close film"><X size={14}/></button>
      </div>}
    </div>
    <aside className="fb-film-panel" aria-label={panel.mode==='kit'?'Parts':'Kit collection'}>
      {panel.mode==='kit'?<>
        <div className="fb-film-stats"><div><span>PIECES</span><strong>{kit!.parts.length}</strong></div><div><span>LOTS</span><strong>{bom.length}</strong></div><div><span>PARTS COST*</span><strong>≈ ${kitCost(kit!.id).toFixed(2)}</strong></div></div>
        <div className="fb-film-size">{kit!.parts[0].size[0]} wide × {kit!.parts[0].size[2]} deep · synthetic scale</div>
        <div className="fb-film-parts-head"><b>PARTS</b><small>{panel.lot?'Show all':'Pick a row, or a part on the model'}</small></div>
        <div className="fb-film-rows">{bom.map(l=><div key={l.id} className={'fb-film-row'+(panel.lot===l.id?' on':panel.lot?' dim':'')}>
          <span className="fb-part-swatch" style={{'--brick-color':l.color} as CSSProperties}><i/><i/></span><span className="fb-film-qty">{l.quantity}×</span>
          <span className="fb-film-name"><strong>{l.name} {l.code}</strong><small><i style={{background:l.color}}/>{l.id}</small></span><span className="fb-film-price">${(l.price*l.quantity).toFixed(2)}</span></div>)}</div>
        <div className="fb-film-panel-foot"><p>* Illustrative costs, not live prices. Geometry and parts are synthetic; no purchasable kit is claimed.</p><span className="fb-film-cta">Add to build list</span></div>
      </>:<>
        <span className="fb-eyebrow">THE COLLECTION</span><h3>Choose a kit.</h3><p className="fb-film-sub">Small builds, big connections.</p>
        <div className="fb-film-tabs"><span className="fb-film-pill fb-film-pill-on">All kits</span><span className="fb-film-pill">By category</span></div>
        <div className="fb-film-rows">{kits.map(k=><div key={k.id} className="fb-film-row fb-film-kitrow"><span className="fb-film-qty">{k.number}</span><span className="fb-film-name"><strong>{k.title}</strong><small>{k.category}</small></span><span className="fb-film-price">{k.parts.length} pieces</span></div>)}</div>
        <div className="fb-film-panel-foot"><p>Six concept kits. One shared architecture.</p><span className="fb-film-cta">Explore Lakehouse</span></div>
      </>}
    </aside>
    <span className="fb-sr" aria-live="polite">{chapter.label}</span>
  </div>;
}

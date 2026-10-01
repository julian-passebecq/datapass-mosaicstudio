import {useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {Block} from '../types';
import {validateScene,pose,type SceneSpec} from '../scene';
import {useRuntime,useSiteState,useReducedMotion} from '../hooks';
import {createBrowserHost} from '../../core/host';
type View={explode:number;phase:number;camera:string;selection:string};
type API={update(view:View,reduced:boolean):void;resetCamera():void;capture():Promise<Blob>};
/** Demand-rendered Three.js scene. Story progression is owned by VizForge, never here. */
export default function Scene3D({block}:{block:Extract<Block,{type:'scene3d'}>}){
  const runtime=useRuntime(),snapshot=useSiteState(),reduced=useReducedMotion();
  const scene=useMemo(()=>validateScene(runtime.definition.resources!.scenes![block.resource]),[runtime,block.resource]);
  const view:View={explode:Number(snapshot.values[block.explode]),phase:Number(snapshot.values[block.phase]),camera:String(snapshot.values[block.camera]),selection:String(snapshot.values[block.selection])};
  const host=useRef<HTMLDivElement>(null),api=useRef<API|null>(null),latest=useRef(view);latest.current=view;
  const [status,setStatus]=useState('Preparing 3D'),[error,setError]=useState(''),[reset,setReset]=useState(0);
  const selected=scene.entities.find(e=>e.id===view.selection);
  useEffect(()=>{
    const root=host.current!,canvas=document.createElement('canvas');canvas.setAttribute('aria-label',scene.title+' interactive 3D model');canvas.tabIndex=0;canvas.dataset.animating='false';
    // Probe WebGL2 before constructing Three, so an unavailable GPU has an honest
    // accessible fallback rather than a 2D image silently labelled as 3D.
    const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
    if(!context){setStatus('3D unavailable');setError('WebGL2 is unavailable. Use the component list and descriptions below.');return;}
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});}
    catch(e){setStatus('3D unavailable');setError(e instanceof Error?e.message:String(e));return;}
    let alive=true,frame=0;let displayed={...latest.current};let lastCamera='';
    const world=new THREE.Scene();world.background=new THREE.Color('#f3f7fa');
    const camera=new THREE.PerspectiveCamera(35,1,.1,3000),controls=new OrbitControls(camera,canvas);
    controls.enableDamping=false;controls.minDistance=2;controls.maxDistance=100;controls.maxPolarAngle=Math.PI*.9;controls.enablePan=true;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    world.add(new THREE.HemisphereLight('#ffffff','#788a91',2.4));const sun=new THREE.DirectionalLight('#ffffff',3.2);sun.position.set(8,16,12);world.add(sun);
    const items=new Map<string,THREE.Object3D>(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    const entityFor=(partId:string):string|null=>{let p=scene.parts.find(p=>p.id===partId)!;while(p){if(p.entity)return p.entity;if(!p.parent)return null;p=scene.parts.find(n=>n.id===p.parent)!;}return null;};
    for(const part of scene.parts){let object:THREE.Object3D;
      if(part.shape==='group')object=new THREE.Group();
      else{
        const s=part.size,geometry=part.shape==='box'?new THREE.BoxGeometry(...s):part.shape==='cylinder'?new THREE.CylinderGeometry(s[0],s[1],s[2],32):part.shape==='cone'?new THREE.ConeGeometry(s[0],s[1],32):new THREE.SphereGeometry(s[0],24,16);
        const material=new THREE.MeshStandardMaterial({color:part.color,roughness:.58,metalness:.12});geometries.add(geometry);materials.add(material);object=new THREE.Mesh(geometry,material);
      }
      object.name=part.id;object.userData.entity=entityFor(part.id);items.set(part.id,object);
    }
    for(const p of scene.parts)(p.parent?items.get(p.parent)!:world).add(items.get(p.id)!);
    const ground=new THREE.GridHelper(24,24,'#c8d5df','#e1e8ee');ground.position.y=-.02;world.add(ground);geometries.add(ground.geometry);(Array.isArray(ground.material)?ground.material:[ground.material]).forEach(m=>materials.add(m));
    const render=()=>{if(alive&&!context.isContextLost())renderer.render(world,camera);};
    const place=(v:View)=>{for(const p of scene.parts){const object=items.get(p.id)!,target=pose(p,v.explode,v.phase);object.position.fromArray(target.position);object.rotation.set(...target.rotation);if(object instanceof THREE.Mesh){const m=object.material as THREE.MeshStandardMaterial;const active=object.userData.entity===v.selection;m.emissive.set(active?'#24566b':'#000000');m.emissiveIntensity=active?.3:0;}}};
    const cameraPreset=(id:string)=>scene.cameras.find(c=>c.id===id)||scene.cameras[0];
    const applyCamera=(id:string)=>{const preset=cameraPreset(id);camera.position.fromArray(preset.position);controls.target.fromArray(preset.target);controls.update();lastCamera=id;};
    root.appendChild(canvas);applyCamera(latest.current.camera);place(displayed);
    const resize=()=>{const width=Math.max(1,root.clientWidth),height=Math.max(1,root.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();};
    const observer=new ResizeObserver(resize);observer.observe(root);controls.addEventListener('change',render);resize();
    const raycaster=new THREE.Raycaster(),point=new THREE.Vector2();let start:{x:number;y:number}|null=null;
    const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY};};
    const up=(e:PointerEvent)=>{if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;start=null;const rect=canvas.getBoundingClientRect();point.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(point,camera);const hit=raycaster.intersectObjects([...items.values()],false).find(h=>typeof h.object.userData.entity==='string');if(hit)runtime.set(block.selection,hit.object.userData.entity);};
    const lost=(e:Event)=>{e.preventDefault();cancelAnimationFrame(frame);setStatus('3D unavailable');setError('The WebGL context was lost. Retry the renderer or keep using the component list.');};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('webglcontextlost',lost);
    api.current={
      update(next,noMotion){
        cancelAnimationFrame(frame);canvas.dataset.animating='true';const from={...displayed},began=performance.now(),cameraChanged=lastCamera!==next.camera;
        const fromPosition=camera.position.clone(),fromTarget=controls.target.clone(),preset=cameraPreset(next.camera),toPosition=new THREE.Vector3(...preset.position),toTarget=new THREE.Vector3(...preset.target);lastCamera=next.camera;
        const duration=noMotion||!cameraChanged&&from.explode===next.explode&&from.phase===next.phase?0:420;
        const draw=(now:number)=>{if(!alive)return;const raw=duration?Math.min(1,(now-began)/duration):1,t=raw*raw*(3-2*raw);displayed={...next,explode:from.explode+(next.explode-from.explode)*t,phase:from.phase+(next.phase-from.phase)*t};place(displayed);if(cameraChanged){camera.position.lerpVectors(fromPosition,toPosition,t);controls.target.lerpVectors(fromTarget,toTarget,t);controls.update();}render();if(raw<1)frame=requestAnimationFrame(draw);else canvas.dataset.animating='false';};
        draw(began);
      },
      resetCamera(){cancelAnimationFrame(frame);canvas.dataset.animating='false';place(latest.current);displayed={...latest.current};applyCamera(latest.current.camera);render();},
      capture(){render();return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG capture failed')),'image/png'));}
    };
    setStatus('3D ready');setError('');canvas.dataset.renderer='three-webgl2';
    return()=>{alive=false;cancelAnimationFrame(frame);api.current=null;observer.disconnect();controls.removeEventListener('change',render);controls.dispose();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();canvas.remove();};
  },[scene,runtime,block.selection,reset]);
  useEffect(()=>{api.current?.update(view,reduced);},[view.explode,view.phase,view.camera,view.selection,reduced]);
  function field(id:string){return runtime.manifest.fields.find(f=>f.id===id)!;}
  return <section className="site-scene" data-testid="scene3d" data-explode={view.explode} data-phase={view.phase} data-selection={view.selection} data-camera={view.camera}><div className="site-scene-toolbar"><span>{block.title||scene.title}</span><span className="site-render-status" role="status">{status}</span><button type="button" onClick={()=>api.current?.resetCamera()} disabled={status!=='3D ready'}>Reset camera</button><button type="button" disabled={status!=='3D ready'} onClick={async()=>{try{createBrowserHost().saveDownload(block.resource+'-scene.png',await api.current!.capture());}catch(e){setError(String(e));}}}>Capture PNG</button></div>
    <div ref={host} className="site-scene-canvas"/>
    {error&&<div className="site-notice" role="status"><p>{error}</p><button type="button" onClick={()=>setReset(n=>n+1)}>Retry 3D</button></div>}
    <div className="site-scene-controls"><label>{field(block.explode).label}<input aria-label={field(block.explode).label} type="range" min={field(block.explode).min} max={field(block.explode).max} step={field(block.explode).step} value={view.explode} onChange={e=>runtime.set(block.explode,Number(e.target.value))}/></label><label>{field(block.phase).label}<input aria-label={field(block.phase).label} type="range" min={field(block.phase).min} max={field(block.phase).max} step={field(block.phase).step} value={view.phase} onChange={e=>runtime.set(block.phase,Number(e.target.value))}/></label><label>{field(block.camera).label}<select aria-label={field(block.camera).label} value={view.camera} onChange={e=>runtime.set(block.camera,e.target.value)}>{scene.cameras.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div>
    <div className="site-parts" role="group" aria-label="Select model component"><button type="button" aria-pressed={view.selection==='none'} onClick={()=>runtime.set(block.selection,'none')}>All parts</button>{scene.entities.map(e=><button type="button" key={e.id} aria-pressed={view.selection===e.id} onClick={()=>runtime.set(block.selection,e.id)}>{e.label}</button>)}</div><div className="site-part-description" aria-live="polite"><strong>{selected?.label||'Interactive assembly'}</strong><p>{selected?.description||'Drag to orbit, scroll to zoom, or select a component using the buttons. Geometry is illustrative, not an engineering model.'}</p></div><small className="site-scene-note">{scene.note}</small>
  </section>;
}

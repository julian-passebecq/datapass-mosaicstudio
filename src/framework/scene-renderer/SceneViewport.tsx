import {useEffect,useRef,useState} from 'react';
import type {SceneSpec,PartPoseOffsets} from '../scene';
import {useReducedMotion} from '../hooks';
import {createBrowserHost} from '../../core/host';
import {createSceneRenderer,type SceneView,type SceneRenderer,type ProjectedAnchor} from './renderer';
export type SceneViewportProps={
  scene:SceneSpec; view:SceneView; onSelect(entity:string):void; title?:string; fileName?:string;
  appearance?:'light'|'dark'; pageScroll?:boolean; interactive?:boolean; highlighted?:readonly string[]|null;
  offsets?:PartPoseOffsets;
  anchors?:readonly {entity:string;label:string}[];
};
/** One graphics implementation, used by the assembly block and the spatial explorer. */
export default function SceneViewport({scene,view,onSelect,title,fileName='scene',appearance='light',pageScroll=false,interactive=true,highlighted=null,anchors=[],offsets={}}:SceneViewportProps){
  const host=useRef<HTMLDivElement>(null),api=useRef<SceneRenderer|null>(null),latest=useRef({view,onSelect,highlighted,offsets});latest.current={view,onSelect,highlighted,offsets};
  const anchorElements=useRef(new Map<string,HTMLButtonElement>());
  const [status,setStatus]=useState('Preparing 3D'),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),reduced=useReducedMotion();
  useEffect(()=>{
    let renderer:SceneRenderer|null=null;setStatus('Preparing 3D');setError('');
    const project=(points:ProjectedAnchor[])=>{for(const p of points){const element=anchorElements.current.get(p.entity);if(element){element.style.left=p.x+'px';element.style.top=p.y+'px';element.hidden=!p.visible;}}};
    try{
      renderer=createSceneRenderer(host.current!,scene,latest.current.view,{appearance,pageScroll,interactive,onSelect:id=>latest.current.onSelect(id),onUnavailable:message=>{setStatus('3D unavailable');setError(message);},onAnchors:project});
      api.current=renderer;renderer.update(latest.current.view,true,latest.current.highlighted,latest.current.offsets);setStatus('3D ready');
    }catch(e){setStatus('3D unavailable');setError(e instanceof Error?e.message:String(e));}
    return()=>{api.current=null;renderer?.dispose();};
  },[scene,appearance,pageScroll,interactive,attempt]);
  // Serialize the short ID set, not a large geometry or a changing React object.
  const highlightKey=highlighted?.join('|')??'',offsetKey=JSON.stringify(offsets);
  useEffect(()=>{api.current?.update(view,reduced,highlighted,offsets);},[view.camera,view.explode,view.phase,view.selection,reduced,highlightKey,offsetKey,status]);
  return <div className={'studio-scene-viewport '+appearance} data-camera={view.camera} data-selection={view.selection}>
    <div className="site-scene-toolbar"><span>{title||scene.title}</span><span className="site-render-status" role="status">{status}</span><button type="button" disabled={status!=='3D ready'} onClick={()=>api.current?.resetCamera()}>Reset camera</button><button type="button" disabled={status!=='3D ready'} onClick={async()=>{try{createBrowserHost().saveDownload(fileName+'-scene.png',await api.current!.capture());}catch(e){setError(String(e));}}}>Capture PNG</button></div>
    <div className="studio-scene-stage"><div ref={host} className="site-scene-canvas"/>{status==='3D ready'&&<div className="studio-scene-anchors" aria-label="Spatial components">{anchors.map(anchor=><button type="button" key={anchor.entity} ref={element=>{if(element)anchorElements.current.set(anchor.entity,element);else anchorElements.current.delete(anchor.entity);}} onClick={()=>onSelect(anchor.entity)} aria-pressed={view.selection===anchor.entity}>{anchor.label}</button>)}</div>}</div>
    {error&&<div className="site-notice" role="status"><p>{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry 3D</button></div>}
  </div>;
}

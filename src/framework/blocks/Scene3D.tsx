import {useMemo} from 'react';
import type {Block} from '../types';
import {validateScene,scenePartLimit} from '../scene';
import {useRuntime,useSiteState} from '../hooks';
import SceneViewport from '../scene-renderer/SceneViewport';
import type {SceneView} from '../scene-renderer/renderer';
/** State binding only. The shared viewport owns GPU resources and demand rendering. */
export default function Scene3D({block}:{block:Extract<Block,{type:'scene3d'}>}){
  const runtime=useRuntime(),snapshot=useSiteState();
  const scene=useMemo(()=>validateScene(runtime.definition.resources!.scenes![block.resource],{maxParts:scenePartLimit(runtime.definition)}),[runtime,block.resource]);
  const view:SceneView={explode:Number(snapshot.values[block.explode]),phase:Number(snapshot.values[block.phase]),camera:String(snapshot.values[block.camera]),selection:String(snapshot.values[block.selection])};
  const selected=scene.entities.find(e=>e.id===view.selection);
  function field(id:string){return runtime.manifest.fields.find(f=>f.id===id)!;}
  return <section className="site-scene" data-testid="scene3d" data-explode={view.explode} data-phase={view.phase} data-selection={view.selection} data-camera={view.camera}>
    <SceneViewport scene={scene} view={view} onSelect={id=>runtime.set(block.selection,id)} title={block.title} fileName={block.resource}/>
    <div className="site-scene-controls"><label>{field(block.explode).label}<input aria-label={field(block.explode).label} type="range" min={field(block.explode).min} max={field(block.explode).max} step={field(block.explode).step} value={view.explode} onChange={e=>runtime.set(block.explode,Number(e.target.value))}/></label><label>{field(block.phase).label}<input aria-label={field(block.phase).label} type="range" min={field(block.phase).min} max={field(block.phase).max} step={field(block.phase).step} value={view.phase} onChange={e=>runtime.set(block.phase,Number(e.target.value))}/></label><label>{field(block.camera).label}<select aria-label={field(block.camera).label} value={view.camera} onChange={e=>runtime.set(block.camera,e.target.value)}>{scene.cameras.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div>
    <div className="site-parts" role="group" aria-label="Select model component"><button type="button" aria-pressed={view.selection==='none'} onClick={()=>runtime.set(block.selection,'none')}>All parts</button>{scene.entities.map(e=><button type="button" key={e.id} aria-pressed={view.selection===e.id} onClick={()=>runtime.set(block.selection,e.id)}>{e.label}</button>)}</div><div className="site-part-description" aria-live="polite"><strong>{selected?.label||'Interactive assembly'}</strong><p>{selected?.description||'Drag to orbit, scroll to zoom, or select a component using the buttons. Geometry is illustrative, not an engineering model.'}</p></div><small className="site-scene-note">{scene.note}</small>
  </section>;
}

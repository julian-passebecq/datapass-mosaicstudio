import * as THREE from 'three';
import {useCallback,useRef,useMemo,useLayoutEffect} from 'react';
import SceneViewport from '../../src/framework/scene-renderer/SceneViewport';
import type {SceneContent,LoadedScene} from '../../src/framework/scene-renderer/content';
import {getKit,kits,kitScenes,collectionScene,stepOffsets,type KitId} from './kits';
import {buildKitContent,studioEnvironment,fitShadow,type KitContent} from './brickContent';
import type {SceneSpec,Vec3} from '../../src/framework/scene';

/** Client-owned procedural content; camera, picking, motion and GPU lifecycle remain in SceneViewport. */
function loadKit(id:KitId,presentation:{current:{isolate:boolean;selection:string;piece:string}},sceneSpec:SceneSpec=kitScenes[id],dress=true):LoadedScene{
  const ghostColor=new THREE.Color('#fafbf8'),ghostGlow=new THREE.Color('#f4f5ef'),black=new THREE.Color('#000000');
  const content=buildKitContent(id,({part:p,material:mat,color})=>{const v=presentation.current;const ghost=v.isolate&&v.selection!=='none'&&(v.piece!=='none'?v.piece!==p.id:v.selection!==p.lot);
    mat.color.copy(ghost?ghostColor:color);mat.emissive.copy(ghost?ghostGlow:black);mat.emissiveIntensity=ghost?.65:0;});
  if(dress)dressSharedStage(content);
  return {scene:sceneSpec,content};
}
/** One-time studio dressing of the shared renderer from inside the content adapter: white page, image-based light, soft key shadow. */
function dressSharedStage(content:KitContent|SceneContent){
  let dressed=false,environment:THREE.Texture|null=null;
  const first=content.meshes[0],previous=first.onBeforeRender;
  first.onBeforeRender=function(renderer,scene,camera,geometry,material,group){previous.call(this,renderer,scene,camera,geometry,material,group);if(dressed)return;dressed=true;
    scene.background=new THREE.Color('#ffffff');renderer.toneMappingExposure=.92;
    environment=studioEnvironment(renderer);(scene as THREE.Scene).environment=environment;(scene as THREE.Scene).environmentIntensity=.6;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const bounds=new THREE.Box3().setFromObject(content.root),center=bounds.getCenter(new THREE.Vector3()),half=Math.max(6,bounds.getSize(new THREE.Vector3()).length()*.6);
    scene.traverse(o=>{if(o instanceof THREE.GridHelper)o.visible=false;else if(o instanceof THREE.HemisphereLight)o.intensity=.55;
      else if(o instanceof THREE.DirectionalLight){o.intensity=2.6;o.castShadow=true;o.shadow.mapSize.set(2048,2048);o.shadow.bias=-.0004;o.shadow.normalBias=.02;o.shadow.radius=4;fitShadow(o,new THREE.Vector3(center.x,0,center.z),half);if(!o.target.parent)scene.add(o.target);}});
    content.materials.forEach(m=>{m.needsUpdate=true;});
  };
  const dispose=content.dispose;content.dispose=()=>{environment?.dispose();dispose();};
}
export default function KitModel({kit,selection,piece,explode,step,isolate,camera,onSelect}:{kit:KitId;selection:string;piece:string;explode:number;step:number;isolate:boolean;camera:string;onSelect:(id:string)=>void}){
  const presentation=useRef({isolate,selection,piece});presentation.current={isolate,selection,piece};
  const scene=useMemo(()=>structuredClone(kitScenes[kit]),[kit]);
  useLayoutEffect(()=>{const selected=getKit(kit).parts.filter(p=>piece!=='none'?p.id===piece:p.lot===selection);if(!selected.length)return;
    const target=selected.reduce((a,p)=>a.map((v,i)=>v+(p.position[i]+(i===1?(p.step-1)*.72*explode:0))/selected.length) as Vec3,[0,0,0] as Vec3);
    for(const c of scene.cameras.filter(c=>c.id.startsWith('focus-'))){c.target=target;c.position=[target[0]+5,target[1]+4,target[2]+6];}
  },[scene,selection,piece,explode]);
  const loadContent=useCallback(async(signal:AbortSignal)=>{signal.throwIfAborted();return loadKit(kit,presentation,scene);},[kit,scene]);
  const highlighted=isolate&&selection!=='none'?getKit(kit).parts.filter(p=>piece!=='none'?p.id===piece:p.lot===selection).map(p=>p.id):null;
  const resolvedCamera=scene.cameras.some(c=>c.id===camera)?camera:selection!=='none'?'focus-a':'overview';
  return <div className="fb-model" data-testid="kit-model" data-selection={selection} data-piece={piece} data-step={step} data-explode={explode} data-isolate={isolate}>
    <SceneViewport scene={scene} loadContent={loadContent} view={{selection:piece,camera:resolvedCamera==='overview'&&explode>.1?'exploded':resolvedCamera,explode,phase:0}} onSelect={onSelect} title={getKit(kit).title}
      highlighted={highlighted} offsets={stepOffsets(kit,step)} fileName={'fabric-'+kit+'-synthetic'}/>
  </div>;
}
export function KitCollection({onSelect}:{onSelect:(id:KitId)=>void}){
  const loadContent=useCallback(async(signal:AbortSignal):Promise<LoadedScene>=>{signal.throwIfAborted();const root=new THREE.Group(),items=new Map<string,THREE.Object3D>(),meshes:THREE.Mesh[]=[],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    const loaded=kits.map(k=>{const model=loadKit(k.id,{current:{selection:'none',piece:'none',isolate:false}},kitScenes[k.id],false);root.add(model.content.root);items.set(k.id,model.content.root);model.content.meshes.forEach(m=>{m.userData.entity=k.id;meshes.push(m);});model.content.geometries.forEach(g=>geometries.add(g));model.content.materials.forEach(m=>materials.add(m));return model;});
    const content:SceneContent={root,items,meshes,geometries,materials,dispose(){loaded.forEach(m=>m.content.dispose());root.clear();}};dressSharedStage(content);
    return {scene:collectionScene,content};
  },[]);
  return <div className="fb-model" data-testid="kit-collection"><SceneViewport scene={collectionScene} loadContent={loadContent} view={{selection:'none',camera:'overview',explode:0,phase:0}} onSelect={id=>onSelect(id as KitId)} title="Fabric kit collection"/></div>;
}

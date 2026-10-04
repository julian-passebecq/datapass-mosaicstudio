import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {useCallback,useRef,useMemo,useLayoutEffect} from 'react';
import SceneViewport from '../../src/framework/scene-renderer/SceneViewport';
import type {SceneContent,LoadedScene} from '../../src/framework/scene-renderer/content';
import {getKit,kits,kitScenes,collectionScene,stepOffsets,type KitId} from './kits';
import type {SceneSpec,Vec3} from '../../src/framework/scene';

/** Client-owned procedural content; camera, picking, motion and GPU lifecycle remain in SceneViewport. */
function loadKit(id:KitId,presentation:{current:{isolate:boolean;selection:string;piece:string}},sceneSpec:SceneSpec=kitScenes[id]):LoadedScene{
  const kit=getKit(id),root=new THREE.Group(),items=new Map<string,THREE.Object3D>(),meshes:THREE.Mesh[]=[],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const material=(color:string)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.02});materials.add(m);return m;};
  for(const p of kit.parts){
    const group=new THREE.Group();group.name=p.id;group.position.set(...p.position);items.set(p.id,group);root.add(group);
    const mat=material(p.color);
    const add=(geometry:THREE.BufferGeometry,position:[number,number,number]=[0,0,0])=>{geometries.add(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.userData.entity=p.id;group.add(mesh);meshes.push(mesh);
      mesh.onBeforeRender=()=>{const v=presentation.current;const ghost=v.isolate&&v.selection!=='none'&&(v.piece!=='none'?v.piece!==p.id:v.selection!==p.lot);mat.color.set(ghost?'#fafbf8':p.color);mat.emissive.set(ghost?'#f4f5ef':'#000000');mat.emissiveIntensity=ghost?.65:0;};
      return mesh;};
    if(p.shape==='cylinder')add(new THREE.CylinderGeometry(...p.size,24));
    else if(p.shape==='leaf'){const leaf=add(new RoundedBoxGeometry(...p.size,1,.05));leaf.rotation.y=(Number(p.id.split('-').at(-1))-1)*1.1;leaf.rotation.z=.15;}
    else add(new RoundedBoxGeometry(...p.size,2,.035));
    if(p.studs){const [nx,nz]=p.studs;for(let x=0;x<nx;x++)for(let z=0;z<nz;z++)add(new THREE.CylinderGeometry(.13,.14,.1,16),[(x-(nx-1)/2)*(p.size[0]/nx),p.size[1]/2+.045,(z-(nz-1)/2)*(p.size[2]/nz)]);}
  }
  // The content adapter owns its editorial environment. No additional renderer or render loop.
  let dressed=false;
  const firstMaterialUpdate=meshes[0].onBeforeRender;
  meshes[0].onBeforeRender=function(renderer,scene,camera,geometry,material,group){firstMaterialUpdate.call(this,renderer,scene,camera,geometry,material,group);if(dressed)return;dressed=true;scene.background=new THREE.Color('#ffffff');renderer.toneMappingExposure=.88;scene.children.filter(o=>o instanceof THREE.GridHelper).forEach(o=>{o.visible=false;});};
  let disposed=false;
  const content:SceneContent={root,items,meshes,geometries,materials,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();}};
  return {scene:sceneSpec,content};
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
    const loaded=kits.map(k=>{const model=loadKit(k.id,{current:{selection:'none',piece:'none',isolate:false}});root.add(model.content.root);items.set(k.id,model.content.root);model.content.meshes.forEach(m=>{m.userData.entity=k.id;meshes.push(m);});model.content.geometries.forEach(g=>geometries.add(g));model.content.materials.forEach(m=>materials.add(m));return model;});
    return {scene:collectionScene,content:{root,items,meshes,geometries,materials,dispose(){loaded.forEach(m=>m.content.dispose());root.clear();}}};
  },[]);
  return <div className="fb-model" data-testid="kit-collection"><SceneViewport scene={collectionScene} loadContent={loadContent} view={{selection:'none',camera:'overview',explode:0,phase:0}} onSelect={id=>onSelect(id as KitId)} title="Fabric kit collection"/></div>;
}

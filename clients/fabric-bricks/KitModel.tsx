import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {useCallback,useRef} from 'react';
import SceneViewport from '../../src/framework/scene-renderer/SceneViewport';
import type {SceneContent,LoadedScene} from '../../src/framework/scene-renderer/content';
import {getKit,kitScenes,stepOffsets,type KitId} from './kits';

/** Client-owned procedural content; camera, picking, motion and GPU lifecycle remain in SceneViewport. */
function loadKit(id:KitId,presentation:{current:{isolate:boolean;selection:string}}):LoadedScene{
  const kit=getKit(id),root=new THREE.Group(),items=new Map<string,THREE.Object3D>(),meshes:THREE.Mesh[]=[],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const material=(color:string)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.02});materials.add(m);return m;};
  for(const p of kit.parts){
    const group=new THREE.Group();group.name=p.id;items.set(p.id,group);root.add(group);
    const mat=material(p.color);
    const add=(geometry:THREE.BufferGeometry,position:[number,number,number]=[0,0,0])=>{geometries.add(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.userData.entity=p.lot;group.add(mesh);meshes.push(mesh);
      mesh.onBeforeRender=()=>{const v=presentation.current;const ghost=v.isolate&&v.selection!=='none'&&v.selection!==p.lot;mat.color.set(ghost?'#fafbf8':p.color);if(ghost){mat.emissive.set('#f4f5ef');mat.emissiveIntensity=.65;}};
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
  return {scene:kitScenes[id],content};
}
export default function KitModel({kit,selection,explode,step,isolate,camera,onSelect}:{kit:KitId;selection:string;explode:number;step:number;isolate:boolean;camera:string;onSelect:(id:string)=>void}){
  const presentation=useRef({isolate,selection});presentation.current={isolate,selection};
  const loadContent=useCallback(async(signal:AbortSignal)=>{signal.throwIfAborted();return loadKit(kit,presentation);},[kit]);
  return <div className="fb-model" data-testid="kit-model" data-selection={selection} data-step={step} data-explode={explode} data-isolate={isolate}>
    <SceneViewport scene={kitScenes[kit]} loadContent={loadContent} view={{selection,camera:camera==='overview'&&explode>.1?'exploded':camera,explode,phase:0}} onSelect={onSelect} title={getKit(kit).title}
      highlighted={isolate&&selection!=='none'?[selection]:null} offsets={stepOffsets(kit,step)} fileName={'fabric-'+kit+'-synthetic'}/>
  </div>;
}

import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fetchModelBytes,verifyModelBytes} from './load.ts';
import {validatePartBindings} from './glb.ts';
import {validateModel,type ModelSpec} from './model.ts';
import type {SceneSpec,Vec3} from '../scene.ts';
import type {LoadedScene} from '../scene-renderer/content.ts';

/** Reuses the pinned Three loader, after a bounded file/profile check; owns every resource. */
export async function prepareModel(input:ModelSpec,signal:AbortSignal,base=location.href):Promise<LoadedScene> {
  const spec=validateModel(input),bytes=await fetchModelBytes(spec.asset,signal,base);
  signal.throwIfAborted();const inspected=await verifyModelBytes(spec.asset,bytes);validatePartBindings(spec,inspected);signal.throwIfAborted();
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(()=>{throw new Error('Secondary model requests are forbidden');});
  const gltf=await new GLTFLoader(manager).parseAsync(bytes.buffer as ArrayBuffer,'');
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),meshes:THREE.Mesh[]=[];
  gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());gltf.scene.removeFromParent();};
  try {
    signal.throwIfAborted();
    const items=new Map<string,THREE.Object3D>(),parts:SceneSpec['parts']=[];
    for(const part of spec.parts){
      const object:THREE.Object3D=await gltf.parser.getDependency('node',part.node);
      let parent:THREE.Object3D|null=object;while(parent&&parent!==gltf.scene)parent=parent.parent;
      if(!parent)throw new Error('Part binding is not in the imported scene');
      items.set(part.id,object);
      parts.push({id:part.id,entity:part.id,parent:null,shape:'group',size:[1,1,1],position:object.position.toArray(),rotation:[object.rotation.x,object.rotation.y,object.rotation.z],explode:[...part.explode],color:'#ffffff'});
      object.traverse(child=>{if(child instanceof THREE.Mesh){child.userData.entity=part.id;const original=Array.isArray(child.material)?child.material:[child.material];const owned=original.map(material=>{if(!(material instanceof THREE.MeshStandardMaterial))throw new Error('Only PBR mesh materials are supported');const copy=material.clone();materials.add(copy);return copy;});child.material=Array.isArray(child.material)?owned:owned[0];meshes.push(child);}});
    }
    // Reject huge compounded transforms before creating a WebGL renderer.
    gltf.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(gltf.scene);
    if(bounds.isEmpty()||[...bounds.min.toArray(),...bounds.max.toArray()].some(n=>!Number.isFinite(n)||Math.abs(n)>500))throw new Error('Model world bounds exceed the viewer profile');
    const anchors=new Map(spec.annotations.map(a=>[a.part,{object:items.get(a.part)!,position:[...a.position] as Vec3}]));
    const extent=bounds.max.x-bounds.min.x;if(extent<.001)throw new Error('Model has degenerate bounds');
    signal.throwIfAborted();
    return {scene:{format:'datapass.scene3d',version:1,title:spec.title,note:spec.note,entities:spec.parts.map(p=>({id:p.id,label:p.label,description:p.description})),parts,cameras:structuredClone(spec.cameras)},content:{root:gltf.scene,items,meshes,geometries,materials,anchors,sectionBounds:[bounds.min.x, bounds.max.x],dispose}};
  }catch(error){dispose();throw error;}
}

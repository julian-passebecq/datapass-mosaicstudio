import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {useCallback} from 'react';
import SceneViewport from '../../src/framework/scene-renderer/SceneViewport';
import type {LoadedScene} from '../../src/framework/scene-renderer/content';
import {concepts,conceptScene,conceptOffsets,conceptOwner,type FabricConcept} from './concepts';

function labelTexture(concept:FabricConcept,label:string){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1024,512);ctx.fillStyle=concept.color;ctx.fillRect(0,0,1024,13);
 ctx.font='500 30px Arial';ctx.fillStyle='#788587';ctx.fillText(concept.category,48,67);
 ctx.font='bold 58px Arial';ctx.fillStyle='#213c42';ctx.fillText(concept.title,48,145);
 ctx.font='42px Arial';ctx.fillStyle=concept.color;
 const words=label.split(' ');let line='',y=217;for(const word of words){if(ctx.measureText(line+' '+word).width>920){ctx.fillText(line,48,y);line=word;y+=49;}else line+=(line?' ':'')+word;}ctx.fillText(line,48,y);
 // Authored software diagrams: table grids, code lines and connected processing nodes.
 ctx.strokeStyle=concept.color;ctx.lineWidth=4;ctx.globalAlpha=.75;
 if(['concept-lakehouse','concept-warehouse','concept-sqldb','concept-semantic'].includes(concept.id)){
  for(let x=0;x<4;x++)for(let z=0;z<3;z++){ctx.strokeRect(50+x*110,325+z*40,105,35);}ctx.font='bold 100px Arial';ctx.fillText(concept.symbol,680,435);
 }else if(concept.id==='concept-notebook'){
  for(let i=0;i<4;i++){ctx.fillRect(50,320+i*35,380-i*55,9);}ctx.font='bold 95px Arial';ctx.fillText('</>',690,435);
 }else{for(let i=0;i<3;i++){ctx.strokeRect(70+i*305,335,160,100);if(i<2){ctx.beginPath();ctx.moveTo(240+i*305,385);ctx.lineTo(360+i*305,385);ctx.stroke();}}}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function loadConcepts():LoadedScene{
 const root=new THREE.Group(),items=new Map<string,THREE.Object3D>(),meshes:THREE.Mesh[]=[],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures:THREE.Texture[]=[];
 for(const part of conceptScene.parts){const concept=conceptOwner(part.entity!)!,layer=concept.layers.find(l=>part.id===concept.id+'--'+l.id);
  const group=new THREE.Group();items.set(part.id,group);group.position.set(...part.position);
  if(part.parent)items.get(part.parent)!.add(group);else root.add(group);
  const material=new THREE.MeshStandardMaterial({color:layer?'#e9f1f2':concept.color,roughness:.72});materials.add(material);
  const geometry=new RoundedBoxGeometry(...part.size,2,.065);geometries.add(geometry);const body=new THREE.Mesh(geometry,material);body.userData.entity=part.entity;group.add(body);meshes.push(body);
  if(layer){const tex=labelTexture(concept,layer.label);textures.push(tex);const topMaterial=new THREE.MeshBasicMaterial({map:tex,toneMapped:false});materials.add(topMaterial);
   const topGeometry=new THREE.PlaneGeometry(5.04,2.85);geometries.add(topGeometry);const top=new THREE.Mesh(topGeometry,topMaterial);top.rotation.x=-Math.PI/2;top.position.y=.105;top.userData.entity=part.entity;group.add(top);meshes.push(top);}
 }
 let dressed=false;meshes[0].onBeforeRender=(renderer,scene)=>{if(dressed)return;dressed=true;scene.background=new THREE.Color('#f8fbfb');renderer.toneMappingExposure=.95;scene.children.filter(o=>o instanceof THREE.GridHelper).forEach(o=>{o.visible=false;});};
 let disposed=false;return {scene:conceptScene,content:{root,items,meshes,geometries,materials,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();}}};
}
export default function ConceptModel({selection,explode,camera,onSelect}:{selection:string;explode:number;camera:string;onSelect:(id:string)=>void}){
 const loadContent=useCallback(async(signal:AbortSignal)=>{signal.throwIfAborted();return loadConcepts();},[]);
 const selected=conceptOwner(selection);
 return <div className="fc-model fb-model" data-testid="concept-model" data-concept={selected?.id??'none'} data-selection={selection} data-explode={explode}>
  <SceneViewport scene={conceptScene} loadContent={loadContent} view={{selection,camera,explode:0,phase:0}} offsets={conceptOffsets(selection,explode)} anchors={[...concepts.filter(c=>c.id!==selected?.id).map(c=>({entity:c.id,label:c.title})),...(selected?selected.layers.map(l=>({entity:selected.id+'--'+l.id,label:l.label})):[])]} onSelect={onSelect} title="Concepts Microsoft Fabric" fileName="fabric-concepts"/>
 </div>;
}

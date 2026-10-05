import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {SceneContent} from '../../src/framework/scene-renderer/content';
import {getKit,type BrickPart,type KitId} from './kits';

/**
 * Client-owned procedural brick content, shared by the interactive viewport (KitModel) and the autoplay film (KitFilm).
 * Realism comes from geometry and materials only: bevelled bricks, instanced lathe studs, extruded foliage,
 * a clear-coated ABS-like material, image-based lighting and a soft contact shadow under each display plate.
 * Everything stays SYNTHETIC: dimensions and pieces are illustrative.
 */
export type PartHandle={part:BrickPart;group:THREE.Group;material:THREE.MeshPhysicalMaterial;color:THREE.Color};
export type KitContent=SceneContent&{parts:Map<string,PartHandle>;stage:THREE.Group;stageMaterials:THREE.Material[]};

/** Lathe profile of a cylinder with rounded rims (a real moulded edge instead of a hard CG edge). */
function roundedCylinder(radiusTop:number,radiusBottom:number,height:number,bevel:number,segments=40){
  const h=height/2,b=Math.min(bevel,radiusTop*.45,radiusBottom*.45,h*.45),pts:THREE.Vector2[]=[new THREE.Vector2(0,-h)];
  const arc=(cx:number,cy:number,from:number,to:number,r:number)=>{for(let i=0;i<=4;i++){const a=from+(to-from)*i/4;pts.push(new THREE.Vector2(cx+Math.cos(a)*r,cy+Math.sin(a)*r));}};
  arc(radiusBottom-b,-h+b,-Math.PI/2,0,b);arc(radiusTop-b,h-b,0,Math.PI/2,b);pts.push(new THREE.Vector2(0,h));
  return new THREE.LatheGeometry(pts,segments);
}
/** Stud: short rounded cylinder sitting on top of a brick, origin at its base. */
function studGeometry(){const g=roundedCylinder(.128,.128,.095,.022,28);g.translate(0,.0475,0);return g;}
function leafShape(length:number,width:number){
  const s=new THREE.Shape();s.moveTo(0,0);
  s.bezierCurveTo(length*.25,width*.75,length*.7,width*.62,length,0);
  s.bezierCurveTo(length*.7,-width*.62,length*.25,-width*.75,0,0);
  return s;
}
/** Botanical element: three moulded leaves fanned around a short stem, like the classic plant piece. */
function foliageGeometry(size:[number,number,number]){
  const length=size[0]*.58,width=size[2]*.62,leaves:THREE.BufferGeometry[]=[];
  for(let i=0;i<3;i++){
    const g=new THREE.ExtrudeGeometry(leafShape(length,width),{depth:.035,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:2,curveSegments:12});
    g.rotateX(-Math.PI/2);g.rotateZ(-.32-(i%2)*.12);g.rotateY(i*Math.PI*2/3+.3);leaves.push(g);
  }
  const stem=roundedCylinder(.05,.06,.18,.015,12);stem.translate(0,-.06,0);leaves.push(stem.toNonIndexed());
  const merged=mergeGeometries(leaves.map(g=>g.index?g.toNonIndexed():g),false)!;leaves.forEach(g=>g.dispose());
  merged.computeVertexNormals();return merged;
}
/** Flower stud: round plate with a five-petal top. */
function flowerGeometry(size:[number,number,number]){
  const r=size[0]*.95,petals=new THREE.Shape();
  for(let i=0;i<=60;i++){const a=i/60*Math.PI*2,rr=r*(.72+.28*Math.abs(Math.cos(a*2.5)));const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)petals.moveTo(x,y);else petals.lineTo(x,y);}
  const top=new THREE.ExtrudeGeometry(petals,{depth:.03,bevelEnabled:true,bevelThickness:.015,bevelSize:.015,bevelSegments:2});top.rotateX(-Math.PI/2);top.translate(0,size[2]*.2,0);
  const base=roundedCylinder(size[0]*.55,size[0]*.6,size[2]*.6,.02,20);base.translate(0,-size[2]*.15,0);
  const merged=mergeGeometries([top.toNonIndexed(),base.toNonIndexed()],false)!;top.dispose();base.dispose();merged.computeVertexNormals();return merged;
}
/** Soft rectangular contact shadow, baked once into a small canvas texture. */
function contactShadowTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d')!;
  g.fillStyle='#000';g.fillRect(0,0,128,128);g.filter='blur(10px)';g.fillStyle='#fff';g.fillRect(24,24,80,80);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;return t;
}
function plastic(color:string,lot:string){
  const glossy=lot==='water';
  return new THREE.MeshPhysicalMaterial({color,roughness:glossy?.3:lot==='leaves'?.42:lot==='display-base'?.55:.34,metalness:0,
    clearcoat:glossy?.25:lot==='display-base'?.15:.4,clearcoatRoughness:glossy?.35:.3,specularIntensity:.5,envMapIntensity:glossy?.38:lot==='display-base'?.35:.7});
}

export function buildKitContent(id:KitId,onPartRender?:(handle:PartHandle)=>void):KitContent{
  const kit=getKit(id),root=new THREE.Group(),items=new Map<string,THREE.Object3D>(),meshes:THREE.Mesh[]=[];
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),parts=new Map<string,PartHandle>();
  const stud=studGeometry();geometries.add(stud);
  const shared=new Map<string,THREE.BufferGeometry>();
  const cached=(key:string,make:()=>THREE.BufferGeometry)=>{let g=shared.get(key);if(!g){g=make();shared.set(key,g);geometries.add(g);}return g;};
  for(const p of kit.parts){
    const group=new THREE.Group();group.name=p.id;group.position.set(...p.position);items.set(p.id,group);root.add(group);
    const material=plastic(p.color,p.lot);materials.add(material);
    const handle:PartHandle={part:p,group,material,color:new THREE.Color(p.color)};parts.set(p.id,handle);
    const mount=<T extends THREE.Mesh>(mesh:T)=>{mesh.userData.entity=p.id;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);
      if(onPartRender)mesh.onBeforeRender=()=>onPartRender(handle);return mesh;};
    const [w,h,d]=p.size;
    if(p.shape==='cylinder'){
      const flower=p.lot==='flowers';
      mount(new THREE.Mesh(flower?cached('flower:'+p.size,()=>flowerGeometry(p.size)):cached('cyl:'+p.size,()=>roundedCylinder(w,h,d,Math.min(.05,w*.12))),material));
    }
    else if(p.shape==='leaf'){const leaf=mount(new THREE.Mesh(cached('leaf:'+p.size,()=>foliageGeometry(p.size)),material));leaf.rotation.y=(Number(p.id.split('-').at(-1))-1)*1.05;}
    else mount(new THREE.Mesh(cached('box:'+p.size,()=>new RoundedBoxGeometry(w,h,d,3,Math.min(.045,Math.min(w,h,d)*.2))),material));
    if(p.studs){
      const [nx,nz]=p.studs,studs=new THREE.InstancedMesh(stud,material,nx*nz),m=new THREE.Matrix4();
      let n=0;for(let x=0;x<nx;x++)for(let z=0;z<nz;z++)studs.setMatrixAt(n++,m.makeTranslation((x-(nx-1)/2)*(w/nx),h/2-.004,(z-(nz-1)/2)*(d/nz)));
      studs.instanceMatrix.needsUpdate=true;studs.computeBoundingSphere();mount(studs);
    }
  }
  // Display stage: a shadow catcher plus a baked contact shadow, never pickable.
  const base=kit.parts[0],stage=new THREE.Group();stage.name='stage';root.add(stage);
  const aoTexture=contactShadowTexture();
  const ao=new THREE.MeshBasicMaterial({color:'#1f2420',alphaMap:aoTexture,transparent:true,opacity:.5,depthWrite:false});
  const aoPlane=new THREE.PlaneGeometry(base.size[0]*1.62,base.size[2]*1.62);aoPlane.rotateX(-Math.PI/2);
  const blob=new THREE.Mesh(aoPlane,ao);blob.position.y=.004;blob.renderOrder=-1;stage.add(blob);
  const catcher=new THREE.ShadowMaterial({color:'#28302a',opacity:.2,depthWrite:false});
  const floor=new THREE.PlaneGeometry(base.size[0]*3.2,base.size[2]*3.2);floor.rotateX(-Math.PI/2);
  const shadow=new THREE.Mesh(floor,catcher);shadow.receiveShadow=true;shadow.position.y=.002;stage.add(shadow);
  geometries.add(aoPlane);geometries.add(floor);materials.add(ao);materials.add(catcher);
  let disposed=false;
  return {root,items,meshes,geometries,materials,parts,stage,stageMaterials:[ao,catcher],
    dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());aoTexture.dispose();root.clear();}};
}

/** Image-based lighting from a procedural studio room; one PMREM per renderer. */
export function studioEnvironment(renderer:THREE.WebGLRenderer){
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  const texture=pmrem.fromScene(room,.035).texture;room.dispose?.();pmrem.dispose();return texture;
}
/** Fits a directional light's shadow frustum around a square area of the floor. */
export function fitShadow(light:THREE.DirectionalLight,center:THREE.Vector3,half:number){
  const cam=light.shadow.camera;cam.left=-half;cam.right=half;cam.top=half;cam.bottom=-half;cam.near=1;cam.far=80;cam.updateProjectionMatrix();
  light.target.position.copy(center);light.position.copy(center).add(new THREE.Vector3(-11,21,9));light.target.updateMatrixWorld();
}

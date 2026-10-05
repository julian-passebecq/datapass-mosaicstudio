import * as THREE from 'three';
import {partMeshes,plastic,studGeometry,studioEnvironment,type GeometryCache} from './brickContent';
import {thumbKey,type BrickPart} from './kits';

/**
 * Small rendered thumbnails for the parts list: each distinct piece (shape, size, colour, studs) is rendered once
 * on a single shared offscreen WebGL canvas, read back as a PNG data URL and cached for the session.
 * Rendering is synchronous, so the film can show its panel at an exact frame without waiting.
 */
const W=96,H=64;
type Stage={renderer:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.OrthographicCamera;stud:THREE.BufferGeometry};
let stage:Stage|null=null;
const cache=new Map<string,string>();
const VIEW=new THREE.Vector3(1,.85,1.3).normalize();

function createStage():Stage{
  const canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=H*2;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(W*2,H*2,false);renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  const scene=new THREE.Scene();scene.environment=studioEnvironment(renderer);scene.environmentIntensity=.75;
  scene.add(new THREE.HemisphereLight('#ffffff','#d6dbd3',.6));
  const key=new THREE.DirectionalLight('#fff6ec',2.1);key.position.set(-3,8,6);scene.add(key);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
  return {renderer,scene,camera,stud:studGeometry()};
}

/** Returns a cached PNG data URL of one piece, seen from the same three-quarter angle as the kits. */
export function partThumbnail(part:BrickPart):string{
  const key=thumbKey(part),hit=cache.get(key);if(hit)return hit;
  stage??=createStage();
  const {renderer,scene,camera,stud}=stage,local=new Set<THREE.BufferGeometry>();
  const cached:GeometryCache=(_,make)=>{const g=make();local.add(g);return g;};
  const material=plastic(part.color,part.lot),holder=new THREE.Group();if(part.rot)holder.rotation.set(...part.rot);
  partMeshes(part,material,cached,stud).forEach(m=>holder.add(m));scene.add(holder);holder.updateMatrixWorld(true);
  // Tight orthographic framing: project the piece's bounds into the view and keep the thumbnail's aspect.
  const box=new THREE.Box3().setFromObject(holder),center=box.getCenter(new THREE.Vector3());
  camera.position.copy(center).addScaledVector(VIEW,20);camera.up.set(0,1,0);camera.lookAt(center);camera.updateMatrixWorld(true);
  let x=0,y=0;const inverse=camera.matrixWorldInverse,corner=new THREE.Vector3();
  for(let i=0;i<8;i++){corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(inverse);x=Math.max(x,Math.abs(corner.x));y=Math.max(y,Math.abs(corner.y));}
  const halfH=Math.max(y,x*H/W,.05)*1.12,halfW=halfH*W/H;
  camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  const url=renderer.domElement.toDataURL('image/png');
  scene.remove(holder);local.forEach(g=>g.dispose());material.dispose();
  cache.set(key,url);return url;
}

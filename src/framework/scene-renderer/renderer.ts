import * as THREE from 'three';
import {CameraTransition} from './camera-transition';
import type {SceneContent} from './content';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {pose,validatePoseOffsets, type SceneSpec,type PartPoseOffsets} from '../scene';

export type SceneView = {explode:number; phase:number; camera:string; selection:string; mode?:'assembled'|'exploded'|'wireframe'|'isolate'|'section'; section?:number};
export type ProjectedAnchor = {entity:string; x:number; y:number; visible:boolean};
export type SceneRenderer = {
  update(view:SceneView, reduced:boolean, highlighted?:readonly string[]|null,offsets?:PartPoseOffsets):void;
  resetCamera():void;
  capture():Promise<Blob>;
  dispose():void;
};
export type SceneRendererOptions = {
  appearance:'light'|'dark'; pageScroll:boolean; interactive:boolean;
  onSelect(entity:string):void; onUnavailable(message:string):void;
  onAnchors?(anchors:ProjectedAnchor[]):void;
  content?:SceneContent;
};
/** Shared, demand-rendered geometry host. A renderer transition is not a story clock. */
export function createSceneRenderer(root:HTMLElement, scene:SceneSpec, initial:SceneView, options:SceneRendererOptions):SceneRenderer {
  const canvas=document.createElement('canvas');
  canvas.tabIndex=0; canvas.setAttribute('aria-label',scene.title+' interactive 3D model'); canvas.dataset.animating='false';
  canvas.style.touchAction=options.pageScroll?'pan-y':'none';
  const candidate=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
  if(!candidate)throw new Error('WebGL2 is unavailable. The component outline and documents remain usable.');
  const context:WebGL2RenderingContext=candidate;
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,3000),controls=new OrbitControls(camera,canvas);
  const dark=options.appearance==='dark';
  world.background=new THREE.Color(dark?'#0b1521':'#f3f7fa');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=dark?1.1:1.25;
  controls.enabled=options.interactive&&!(options.pageScroll&&matchMedia('(pointer: coarse)').matches); canvas.style.touchAction=options.pageScroll?'pan-y':'none'; controls.enableDamping=false; controls.enableZoom=!options.pageScroll;
  controls.minDistance=2; controls.maxDistance=250; controls.maxPolarAngle=Math.PI*.9; controls.enablePan=true;
  if(options.pageScroll)controls.touches.ONE=THREE.TOUCH.PAN;
  world.add(new THREE.HemisphereLight('#ffffff',dark?'#26344e':'#788a91',2.4));
  const sun=new THREE.DirectionalLight('#ffffff',3.2);sun.position.set(8,16,12);world.add(sun);
  const supplied=options.content;
  const items=supplied?.items??new Map<string,THREE.Object3D>(),geometries=supplied?.geometries??new Set<THREE.BufferGeometry>(),materials=supplied?.materials??new Set<THREE.Material>();
  const cutPlane=new THREE.Plane(new THREE.Vector3(1,0,0),0);
  const original=new Map<THREE.Material,{emissive:THREE.Color;intensity:number}>();
  renderer.localClippingEnabled=!!supplied;
  const byPart=new Map(scene.parts.map(p=>[p.id,p]));
  const entityFor=(partId:string):string|null=>{let p=byPart.get(partId)!;while(p){if(p.entity)return p.entity;if(!p.parent)return null;p=byPart.get(p.parent)!;}return null;};
  if(!supplied)for(const part of scene.parts){
    let object:THREE.Object3D;
    if(part.shape==='group')object=new THREE.Group();
    else {
      const s=part.size;
      const geometry=part.shape==='box'?new THREE.BoxGeometry(...s):part.shape==='cylinder'?new THREE.CylinderGeometry(s[0],s[1],s[2],32):part.shape==='cone'?new THREE.ConeGeometry(s[0],s[1],32):new THREE.SphereGeometry(s[0],24,16);
      const material=new THREE.MeshStandardMaterial({color:part.color,roughness:.5,metalness:.18});
      geometries.add(geometry); materials.add(material); object=new THREE.Mesh(geometry,material);
    }
    object.name=part.id; object.userData.entity=entityFor(part.id); items.set(part.id,object);
  }
  if(supplied)world.add(supplied.root);
  else for(const p of scene.parts)(p.parent?items.get(p.parent)!:world).add(items.get(p.id)!);
  const pickable=supplied?.meshes??[...items.values()].filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh);
  for(const object of pickable)for(const mat of Array.isArray(object.material)?object.material:[object.material])if(mat instanceof THREE.MeshStandardMaterial)original.set(mat,{emissive:mat.emissive.clone(),intensity:mat.emissiveIntensity});
  const ground=new THREE.GridHelper(40,40,dark?'#23364a':'#c8d5df',dark?'#152638':'#e1e8ee');
  ground.position.y=-.03;world.add(ground);geometries.add(ground.geometry);
  (Array.isArray(ground.material)?ground.material:[ground.material]).forEach(m=>materials.add(m));
  let alive=true,frame=0,displayed={...initial},desired={...initial},highlighted:readonly string[]|null=null;
  const cameraTransition=new CameraTransition(initial.camera);
  let displayedOffsets:PartPoseOffsets={},desiredOffsets:PartPoseOffsets={};
  const cameraPreset=(id:string)=>scene.cameras.find(c=>c.id===id)||scene.cameras[0];
  const boxes=new Map(scene.entities.map(e=>[e.id,new THREE.Box3()]));
  const box=new THREE.Box3(),point3=new THREE.Vector3();
  function anchors(){
    if(!options.onAnchors)return;
    for(const bounds of boxes.values())bounds.makeEmpty();
    world.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    for(const object of pickable)if(object.visible&&boxes.has(object.userData.entity)){
      box.setFromObject(object);boxes.get(object.userData.entity)!.union(box);
    }
    const width=root.clientWidth,height=root.clientHeight;
    options.onAnchors([...boxes].map(([entity,bounds])=>{
      if(bounds.isEmpty())return {entity,x:0,y:0,visible:false};
      const explicit=supplied?.anchors?.get(entity);
      if(explicit)point3.fromArray(explicit.position).applyMatrix4(explicit.object.matrixWorld);
      else {bounds.getCenter(point3);point3.y=bounds.max.y+.18;}
      if(desired.mode==='section'&&cutPlane.distanceToPoint(point3)<0)return {entity,x:0,y:0,visible:false};
      point3.project(camera);
      return {entity,x:(point3.x+1)/2*width,y:(1-point3.y)/2*height,visible:point3.z>=-1&&point3.z<=1&&Math.abs(point3.x)<.97&&Math.abs(point3.y)<.94};
    }));
  }
  function render(){if(alive&&!context.isContextLost()){renderer.render(world,camera);if(supplied){canvas.dataset.modelMode=displayed.mode??'assembled';canvas.dataset.partPositions=JSON.stringify(Object.fromEntries([...items].map(([id,o])=>[id,o.position.toArray()])));canvas.dataset.visibleParts=JSON.stringify([...new Set(pickable.filter(o=>o.visible).map(o=>o.userData.entity))]);}canvas.dataset.cameraPosition=camera.position.toArray().map(v=>v.toFixed(4)).join(',');anchors();}}
  function place(v:SceneView,offsets:PartPoseOffsets=displayedOffsets){
    for(const p of scene.parts){const object=items.get(p.id)!,target=pose(p,v.explode,v.phase);const delta=offsets[p.id];
      object.position.fromArray(target.position.map((v,i)=>v+(delta?.position?.[i]||0)) as [number,number,number]);object.rotation.set(...target.rotation.map((v,i)=>v+(delta?.rotation?.[i]||0)) as [number,number,number]);
    }
    const range=supplied?.sectionBounds??[0,1];cutPlane.constant=-(range[0]+(range[1]-range[0])*(v.section??.5));
    for(const object of pickable){
      const active=object.userData.entity===v.selection,dim=highlighted!==null&&object.userData.entity&&!highlighted.includes(object.userData.entity);
      object.visible=v.mode!=='isolate'||v.selection==='none'||active;
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial){
        const base=original.get(material)!;
        material.emissive.copy(active?new THREE.Color(dark?'#3a7388':'#24566b'):base.emissive);material.emissiveIntensity=active ? .32 : base.intensity;
        material.transparent=!!dim;material.opacity=dim ? .18 : 1;material.depthWrite=!dim;
        material.wireframe=v.mode==='wireframe';
        const clipping=supplied&&v.mode==='section';
        const previousClipping=!!material.clippingPlanes?.length;
        material.clippingPlanes=clipping?[cutPlane]:null;
        if(previousClipping!==!!clipping)material.needsUpdate=true;
      }
    }
  }
  function stop(){cancelAnimationFrame(frame);frame=0;canvas.dataset.animating='false';}
  function applyCamera(id:string){const p=cameraPreset(id);camera.position.fromArray(p.position);controls.target.fromArray(p.target);controls.update();cameraTransition.reset(id);}
  function settle(reset=false){stop();displayed={...desired};displayedOffsets=desiredOffsets;place(displayed);if(reset)applyCamera(desired.camera);else {const end=cameraTransition.at(performance.now()+100000);if(end){camera.position.fromArray(end.position);controls.target.fromArray(end.target);controls.update();}}render();}
  function resize(){const width=Math.max(1,root.clientWidth),height=Math.max(1,root.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();}
  function hide(){if(document.hidden)settle();}
  const observer=new ResizeObserver(resize);
  const raycaster=new THREE.Raycaster(),point=new THREE.Vector2();let start:{x:number;y:number}|null=null;
  const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY};};
  const up=(e:PointerEvent)=>{
    const origin=start;start=null;if(!origin||Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>5)return;
    const rect=canvas.getBoundingClientRect();if(rect.width===0||rect.height===0)return;
    point.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(point,camera);
    const hit=raycaster.intersectObjects(pickable.filter(o=>o.visible),false).find(h=>(desired.mode!=='section'||cutPlane.distanceToPoint(h.point)>=0)&&typeof h.object.userData.entity==='string'&&(highlighted===null||highlighted.includes(h.object.userData.entity)));
    if(hit)options.onSelect(hit.object.userData.entity);
  };
  const cancelled=()=>{start=null;};
  const lost=(e:Event)=>{e.preventDefault();stop();options.onUnavailable('The WebGL context was lost. Retry 3D or keep using the outline and documents.');};
  // Direct manipulation always owns the camera until another explicit target is selected.
  const interaction=()=>{stop();cameraTransition.cancel();displayed={...desired};displayedOffsets=desiredOffsets;place(displayed);render();};
  controls.addEventListener('change',render);controls.addEventListener('start',interaction);
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancelled);canvas.addEventListener('webglcontextlost',lost);
  document.addEventListener('visibilitychange',hide);
  root.appendChild(canvas);canvas.dataset.renderer='three-webgl2';applyCamera(initial.camera);place(initial);observer.observe(root);resize();
  return {
    update(next,noMotion,nextHighlighted=null,offsets={}){
      if(!alive)return;const checkedOffsets=validatePoseOffsets(scene,offsets);stop();desired={...next};highlighted=nextHighlighted;
      const fromOffsets=displayedOffsets,offsetChanged=JSON.stringify(fromOffsets)!==JSON.stringify(checkedOffsets);desiredOffsets=checkedOffsets;
      const from={...displayed},began=performance.now(),preset=cameraPreset(next.camera);
      cameraTransition.request(next.camera,{position:camera.position.toArray(),target:controls.target.toArray()},{position:preset.position,target:preset.target},began,noMotion||document.hidden);
      const duration=noMotion||document.hidden||from.explode===next.explode&&from.phase===next.phase&&!offsetChanged?0:420;
      canvas.dataset.animating=String(duration>0||cameraTransition.active);
      const draw=(now:number)=>{if(!alive)return;const raw=duration?Math.min(1,(now-began)/duration):1,t=raw*raw*(3-2*raw);
        displayed={...next,explode:from.explode+(next.explode-from.explode)*t,phase:from.phase+(next.phase-from.phase)*t};
        displayedOffsets={};
        for(const id of new Set([...Object.keys(fromOffsets),...Object.keys(checkedOffsets)])){const out:PartPoseOffsets[string]={};for(const key of ['position','rotation'] as const){const a=fromOffsets[id]?.[key],b=checkedOffsets[id]?.[key];if(a||b)out[key]=[0,1,2].map(i=>(a?.[i]||0)+((b?.[i]||0)-(a?.[i]||0))*t) as [number,number,number];}displayedOffsets[id]=out;}
        place(displayed);
        const cameraPose=cameraTransition.at(now);if(cameraPose){camera.position.fromArray(cameraPose.position);controls.target.fromArray(cameraPose.target);controls.update();}
        render();if(raw<1||cameraTransition.active)frame=requestAnimationFrame(draw);else canvas.dataset.animating='false';
      };draw(began);
    },
    resetCamera:()=>settle(true),
    capture(){render();return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG capture failed')),'image/png'));},
    dispose(){if(!alive)return;alive=false;stop();observer.disconnect();document.removeEventListener('visibilitychange',hide);controls.removeEventListener('change',render);controls.removeEventListener('start',interaction);controls.dispose();
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancelled);canvas.removeEventListener('webglcontextlost',lost);
      if(supplied)supplied.dispose();else {geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  };
}

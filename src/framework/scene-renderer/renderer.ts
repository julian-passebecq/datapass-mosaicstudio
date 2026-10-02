import * as THREE from 'three';
import {CameraTransition} from './camera-transition';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {pose,validatePoseOffsets, type SceneSpec,type PartPoseOffsets} from '../scene';

export type SceneView = {explode:number; phase:number; camera:string; selection:string};
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
  const items=new Map<string,THREE.Object3D>(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const byPart=new Map(scene.parts.map(p=>[p.id,p]));
  const entityFor=(partId:string):string|null=>{let p=byPart.get(partId)!;while(p){if(p.entity)return p.entity;if(!p.parent)return null;p=byPart.get(p.parent)!;}return null;};
  for(const part of scene.parts){
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
  for(const p of scene.parts)(p.parent?items.get(p.parent)!:world).add(items.get(p.id)!);
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
    for(const object of items.values())if(object instanceof THREE.Mesh&&boxes.has(object.userData.entity)){
      box.setFromObject(object);boxes.get(object.userData.entity)!.union(box);
    }
    const width=root.clientWidth,height=root.clientHeight;
    options.onAnchors([...boxes].map(([entity,bounds])=>{
      if(bounds.isEmpty())return {entity,x:0,y:0,visible:false};
      bounds.getCenter(point3);point3.y=bounds.max.y+.18;point3.project(camera);
      return {entity,x:(point3.x+1)/2*width,y:(1-point3.y)/2*height,visible:point3.z>=-1&&point3.z<=1&&Math.abs(point3.x)<.97&&Math.abs(point3.y)<.94};
    }));
  }
  function render(){if(alive&&!context.isContextLost()){renderer.render(world,camera);canvas.dataset.cameraPosition=camera.position.toArray().map(v=>v.toFixed(4)).join(',');anchors();}}
  function place(v:SceneView,offsets:PartPoseOffsets=displayedOffsets){
    for(const p of scene.parts){const object=items.get(p.id)!,target=pose(p,v.explode,v.phase);const delta=offsets[p.id];
      object.position.fromArray(target.position.map((v,i)=>v+(delta?.position?.[i]||0)) as [number,number,number]);object.rotation.set(...target.rotation.map((v,i)=>v+(delta?.rotation?.[i]||0)) as [number,number,number]);
      if(object instanceof THREE.Mesh){const m=object.material as THREE.MeshStandardMaterial,active=object.userData.entity===v.selection,dim=highlighted!==null&&object.userData.entity&&!highlighted.includes(object.userData.entity);
        m.emissive.set(active?(dark?'#3a7388':'#24566b'):'#000000');m.emissiveIntensity=active?.32:0;
        m.transparent=!!dim;m.opacity=dim?.18:1;m.depthWrite=!dim;
      }
    }
  }
  function stop(){cancelAnimationFrame(frame);frame=0;canvas.dataset.animating='false';}
  function applyCamera(id:string){const p=cameraPreset(id);camera.position.fromArray(p.position);controls.target.fromArray(p.target);controls.update();cameraTransition.reset(id);}
  function settle(){stop();displayed={...desired};displayedOffsets=desiredOffsets;place(displayed);applyCamera(desired.camera);render();}
  function resize(){const width=Math.max(1,root.clientWidth),height=Math.max(1,root.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();}
  function hide(){if(document.hidden)settle();}
  const observer=new ResizeObserver(resize);
  const raycaster=new THREE.Raycaster(),point=new THREE.Vector2();let start:{x:number;y:number}|null=null;
  const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY};};
  const up=(e:PointerEvent)=>{
    const origin=start;start=null;if(!origin||Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>5)return;
    const rect=canvas.getBoundingClientRect();if(rect.width===0||rect.height===0)return;
    point.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(point,camera);
    const hit=raycaster.intersectObjects([...items.values()],false).find(h=>typeof h.object.userData.entity==='string'&&(highlighted===null||highlighted.includes(h.object.userData.entity)));
    if(hit)options.onSelect(hit.object.userData.entity);
  };
  const cancelled=()=>{start=null;};
  const lost=(e:Event)=>{e.preventDefault();stop();options.onUnavailable('The WebGL context was lost. Retry 3D or keep using the outline and documents.');};
  // Direct manipulation always owns the camera until another explicit target is selected.
  const interaction=()=>{stop();cameraTransition.cancel();};
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
    resetCamera:settle,
    capture(){render();return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG capture failed')),'image/png'));},
    dispose(){if(!alive)return;alive=false;stop();observer.disconnect();document.removeEventListener('visibilitychange',hide);controls.removeEventListener('change',render);controls.removeEventListener('start',interaction);controls.dispose();
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancelled);canvas.removeEventListener('webglcontextlost',lost);
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();canvas.remove();}
  };
}

import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {ArchSpec} from './spec.ts';
import {KIND_LABELS} from './spec.ts';
import {grid,nodePosition,route3d,layerY,worldWidth,WORLD,type Vec3} from './layout.ts';
import {buildIcon,matte,disposeIconMaterials,type Icon} from './icons.ts';
import {LAYER_TINT,KIND_COLOR} from './palette.ts';
import {cameraPosition,type Pose} from './navigation.ts';

/**
 * The layered atlas world. Rendering is on demand: `render(t, pose, view)` draws exactly one frame that
 * depends only on its arguments, so a film frame or a test capture is reproducible. HTML labels are
 * positioned from the same projection in the same call.
 */
export type View={selection:string;layer:number};
export type Stage={render(t:number,pose:Pose,view:View):void;pick(clientX:number,clientY:number):string|null;resize():void;dispose():void;canvas:HTMLCanvasElement};
const BG='#f1eee7';
const DEPTH=4.8;

function roundedRect(w:number,d:number,r:number){
  const s=new THREE.Shape(),x=-w/2,y=-d/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
  s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
/** A flat slab lying in the xz plane, top face at y=0. */
function slab(w:number,d:number,r:number,h:number,material:THREE.Material){
  const geo=new THREE.ExtrudeGeometry(roundedRect(w,d,r),{depth:h,bevelEnabled:false,curveSegments:6});
  geo.rotateX(Math.PI/2);const m=new THREE.Mesh(geo,material);m.receiveShadow=true;return m;
}
function mixColor(a:string,b:string,k:number){return '#'+new THREE.Color(a).lerp(new THREE.Color(b),k).getHexString();}
/** Polyline with rounded corners for tubes and particles. */
function roundedCurve(points:Vec3[],r=.38){
  const path=new THREE.CurvePath<THREE.Vector3>(),p=points.map(v=>new THREE.Vector3(...v));
  let cur=p[0].clone();
  for(let i=1;i<p.length;i++){
    const b=p[i];
    if(i<p.length-1){
      const c=p[i+1],k=Math.min(r,b.distanceTo(cur)/2,b.distanceTo(c)/2);
      const p1=b.clone().add(cur.clone().sub(b).normalize().multiplyScalar(k)),p2=b.clone().add(c.clone().sub(b).normalize().multiplyScalar(k));
      if(cur.distanceTo(p1)>1e-4)path.add(new THREE.LineCurve3(cur.clone(),p1));
      path.add(new THREE.QuadraticBezierCurve3(p1,b.clone(),p2));cur=p2;
    }else if(cur.distanceTo(b)>1e-4)path.add(new THREE.LineCurve3(cur.clone(),b.clone()));
  }
  return path;
}

export function createStage(host:HTMLElement,overlay:HTMLElement,spec:ArchSpec):Stage{
  const canvas=document.createElement('canvas');canvas.dataset.renderer='arch-atlas-webgl2';canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
  if(!context)throw new Error('WebGL2 is unavailable. The layered and isometric 2D diagrams remain available.');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(BG);scene.fog=new THREE.Fog(BG,30,90);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04).texture;pmrem.dispose();
  scene.environment=env;scene.environmentIntensity=.45;
  scene.add(new THREE.HemisphereLight('#fffaf2','#cfc8ba',.9));
  const key=new THREE.DirectionalLight('#fff3e3',2.1);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0005;key.shadow.normalBias=.03;key.shadow.radius=4;
  const g=grid(spec),W=worldWidth(g)+3.2,top=layerY(spec.layers.length-1);
  {const c=key.shadow.camera,half=Math.max(W,top+8)/2+4;c.left=-half;c.right=half;c.top=half;c.bottom=-half;c.near=1;c.far=140;c.updateProjectionMatrix();
    key.position.set(-14,top+28,22);key.target.position.set(0,top/2,0);scene.add(key,key.target);}
  const fill=new THREE.DirectionalLight('#e6efff',.5);fill.position.set(18,12,-10);scene.add(fill);
  const camera=new THREE.PerspectiveCamera(30,1,.1,600);
  const disposables:{dispose():void}[]=[];
  const track=<T extends {dispose():void}>(x:T)=>{disposables.push(x);return x;};

  // Ground far below, catching soft shadows so the stack feels grounded.
  const ground=new THREE.Mesh(track(new THREE.CircleGeometry(W*1.6,48)),track(new THREE.MeshStandardMaterial({color:'#e9e5dc',roughness:1})));
  ground.rotation.x=-Math.PI/2;ground.position.y=-1.1;ground.receiveShadow=true;scene.add(ground);

  /* ---------- layers ---------- */
  const lake=spec.nodes.find(n=>n.kind==='lake');
  const plates:{mesh:THREE.Mesh;material:THREE.MeshStandardMaterial;layer:number}[]=[];
  const ripples:THREE.Mesh[]=[];
  spec.layers.forEach((layer,i)=>{
    const y=layerY(i),tint=LAYER_TINT[layer.role];
    if(i===0&&lake){
      const bank=slab(W+2.6,DEPTH+2.4,1.6,.9,matte('#e3d6bd',{flatShading:false}));bank.position.y=-.02;scene.add(bank);
      const bed=slab(W+1.0,DEPTH+.8,1.1,.4,matte('#5d8c96',{flatShading:false}));bed.position.y=-.32;scene.add(bed);
      const waterMat=track(new THREE.MeshStandardMaterial({color:KIND_COLOR.lake,roughness:.22,metalness:.05,transparent:true,opacity:.9}));
      const water=new THREE.Mesh(track(new THREE.ShapeGeometry(roundedRect(W+1.0,DEPTH+.8,1.1),8)),waterMat);
      water.rotation.x=-Math.PI/2;water.position.y=.06;water.receiveShadow=true;water.userData.nodeId=lake.id;scene.add(water);
      // Shore stones (deterministic).
      for(let k=0;k<26;k++){const a=k*2.39996,x=Math.cos(a)*(W/2+.55),z=Math.sin(a*1.7)*(DEPTH/2+.6);const s=new THREE.Mesh(track(new THREE.IcosahedronGeometry(.12+((k*37)%7)*.03,0)),matte(k%3?'#c9bfae':'#b5ab9a'));s.position.set(Math.max(-W/2-.9,Math.min(W/2+.9,x)),.0,Math.sign(z||1)*(DEPTH/2+.75));s.castShadow=true;scene.add(s);}
      for(let k=0;k<7;k++){const r=new THREE.Mesh(track(new THREE.TorusGeometry(.5,.02,4,40)),track(new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.5})));
        r.rotation.x=Math.PI/2;r.position.set(((k*0.618)%1-.5)*(W-3),.08,((k*0.383)%1-.5)*(DEPTH-1.2));r.userData.phase=k/7;ripples.push(r);scene.add(r);}
      return;
    }
    const material=track(new THREE.MeshStandardMaterial({color:mixColor(tint,'#ffffff',.42),roughness:.95,transparent:true,opacity:.6,depthWrite:false}));
    const plate=slab(W,DEPTH,.9,.12,material);plate.position.y=y-.02;plate.renderOrder=-1;scene.add(plate);
    const rim=slab(W,.16,.08,.16,matte(tint,{flatShading:false}));rim.position.set(0,y-.02,DEPTH/2-.08);scene.add(rim);
    plates.push({mesh:plate,material,layer:i});
  });

  /* ---------- nodes ---------- */
  const icons=new Map<string,{icon:Icon;pos:Vec3}>(),pickables:THREE.Object3D[]=[];
  const ring=new THREE.Mesh(track(new THREE.TorusGeometry(1.42,.028,6,64)),track(new THREE.MeshBasicMaterial({color:'#2f6f84'})));ring.rotation.x=Math.PI/2;ring.visible=false;scene.add(ring);
  for(const node of spec.nodes){
    if(node.kind==='lake')continue;
    const icon=buildIcon(node.kind),pos=nodePosition(g,node.id);
    icon.group.position.set(...pos);icon.group.traverse(o=>{o.userData.nodeId=node.id;});scene.add(icon.group);pickables.push(icon.group);
    icons.set(node.id,{icon,pos});
    // Items standing on the lake layer get piles down into the water.
    const s=g.slots.get(node.id)!;
    if(lake&&s.layer===1)for(const [dx,dz] of [[-.8,-.6],[.8,-.6],[-.8,.6],[.8,.6]]){const pile=new THREE.Mesh(track(new THREE.CylinderGeometry(.05,.05,pos[1],6)),matte('#9b8b76'));pile.position.set(pos[0]+dx,pos[1]/2,dz);pile.castShadow=true;scene.add(pile);}
  }
  if(lake)pickables.push(...scene.children.filter(o=>o.userData.nodeId===lake.id));

  /* ---------- edges: pipes with flowing particles (data) or dashed tethers (control) ---------- */
  type Flow={id:string;from:string;to:string;curve:THREE.CurvePath<THREE.Vector3>;length:number;material:THREE.MeshStandardMaterial;beads:THREE.InstancedMesh|null;count:number;kind:string};
  const flows:Flow[]=[],m4=new THREE.Matrix4(),v=new THREE.Vector3();
  spec.edges.forEach((edge,i)=>{
    const curve=roundedCurve(route3d(spec,g,edge,i)),length=curve.getLength();
    const control=edge.kind==='control';
    const material=track(new THREE.MeshStandardMaterial({color:control?'#c4a77c':'#8fa9b2',roughness:.7,transparent:true,opacity:1}));
    if(!control){
      const tube=new THREE.Mesh(track(new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>,Math.max(24,Math.round(length*10)),.06,8,false)),material);tube.castShadow=true;scene.add(tube);
      const count=Math.max(2,Math.round(length/2.6)),beads=new THREE.InstancedMesh(track(new THREE.SphereGeometry(.1,10,8)),track(new THREE.MeshStandardMaterial({color:'#2f6f84',roughness:.5,emissive:'#2f6f84',emissiveIntensity:.25})),count);
      scene.add(beads);flows.push({id:edge.id,from:edge.from,to:edge.to,curve,length,material,beads,count,kind:edge.kind});
    }else{
      const dashes=Math.max(3,Math.floor(length/.32)),inst=new THREE.InstancedMesh(track(new THREE.CylinderGeometry(.035,.035,.18,6)),material,dashes);
      const up=new THREE.Vector3(0,1,0),q=new THREE.Quaternion();
      for(let k=0;k<dashes;k++){const u=(k+.5)/dashes;curve.getPointAt(u,v);const tan=curve.getTangentAt(u).normalize();q.setFromUnitVectors(up,tan);m4.compose(v,q,new THREE.Vector3(1,1,1));inst.setMatrixAt(k,m4);}
      scene.add(inst);flows.push({id:edge.id,from:edge.from,to:edge.to,curve,length,material,beads:null,count:0,kind:edge.kind});
    }
  });

  /* ---------- HTML labels ---------- */
  overlay.replaceChildren();
  const nodeLabels=new Map<string,HTMLElement>(),layerLabels:HTMLElement[]=[];
  for(const node of spec.nodes){
    const el=document.createElement('div');el.className='aa-label'+(node.kind==='lake'?' aa-label-lake':'');el.dataset.node=node.id;
    el.innerHTML='<strong></strong><small></small>';el.querySelector('strong')!.textContent=node.label;el.querySelector('small')!.textContent=KIND_LABELS[node.kind];
    overlay.appendChild(el);nodeLabels.set(node.id,el);
  }
  spec.layers.forEach((layer,i)=>{const el=document.createElement('div');el.className='aa-layer-label';el.dataset.layer=layer.id;el.style.setProperty('--tint',LAYER_TINT[layer.role]);
    el.innerHTML='<small></small><strong></strong>';el.querySelector('small')!.textContent=(i===0?'BOTTOM':'L'+i)+' · '+layer.role.toUpperCase();el.querySelector('strong')!.textContent=layer.label;overlay.appendChild(el);layerLabels.push(el);});

  host.appendChild(canvas);
  let size={width:1,height:1};
  const project=(p:Vec3)=>{v.set(...p).project(camera);return {x:(v.x*.5+.5)*size.width,y:(-v.y*.5+.5)*size.height,visible:v.z<1&&v.z>-1};};
  const dummy=new THREE.Object3D();
  function render(t:number,pose:Pose,view:View){
    camera.fov=pose.fov;camera.aspect=size.width/size.height;
    // Narrow viewports pull the camera back so the same pose frames the same content.
    const fit=Math.max(1,1.5/camera.aspect);if(fit>1)pose={...pose,distance:pose.distance*fit};
    if(pose.shift)camera.setViewOffset(size.width,size.height,-pose.shift*size.width,0,size.width,size.height);else camera.clearViewOffset();
    camera.position.set(...cameraPosition(pose));camera.lookAt(...pose.target);camera.updateProjectionMatrix();
    (scene.fog as THREE.Fog).near=pose.distance*.85;(scene.fog as THREE.Fog).far=pose.distance*3.2+20;
    for(const {icon} of icons.values())icon.update?.(t);
    ripples.forEach(r=>{const k=(t*.16+r.userData.phase)%1;r.scale.setScalar(.4+k*2.2);(r.material as THREE.MeshBasicMaterial).opacity=.45*(1-k);});
    const sel=view.selection;
    for(const f of flows){
      const on=sel==='none'||f.from===sel||f.to===sel;
      f.material.opacity=on?1:.28;f.material.depthWrite=on;
      if(f.beads){
        f.beads.visible=on;
        for(let k=0;k<f.count;k++){const u=((t*1.1/f.length)+k/f.count)%1;f.curve.getPointAt(u,v);dummy.position.copy(v);dummy.scale.setScalar(sel!=='none'&&on?1.25:1);dummy.updateMatrix();f.beads.setMatrixAt(k,dummy.matrix);}
        f.beads.instanceMatrix.needsUpdate=true;
      }
    }
    plates.forEach(p=>{p.material.opacity=p.layer===view.layer?.8:.55;});
    const focus=icons.get(sel);ring.visible=!!focus;if(focus)ring.position.set(focus.pos[0],focus.pos[1]+.02,focus.pos[2]);
    renderer.render(scene,camera);
    // Labels: under each icon's plinth front; layer names at the left front corner of each plate.
    for(const node of spec.nodes){
      const el=nodeLabels.get(node.id)!,p=node.kind==='lake'?project([-W/2+3.2,.1,DEPTH/2+.2]):project([icons.get(node.id)!.pos[0],icons.get(node.id)!.pos[1]-.05,1.45]);
      const layer=g.slots.get(node.id)!.layer,near=Math.abs(layer-view.layer)<=1||view.layer<0;
      el.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,0)`;
      el.style.opacity=!p.visible?'0':sel===node.id?'1':sel!=='none'?'.55':near?'1':'.7';
      el.classList.toggle('on',sel===node.id);
    }
    layerLabels.forEach((el,i)=>{const p=project([-W/2-.3,layerY(i)+.05,DEPTH/2]);el.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-100%,-50%)`;el.style.opacity=p.visible?'1':'0';el.classList.toggle('on',i===view.layer);});
    overlay.classList.toggle('aa-far',pose.distance>38);
    canvas.dataset.t=t.toFixed(4);
  }
  const ray=new THREE.Raycaster();
  function pick(clientX:number,clientY:number){
    const r=canvas.getBoundingClientRect(),ndc=new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
    ray.setFromCamera(ndc,camera);const hit=ray.intersectObjects(pickables,true).find(h=>h.object.userData.nodeId);
    return hit?String(hit.object.userData.nodeId):null;
  }
  function resize(){size={width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)};renderer.setSize(size.width,size.height,false);}
  resize();
  return {render,pick,resize,canvas,dispose(){
    scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)m.geometry?.dispose();});
    disposables.forEach(d=>d.dispose());disposeIconMaterials();env.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();overlay.replaceChildren();
  }};
}

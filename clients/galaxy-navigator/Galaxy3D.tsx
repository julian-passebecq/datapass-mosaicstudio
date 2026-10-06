/** 3D Galaxy (lazy chunk, the only module that imports three.js).
 * Planes at their own heights, the commons lake below, natural kind glyphs built as solids from the same
 * framework glyph parts as the isometric SVG, contract pipes coloured by status. Rendering is a pure function
 * of (t, pose, view): the rAF loop only supplies elapsed time. Camera flights are eased samples of
 * (from, to, elapsed); reduced motion jumps and holds every animation still. The tour runs on a virtual clock.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';
import {shadeColor,type GlyphKit,type GlyphPart} from '../../src/framework/motion/glyphs.ts';
import {vizTokens} from '../../src/framework/viz/index.ts';
import {GALAXY_GLYPHS,glyphName} from './glyphs.ts';
import {REGISTRY} from './registry.generated.ts';
import {GROUPS,OTHER_GROUP,shortName,STATUS_LABEL,type StatusFilter} from './registry.ts';
import {CAMERA,COMMONS,KIND_LABEL,STATUS_COLOR,TOUR_SECONDS,WORLD,buildWorld,cameraAt,clampPose,flight,focusPose,overviewPose,tourFrame,tourKeys,type P3,type Pose,type World} from './world.ts';

type Mode='light'|'dark';
export type Galaxy3DProps={filter:StatusFilter;focus:string|null;mode:Mode;reduced:boolean;capture:boolean;onSelect(id:string|null):void;tour:{open:boolean;start:number;paused:boolean}|null;onTourEnd():void};
declare global{interface Window{__galaxy3d?:{settled():boolean;pose():Pose;seek(t:number):void;duration:number;pick(x:number,y:number):string|null}}}

/* ---------- glyph parts -> three solids ---------- */
const V=(p:P3)=>new THREE.Vector3(p[0],p[2],p[1]);
function ring(x:number,y:number,z:number,r:number,plane:'xy'|'xz'='xy',n=20):P3[]{
  return [...Array(n)].map((_,i)=>{const a=i/n*Math.PI*2,c=Math.cos(a)*r,s=Math.sin(a)*r;return (plane==='xy'?[x+c,y+s,z]:[x+c,y,z+s]) as P3;});
}
const solidFaces=new WeakSet<GlyphPart>();
/** Same kit contract as the isometric exporter, but boxes are closed (six faces) so they read from any side. */
function kit3d(color:string,w:number,d:number,h:number,unit:number):GlyphKit{
  const box=(x:number,y:number,z:number,bw:number,bd:number,bh:number,c:string):GlyphPart[]=>{
    const [x0,x1,y0,y1,z1]=[x-bw/2,x+bw/2,y-bd/2,y+bd/2,z+bh];
    const faces:P3[][]=[[[x0,y1,z1],[x1,y1,z1],[x1,y1,z],[x0,y1,z]],[[x0,y0,z1],[x1,y0,z1],[x1,y0,z],[x0,y0,z]],[[x1,y0,z1],[x1,y0,z],[x1,y1,z],[x1,y1,z1]],
      [[x0,y0,z1],[x0,y0,z],[x0,y1,z],[x0,y1,z1]],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]]];
    return faces.map(points=>{const part:GlyphPart={shape:'poly',points,fill:c};solidFaces.add(part);return part;});
  };
  const frustum=(x:number,y:number,z:number,r0:number,r1:number,fh:number,c:string):GlyphPart[]=>[{shape:'hull',points:[...ring(x,y,z,r0),...ring(x,y,z+fh,r1)],fill:c}];
  return {color,w,d,h,unit,shade:shadeColor,box,frustum,circle:ring};
}
type Cache={mats:Map<string,THREE.Material>;geos:THREE.BufferGeometry[]};
function material(cache:Cache,key:string,make:()=>THREE.Material){let m=cache.mats.get(key);if(!m){m=make();cache.mats.set(key,m);}return m;}
function buildGlyph(name:string,color:string,size:P3,cache:Cache):THREE.Group{
  const unit=Math.min(size[0],size[1]),k=kit3d(color,size[0]/unit,size[1]/unit,size[2]/unit,unit);
  const glyph=GALAXY_GLYPHS[name as keyof typeof GALAXY_GLYPHS],group=new THREE.Group();
  const at=(p:P3)=>V([p[0]*unit,p[1]*unit,p[2]*unit]);
  for(const part of glyph(k)){
    if(part.shape==='poly'){
      const pts=part.points.map(at),pos:number[]=[];
      for(let i=1;i<pts.length-1;i++)for(const p of [pts[0],pts[i],pts[i+1]])pos.push(p.x,p.y,p.z);
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();cache.geos.push(g);
      const decal=!solidFaces.has(part),o=part.opacity??1;
      const m=material(cache,'p'+part.fill+o+decal,()=>new THREE.MeshStandardMaterial({color:part.fill,roughness:.75,side:THREE.DoubleSide,flatShading:true,transparent:o<1,opacity:o,...(decal?{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}:{})}));
      const mesh=new THREE.Mesh(g,m);mesh.castShadow=!decal;group.add(mesh);
    }else if(part.shape==='hull'){
      const g=new ConvexGeometry(part.points.map(at));cache.geos.push(g);
      const mesh=new THREE.Mesh(g,material(cache,'h'+part.fill,()=>new THREE.MeshStandardMaterial({color:part.fill,roughness:.6})));mesh.castShadow=true;group.add(mesh);
    }else if(part.shape==='line'){
      const g=new THREE.BufferGeometry().setFromPoints(part.points.map(at));cache.geos.push(g);
      group.add(new THREE.Line(g,material(cache,'l'+part.stroke,()=>new THREE.LineBasicMaterial({color:part.stroke}))));
    }else if(part.shape==='sphere'){
      const g=new THREE.SphereGeometry(part.r*unit,16,12);cache.geos.push(g);
      const mesh=new THREE.Mesh(g,material(cache,'s'+part.fill,()=>new THREE.MeshStandardMaterial({color:part.fill,roughness:.5})));mesh.position.copy(at(part.center));mesh.castShadow=true;group.add(mesh);
    }
  }
  return group;
}
function roundedCurve(points:P3[],radius=.3){
  const path=new THREE.CurvePath<THREE.Vector3>(),p=points.map(V);let cur=p[0].clone();
  for(let i=1;i<p.length;i++){
    const b=p[i];
    if(i<p.length-1){
      const c=p[i+1],k=Math.min(radius,b.distanceTo(cur)/2,b.distanceTo(c)/2);
      const p1=b.clone().add(cur.clone().sub(b).normalize().multiplyScalar(k)),p2=b.clone().add(c.clone().sub(b).normalize().multiplyScalar(k));
      if(cur.distanceTo(p1)>1e-4)path.add(new THREE.LineCurve3(cur.clone(),p1));
      if(k>1e-4)path.add(new THREE.QuadraticBezierCurve3(p1,b.clone(),p2));cur=p2;
    }else if(cur.distanceTo(b)>1e-4)path.add(new THREE.LineCurve3(cur.clone(),b.clone()));
  }
  return path;
}
function slab(w:number,d:number,h:number,r:number,mat:THREE.Material){
  const s=new THREE.Shape(),x=-w/2,y=-d/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,curveSegments:6});g.rotateX(Math.PI/2);
  const m=new THREE.Mesh(g,mat);m.receiveShadow=true;return m;
}

/* ---------- stage ---------- */
type View={focus:string|null;highlight:string|null};
type Stage={render(t:number,pose:Pose,view:View):void;pick(x:number,y:number):string|null;resize():void;dispose():void;aspect():number};
const THEME={light:{bg:'#eef0ee',ground:'#e2e5e1',water:'#7fb0bb',rim:'#5d8c96',label:'#1f2a30'},dark:{bg:'#11171b',ground:'#161e23',water:'#2f6170',rim:'#1f4652',label:'#e8eef0'}};

function createStage(host:HTMLElement,overlay:HTMLElement,world:World,mode:Mode,onLabel:(id:string)=>void):Stage{
  const theme=THEME[mode],tokens=vizTokens(mode);
  const canvas=document.createElement('canvas');canvas.dataset.renderer='galaxy-webgl2';canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true});
  if(!context)throw new Error('WebGL2 is unavailable here. The Isometric, Graph, Matrix and Board views show the same snapshot.');
  const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(theme.bg);scene.fog=new THREE.Fog(theme.bg,60,160);
  scene.add(new THREE.HemisphereLight(mode==='dark'?'#9fb4c4':'#fffaf2',mode==='dark'?'#20272c':'#c9c4b8',mode==='dark'?1.4:1.1));
  const b=world.bounds,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
  const key=new THREE.DirectionalLight('#fff3e3',mode==='dark'?1.6:2.2);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0005;key.shadow.normalBias=.03;
  {const c=key.shadow.camera,half=Math.max(b.x1-b.x0,b.y1-b.y0)/2+4;c.left=-half;c.right=half;c.top=half;c.bottom=-half;c.near=1;c.far=200;c.updateProjectionMatrix();}
  key.position.set(cx-18,b.z1+34,cy+26);key.target.position.set(cx,0,cy);scene.add(key,key.target);
  const fill=new THREE.DirectionalLight('#dfe9ff',.5);fill.position.set(cx+30,14,cy-20);scene.add(fill);
  const camera=new THREE.PerspectiveCamera(CAMERA.fov,1,.1,600);
  const cache:Cache={mats:new Map(),geos:[]};
  const std=(color:string,extra:THREE.MeshStandardMaterialParameters={})=>material(cache,'std'+color+JSON.stringify(extra),()=>new THREE.MeshStandardMaterial({color,roughness:.9,...extra}));
  const groupIndex=(id:string)=>Math.max(0,[...GROUPS,OTHER_GROUP].findIndex(g=>g.id===id));
  const planeColor=(id:string)=>id===COMMONS.id?(mode==='dark'?'#4f8f9d':'#5f8f9b'):tokens.categorical[groupIndex(id)%tokens.categorical.length];

  // Ground and the commons lake.
  const ground=new THREE.Mesh(new THREE.CircleGeometry(Math.max(b.x1-b.x0,b.y1-b.y0)*4,64),std(theme.ground,{roughness:1}));cache.geos.push(ground.geometry);
  ground.rotation.x=-Math.PI/2;ground.position.set(cx,-.9,cy);ground.receiveShadow=true;scene.add(ground);
  const [ex0,ey0,ex1,ey1]=world.commons.extent,lw=ex1-ex0,ld=ey1-ey0;
  const bank=slab(lw+1.6,ld+1.6,.7,1.4,std(mode==='dark'?'#2a3236':'#d9d0bd'));bank.position.set(cx,-.05,(ey0+ey1)/2);scene.add(bank);
  const water=slab(lw,ld,.3,1.1,std(theme.water,{roughness:.25,metalness:.05,transparent:true,opacity:.92}));water.position.set(cx,.02,(ey0+ey1)/2);scene.add(water);
  const ripples:THREE.Mesh[]=[];
  for(let k=0;k<9;k++){const m=new THREE.Mesh(new THREE.TorusGeometry(.6,.025,4,40),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.4}));cache.geos.push(m.geometry);
    m.rotation.x=Math.PI/2;m.position.set(ex0+((k*.618)%1)*lw,.05,ey0+((k*.383)%1)*ld);m.userData.phase=k/9;ripples.push(m);scene.add(m);}

  // Group planes, floating on thin posts.
  const plates:{mat:THREE.MeshStandardMaterial;id:string}[]=[];
  for(const p of world.planes){
    const [x0,y0,x1,y1]=p.extent,w=x1-x0+1.4,d=y1-y0+.6,c=planeColor(p.id);
    const mat=new THREE.MeshStandardMaterial({color:new THREE.Color(c).lerp(new THREE.Color(mode==='dark'?'#11171b':'#ffffff'),mode==='dark'?.45:.55),roughness:.95,transparent:true,opacity:.72,depthWrite:false});
    const plate=slab(w,d,.14,.8,mat);plate.position.set((x0+x1)/2,p.z-.02,(y0+y1)/2);plate.renderOrder=-1;scene.add(plate);plates.push({mat,id:p.id});
    const rim=slab(w,.16,.18,.06,std(c));rim.position.set((x0+x1)/2,p.z-.02,y1+.3-.08);scene.add(rim);
    for(const [px,pz] of [[x0-.4,y0],[x1+.4,y0]] as [number,number][]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,p.z,6),std(mode==='dark'?'#4a565d':'#a59a88'));cache.geos.push(post.geometry);post.position.set(px,p.z/2,pz);scene.add(post);}
  }

  // Stations: glyph solids, a shadow plinth, and the hub ring.
  const stationObjects=new Map<string,THREE.Group>(),pickables:THREE.Object3D[]=[];
  const focusRing=new THREE.Mesh(new THREE.TorusGeometry(1.25,.05,6,64),new THREE.MeshBasicMaterial({color:tokens.selection}));cache.geos.push(focusRing.geometry);focusRing.rotation.x=Math.PI/2;focusRing.visible=false;scene.add(focusRing);
  const tourRing=new THREE.Mesh(new THREE.TorusGeometry(1.4,.035,6,64),new THREE.MeshBasicMaterial({color:'#e5a65a'}));cache.geos.push(tourRing.geometry);tourRing.rotation.x=Math.PI/2;tourRing.visible=false;scene.add(tourRing);
  for(const s of world.stations){
    const g=buildGlyph(glyphName(s.kind),planeColor(s.plane),WORLD.station,cache);
    g.position.copy(V(s.position));g.traverse(o=>{o.userData.node=s.id;});scene.add(g);stationObjects.set(s.id,g);pickables.push(g);
    if(s.node.hub){const hub=new THREE.Mesh(new THREE.TorusGeometry(1.05,.06,6,48),std('#e5a65a'));cache.geos.push(hub.geometry);hub.rotation.x=Math.PI/2;hub.position.copy(V(s.position)).add(new THREE.Vector3(0,.04,0));scene.add(hub);}
  }

  // Contract pipes (bundled per pair), beads flowing on live ones.
  type Flow={from:string;to:string;mat:THREE.MeshStandardMaterial;curve:THREE.CurvePath<THREE.Vector3>;length:number;beads:THREE.InstancedMesh|null;count:number};
  const flows:Flow[]=[];
  for(const p of world.pipes){
    const curve=roundedCurve(p.route),length=curve.getLength(),radius=.035+Math.min(4,p.contracts.length-1)*.012;
    const mat=new THREE.MeshStandardMaterial({color:STATUS_COLOR[p.status],roughness:.55,transparent:true,opacity:1});
    const tube=new THREE.Mesh(new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>,Math.max(32,Math.round(length*8)),radius,6,false),mat);cache.geos.push(tube.geometry);tube.castShadow=true;scene.add(tube);
    let beads:THREE.InstancedMesh|null=null,count=0;
    if(p.status==='live'){count=Math.max(2,Math.round(length/3));beads=new THREE.InstancedMesh(new THREE.SphereGeometry(radius*2.2,8,6),std('#ffffff',{emissive:STATUS_COLOR.live,emissiveIntensity:.4}),count);cache.geos.push(beads.geometry);scene.add(beads);}
    flows.push({from:p.from,to:p.to,mat,curve,length,beads,count});
  }

  // HTML labels: stations are buttons (accessible picking), planes are captions.
  overlay.replaceChildren();
  const labels=new Map<string,HTMLButtonElement>(),planeLabels:{el:HTMLElement;at:P3}[]=[];
  for(const s of world.stations){
    const el=document.createElement('button');el.type='button';el.className='gn3-label';el.dataset.node=s.id;el.dataset.kind=s.kind;
    el.setAttribute('aria-label',`${s.node.name}, ${KIND_LABEL[s.kind]}`);
    el.innerHTML='<strong></strong><small></small>';el.querySelector('strong')!.textContent=shortName(s.node.name);el.querySelector('small')!.textContent=KIND_LABEL[s.kind];
    el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('click',e=>{e.stopPropagation();onLabel(s.id);});
    overlay.appendChild(el);labels.set(s.id,el);
  }
  for(const p of [...world.planes,world.commons]){
    const el=document.createElement('div');el.className='gn3-plane';el.dataset.plane=p.id;el.style.setProperty('--gn3-c',planeColor(p.id));
    el.innerHTML='<small></small><strong></strong>';el.querySelector('small')!.textContent=p.id===COMMONS.id?'COMMONS · z 0':'PLANE · z '+p.z;el.querySelector('strong')!.textContent=p.label;
    overlay.appendChild(el);planeLabels.push({el,at:[p.extent[0]-.4,p.extent[3]+.4,p.z+.05]});
  }
  host.appendChild(canvas);
  let size={width:1,height:1};
  const v=new THREE.Vector3(),m4=new THREE.Object3D();
  const project=(p:P3)=>{v.copy(V(p)).project(camera);return {x:(v.x*.5+.5)*size.width,y:(-v.y*.5+.5)*size.height,visible:v.z<1&&v.z>-1};};
  /** Greedy label placement in priority order: a label is shown only when it is wholly inside the stage and
   * does not overlap a label already placed; otherwise it is hidden (never clipped, never stacked). */
  type Candidate={el:HTMLElement;x:number;y:number;ax:number;visible:boolean;opacity:string;priority:number};
  const placeAll=(list:Candidate[])=>{
    const placed:{l:number;t:number;r:number;b:number}[]=[];
    for(const c of list.sort((a,b)=>a.priority-b.priority)){
      const w=c.el.offsetWidth,h=c.el.offsetHeight,left=c.x-w*c.ax,top=c.y;
      const box={l:left-2,t:top-2,r:left+w+2,b:top+h+2};
      const inside=c.visible&&left>=2&&top>=2&&left+w<=size.width-2&&top+h<=size.height-2;
      const free=!placed.some(p=>box.l<p.r&&box.r>p.l&&box.t<p.b&&box.b>p.t);
      const show=inside&&free;if(show)placed.push(box);
      c.el.style.transform=`translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`;
      c.el.style.visibility=show?'visible':'hidden';c.el.style.opacity=c.opacity;c.el.dataset.clipped=inside?'false':'true';c.el.dataset.shown=String(show);
      if(c.el instanceof HTMLButtonElement)c.el.tabIndex=show?0:-1;
    }
  };
  function render(t:number,pose:Pose,view:View){
    camera.aspect=size.width/size.height;(scene.fog as THREE.Fog).near=pose.distance*1.1;(scene.fog as THREE.Fog).far=pose.distance*2.8+30;
    const pos=cameraAt(pose);camera.position.copy(V(pos));camera.lookAt(V(pose.target));camera.updateProjectionMatrix();
    ripples.forEach(r=>{const k=(t*.12+r.userData.phase)%1;r.scale.setScalar(.4+k*2.4);(r.material as THREE.MeshBasicMaterial).opacity=.42*(1-k);});
    const sel=view.focus;
    for(const f of flows){
      const on=!sel||f.from===sel||f.to===sel;
      f.mat.opacity=on?1:.16;f.mat.depthWrite=on;
      if(f.beads){f.beads.visible=on;
        for(let k=0;k<f.count;k++){const u=((t*1.2/f.length)+k/f.count)%1;f.curve.getPointAt(u,v);m4.position.copy(v);m4.updateMatrix();f.beads.setMatrixAt(k,m4.matrix);}
        f.beads.instanceMatrix.needsUpdate=true;}
    }
    const focusStation=sel?world.byId.get(sel):undefined;focusRing.visible=!!focusStation;if(focusStation)focusRing.position.copy(V(focusStation.position)).add(new THREE.Vector3(0,.06,0));
    const hl=view.highlight?world.byId.get(view.highlight):undefined;tourRing.visible=!!hl;if(hl){tourRing.position.copy(V(hl.position)).add(new THREE.Vector3(0,.08,0));tourRing.scale.setScalar(1+.06*Math.sin(t*4));}
    const focusPlane=focusStation?.plane;plates.forEach(p=>{p.mat.opacity=focusPlane===p.id?.86:.72;});
    renderer.render(scene,camera);
    overlay.classList.toggle('gn3-far',pose.distance>34);
    const list:Candidate[]=[];
    for(const s of world.stations){
      const el=labels.get(s.id)!,p=project([s.position[0],s.position[1]+WORLD.station[1]/2+.15,s.position[2]]);
      const near=!sel||sel===s.id||flows.some(f=>(f.from===sel&&f.to===s.id)||(f.to===sel&&f.from===s.id));
      el.classList.toggle('on',sel===s.id);el.classList.toggle('hl',view.highlight===s.id);
      const depth=camera.position.distanceTo(V(s.position));
      list.push({el,x:p.x,y:p.y,ax:.5,visible:p.visible,opacity:near?'1':'.5',priority:sel===s.id?0:view.highlight===s.id?1:(near&&sel?3:5)+depth/1000});
    }
    for(const {el,at} of planeLabels){const p=project(at);list.push({el,x:p.x,y:p.y,ax:0,visible:p.visible,opacity:'1',priority:2+camera.position.distanceTo(V(at))/1000});}
    placeAll(list);
    canvas.dataset.t=t.toFixed(3);
  }
  const ray=new THREE.Raycaster();
  return {
    render,aspect:()=>size.width/size.height,
    pick(clientX,clientY){
      const r=canvas.getBoundingClientRect(),ndc=new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
      ray.setFromCamera(ndc,camera);const hit=ray.intersectObjects(pickables,true).find(h=>h.object.userData.node);return hit?String(hit.object.userData.node):null;
    },
    resize(){size={width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)};renderer.setSize(size.width,size.height,false);},
    dispose(){cache.geos.forEach(g=>g.dispose());cache.mats.forEach(m=>m.dispose());scene.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh){mesh.geometry?.dispose();const mm=mesh.material as THREE.Material;mm?.dispose?.();}});
      renderer.dispose();renderer.forceContextLoss();canvas.remove();overlay.replaceChildren();},
  };
}

/* ---------- React view ---------- */
export default function Galaxy3D({filter,focus,mode,reduced,capture,onSelect,tour,onTourEnd}:Galaxy3DProps){
  const host=useRef<HTMLDivElement>(null),overlay=useRef<HTMLDivElement>(null),stage=useRef<Stage|null>(null);
  const world=useMemo(()=>buildWorld(REGISTRY,filter),[filter]);
  const still=reduced||capture;
  const [error,setError]=useState(''),[caption,setCaption]=useState('');
  const [playing,setPlaying]=useState(false);
  // Camera state lives in refs: the rAF loop samples it, React never re-renders per frame.
  const cam=useRef<{current:Pose;from:Pose;to:Pose;start:number}|null>(null);
  const tourState=useRef<{t:number;playing:boolean;origin:number}|null>(null);
  const viewRef=useRef<View>({focus,highlight:null});viewRef.current={...viewRef.current,focus};
  const selectRef=useRef(onSelect);selectRef.current=onSelect;
  const endRef=useRef(onTourEnd);endRef.current=onTourEnd;
  const keys=useRef(tourKeys(world));
  useEffect(()=>{
    try{stage.current=createStage(host.current!,overlay.current!,world,mode,id=>selectRef.current(viewRef.current.focus===id?null:id));}catch(e){setError(e instanceof Error?e.message:String(e));return;}
    stage.current.resize();keys.current=tourKeys(world,stage.current.aspect());
    const home=overviewPose(world,stage.current.aspect()),target=viewRef.current.focus?focusPose(world,viewRef.current.focus,home):home;
    cam.current={current:target,from:target,to:target,start:-1e9};
    if(tour?.open){tourState.current={t:tour.start,playing:!tour.paused&&!still,origin:performance.now()-tour.start*1000};setPlaying(!tour.paused&&!still);}
    const observer=new ResizeObserver(()=>stage.current?.resize());observer.observe(host.current!);
    let frame=0;
    const tick=(now:number)=>{
      const c=cam.current!,ts=tourState.current;
      let t=still?0:now/1000;
      if(ts){
        if(ts.playing){ts.t=(now-ts.origin)/1000;if(ts.t>=TOUR_SECONDS){ts.t=TOUR_SECONDS;ts.playing=false;setPlaying(false);}}
        const f=tourFrame(keys.current,ts.t);c.current=f.pose;c.from=f.pose;c.to=f.pose;c.start=-1e9;viewRef.current.highlight=f.highlight;t=ts.t;
        setCaption(prev=>prev===f.caption?prev:f.caption);
      }else{viewRef.current.highlight=null;c.current=flight(c.from,c.to,now-c.start,still);}
      stage.current?.render(t,c.current,viewRef.current);
      host.current!.dataset.settled=String(!!ts&&!ts.playing||!ts&&(still||now-c.start>=CAMERA.flyMs));
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    window.__galaxy3d={settled:()=>host.current?.dataset.settled==='true',pose:()=>cam.current!.current,duration:TOUR_SECONDS,pick:(x,y)=>stage.current?.pick(x,y)??null,
      seek:t=>{tourState.current={t,playing:false,origin:0};const f=tourFrame(keys.current,t);viewRef.current.highlight=f.highlight;stage.current?.render(t,f.pose,viewRef.current);if(cam.current)cam.current.current=f.pose;setCaption(f.caption);}};
    return()=>{cancelAnimationFrame(frame);observer.disconnect();stage.current?.dispose();stage.current=null;delete window.__galaxy3d;};
    // Rebuilt only for a new world or theme; focus changes retarget the camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[world,mode,still]);
  // Focus-fly: from wherever the camera is now to the focused node (or the overview).
  useEffect(()=>{
    const c=cam.current,s=stage.current;if(!c||!s||tourState.current)return;
    const home=overviewPose(world,s.aspect());
    c.from=c.current;c.to=focus?focusPose(world,focus,c.current):{...home,azimuth:c.current.azimuth};c.start=performance.now();
    if(host.current)host.current.dataset.settled=String(still);
  },[focus,world,still]);
  const stopTour=()=>{if(tourState.current){tourState.current=null;setPlaying(false);setCaption('');endRef.current();}};
  const nudge=(d:Partial<{az:number;el:number;zoom:number}>)=>{
    stopTour();const c=cam.current;if(!c)return;
    const next=clampPose({...c.current,azimuth:c.current.azimuth+(d.az||0),elevation:c.current.elevation+(d.el||0),distance:c.current.distance*(d.zoom||1)});
    c.from=c.current;c.to=next;c.start=still?-1e9:performance.now()-CAMERA.flyMs*.55;
  };
  const reset=()=>{stopTour();const c=cam.current,s=stage.current;if(!c||!s)return;c.from=c.current;c.to=overviewPose(world,s.aspect());c.start=performance.now();onSelect(null);};
  const playTour=()=>{if(still)return;tourState.current={t:0,playing:true,origin:performance.now()};setPlaying(true);};
  // Drag to orbit; a click without drag picks a node.
  const drag=useRef<{x:number;y:number;moved:boolean}|null>(null);
  const down=(e:React.PointerEvent)=>{drag.current={x:e.clientX,y:e.clientY,moved:false};(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);};
  const move=(e:React.PointerEvent)=>{
    const d=drag.current,c=cam.current;if(!d||!c)return;
    const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved&&Math.hypot(dx,dy)<4)return;
    if(!d.moved)stopTour();d.moved=true;d.x=e.clientX;d.y=e.clientY;
    const next=clampPose({...c.current,azimuth:c.current.azimuth-dx*.006,elevation:c.current.elevation+dy*.005});c.current=next;c.from=next;c.to=next;c.start=-1e9;
  };
  const up=(e:React.PointerEvent)=>{const d=drag.current;drag.current=null;if(d&&!d.moved){const id=stage.current?.pick(e.clientX,e.clientY);if(id)onSelect(focus===id?null:id);}};
  const keyNav=(e:React.KeyboardEvent)=>{
    const map:Record<string,Partial<{az:number;el:number;zoom:number}>>={ArrowLeft:{az:-.15},ArrowRight:{az:.15},ArrowUp:{el:.1},ArrowDown:{el:-.1},'+':{zoom:.85},'=':{zoom:.85},'-':{zoom:1.18}};
    if(map[e.key]){e.preventDefault();nudge(map[e.key]);}else if(e.key==='Home'){e.preventDefault();reset();}
  };
  const legend=useMemo(()=>(['live','branch','planned','proposed'] as const).map(s=>({s,label:STATUS_LABEL[s],color:STATUS_COLOR[s]})),[]);
  return <div className="gn3" data-testid="gn-3d" data-theme={mode}>
    <div className="gn3-stage" tabIndex={0} role="application" aria-label="3D App Galaxy. Arrow keys orbit, plus and minus zoom, Home resets. Node labels are buttons."
      onKeyDown={keyNav} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;}}>
      <div className="gn3-canvas" ref={host} data-settled="false" data-testid="gn-3d-canvas"/>
      <div className="gn3-overlay" ref={overlay} data-testid="gn-3d-labels"/>
      {caption&&<div className="gn3-caption" role="status" data-testid="gn-tour-caption">{caption}</div>}
      {error&&<div className="gn3-error" role="status">{error}</div>}
    </div>
    <div className="gn3-tools" role="group" aria-label="Camera">
      <button type="button" onClick={()=>nudge({az:-.3})} aria-label="Orbit left">⟲</button>
      <button type="button" onClick={()=>nudge({az:.3})} aria-label="Orbit right">⟳</button>
      <button type="button" onClick={()=>nudge({zoom:.8})} aria-label="Zoom in">+</button>
      <button type="button" onClick={()=>nudge({zoom:1.25})} aria-label="Zoom out">−</button>
      <button type="button" onClick={reset} data-testid="gn-3d-reset">Overview</button>
      <button type="button" onClick={()=>playing?stopTour():playTour()} disabled={still&&!playing} data-testid="gn-tour" aria-pressed={playing}
        title={still?'The tour is off under reduced motion':'A 24 s camera tour on a virtual clock'}>{playing?'Stop tour':'Tour'}</button>
      <span className="gn3-legend" aria-label="Pipe colours">{legend.map(l=><span key={l.s}><i style={{background:l.color}}/>{l.label}</span>)}</span>
    </div>
  </div>;
}

import * as THREE from 'three';
import type {ConceptKind} from '../schema.ts';
import {KINDS,statusColor} from '../kinds.ts';
import type {NodeStatus} from '../schema.ts';

/**
 * Procedural low-poly icons: each kind is drawn as the thing it is (shelved warehouse, open notebook,
 * pipes with a valve, a key, a conveyor...). Matte, flat-shaded, one shared palette. Every icon sits on a
 * plinth at y=0, fits a ~2.4-unit footprint and tops out near y=1.7. `update(t)` animates only from t.
 */
export type Icon={group:THREE.Group;update?(t:number):void};
const cache=new Map<string,THREE.MeshStandardMaterial>();
export function matte(color:string,extra:Partial<THREE.MeshStandardMaterialParameters>={}):THREE.MeshStandardMaterial{
  const key=color+JSON.stringify(extra);let m=cache.get(key);
  if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.88,metalness:0,flatShading:true,...extra});cache.set(key,m);}
  return m;
}
export function disposeIconMaterials(){cache.forEach(m=>m.dispose());cache.clear();}
const STONE='#ebe6dc',INK='#33434d',PAPER='#f6f2e8',SHADE='#d9d2c4';
type V3=[number,number,number];
function mesh(geo:THREE.BufferGeometry,color:string,pos:V3=[0,0,0],rot:V3=[0,0,0],extra?:Partial<THREE.MeshStandardMaterialParameters>){
  const m=new THREE.Mesh(geo,matte(color,extra));m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;return m;
}
const box=(w:number,h:number,d:number,color:string,pos:V3=[0,0,0],rot?:V3)=>mesh(new THREE.BoxGeometry(w,h,d),color,[pos[0],pos[1]+h/2,pos[2]],rot);
/** Upright cylinders stand on pos; rotated ones are centred on pos. */
const cyl=(r:number,h:number,color:string,pos:V3=[0,0,0],seg=14,rot?:V3,r2=r)=>mesh(new THREE.CylinderGeometry(r,r2,h,seg),color,rot?pos:[pos[0],pos[1]+h/2,pos[2]],rot);
const ball=(r:number,color:string,pos:V3,detail=1)=>mesh(new THREE.IcosahedronGeometry(r,detail),color,pos);
function rod(a:V3,b:V3,r:number,color:string){
  const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),len=va.distanceTo(vb);
  const m=mesh(new THREE.CylinderGeometry(r,r,len,8),color);m.position.copy(va.clone().add(vb).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.clone().sub(va).normalize());return m;
}
/** A gable prism (roof), axis along x. */
function prism(w:number,h:number,d:number,color:string,pos:V3){
  const s=new THREE.Shape();s.moveTo(-d/2,0);s.lineTo(d/2,0);s.lineTo(0,h);s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:w,bevelEnabled:false});geo.translate(0,0,-w/2);geo.rotateY(Math.PI/2);
  return mesh(geo,color,pos);
}
function plinth(){const g=new THREE.Group();g.add(cyl(1.28,.12,STONE,[0,0,0],28));g.add(cyl(1.18,.04,SHADE,[0,.12,0],28));return g;}

function warehouse(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(2.1,.08,1.3,SHADE,[0,b,0]));
  g.add(box(2.1,1.15,.08,c,[0,b,-.6]));g.add(box(.08,1.15,1.3,c,[-1.01,b,0]));g.add(box(.08,1.15,1.3,c,[1.01,b,0]));
  const roof=prism(2.3,.42,1.55,c,[0,b+1.15,0]);g.add(roof);
  const crates=['#c99a78','#9bb0b8','#d2b071','#a7b98f','#8d9fb6','#d39a7c'];
  [.38,.74,1.08].forEach((y,row)=>{g.add(box(1.9,.04,.95,'#8e7a62',[0,b+y-.04,-.1]));
    for(let i=0;i<5;i++){if((i+row)%4===3)continue;const w=.22+((i*7+row*3)%3)*.04;g.add(box(w,.2,.38,crates[(i+row*2)%crates.length],[-.72+i*.36,b+y,-.12-(i%2)*.1]));}});
  return {group:g};
}
function lakehouse(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  const water=mesh(new THREE.CircleGeometry(.75,20),'#86b6c0',[.55,b+.01,.45],[-Math.PI/2,0,0],{roughness:.35});g.add(water);
  for(const x of [-.45,.35])for(const z of [-.45,.25])g.add(cyl(.05,.3,'#8e7a62',[x-.1,b,z]));
  g.add(box(1.25,.06,1.0,'#a58b6c',[-.1,b+.3,-.1]));
  g.add(box(1.0,.68,.8,c,[-.1,b+.36,-.1]));
  g.add(prism(1.14,.48,1.0,'#8f6f5a',[-.1,b+1.04,-.1]));
  g.add(box(.24,.4,.03,'#6d5646',[-.1,b+.36,.31]));g.add(box(.2,.18,.03,'#e9eef0',[.2,b+.66,.31]));g.add(box(.2,.18,.03,'#e9eef0',[-.4,b+.66,.31]));
  g.add(box(.12,.35,.12,'#8f6f5a',[.15,b+1.05,-.3]));
  const ripple=mesh(new THREE.TorusGeometry(.3,.012,4,28),'#ffffff',[.6,b+.03,.5],[Math.PI/2,0,0]);g.add(ripple);
  return {group:g,update(t){const k=(t*.45)%1;ripple.scale.setScalar(.6+k*1.3);(ripple.material as THREE.Material).opacity=1;}};
}
function eventhouse(c:string):Icon{
  const g=new THREE.Group(),b=.16,discs:THREE.Mesh[]=[];
  for(let i=0;i<6;i++){const d=cyl(.72,.15,i%2?c:'#a9b6c8',[0,b+i*.2,0],24);discs.push(d);g.add(d);}
  g.add(cyl(.05,1.45,INK,[0,b,0],8));
  for(let i=0;i<6;i++)g.add(box(.18,.035,.04,'#ffffff',[.62,b+i*.2+.06,.32]));
  return {group:g,update(t){discs.forEach((d,i)=>{d.rotation.y=t*.25*(i%2?1:-1);});}};
}
function database(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  for(let i=0;i<3;i++){g.add(cyl(.66,.36,i===2?'#b9c2c8':c,[0,b+i*.42,0],24));g.add(cyl(.68,.05,'#7f8a92',[0,b+i*.42+.36,0],24));}
  g.add(box(.18,.04,.02,'#7ec09a',[.3,b+.98,.6]));
  return {group:g};
}
function artifact(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  for(let i=0;i<5;i++)g.add(box(1.0,.035,1.3,i===4?PAPER:i%2?c:'#efe7d4',[(i%2)*.06-.03,b+i*.06,-(i%3)*.04],[0,(i-2)*.06,0]));
  const y=b+.31;for(let i=0;i<6;i++)g.add(box(.25+((i*5)%4)*.12,.012,.05,i===0?'#c99a78':INK,[-.32+(.25+((i*5)%4)*.12)/2-.12,y,-.42+i*.15],[0,.12,0]));
  const fold=mesh(new THREE.ConeGeometry(.14,.02,3),SHADE,[.42,y+.01,-.55],[0,.3,0]);g.add(fold);
  // Second, upright document behind the stack.
  g.add(box(.8,1.05,.04,PAPER,[.15,b,-.62],[-.12,0,0]));
  for(let i=0;i<5;i++)g.add(box(.5-(i%2)*.15,.03,.012,INK,[.05,b+.75-i*.13,-.58],[-.12,0,0]));
  return {group:g};
}
function repo(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(rod([0,b,0],[0,b+1.5,0],.07,'#6f6253'));
  const n:[V3,V3][]=[[[0,b+.45,0],[.55,b+.85,.1]],[[.55,b+.85,.1],[.55,b+1.35,.1]],[[0,b+.8,0],[-.5,b+1.15,-.1]]];
  n.forEach(([a,z])=>g.add(rod(a,z,.05,'#6f6253')));
  for(const p of [[0,b+.3,0],[0,b+.8,0],[0,b+1.5,0],[.55,b+.85,.1],[.55,b+1.35,.1],[-.5,b+1.15,-.1]] as V3[])g.add(ball(.14,p[0]===0?c:'#c9a65f',p));
  return {group:g};
}
function pipeline(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(cyl(.12,2.2,c,[-0,b+.45,0],12,[0,0,Math.PI/2]));
  for(const x of [-.95,-.45,.45,.95])g.add(cyl(.17,.08,'#7d929b',[x,b+.45,0],12,[0,0,Math.PI/2]));
  const body=cyl(.34,.8,'#b7c7cc',[0,b,0],16);g.add(body);g.add(cyl(.38,.06,'#7d929b',[0,b+.8,0],16));
  g.add(cyl(.05,.35,INK,[0,b+.86,0],8));
  const wheel=new THREE.Group();wheel.position.set(0,b+1.25,0);
  wheel.add(mesh(new THREE.TorusGeometry(.26,.04,6,18),'#c46f4e',[0,0,0],[Math.PI/2,0,0]));
  for(let i=0;i<3;i++)wheel.add(mesh(new THREE.BoxGeometry(.5,.03,.03),'#c46f4e',[0,0,0],[0,i*Math.PI/3,0]));
  g.add(wheel);
  for(const x of [-.75,.75])g.add(box(.06,.4,.3,'#7d929b',[x,b,0]));
  return {group:g,update(t){wheel.rotation.y=Math.sin(t*.7)*.6;}};
}
function notebook(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(2.1,.1,1.45,'#7c6a58',[0,b,0]));
  const page=(side:number)=>{
    const p=new THREE.Group();p.position.set(side*.5,b+.12,0);p.rotation.z=-side*.09;
    p.add(box(.98,.05,1.32,c));
    const lines=[[.5,0],[.3,.1],[.62,.1],[.4,.2],[.22,0],[.55,.1],[.36,.2],[.48,0]];
    lines.forEach(([w,ind],i)=>p.add(box(w,.012,.05,i===0||i===4?'#c99a78':i%3===1?'#7fa9b5':INK,[-.4+w/2+ind,.05,-.52+i*.14])));
    return p;
  };
  g.add(page(-1),page(1));g.add(cyl(.05,1.36,'#6c5a49',[0,b+.16,0],8,[Math.PI/2,0,0]));
  const ribbon=box(.06,.02,.5,'#c46f4e',[.18,b+.19,.6]);g.add(ribbon);
  return {group:g};
}
function stream(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  const geo=new THREE.PlaneGeometry(2.3,.42,48,1),base=geo.attributes.position.array.slice() as Float32Array;
  const ribbon=mesh(geo,c,[0,b+.75,0],[0,0,0],{side:THREE.DoubleSide,flatShading:false,roughness:.6});g.add(ribbon);
  const geo2=new THREE.PlaneGeometry(2.3,.26,48,1),base2=geo2.attributes.position.array.slice() as Float32Array;
  const ribbon2=mesh(geo2,'#b9d4da',[0,b+.45,.3],[0,0,0],{side:THREE.DoubleSide,flatShading:false,roughness:.6});g.add(ribbon2);
  const beads=[0,1,2,3].map(i=>{const m=ball(.07,'#ffffff',[0,0,0],0);g.add(m);return m;});
  for(const x of [-1.1,1.1])g.add(cyl(.04,.95,'#9aa5ad',[x,b,0],6));
  const wave=(x:number,t:number,k=1)=>Math.sin(x*2.6-t*2.2*k)*.18;
  const deform=(gm:THREE.PlaneGeometry,src:Float32Array,t:number,k:number)=>{const a=gm.attributes.position.array as Float32Array;for(let i=0;i<a.length;i+=3){const x=src[i];a[i+1]=src[i+1]+wave(x,t,k)*(.6+.4*Math.cos(x));a[i+2]=src[i+2]+Math.cos(x*2.6-t*2.2*k)*.14;}gm.attributes.position.needsUpdate=true;gm.computeVertexNormals();};
  return {group:g,update(t){deform(geo,base,t,1);deform(geo2,base2,t+.8,1.2);beads.forEach((m,i)=>{const x=((t*.55+i/4)%1)*2.2-1.1;m.position.set(x,b+.75+wave(x,t)*(.6+.4*Math.cos(x))+.06,Math.cos(x*2.6-t*2.2)*.14);});}};
}
function producer(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(1.7,.7,1.1,c,[0,b,0]));
  for(let i=0;i<3;i++){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(.567,0);s.lineTo(.567,.42);s.closePath();const geo=new THREE.ExtrudeGeometry(s,{depth:1.1,bevelEnabled:false});geo.translate(-.85+i*.567,0,-.55);g.add(mesh(geo,i===1?'#a77f66':'#9b7560',[0,b+.7,0]));
    g.add(box(.5,.3,.02,'#e3eef0',[-.57+i*.567,b+.74,.15],[.0,0,0]));}
  g.add(cyl(.12,.9,'#7b6656',[.55,b+.7,-.35],10));
  g.add(box(.3,.4,.03,'#5e4a3d',[-.4,b,.56]));
  const puffs=[0,1,2].map(()=>{const m=ball(.12,'#e8e4dc',[0,0,0],1);g.add(m);return m;});
  return {group:g,update(t){puffs.forEach((m,i)=>{const k=(t*.35+i/3)%1;m.position.set(.55+k*.25,b+1.65+k*.7,-.35);m.scale.setScalar(.6+k*.9);});}};
}
function semanticModel(c:string):Icon{
  const g=new THREE.Group(),b=.16,y=b+.9;
  g.add(cyl(.06,.6,'#9a8a6c',[0,b,0],8));
  const hub=ball(.34,c,[0,y,0],1);g.add(hub);
  const dims:V3[]=[[-.85,y+.25,-.35],[.85,y+.25,-.35],[-.75,y-.3,.5],[.75,y-.3,.5],[0,y+.6,.1]];
  const colors=['#7fa9b5','#a7b98f','#d39a7c','#8e9fb2','#c9a65f'];
  dims.forEach((p,i)=>{g.add(rod([0,y,0],p,.035,'#8d7f66'));g.add(ball(.17,colors[i],p,1));});
  return {group:g,update(t){hub.rotation.y=t*.4;}};
}
function library(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(2.0,.08,.8,'#8e7a62',[0,b,0]));
  const books=[[.24,1.1,'#a88f6e'],[.2,1.25,'#7fa9b5'],[.28,1.0,'#c99a78'],[.18,1.3,'#8f9b7a'],[.24,1.15,'#d2b071'],[.2,.95,'#8e9fb2']] as const;
  let x=-.85;books.forEach(([w,h,col],i)=>{g.add(box(w,h,.6,col,[x+w/2,b+.08,0]));g.add(box(w*.7,.04,.61,'#f1ece2',[x+w/2,b+.08+h*.78,0]));x+=w+.04;if(i===2)x+=.02;});
  g.add(box(.22,1.05,.6,c,[.75,b+.08,0],[0,0,-.32]));
  return {group:g};
}
function screen(c:string,kind:'report'|'dashboard'):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(.6,.06,.4,'#59656d',[0,b,0]));g.add(box(.1,.5,.08,'#59656d',[0,b+.06,-.05]));
  const s=new THREE.Group();s.position.set(0,b+1.05,0);s.rotation.x=-.08;g.add(s);
  s.add(mesh(new THREE.BoxGeometry(1.9,1.15,.08),'#3c4850'));
  s.add(mesh(new THREE.BoxGeometry(1.76,1.01,.02),'#f7f4ec',[0,0,.045]));
  const bars:THREE.Mesh[]=[];
  if(kind==='report'){
    const cols=['#7fa9b5','#7fa9b5','#d2b071','#7fa9b5','#c46f4e','#7fa9b5','#a7b98f'];
    cols.forEach((col,i)=>{const m=mesh(new THREE.BoxGeometry(.16,1,.03),col,[-.66+i*.22,-.4,.07]);bars.push(m);s.add(m);});
    s.add(mesh(new THREE.BoxGeometry(1.6,.012,.03),INK,[0,-.4,.07]));
    s.add(mesh(new THREE.BoxGeometry(.5,.04,.03),INK,[-.5,.4,.07]));
    return {group:g,update(t){bars.forEach((m,i)=>{const h=.18+.5*(.5+.5*Math.sin(t*1.1+i*.9))*(.5+((i*37)%5)/8);m.scale.y=h;m.position.y=-.4+h/2;});}};
  }
  // Dashboard: gauge + sparkline + tiles.
  const gauge=new THREE.Group();gauge.position.set(-.48,.06,.07);s.add(gauge);
  gauge.add(mesh(new THREE.TorusGeometry(.28,.05,6,20,Math.PI),'#d9d2c4'));
  const needle=mesh(new THREE.BoxGeometry(.03,.26,.02),'#c46f4e',[0,0,.02]);needle.geometry.translate(0,.13,0);gauge.add(needle);
  const points=12,dots:THREE.Mesh[]=[];
  for(let i=0;i<points;i++){const m=mesh(new THREE.BoxGeometry(.06,.06,.02),'#4f8a9a',[.08+i*.065,0,.07]);dots.push(m);s.add(m);}
  for(let i=0;i<3;i++)s.add(mesh(new THREE.BoxGeometry(.48,.2,.02),i===1?'#f0dcc8':'#e6eef0',[-.56+i*.56,-.34,.06]));
  return {group:g,update(t){needle.rotation.z=-1.2+Math.sin(t*.9)*.9+1.2*.5;dots.forEach((m,i)=>{m.position.y=.05+Math.sin(i*.8+t*1.6)*.12+Math.sin(i*.3)*.06;});}};
}
function api(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(2.0,.06,1.0,SHADE,[0,b,0]));
  for(const x of [-.7,.7]){g.add(box(.34,1.0,.5,c,[x,b+.06,0]));g.add(box(.42,.08,.58,'#a99a80',[x,b+.06,0]));}
  const arch=mesh(new THREE.TorusGeometry(.7,.17,6,18,Math.PI),c,[0,b+1.06,0]);g.add(arch);
  g.add(box(.2,.26,.52,'#a99a80',[0,b+1.66,0]));
  const packets=[0,1,2].map(i=>{const m=box(.16,.12,.16,i===1?'#d2b071':'#7fa9b5');g.add(m);return m;});
  return {group:g,update(t){packets.forEach((m,i)=>{const k=(t*.4+i/3)%1;m.position.set(0,b+.08,-.9+k*1.8);m.visible=k>.05&&k<.95;});}};
}
function queue(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  for(const x of [-.85,.85])for(const z of [-.25,.25])g.add(box(.08,.45,.08,'#7d7062',[x,b,z]));
  g.add(box(2.0,.1,.62,'#4d5357',[0,b+.45,0]));
  for(const x of [-1,1])g.add(cyl(.09,.66,'#9aa5ad',[x,b+.5,0],10,[Math.PI/2,0,0]));
  const crates=[0,1,2,3].map(i=>{const m=box(.3,.28,.36,['#c99a78','#d2b071','#a7b98f','#c99a78'][i]);g.add(m);return m;});
  return {group:g,update(t){crates.forEach((m,i)=>{const k=(t*.18+i/4)%1;m.position.set(-.85+k*1.7,b+.55,0);});}};
}
function identity(c:string):Icon{
  const g=new THREE.Group(),b=.16,key=new THREE.Group();
  key.position.set(0,b+.95,0);g.add(key);
  key.add(mesh(new THREE.TorusGeometry(.3,.09,8,20),c));
  key.add(mesh(new THREE.BoxGeometry(1.0,.12,.1),c,[.78,0,0]));
  key.add(mesh(new THREE.BoxGeometry(.1,.26,.1),c,[1.08,-.16,0]));key.add(mesh(new THREE.BoxGeometry(.1,.18,.1),c,[.9,-.12,0]));
  key.position.x=-.45;
  g.add(box(.5,.5,.5,'#a99a80',[-.45,b,0]));g.add(box(.62,.06,.62,'#8f826b',[-.45,b+.5,0]));
  // A gate frame behind: the key opens it.
  for(const x of [.75,1.15])g.add(box(.08,1.3,.08,'#8b8f8f',[x,b,-.45]));
  g.add(box(.5,.08,.08,'#8b8f8f',[.95,b+1.3,-.45]));
  return {group:g,update(t){key.rotation.x=Math.sin(t*.8)*.25;}};
}
function gear(r:number,teeth:number,color:string){
  const g=new THREE.Group();g.add(mesh(new THREE.CylinderGeometry(r,r,.16,teeth*2),color,[0,0,0],[Math.PI/2,0,0]));
  for(let i=0;i<teeth;i++){const a=i/teeth*Math.PI*2,m=mesh(new THREE.BoxGeometry(.16,.18,.16),color,[Math.cos(a)*(r+.06),Math.sin(a)*(r+.06),0],[0,0,a]);g.add(m);}
  g.add(mesh(new THREE.CylinderGeometry(r*.3,r*.3,.2,10),'#5d6870',[0,0,0],[Math.PI/2,0,0]));
  return g;
}
function ciRunner(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(1.8,.12,.7,SHADE,[0,b,0]));
  const big=gear(.5,10,c),small=gear(.3,7,'#c9a65f');big.position.set(-.3,b+.78,0);small.position.set(.55,b+1.15,0);g.add(big,small);
  g.add(box(.1,.6,.1,'#7d8890',[-.3,b+.12,0]));g.add(box(.08,.95,.08,'#7d8890',[.55,b+.12,0]));
  const flag=new THREE.Group();flag.position.set(.85,b+.12,.15);g.add(flag);
  flag.add(cyl(.025,.75,INK,[0,0,0],6));flag.add(mesh(new THREE.BoxGeometry(.3,.2,.02),'#6aa37f',[.15,.65,0]));
  return {group:g,update(t){big.rotation.z=t*.6;small.rotation.z=-t*.6*10/7+.2;}};
}
function staticHost(c:string):Icon{
  const g=new THREE.Group(),b=.16,leds:THREE.Mesh[]=[];
  g.add(box(1.3,.08,1.0,'#59656d',[0,b,0]));
  for(let i=0;i<4;i++){g.add(box(1.2,.3,.9,i%2?c:'#8d99a2',[0,b+.1+i*.34,0]));
    for(let k=0;k<3;k++){const m=mesh(new THREE.BoxGeometry(.06,.06,.02),'#9fd3a8',[-.42+k*.12,b+.25+i*.34,.46],[0,0,0],{emissive:'#6fbf83',emissiveIntensity:.5});leds.push(m);g.add(m);}
    g.add(box(.5,.04,.02,'#3c4850',[.25,b+.23+i*.34,.45]));}
  return {group:g,update(t){leds.forEach((m,i)=>{m.visible=Math.sin(t*3+i*1.7)>-.6;});}};
}
function browser(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  const w=new THREE.Group();w.position.set(0,b+.85,0);w.rotation.x=-.12;g.add(w);
  w.add(mesh(new THREE.BoxGeometry(1.9,1.25,.07),'#e9e5dc'));
  w.add(mesh(new THREE.BoxGeometry(1.9,.18,.08),c,[0,.535,.005]));
  [-.82,-.72,-.62].forEach((x,i)=>w.add(mesh(new THREE.BoxGeometry(.06,.06,.02),['#d17d5e','#d2b071','#8fb2a6'][i],[x,.535,.05])));
  w.add(mesh(new THREE.BoxGeometry(1.0,.08,.02),'#ffffff',[.1,.535,.05]));
  [[.9,.25],[1.2,.08],[.6,-.08],[1.0,-.24]].forEach(([wd,y],i)=>w.add(mesh(new THREE.BoxGeometry(wd,.06,.02),i===0?INK:'#9aa5ad',[-.78+wd/2,y,.045])));
  w.add(mesh(new THREE.BoxGeometry(.5,.36,.02),'#cfe0e4',[.52,-.08,.045]));
  g.add(box(.08,.5,.08,'#8d99a2',[0,b,-.1]));g.add(box(.7,.05,.4,'#8d99a2',[0,b,0]));
  return {group:g};
}
function users(c:string):Icon{
  const g=new THREE.Group(),b=.16,figs:THREE.Group[]=[];
  const colors=[c,'#7fa9b5','#a7b98f'];
  [[-.5,.1],[.05,-.2],[.55,.15]].forEach(([x,z],i)=>{const f=new THREE.Group();f.position.set(x,b,z);
    f.add(mesh(new THREE.CapsuleGeometry(.2,.42,3,8),colors[i],[0,.42,0]));f.add(ball(.17,'#e9d8c5',[0,.98,0],1));figs.push(f);g.add(f);});
  return {group:g,update(t){figs.forEach((f,i)=>{f.position.y=b+Math.max(0,Math.sin(t*1.6+i*2.1))*.04;});}};
}
function device(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(cyl(.06,1.3,'#7d8890',[-.3,b,0],8));
  g.add(box(.5,.36,.3,c,[-.3,b+.5,.1]));g.add(box(.12,.06,.02,'#9fd3a8',[-.2,b+.7,.26]));
  g.add(cyl(.02,.35,INK,[-.3,b+1.3,0],6));
  const rings=[0,1].map(()=>{const m=mesh(new THREE.TorusGeometry(.2,.018,4,24,Math.PI*.6),'#7fa9b5',[-.3,b+1.6,0],[0,0,Math.PI*.2]);g.add(m);return m;});
  g.add(cyl(.05,.9,'#7d8890',[.55,b,-.1],8));g.add(box(.36,.26,.24,'#a9b4ac',[.55,b+.55,-.1]));
  return {group:g,update(t){rings.forEach((m,i)=>{const k=(t*.6+i/2)%1;m.scale.setScalar(1+k*1.8);m.position.y=b+1.6;});}};
}
function alert(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(.18,1.4,.18,'#8b8f8f',[0,b,-.4]));g.add(box(1.0,.12,.18,'#8b8f8f',[.0,b+1.4,-.4]));
  const pts=[[0,0],[.42,0],[.4,.08],[.33,.25],[.3,.5],[.24,.62],[.12,.68],[0,.7]].map(([x,y])=>new THREE.Vector2(x,y));
  const bell=new THREE.Group();bell.position.set(.2,b+1.38,-.1);g.add(bell);
  const shell=mesh(new THREE.LatheGeometry(pts,16),c,[0,-.72,0],[0,0,0],{side:THREE.DoubleSide});bell.add(shell);
  bell.add(ball(.08,'#6d5646',[0,-.74,0],1));
  return {group:g,update(t){bell.rotation.z=Math.sin(t*2.4)*.18*Math.max(0,Math.sin(t*.5));}};
}

function app(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(.9,.06,.6,'#59656d',[0,b,0]));
  const s=new THREE.Group();s.position.set(0,b+.86,0);s.rotation.x=-.1;g.add(s);
  s.add(mesh(new THREE.BoxGeometry(.9,1.45,.1),'#3c4850'));
  s.add(mesh(new THREE.BoxGeometry(.78,1.3,.02),'#f3f6f4',[0,0,.055]));
  const tiles:THREE.Mesh[]=[];
  for(let r=0;r<3;r++)for(let k=0;k<2;k++){const m=mesh(new THREE.BoxGeometry(.28,.28,.03),(r+k)%3===1?'#d2b071':c,[-.17+k*.34,.4-r*.38,.075]);tiles.push(m);s.add(m);}
  g.add(box(.12,.5,.1,'#59656d',[0,b+.06,-.08]));
  return {group:g,update(t){tiles.forEach((m,i)=>{m.scale.setScalar(1+.06*Math.max(0,Math.sin(t*1.4-i*.9)));});}};
}
function endpoint(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(1.2,.9,.9,c,[-.2,b,0]));
  for(let i=0;i<3;i++)g.add(box(.7,.04,.02,INK,[-.25,b+.25+i*.2,.46]));
  g.add(box(.4,.36,.5,'#8b8f8f',[.55,b+.27,0]));
  for(const z of [-.12,.12])g.add(cyl(.04,.4,'#d2b071',[.95,b+.45,z],8,[0,0,Math.PI/2]));
  const pulse=ball(.08,'#7fd1a0',[-.6,b+.75,.46],1);g.add(pulse);
  return {group:g,update(t){pulse.visible=Math.sin(t*3)>-.4;}};
}
function lambda(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(1.3,.14,1.0,'#8b8f8f',[0,b,0]));
  const s=new THREE.Shape();[[.06,.86],[-.14,.46],[.02,.46],[-.08,.14],[.18,.56],[.02,.56],[.14,.86]].forEach(([x,y],i)=>i?s.lineTo(x*1.6,y*1.6):s.moveTo(x*1.6,y*1.6));s.closePath();
  const bolt=mesh(new THREE.ExtrudeGeometry(s,{depth:.16,bevelEnabled:false}),c,[0,b,-.08],[0,0,0],{emissive:c,emissiveIntensity:.15});g.add(bolt);
  return {group:g,update(t){(bolt.material as THREE.MeshStandardMaterial).emissiveIntensity=.1+.25*Math.max(0,Math.sin(t*2.2));}};
}
function user(c:string):Icon{
  const g=new THREE.Group(),b=.16,f=new THREE.Group();f.position.set(0,b,0);g.add(f);
  f.add(mesh(new THREE.CapsuleGeometry(.28,.6,3,10),c,[0,.58,0]));f.add(ball(.24,'#e9d8c5',[0,1.32,0],1));
  return {group:g,update(t){f.position.y=b+Math.max(0,Math.sin(t*1.4))*.04;}};
}
function external(c:string):Icon{
  const g=new THREE.Group(),b=.16;
  g.add(box(1.6,.08,1.0,'#9aa0a6',[0,b,0]));
  const cloud=new THREE.Group();cloud.position.set(0,b+.9,0);g.add(cloud);
  ([[-.45,0,0,.38],[.4,-.05,0,.34],[0,.2,0,.46],[.15,-.1,.25,.3],[-.2,-.1,-.25,.3]] as const).forEach(([x,y,z,r],i)=>cloud.add(ball(r,i%2?c:'#c9ced4',[x,y,z],1)));
  for(const x of [-.5,.5])g.add(cyl(.03,.55,'#8b8f8f',[x,b,0],6));
  return {group:g,update(t){cloud.position.x=Math.sin(t*.4)*.06;}};
}

const builders:Record<string,(c:string)=>Icon>={
  app,endpoint,function:lambda,user,external,warehouse,lakehouse,eventhouse,database,artifact,repo,pipeline,notebook,stream,producer,
  'semantic-model':semanticModel,library,report:c=>screen(c,'report'),dashboard:c=>screen(c,'dashboard'),
  api,queue,identity,'ci-runner':ciRunner,'static-host':staticHost,browser,users,device,alert
};
/** Icon on its plinth, built from the kind's metaphor (KINDS[kind].icon). The lake is the ground plane built by the world. */
export function buildIcon(kind:Exclude<ConceptKind,'lake'>,status:NodeStatus='active'):Icon{
  const info=KINDS[kind],icon=(builders[info.icon]??external)(statusColor(info.color,status));
  icon.group.add(plinth());
  return icon;
}
export const ICON_NAMES:readonly string[]=Object.keys(builders);

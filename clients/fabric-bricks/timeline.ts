import {kits,getKit,getBuildSteps,getBOM,collectionScene,type KitId,type BrickPart} from './kits.ts';
import type {Vec3} from '../../src/framework/scene.ts';

/**
 * Deterministic autoplay film for the Fabric Bricks product page.
 * Every value returned here is a pure function of the film time `t` (seconds):
 * the same `t` always yields the same camera, part poses and captions, so captures are reproducible.
 * The playback clock (requestAnimationFrame) only advances `t`; it never owns any state.
 * Content stays SYNTHETIC/PROVISIONAL: captions reuse existing kit copy, no new product claims.
 */
export const FILM_DURATION=25;
export const FILM_FPS=30;
export type FilmChapter={id:string;label:string;start:number;end:number;/** The settled state shown for reduced motion. */rest:number};
export const chapters:FilmChapter[]=[
  {id:'lakehouse',label:'Lakehouse build',start:0,end:5.4,rest:5},
  {id:'layers',label:'Layered view',start:5.4,end:9,rest:7.4},
  {id:'collection',label:'Collection',start:9,end:12.6,rest:11},
  {id:'onelake',label:'OneLake',start:12.6,end:18.8,rest:15},
  {id:'finale',label:'Collection',start:18.8,end:FILM_DURATION,rest:23.5},
];

/* ---------- easing (pure) ---------- */
export const clamp01=(v:number)=>v<0?0:v>1?1:v;
const lerp=(a:number,b:number,k:number)=>a+(b-a)*k;
export const smooth=(v:number)=>{const x=clamp01(v);return x*x*(3-2*x);};
export const easeInOutCubic=(v:number)=>{const x=clamp01(v);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;};
export const easeOutCubic=(v:number)=>1-Math.pow(1-clamp01(v),3);
/** Slight overshoot, like a brick pressed onto its studs. */
export const easeOutBack=(v:number)=>{const x=clamp01(v),c1=1.25,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
/** 0 before a, 1 after b, eased in between. */
const ramp=(t:number,a:number,b:number,ease=easeInOutCubic)=>ease((t-a)/(b-a));
/** Rises on [a,b], holds, falls on [c,d]. */
const pulse=(t:number,a:number,b:number,c:number,d:number)=>Math.min(ramp(t,a,b),1-ramp(t,c,d));

/* ---------- layout ---------- */
export const kitOrigin=(id:KitId):Vec3=>collectionScene.parts.find(p=>p.id===id)!.position as Vec3;
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];

/* ---------- camera (orbit keys, interpolated in spherical space) ---------- */
export type OrbitKey={t:number;target:Vec3;distance:number;azimuth:number;elevation:number;fov:number;/** horizontal framing shift, fraction of width (positive moves subject right) */shift:number};
const L=kitOrigin('lakehouse'),O=kitOrigin('onelake'),SHELF:Vec3=[1,1.6,-3];
const cameraKeys:OrbitKey[]=[
  {t:0,target:add(L,[0,.6,0]),distance:27.7,azimuth:14,elevation:36,fov:30,shift:.07},
  {t:4.8,target:add(L,[0,.95,0]),distance:24.0,azimuth:38,elevation:29,fov:30,shift:.07},
  {t:5.6,target:add(L,[0,1.05,0]),distance:23.8,azimuth:42,elevation:28,fov:30,shift:.07},
  {t:6.8,target:add(L,[0,2.6,0]),distance:29.7,azimuth:47,elevation:27,fov:30,shift:.07},
  {t:8.4,target:add(L,[0,2.65,0]),distance:29.0,azimuth:53,elevation:28,fov:30,shift:.07},
  {t:9.2,target:add(L,[0,1.2,0]),distance:25.1,azimuth:52,elevation:31,fov:30,shift:.07},
  {t:10.2,target:SHELF,distance:96,azimuth:9,elevation:40,fov:30,shift:.06},
  {t:12.5,target:SHELF,distance:93,azimuth:5,elevation:39,fov:30,shift:.06},
  {t:13.8,target:add(O,[0,1,0]),distance:23.8,azimuth:24,elevation:30,fov:30,shift:.07},
  {t:16,target:add(O,[0,1.4,0]),distance:24.4,azimuth:58,elevation:27,fov:30,shift:.07},
  {t:17.2,target:add(O,[0,2.4,0]),distance:28.4,azimuth:72,elevation:27,fov:30,shift:.07},
  {t:18.6,target:add(O,[0,1.2,0]),distance:25.1,azimuth:86,elevation:29,fov:30,shift:.07},
  {t:20.2,target:SHELF,distance:95,azimuth:10,elevation:38,fov:30,shift:.06},
  {t:FILM_DURATION,target:SHELF,distance:92,azimuth:5,elevation:37,fov:30,shift:.06},
];
export type FilmCamera={position:Vec3;target:Vec3;fov:number;shift:number;distance:number};
export function filmCamera(t:number):FilmCamera{
  const time=Math.min(FILM_DURATION,Math.max(0,t));
  let i=0;while(i<cameraKeys.length-2&&time>cameraKeys[i+1].t)i++;
  const a=cameraKeys[i],b=cameraKeys[i+1],k=easeInOutCubic((time-a.t)/(b.t-a.t));
  const target=a.target.map((v,n)=>lerp(v,b.target[n],k)) as Vec3;
  // distance interpolates geometrically so long dolly moves feel even.
  const distance=Math.exp(lerp(Math.log(a.distance),Math.log(b.distance),k));
  const az=lerp(a.azimuth,b.azimuth,k)*Math.PI/180,el=lerp(a.elevation,b.elevation,k)*Math.PI/180;
  const position:Vec3=[target[0]+distance*Math.cos(el)*Math.sin(az),target[1]+distance*Math.sin(el),target[2]+distance*Math.cos(el)*Math.cos(az)];
  return {position,target,fov:lerp(a.fov,b.fov,k),shift:lerp(a.shift,b.shift,k),distance};
}

/* ---------- part poses ---------- */
export type PartPose={visible:boolean;/** additive world offset */offset:Vec3;/** 0 = solid, 1 = fully ghosted */ghost:number;opacity:number};
type BuildWindow={start:number;end:number};
/** When each kit (re)builds. Lakehouse builds on camera; the other kits snap in for the collection reveal. */
const builds=Object.fromEntries(kits.map((k,i)=>{const n=i<2?i:i-1;// the other eleven kits snap in left to right, in catalogue order
  return [k.id,k.id==='lakehouse'?{start:.35,end:4.55}:{start:8.62+n*.08,end:9.17+n*.08}];})) as Record<KitId,BuildWindow>;
/** Exploded-view beats: amount of layer separation and the lot that stays solid while the rest is ghosted. */
const layered:Record<string,{explode:[number,number,number,number];ghost:[number,number,number,number];lot:string}>={
  lakehouse:{explode:[5.7,6.6,8.2,9.05],ghost:[6.45,6.95,7.95,8.5],lot:'boardwalk'},
  onelake:{explode:[16,16.9,17.9,18.7],ghost:[16.7,17.2,17.7,18.25],lot:'water'},
};
/** Kits that are not the subject step aside (sink + fade) during a kit close-up. */
function presence(id:KitId,t:number){
  if(id==='lakehouse'){return 1-pulse(t,12.7,13.3,19.3,20);}
  if(id==='onelake')return t<8.75?0:1;
  return t<8.75?0:1-pulse(t,12.7,13.3,19.3,20);
}
const partOrder=new Map<KitId,Map<string,{rank:number;of:number}>>();
for(const k of kits){
  const m=new Map<string,{rank:number;of:number}>();
  for(let s=1;s<=6;s++){const inStep=k.parts.filter(p=>p.step===s);inStep.forEach((p,i)=>m.set(p.id,{rank:i,of:inStep.length}));}
  partOrder.set(k.id,m);
}
const DROP=1.9,guided=new Set<KitId>(['lakehouse']);
export function partPose(kitId:KitId,part:BrickPart,t:number):PartPose{
  const w=builds[kitId],order=partOrder.get(kitId)!.get(part.id)!,stepLength=(w.end-w.start)/6;
  // A step starts at its slot; pieces inside the step are staggered over 55% of the slot, each falling for ~one slot.
  const start=w.start+(part.step-1)*stepLength+(order.of>1?order.rank/(order.of-1):0)*stepLength*.55;
  const fall=Math.max(.18,Math.min(.5,stepLength*1.05));
  const k=(t-start)/fall;
  const there=presence(kitId,t);
  if(there<=0)return {visible:false,offset:[0,0,0],ghost:0,opacity:0};
  if(k<=0){
    // Assembly guide: an on-camera build first shows the whole kit as a faint white silhouette; each piece then drops in, in colour.
    const guide=guided.has(kitId)?ramp(t,w.start-.35,w.start)*there:0;
    return guide>0?{visible:true,offset:[0,0,0],ghost:1,opacity:.24*guide}:{visible:false,offset:[0,0,0],ghost:0,opacity:0};
  }
  const drop=(1-easeOutBack(k))*DROP;
  const beat=layered[kitId];
  const explode=beat?pulse(t,...beat.explode):0;
  const ghost=Math.max(beat&&part.lot!==beat.lot?pulse(t,...beat.ghost):0,1-there);
  const lift=beat&&part.lot===beat.lot?pulse(t,...beat.ghost)*.35:0;
  const sink=(1-there)*-1.2;
  return {visible:true,offset:[0,drop+(part.step-1)*.72*explode+lift+sink,0],ghost,opacity:Math.min(clamp01(k*3.2),there)};
}
/** Opacity of the kit's display stage (contact shadow). */
export const stageOpacity=(id:KitId,t:number)=>Math.min(id==='lakehouse'?ramp(t,0,.5):ramp(t,builds[id].start-.1,builds[id].start+.3),presence(id,t));

/* ---------- captions and page panel (existing copy only) ---------- */
export type FilmCaption={key:string;eyebrow:string;title:string;body:string;opacity:number;chip?:string};
function lotChip(id:KitId,lot:string){const l=getBOM(id).find(l=>l.id===lot);return l?l.quantity+'× '+l.name+' '+l.code:'';}
const lotBeat=(id:KitId,t:number)=>{const b=layered[id];return b&&pulse(t,...b.ghost)>.5?b.lot:undefined;};
export function filmCaption(t:number):FilmCaption{
  const lake=getKit('lakehouse'),one=getKit('onelake');
  const fade=(a:number,b:number)=>pulse(t,a,a+.45,b-.45,b);
  const kitCaption=(id:KitId,a:number,b:number):FilmCaption=>{const k=getKit(id),lot=lotBeat(id,t);return {key:id,eyebrow:'MICROSOFT FABRIC · '+k.category.toUpperCase(),title:k.title,body:k.description,opacity:fade(a,b),chip:lot?lotChip(id,lot):undefined};};
  if(t<9.1)return kitCaption(lake.id,-1,9.1);
  if(t<12.8)return {key:'collection',eyebrow:'A SMALL WORLD OF DATA',title:'Big ideas. Small bricks.',body:'Explore the architecture of data, one playful little kit at a time.',opacity:fade(9.1,12.8)};
  if(t<18.9)return kitCaption(one.id,12.8,18.9);
  return {key:'finale',eyebrow:'FROM DATA TO SOMETHING TANGIBLE',title:'Twelve concept kits.',body:'One shared architecture. Pick a model. Take it apart. See how it all fits.',opacity:fade(18.9,FILM_DURATION+1)};
}
/** Right-hand page panel and transport bar state: parts list for a kit, or the kit chooser. */
export type FilmPanel={mode:'kit';kit:KitId;step:number;stepName:string;stepParts:number;exploded:boolean;lot?:string}|{mode:'gallery'};
export function filmPanel(t:number):FilmPanel{
  const id:KitId|null=t<9.1?'lakehouse':t<12.8?null:t<18.9?'onelake':null;
  if(!id)return {mode:'gallery'};
  const w=builds[id],kit=getKit(id),step=guided.has(id)?Math.min(6,Math.max(1,Math.floor((t-w.start)/((w.end-w.start)/6))+1)):6;
  const beat=layered[id];
  return {mode:'kit',kit:id,step,stepName:getBuildSteps(id)[step-1],stepParts:kit.parts.filter(p=>p.step===step).length,exploded:!!beat&&pulse(t,...beat.explode)>.5,lot:lotBeat(id,t)};
}

/* ---------- time helpers ---------- */
export const chapterAt=(t:number)=>chapters.find(c=>t<c.end)??chapters[chapters.length-1];
/** Reduced motion never animates: any requested time shows its chapter's settled end state. */
export const settledTime=(t:number,reduced:boolean)=>{const c=Math.min(FILM_DURATION,Math.max(0,t));return reduced?chapterAt(c).rest:c;};
/** Snap to the nearest captured frame so URL times and scrubbing address exact frames. */
export const frameTime=(t:number)=>Math.round(Math.min(FILM_DURATION,Math.max(0,t))*FILM_FPS)/FILM_FPS;
export function parseFilmParams(search:string){
  const q=new URLSearchParams(search),raw=q.get('t');const n=raw===null?0:Number(raw);
  return {open:q.get('film')==='1',t:Number.isFinite(n)?frameTime(n):0,paused:q.get('paused')==='1',chrome:q.get('chrome')!=='0'};
}

/** Full frame description: the single source of truth for what the film shows at `t`. */
export function filmFrame(t:number){
  const time=Math.min(FILM_DURATION,Math.max(0,t));
  return {t:time,camera:filmCamera(time),caption:filmCaption(time),panel:filmPanel(time),chapter:chapterAt(time).id,
    kits:Object.fromEntries(kits.map(k=>[k.id,{origin:kitOrigin(k.id),stage:stageOpacity(k.id,time),parts:Object.fromEntries(k.parts.map(p=>[p.id,partPose(k.id,p,time)]))}])) as Record<KitId,{origin:Vec3;stage:number;parts:Record<string,PartPose>}>};
}

import type {ConceptSpec} from './schema.ts';
import {grid,layerY,layerAt,nodePosition,domainCenterX,worldWidth,WORLD,type Vec3} from './layout.ts';

/**
 * Pure camera maths. A pose is a function of navigation state only; a transition is a pure function of
 * (from, to, elapsed). The film is a pure function of t. Nothing here reads a clock.
 */
/** shift: horizontal framing offset as a fraction of the width (positive moves the subject right). */
export type Pose={target:Vec3;distance:number;azimuth:number;elevation:number;fov:number;shift?:number};
export type Nav={layer:number;domain:number;selection:string};
export const OVERVIEW=-1;

export const clamp01=(v:number)=>v<0?0:v>1?1:v;
export const easeInOutCubic=(v:number)=>{const x=clamp01(v);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;};
export const smooth=(v:number)=>{const x=clamp01(v);return x*x*(3-2*x);};
const lerp=(a:number,b:number,k:number)=>a+(b-a)*k;
export function mixPose(a:Pose,b:Pose,k:number):Pose{
  return {target:[0,1,2].map(i=>lerp(a.target[i],b.target[i],k)) as Vec3,distance:lerp(a.distance,b.distance,k),azimuth:lerp(a.azimuth,b.azimuth,k),elevation:lerp(a.elevation,b.elevation,k),fov:lerp(a.fov,b.fov,k),shift:lerp(a.shift??0,b.shift??0,k)};
}
export const TRANSITION_MS=950;
/** Ambient (settled) 3D frames may use at most 1/AMBIENT_SHARE of the main thread and run at most AMBIENT_MAX_FPS. */
export const AMBIENT_SHARE=4,AMBIENT_MAX_FPS=30,AMBIENT_MAX_INTERVAL_MS=500;
/**
 * Next ambient frame interval from the measured cost of the last frame: a slow (software) GPU gets fewer ambient frames
 * instead of a saturated main thread. Camera transitions, resizes and selection changes are never throttled.
 */
export function ambientInterval(frameCostMs:number):number{
  const cost=Number.isFinite(frameCostMs)&&frameCostMs>0?frameCostMs:0;
  return Math.min(AMBIENT_MAX_INTERVAL_MS,Math.max(1000/AMBIENT_MAX_FPS,cost*AMBIENT_SHARE));
}
/** Eased transition sample; `elapsed` comes from whoever owns time (rAF live, or a virtual clock in tests). */
export const transition=(from:Pose,to:Pose,elapsedMs:number,reduced=false)=>reduced?to:mixPose(from,to,easeInOutCubic(elapsedMs/TRANSITION_MS));

export function overviewPose(spec:ConceptSpec):Pose{
  const g=grid(spec),top=layerY(g,spec.layers.length-1)+WORLD.iconHeight;
  // Fits the full width at a 1.5 aspect (the stage pulls back further on narrower viewports).
  return {target:[-1.2,top*.46,0],distance:(Math.max((worldWidth(g)/2+3)/.4,(top/2+3)/.27)+4)*1.12,azimuth:-16,elevation:24,fov:30};
}
export function navPose(spec:ConceptSpec,nav:Nav):Pose{
  const g=grid(spec);
  if(nav.selection!=='none'&&g.slots.has(nav.selection)){
    const [x,y]=nodePosition(g,nav.selection),lake=g.slots.get(nav.selection)!.node.kind==='lake';
    return lake?{target:[0,.3,0],distance:worldWidth(g)*.62+6,azimuth:-24,elevation:20,fov:30}:{target:[x,y+.9,0],distance:15.5,azimuth:-22,elevation:24,fov:30};
  }
  if(nav.layer===OVERVIEW)return overviewPose(spec);
  const x=nav.domain>=0&&nav.domain<spec.domains.length?domainCenterX(g,nav.domain):0;
  const wide=nav.domain<0;
  return {target:[x,layerY(g,nav.layer)+1.0,0],distance:wide?Math.max(24,worldWidth(g)*.72):18,azimuth:-18,elevation:28,fov:30};
}
export function cameraPosition(p:Pose):Vec3{
  const az=p.azimuth*Math.PI/180,el=p.elevation*Math.PI/180;
  return [p.target[0]+p.distance*Math.cos(el)*Math.sin(az),p.target[1]+p.distance*Math.sin(el),p.target[2]+p.distance*Math.cos(el)*Math.cos(az)];
}
/** Keyboard / wheel steps. Up = towards users (higher layer). Overview steps into the bottom layer. */
export function step(spec:ConceptSpec,nav:Nav,dir:'up'|'down'|'left'|'right'|'home'):Nav{
  const top=spec.layers.length-1;
  if(dir==='home')return {layer:OVERVIEW,domain:-1,selection:'none'};
  if(dir==='up'||dir==='down'){
    const base=nav.selection!=='none'?(spec.layers.findIndex(l=>l.id===spec.nodes.find(n=>n.id===nav.selection)?.layer)):nav.layer;
    const layer=base===OVERVIEW?(dir==='up'?0:top):Math.max(0,Math.min(top,base+(dir==='up'?1:-1)));
    return {layer,domain:nav.domain,selection:'none'};
  }
  const count=spec.domains.length,cur=nav.domain<0?(dir==='right'?-1:count):nav.domain;
  const domain=Math.max(0,Math.min(count-1,cur+(dir==='right'?1:-1)));
  return {layer:nav.layer===OVERVIEW?Math.min(1,top):nav.layer,domain,selection:'none'};
}

/* ---------- film (pure function of t) ---------- */
export const FILM_DURATION=28;
export const FILM_FPS=30;
export type FilmFrame={t:number;pose:Pose;selection:string;layer:number;diagram:number;panel:number;caption:{key:string;eyebrow:string;title:string;body:string;opacity:number}};
type Key={t:number;pose:Pose};
type Beat={start:number;end:number;eyebrow:string;title:string;body:string};
export function filmPlan(spec:ConceptSpec,focus:string){
  const g=grid(spec),top=spec.layers.length-1,ov=overviewPose(spec);
  const at=(layer:number,x=0,distance=17,az=-26,el=21):Pose=>({target:[x,layerY(g,layer)+1,0],distance,azimuth:az,elevation:el,fov:30});
  const keys:Key[]=[
    {t:0,pose:{target:[-3,1.7,0],distance:21,azimuth:-6,elevation:15,fov:30}},
    {t:2.6,pose:{target:[-1,2.2,0],distance:26,azimuth:-14,elevation:18,fov:30}},
  ];
  // Rise through every layer, one beat each.
  const riseStart=3.2,riseEnd=12.2,per=(riseEnd-riseStart)/Math.max(1,top);
  for(let l=1;l<=top;l++)keys.push({t:riseStart+per*l,pose:at(l,0,Math.max(22,worldWidth(g)*.62),-26-l*1.5,19)});
  // Pan across the domains at the engines layer.
  const panLayer=Math.min(2,top),panStart=13.2,panEnd=19.2,gs=spec.domains.length;
  // Each domain is framed at its populated layer nearest the pan height, so the camera never lands on an empty plate.
  const panAt=(i:number)=>{const ls=spec.nodes.filter(n=>n.kind!=='lake'&&n.domain===spec.domains[i].id).map(n=>g.slots.get(n.id)!.layer);return ls.length?ls.reduce((a,b)=>Math.abs(b-panLayer)<Math.abs(a-panLayer)||(Math.abs(b-panLayer)===Math.abs(a-panLayer)&&b<a)?b:a):panLayer;};
  for(let i=0;i<gs;i++)keys.push({t:panStart+(panEnd-panStart)*(gs===1?0:i/(gs-1)),pose:at(panAt(i),domainCenterX(g,i),16,-20,24)});
  const [fx,fy]=nodePosition(g,focus);
  keys.push({t:20.4,pose:{target:[fx,fy+.95,0],distance:9.5,azimuth:-32,elevation:18,fov:30}});
  keys.push({t:23.0,pose:{target:[fx,fy+.95,0],distance:9.0,azimuth:-40,elevation:19,fov:30}});
  keys.push({t:24.6,pose:ov});
  keys.push({t:FILM_DURATION,pose:{...ov,azimuth:ov.azimuth-4}});
  const node=spec.nodes.find(n=>n.id===focus)!;
  const beats:Beat[]=[
    {start:0,end:3.2,eyebrow:spec.layers[0].label.toUpperCase(),title:spec.layers[0].label,body:spec.layers[0].description},
    ...spec.layers.slice(1).map((l,i)=>({start:riseStart+per*i+per*.35,end:riseStart+per*(i+1)+per*.35,eyebrow:'LAYER '+(i+1)+' · '+(l.role??'layer').toUpperCase(),title:l.label,body:l.description})),
    ...spec.domains.map((gr,i)=>{const s=panStart+(panEnd-panStart)*(gs===1?0:i/(gs-1));return {start:Math.max(riseEnd+.6,s-.6),end:s+(panEnd-panStart)/Math.max(1,gs-1)-.6,eyebrow:'ACROSS · '+spec.layers[panAt(i)].label.toUpperCase(),title:gr.label,body:gr.description};}),
    {start:19.9,end:24.2,eyebrow:'FOCUS',title:node.label,body:node.description||node.label},
    {start:24.4,end:FILM_DURATION+1,eyebrow:'SAME SPEC · STATIC 2D',title:'The layered diagram',body:'The 3D atlas and this flat diagram are generated from one spec, with the same ids.'}
  ];
  return {keys,beats,focus};
}
const plans=new WeakMap<ConceptSpec,ReturnType<typeof filmPlan>>();
export function filmFrame(spec:ConceptSpec,t:number,focus=defaultFocus(spec)):FilmFrame{
  let plan=plans.get(spec);if(!plan||plan.focus!==focus){plan=filmPlan(spec,focus);plans.set(spec,plan);}
  const time=Math.max(0,Math.min(FILM_DURATION,t)),k=plan.keys;
  let i=0;while(i<k.length-2&&time>=k[i+1].t)i++;
  const a=k[i],b=k[i+1],pose={...mixPose(a.pose,b.pose,easeInOutCubic((time-a.t)/(b.t-a.t))),shift:.08};
  const beat=plan.beats.find(x=>time>=x.start&&time<x.end)??plan.beats[plan.beats.length-1];
  const fade=Math.min(smooth((time-beat.start)/.45),beat.end>FILM_DURATION?1:smooth((beat.end-time)/.45));
  const focusOn=smooth((time-20.0)/.6)*(1-smooth((time-24.0)/.5));
  const layer=layerAt(grid(spec),pose.target[1]-1);
  return {t:time,pose,selection:focusOn>.5?focus:'none',layer:Math.max(0,Math.min(spec.layers.length-1,layer)),diagram:smooth((time-25)/1.1),panel:focusOn,
    caption:{key:beat.title+beat.start,eyebrow:beat.eyebrow,title:beat.title,body:beat.body,opacity:fade}};
}
export const defaultFocus=(spec:ConceptSpec)=>(spec.nodes.find(n=>n.kind==='semantic-model')??spec.nodes.find(n=>n.kind==='api')??spec.nodes.find(n=>n.kind!=='lake')??spec.nodes[0]).id;
/** Film time is quantised to frames so a seek and a recorded frame always match. */
export const frameTime=(t:number)=>Math.round(Math.max(0,Math.min(FILM_DURATION,t))*FILM_FPS)/FILM_FPS;

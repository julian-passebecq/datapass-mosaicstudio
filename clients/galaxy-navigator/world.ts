/** Layered Galaxy world: pure, deterministic, shared by the 3D view, the isometric SVG and the camera tour.
 * Coordinates follow the framework Motion convention: x to the right, y towards the viewer, z up.
 * Each project group is a plane at its own height; repositories sit on the shared "commons" plane below
 * (like a lake every app draws from); contracts are pipes that drop from a plane's front edge, run on one lane
 * of the commons and rise to the consumer. Positions are a computed layout, not geography.
 */
import {GROUPS,OTHER_GROUP,STATUS_FILTERS,STATUS_ORDER,groupOf,strongest,type Group,type Registry,type RegistryNode,type Status,type StatusFilter} from './registry.ts';

export type P3=[number,number,number];
/** Natural kinds drawn as glyphs. Presentation config, derived from the registry kind and stack text. */
export type GlyphKind='extension'|'webapp'|'cli'|'desktop'|'doc'|'repo';
export const KIND_LABEL:Record<GlyphKind,string>={extension:'VS Code extension',webapp:'Web app',cli:'CLI / service',desktop:'Desktop app',doc:'Docs',repo:'Repository'};
/** Ordered rules: the first match wins. Edit here to reclassify; nothing else hard-codes a kind. */
export const KIND_RULES:readonly {kind:GlyphKind;test:(n:RegistryNode)=>boolean}[]=[
  {kind:'repo',test:n=>n.kind==='repo'},
  {kind:'extension',test:n=>/vs ?code extension/i.test(n.stack)},
  {kind:'desktop',test:n=>/\bwpf\b|winui|\.net\b|electron/i.test(n.stack)},
  {kind:'doc',test:n=>/^docs?\b/i.test(n.stack)},
  {kind:'webapp',test:n=>/react|svelte|vite|html|web/i.test(n.stack)},
  {kind:'cli',test:()=>true},
];
export const glyphKind=(n:RegistryNode):GlyphKind=>KIND_RULES.find(r=>r.test(n))!.kind;

/** Status colours (pipes, matrix cells, board lanes). One place, validated hex. */
export const STATUS_COLOR:Record<Status,string>={live:'#1baf7a',branch:'#eda100',planned:'#2a78d6',proposed:'#8b7fe0','no-consumer':'#98a2ab',retired:'#7d7d7d'};

/** Plane config: order left to right and height above the commons. Unlisted groups get `fallbackHeight`. */
export const PLANES={order:['datapass','atlas','mongoku','control','other'],height:{datapass:10.5,atlas:8.2,mongoku:6.2,control:4.4,other:7.2} as Record<string,number>,fallbackHeight:4.8};
export const COMMONS={id:'commons',label:'Commons: shared repos and contracts'};
/** World metrics (world units). `station` is the glyph footprint and height. */
export const WORLD={cell:3.4,gap:2.6,depth:6.8,station:[2,2,1.45] as P3,pipeLift:.12,laneStart:.9,laneStep:.13,repoGap:1.7,margin:1.6};

export type Station={id:string;node:RegistryNode;kind:GlyphKind;plane:string;position:P3;row:number};
export type Plane={id:string;label:string;group:Group|null;z:number;extent:[number,number,number,number];members:string[]};
export type Pipe={id:string;from:string;to:string;status:Status;contracts:string[];lane:number;route:P3[]};
export type World={stations:Station[];byId:Map<string,Station>;planes:Plane[];commons:Plane;pipes:Pipe[];loops:string[];bounds:{x0:number;x1:number;y0:number;y1:number;z1:number}};

const r=(v:number)=>Math.round(v*1000)/1000;
const isCommons=(n:RegistryNode)=>n.kind==='repo';

/** Build the layered world for a status filter. Same registry and filter, same world. */
export function buildWorld(registry:Registry,filter:StatusFilter='all',groups:readonly Group[]=GROUPS):World{
  const allowed=STATUS_FILTERS[filter] as readonly Status[];
  const [cell,gap,D]=[WORLD.cell,WORLD.gap,WORLD.depth];
  const byGroup=new Map<string,RegistryNode[]>();
  for(const n of registry.nodes)if(!isCommons(n)){const g=groupOf(n.id,groups).id;byGroup.set(g,[...(byGroup.get(g)||[]),n]);}
  const order=[...PLANES.order.filter(id=>byGroup.has(id)),...[...byGroup.keys()].filter(id=>!PLANES.order.includes(id)).sort()];
  const stations:Station[]=[],planes:Plane[]=[];
  let x=0;
  for(const gid of order){
    const members=[...byGroup.get(gid)!].sort((a,b)=>Number(b.hub)-Number(a.hub)||a.id.localeCompare(b.id));
    const cols=members.length<=3?members.length:Math.ceil(members.length/2),rows=Math.ceil(members.length/cols);
    const width=cols*cell,z=PLANES.height[gid]??PLANES.fallbackHeight,group=[...groups,OTHER_GROUP].find(g=>g.id===gid)!;
    members.forEach((n,i)=>{
      const col=i%cols,row=Math.floor(i/cols);
      const y=rows===1?0:row===0?D/4:-D/4;
      stations.push({id:n.id,node:n,kind:glyphKind(n),plane:gid,position:[r(x+cell*(col+.5)),y,z],row:rows===1?0:row});
    });
    planes.push({id:gid,label:group.label,group,z,extent:[r(x),-D/2,r(x+width),D/2],members:members.map(n=>n.id)});
    x+=width+gap;
  }
  const xEnd=x-gap;
  // Lanes: one per pipe, shortest spans nearest the planes.
  const pairs=new Map<string,{from:string;to:string;contracts:string[];statuses:Status[]}>(),loops:string[]=[];
  for(const e of registry.edges){
    if(!allowed.includes(e.status))continue;
    if(e.from===e.to){loops.push(e.contract);continue;}
    const id=e.from+'>'+e.to,p=pairs.get(id)??{from:e.from,to:e.to,contracts:[],statuses:[]};
    if(!p.contracts.includes(e.contract))p.contracts.push(e.contract);p.statuses.push(e.status);pairs.set(id,p);
  }
  // Commons stations: repositories, in a front row under the plane of their group (or spread at the end).
  const commonsNodes=registry.nodes.filter(isCommons).sort((a,b)=>a.id.localeCompare(b.id));
  const laneCount=pairs.size,laneDepth=WORLD.laneStart+laneCount*WORLD.laneStep;
  const repoY=r(D/2+laneDepth+WORLD.repoGap);
  const anchorX=(n:RegistryNode)=>{const p=planes.find(p=>p.id===groupOf(n.id,groups).id);return p?(p.extent[0]+p.extent[2])/2:xEnd/2;};
  const byAnchor=new Map<number,RegistryNode[]>();for(const n of commonsNodes){const a=anchorX(n);byAnchor.set(a,[...(byAnchor.get(a)||[]),n]);}
  for(const [ax,list] of byAnchor)list.forEach((n,i)=>stations.push({id:n.id,node:n,kind:'repo',plane:COMMONS.id,position:[r(ax+(i-(list.length-1)/2)*cell),repoY,0],row:0}));
  const byId=new Map(stations.map(s=>[s.id,s]));
  const xs=stations.map(s=>s.position[0]),m=WORLD.margin+WORLD.station[0]/2;
  const commons:Plane={id:COMMONS.id,label:COMMONS.label,group:null,z:0,extent:[r(Math.min(0,...xs)-m),r(-D/2-1),r(Math.max(xEnd,...xs)+m),r(repoY+m+.4)],members:commonsNodes.map(n=>n.id)};
  // Pipes. Order lanes by span, then id, so the result is stable.
  const list=[...pairs.entries()].map(([id,p])=>({id,...p,span:Math.abs(byId.get(p.from)!.position[0]-byId.get(p.to)!.position[0])}))
    .sort((a,b)=>a.span-b.span||a.id.localeCompare(b.id));
  // Each station spreads its pipes side by side (a bundle) in lane order.
  const ends=new Map<string,string[]>();for(const p of list){for(const s of [p.from,p.to])ends.set(s,[...(ends.get(s)||[]),p.id]);}
  const offset=(station:string,pipe:string)=>{const all=ends.get(station)!,k=all.indexOf(pipe),step=Math.min(.13,1.3/Math.max(1,all.length));return (k-(all.length-1)/2)*step;};
  const lift=WORLD.pipeLift,edge=D/2+.15,half=WORLD.station[1]/2;
  const leg=(s:Station,pipe:string,laneY:number):P3[]=>{
    const [sx,sy,sz]=s.position,dx=offset(s.id,pipe);
    if(s.plane===COMMONS.id)return [[r(sx+dx),r(sy-half),lift],[r(sx+dx),r(laneY),lift]];
    // Back-row stations leave through the alley to their right so the bundle never crosses a front station.
    const alley=s.row>0?cell/2:0,px=r(sx+alley+dx);
    return [...(alley?[[r(sx+half*.6),sy,sz+lift] as P3]:[]),[px,r(alley?sy:sy+half),sz+lift],[px,r(edge),sz+lift],[px,r(edge),lift],[px,r(laneY),lift]];
  };
  const pipes:Pipe[]=list.map((p,lane)=>{
    const laneY=r(D/2+WORLD.laneStart+lane*WORLD.laneStep),a=byId.get(p.from)!,b=byId.get(p.to)!;
    return {id:p.id,from:p.from,to:p.to,status:strongest(p.statuses),contracts:p.contracts,lane,route:[...leg(a,p.id,laneY),...leg(b,p.id,laneY).reverse()]};
  });
  const zs=planes.map(p=>p.z);
  return {stations,byId,planes,commons,pipes,loops,bounds:{x0:commons.extent[0],x1:commons.extent[2],y0:commons.extent[1],y1:commons.extent[3],z1:Math.max(0,...zs)+WORLD.station[2]}};
}

/** Contract matrix rows: one per contract, with the provides/consumes role of every node. */
export type MatrixRow={id:string;name:string;owner:string;status:Status;consumers:string[];roles:Record<string,'P'|'C'|'PC'>};
export type MatrixSort='status'|'id'|'owner'|'consumers'|'focus';
export function matrixRows(registry:Registry,filter:StatusFilter='all',sort:MatrixSort='status',focus:string|null=null,descending=false):MatrixRow[]{
  const allowed=STATUS_FILTERS[filter] as readonly Status[];
  const rows=registry.contracts.filter(c=>allowed.includes(c.status)).map(c=>{
    const roles:Record<string,'P'|'C'|'PC'>={[c.owner]:'P'};
    for(const x of c.consumers)roles[x]=roles[x]==='P'?'PC':'C';
    return {id:c.id,name:c.name,owner:c.owner,status:c.status,consumers:[...c.consumers],roles};
  });
  const by:Record<MatrixSort,(a:MatrixRow,b:MatrixRow)=>number>={
    status:(a,b)=>STATUS_ORDER.indexOf(a.status)-STATUS_ORDER.indexOf(b.status),
    id:(a,b)=>a.id.localeCompare(b.id),
    owner:(a,b)=>a.owner.localeCompare(b.owner),
    consumers:(a,b)=>b.consumers.length-a.consumers.length,
    focus:(a,b)=>rank(a)-rank(b),
  };
  const rank=(x:MatrixRow)=>!focus?0:x.roles[focus]==='P'||x.roles[focus]==='PC'?0:x.roles[focus]==='C'?1:2;
  const sign=descending?-1:1;
  return rows.sort((a,b)=>sign*by[sort](a,b)||a.id.localeCompare(b.id));
}
/** Matrix columns: nodes ordered by plane (left to right) then commons, as in the 3D world. */
export function matrixColumns(world:World):Station[]{
  const order=[...world.planes.map(p=>p.id),COMMONS.id];
  return [...world.stations].sort((a,b)=>order.indexOf(a.plane)-order.indexOf(b.plane)||a.position[0]-b.position[0]||a.id.localeCompare(b.id));
}
/** Status board lanes, in the order Julian reads them. Empty lanes are kept so the board shape is stable. */
export const BOARD_LANES:readonly Status[]=['live','branch','planned','retired','proposed','no-consumer'];
export function boardLanes(registry:Registry,filter:StatusFilter='all'){
  const allowed=STATUS_FILTERS[filter] as readonly Status[];
  return BOARD_LANES.filter(s=>allowed.includes(s)).map(status=>({status,contracts:registry.contracts.filter(c=>c.status===status).sort((a,b)=>a.owner.localeCompare(b.owner)||a.id.localeCompare(b.id))}));
}

/* ---------- camera: pure poses, eased samples and the tour ---------- */
/** target in world (Motion) coordinates; azimuth 0 looks from the front (+y), elevation above the horizon. */
export type Pose={target:P3;azimuth:number;elevation:number;distance:number};
export const CAMERA={fov:32,minElevation:.1,maxElevation:1.3,maxAzimuth:1.25,minDistance:7,maxDistance:170,flyMs:900};
export const clampPose=(p:Pose):Pose=>({target:p.target,azimuth:Math.max(-CAMERA.maxAzimuth,Math.min(CAMERA.maxAzimuth,p.azimuth)),elevation:Math.max(CAMERA.minElevation,Math.min(CAMERA.maxElevation,p.elevation)),distance:Math.max(CAMERA.minDistance,Math.min(CAMERA.maxDistance,p.distance))});
/** Camera position in world (Motion) coordinates. */
export function cameraAt(p:Pose):P3{
  const c=Math.cos(p.elevation);
  return [p.target[0]+p.distance*Math.sin(p.azimuth)*c,p.target[1]+p.distance*Math.cos(p.azimuth)*c,p.target[2]+p.distance*Math.sin(p.elevation)];
}
/** Smallest distance at which every given point is inside the view frustum (with a margin). Pure. */
export function fitDistance(points:readonly P3[],pose:Omit<Pose,'distance'>,aspect:number,margin=.92):number{
  const tanV=Math.tan(CAMERA.fov*Math.PI/360)*margin,tanH=tanV*aspect;
  const c=Math.cos(pose.elevation),dir:P3=[Math.sin(pose.azimuth)*c,Math.cos(pose.azimuth)*c,Math.sin(pose.elevation)];
  const f:P3=[-dir[0],-dir[1],-dir[2]],len=Math.hypot(f[1],f[0])||1,right:P3=[f[1]/len,-f[0]/len,0];
  const up:P3=[right[1]*f[2]-right[2]*f[1],right[2]*f[0]-right[0]*f[2],right[0]*f[1]-right[1]*f[0]];
  const dot=(a:P3,b:P3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const fits=(d:number)=>points.every(p=>{
    const v:P3=[p[0]-pose.target[0]-dir[0]*d,p[1]-pose.target[1]-dir[1]*d,p[2]-pose.target[2]-dir[2]*d],z=dot(v,f);
    return z>.1&&Math.abs(dot(v,right))<=z*tanH&&Math.abs(dot(v,up))<=z*tanV;
  });
  let lo=1,hi=400;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(fits(mid))hi=mid;else lo=mid;}
  return hi;
}
export function overviewPose(world:World,aspect=16/9):Pose{
  const b=world.bounds,corners:P3[]=[];
  for(const x of [b.x0-1,b.x1+1])for(const y of [b.y0-1,b.y1+1])for(const z of [0,b.z1+.6])corners.push([x,y,z]);
  const base={target:[r((b.x0+b.x1)/2),r((b.y0+b.y1)/2),r(b.z1*.3)] as P3,azimuth:-.3,elevation:.68};
  return {...base,distance:r(Math.min(CAMERA.maxDistance,fitDistance(corners,base,Math.max(.4,aspect))))};
}
export function focusPose(world:World,id:string,from:Pose):Pose{
  const s=world.byId.get(id);if(!s)return from;
  return clampPose({target:[s.position[0],s.position[1],s.position[2]+.6],azimuth:from.azimuth,elevation:Math.max(.42,Math.min(.7,from.elevation)),distance:17});
}
const smooth=(t:number)=>t<=0?0:t>=1?1:t*t*(3-2*t);
const mix=(a:number,b:number,k:number)=>a+(b-a)*k;
export function mixPose(a:Pose,b:Pose,k:number):Pose{
  const e=smooth(k);
  return {target:[0,1,2].map(i=>r(mix(a.target[i],b.target[i],e))) as P3,azimuth:r(mix(a.azimuth,b.azimuth,e)),elevation:r(mix(a.elevation,b.elevation,e)),distance:r(mix(a.distance,b.distance,e))};
}
/** Eased camera flight sample: a pure function of (from, to, elapsed). Reduced motion jumps. */
export const flight=(from:Pose,to:Pose,elapsedMs:number,reduced:boolean):Pose=>reduced?to:mixPose(from,to,elapsedMs/CAMERA.flyMs);

/** The camera tour: keyframes on a virtual clock (seconds). `highlight` is view-only, never the selection. */
export type TourKey={t:number;pose:Pose;highlight:string|null;caption:string};
export function tourKeys(world:World,aspect=16/9):TourKey[]{
  const home=overviewPose(world,aspect),pick=(ids:string[])=>ids.find(id=>world.byId.has(id))??world.stations[0].id;
  const at=(id:string,az:number,el:number,d:number):Pose=>{const s=world.byId.get(id)!;return {target:[s.position[0],s.position[1],s.position[2]+.5],azimuth:az,elevation:el,distance:d};};
  const repos=world.commons.members.length?world.commons.members:[world.stations[0].id];
  const lake:Pose={target:[r((world.bounds.x0+world.bounds.x1)/2),world.byId.get(repos[0])!.position[1]-2,0],azimuth:.18,elevation:.28,distance:r(home.distance*.62)};
  const big=pick(['datapass-vscode']),hub=world.stations.find(s=>s.node.hub)?.id??pick(['mongoku']),ctl=pick(['claude-control']);
  // Each stop is a pair of keys (arrive, leave) so the camera holds still while the caption is read.
  const stops:[number,number,Pose,string|null,string][]=[
    [0,3,{...home,azimuth:-.62},null,'Project groups float at their own heights'],
    [5.5,8,lake,repos[0],'Shared repos and contracts sit on the commons below'],
    [10.5,12.5,at(big,-.28,.42,16),big,'Contracts are pipes, coloured by status'],
    [15,17,at(hub,.36,.5,16),hub,'A hub gathers many contract pipes'],
    [19.5,21,at(ctl,-.5,.55,17),ctl,'Every pipe runs through the commons'],
    [24,24,{...home,azimuth:.4,elevation:.7},null,'One snapshot, one selection, every view'],
  ];
  return stops.flatMap(([t0,t1,pose,highlight,caption],i)=>{
    const keys:TourKey[]=[{t:t0,pose:i===0?{...home,azimuth:-.62}:pose,highlight,caption}];
    if(t1>t0)keys.push({t:t1,pose:i===0?{...home,azimuth:-.3}:pose,highlight,caption});
    return keys;
  });
}
export const TOUR_SECONDS=24;
/** Tour frame at virtual time t (seconds). Pure: same t, same pose. */
export function tourFrame(keys:readonly TourKey[],t:number):{pose:Pose;highlight:string|null;caption:string}{
  const time=Math.max(0,Math.min(keys[keys.length-1].t,t));
  let i=0;while(i<keys.length-2&&time>=keys[i+1].t)i++;
  const a=keys[i],b=keys[i+1],k=(time-a.t)/(b.t-a.t||1);
  return {pose:mixPose(a.pose,b.pose,k),highlight:k<.5?a.highlight:b.highlight,caption:k<.5?a.caption:b.caption};
}

import type {ArchSpec,ArchNode,ArchEdge} from './spec.ts';

/**
 * Pure, deterministic layout shared by every representation. The same spec always yields the same
 * columns, elevations and routes, so 3D positions, the flat SVG and the isometric SVG agree on ids and order.
 * Grid units: one column per node slot; groups are runs of columns; layers are rows (0 = bottom).
 */
export type Slot={node:ArchNode;layer:number;group:number;column:number};
export type Grid={
  slots:Map<string,Slot>;columns:number;
  groupStart:number[];groupColumns:number[];layerIndex:Map<string,number>;
};
export function grid(spec:ArchSpec):Grid{
  const layerIndex=new Map(spec.layers.map((l,i)=>[l.id,i]));
  const groupIndex=new Map(spec.groups.map((g,i)=>[g.id,i]));
  const cells=new Map<string,ArchNode[]>();
  for(const n of spec.nodes){if(n.kind==='lake')continue;const k=n.layer+'/'+n.group;cells.set(k,[...(cells.get(k)??[]),n]);}
  const groupColumns=spec.groups.map(g=>Math.max(1,...spec.layers.map(l=>cells.get(l.id+'/'+g.id)?.length??0)));
  const groupStart:number[]=[];let c=0;for(const w of groupColumns){groupStart.push(c);c+=w;}
  const slots=new Map<string,Slot>();
  for(const [key,nodes] of cells){
    const [layer,group]=key.split('/'),gi=groupIndex.get(group)!,width=groupColumns[gi];
    nodes.forEach((node,i)=>slots.set(node.id,{node,layer:layerIndex.get(layer)!,group:gi,column:groupStart[gi]+(width-nodes.length)/2+i+.5}));
  }
  for(const n of spec.nodes)if(n.kind==='lake')slots.set(n.id,{node:n,layer:0,group:0,column:c/2});
  return {slots,columns:c,groupStart,groupColumns,layerIndex};
}

/* ---------- 3D world units ---------- */
export const WORLD={column:4.6,groupGap:1.4,layerGap:4.2,iconHeight:1.7};
export type Vec3=[number,number,number];
export function worldX(g:Grid,column:number):number{
  // Group gaps add space between domains without changing column order.
  let gaps=0;for(let i=1;i<g.groupStart.length;i++)if(column>g.groupStart[i])gaps++;
  const total=g.columns*WORLD.column+(g.groupStart.length-1)*WORLD.groupGap;
  return column*WORLD.column+gaps*WORLD.groupGap-total/2;
}
export const worldWidth=(g:Grid)=>g.columns*WORLD.column+(g.groupStart.length-1)*WORLD.groupGap;
export const layerY=(layer:number)=>layer*WORLD.layerGap;
export function nodePosition(g:Grid,id:string):Vec3{const s=g.slots.get(id)!;return [s.node.kind==='lake'?0:worldX(g,s.column),layerY(s.layer),0];}
export function groupCenterX(g:Grid,group:number):number{return worldX(g,g.groupStart[group]+g.groupColumns[group]/2);}

/** Orthogonal 3D route: rise out of the source, travel in a channel between layers, drop into the target.
 * Multi-layer runs move to a riser plane behind the icons so pipes never pierce another node. */
export function route3d(spec:ArchSpec,g:Grid,edge:ArchEdge,index:number):Vec3[]{
  const a=nodePosition(g,edge.from),b=nodePosition(g,edge.to),la=g.slots.get(edge.from)!.layer,lb=g.slots.get(edge.to)!.layer;
  const lane=((index%5)-2)*.18,top=WORLD.iconHeight+.15;
  if(la===lb){
    const y=a[1]+.55+lane*.5,z=1.35;
    return [[a[0],y,.9],[a[0],y,z],[b[0],y,z],[b[0],y,.9]];
  }
  const up=lb>la,[lo,hi]=up?[a,b]:[b,a];
  const loLayer=Math.min(la,lb),hiLayer=Math.max(la,lb);
  const channelLo=layerY(loLayer)+top+.55+lane,channelHi=layerY(hiLayer)-.55+lane;
  const start:Vec3=[lo[0],lo[1]+top,0],end:Vec3=[hi[0],hi[1],0];
  let path:Vec3[];
  if(hiLayer-loLayer===1)path=[start,[lo[0],channelLo,0],[hi[0],channelLo,0],end];
  else{const zBack=-1.9-((index%3)*.25);path=[start,[lo[0],channelLo,0],[lo[0],channelLo,zBack],[hi[0],channelLo,zBack],[hi[0],channelHi,zBack],[hi[0],channelHi,0],end];}
  path=path.filter((q,i)=>i===0||q.some((v,k)=>Math.abs(v-path[i-1][k])>1e-6));
  return up?path:path.slice().reverse();
}

/* ---------- flat 2D (SVG px) ---------- */
export const FLAT={gutter:210,column:196,groupGap:34,row:150,header:118,card:{w:164,h:76},margin:36,footer:58};
export type FlatBox={x:number;y:number;w:number;h:number};
export function flatX(g:Grid,column:number):number{
  let gaps=0;for(let i=1;i<g.groupStart.length;i++)if(column>g.groupStart[i])gaps++;
  return FLAT.gutter+column*FLAT.column+gaps*FLAT.groupGap;
}
export const flatWidth=(g:Grid)=>flatX(g,g.columns)+FLAT.margin;
/** Rows are drawn top-down: the top layer of the spec is the first row. */
export const flatRowY=(spec:ArchSpec,layer:number)=>FLAT.header+(spec.layers.length-1-layer)*FLAT.row;
export const flatHeight=(spec:ArchSpec)=>FLAT.header+spec.layers.length*FLAT.row+FLAT.footer;
export function flatCard(spec:ArchSpec,g:Grid,id:string):FlatBox{
  const s=g.slots.get(id)!,cy=flatRowY(spec,s.layer)+FLAT.row/2;
  if(s.node.kind==='lake'){const x=FLAT.gutter-8,w=flatX(g,g.columns)-x+8;return {x,y:cy-FLAT.card.h/2+4,w,h:FLAT.card.h};}
  return {x:flatX(g,s.column)-FLAT.card.w/2,y:cy-FLAT.card.h/2,w:FLAT.card.w,h:FLAT.card.h};
}
export type P2=[number,number];
/** Orthogonal flat route: ports spread along card edges (ax, bx), horizontal runs in the gap between rows
 * (offset by `lane` px so parallel edges never share a line), vertical runs in free column gaps. */
export type FlatRouteOptions={ax:number;bx:number;lane:number};
export function route2d(spec:ArchSpec,g:Grid,edge:ArchEdge,o:FlatRouteOptions,occupied:(layer:number,x:number)=>boolean):P2[]{
  const sa=g.slots.get(edge.from)!,sb=g.slots.get(edge.to)!,A=flatCard(spec,g,edge.from),B=flatCard(spec,g,edge.to);
  const {ax,bx,lane}=o;
  if(sa.layer===sb.layer){
    const right=bx>ax,x0=right?A.x+A.w:B.x+B.w,x1=right?B.x:A.x;
    let blocked=false;for(let x=x0+12;x<x1-12;x+=12)if(occupied(sa.layer,x)){blocked=true;break;}
    if(!blocked){const y=A.y+A.h/2+lane;return [[right?A.x+A.w:A.x,y],[right?B.x:B.x+B.w,y]];}
    // Detour through the gap under the row so the line never crosses a neighbouring card.
    const y=flatRowY(spec,sa.layer)+FLAT.row+lane;
    return [[ax,A.y+A.h],[ax,y],[bx,y],[bx,B.y+B.h]];
  }
  const up=sb.layer>sa.layer;
  const exitY=up?A.y:A.y+A.h,enterY=up?B.y+B.h:B.y;
  const gapAfter=(layer:number,upward:boolean)=>(upward?flatRowY(spec,layer):flatRowY(spec,layer)+FLAT.row)+lane;
  const c1=gapAfter(sa.layer,up),c2=gapAfter(sb.layer,!up);
  const between=[...Array(Math.abs(sb.layer-sa.layer)-1)].map((_,i)=>up?sa.layer+1+i:sa.layer-1-i);
  if(!between.length||between.every(l=>!occupied(l,bx)))return dedupe([[ax,exitY],[ax,c1],[bx,c1],[bx,enterY]]);
  if(between.every(l=>!occupied(l,ax)))return dedupe([[ax,exitY],[ax,c2],[bx,c2],[bx,enterY]]);
  // Lane: the column gap nearest the target that is free in every intermediate row.
  const candidates=[...Array(g.columns+1)].map((_,i)=>flatX(g,i)+(i>0&&g.groupStart.includes(i)?FLAT.groupGap/2:0)).sort((p,q)=>Math.abs(p-bx)-Math.abs(q-bx)||p-q);
  const laneX=(candidates.find(x=>between.every(l=>!occupied(l,x)))??bx)+lane*.6;
  return dedupe([[ax,exitY],[ax,c1],[laneX,c1],[laneX,c2],[bx,c2],[bx,enterY]]);
}
function dedupe(p:P2[]):P2[]{return p.filter((q,i)=>i===0||q[0]!==p[i-1][0]||q[1]!==p[i-1][1]);}

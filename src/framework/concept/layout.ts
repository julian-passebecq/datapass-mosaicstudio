import type {ConceptSpec,ConceptNode,ConceptFlow} from './schema.ts';
import {fitText,textWidth,wrapText} from './text.ts';

/**
 * Pure, deterministic layout shared by every representation. The same spec always yields the same
 * columns, elevations and routes, so 3D positions, the flat SVG and the isometric SVG agree on ids and order.
 * Grid units: one column per node slot; domains are runs of columns; layers are rows (0 = bottom).
 */
export type Slot={node:ConceptNode;layer:number;domain:number;column:number};
export type Grid={
  slots:Map<string,Slot>;columns:number;
  domainStart:number[];domainColumns:number[];layerIndex:Map<string,number>;
  /** Layer elevations in levels, relative to the bottom layer. */
  heights:number[];
};
const grids=new WeakMap<ConceptSpec,Grid>();
export function grid(spec:ConceptSpec):Grid{
  const cached=grids.get(spec);if(cached)return cached;
  const layerIndex=new Map(spec.layers.map((l,i)=>[l.id,i]));
  const domainIndex=new Map(spec.domains.map((d,i)=>[d.id,i]));
  const cells=new Map<string,ConceptNode[]>();
  for(const n of spec.nodes){if(n.kind==='lake')continue;const k=n.layer+'/'+n.domain;cells.set(k,[...(cells.get(k)??[]),n]);}
  const domainColumns=spec.domains.map(d=>Math.max(1,...spec.layers.map(l=>cells.get(l.id+'/'+d.id)?.length??0)));
  const domainStart:number[]=[];let c=0;for(const w of domainColumns){domainStart.push(c);c+=w;}
  const slots=new Map<string,Slot>();
  for(const [key,nodes] of cells){
    const [layer,domain]=key.split('/'),di=domainIndex.get(domain)!,width=domainColumns[di];
    nodes.forEach((node,i)=>slots.set(node.id,{node,layer:layerIndex.get(layer)!,domain:di,column:domainStart[di]+(width-nodes.length)/2+i+.5}));
  }
  for(const n of spec.nodes)if(n.kind==='lake')slots.set(n.id,{node:n,layer:0,domain:0,column:c/2});
  const g={slots,columns:c,domainStart,domainColumns,layerIndex,heights:spec.layers.map(l=>l.height-spec.layers[0].height)};
  grids.set(spec,g);return g;
}
export const isLake=(spec:ConceptSpec,id:string)=>spec.nodes.find(n=>n.id===id)?.kind==='lake';

/* ---------- 3D world units ---------- */
export const WORLD={column:4.6,domainGap:1.4,layerGap:4.2,iconHeight:1.7};
export type Vec3=[number,number,number];
export function worldX(g:Grid,column:number):number{
  // Domain gaps add space between domains without changing column order.
  let gaps=0;for(let i=1;i<g.domainStart.length;i++)if(column>g.domainStart[i])gaps++;
  const total=g.columns*WORLD.column+(g.domainStart.length-1)*WORLD.domainGap;
  return column*WORLD.column+gaps*WORLD.domainGap-total/2;
}
export const worldWidth=(g:Grid)=>g.columns*WORLD.column+(g.domainStart.length-1)*WORLD.domainGap;
/** World elevation of a layer plane: its height (levels) times the level gap. */
export const layerY=(g:Grid,layer:number)=>g.heights[layer]*WORLD.layerGap;
/** Nearest layer to a world elevation (film captions, focus). */
export function layerAt(g:Grid,y:number):number{let best=0;g.heights.forEach((_,i)=>{if(Math.abs(layerY(g,i)-y)<Math.abs(layerY(g,best)-y))best=i;});return best;}
export function nodePosition(g:Grid,id:string):Vec3{const s=g.slots.get(id)!;return [s.node.kind==='lake'?0:worldX(g,s.column),layerY(g,s.layer),0];}
export function domainCenterX(g:Grid,domain:number):number{return worldX(g,g.domainStart[domain]+g.domainColumns[domain]/2);}

/* ---------- flat 2D layer cake (SVG px) ---------- */
export const FLAT={gutter:210,column:196,domainGap:34,row:150,card:{w:164,h:76},margin:36,noteLine:14};
export type FlatBox={x:number;y:number;w:number;h:number};
export function flatX(g:Grid,column:number):number{
  let gaps=0;for(let i=1;i<g.domainStart.length;i++)if(column>g.domainStart[i])gaps++;
  return FLAT.gutter+column*FLAT.column+gaps*FLAT.domainGap;
}
export const flatWidth=(g:Grid)=>flatX(g,g.columns)+FLAT.margin;
/** Rows are drawn top-down: the top layer of the spec is the first row. */
export const flatRowY=(spec:ConceptSpec,layer:number)=>flatHead(spec).header+(spec.layers.length-1-layer)*FLAT.row;
export type FlatHead={W:number;tag:{y:number};title:{size:number;lines:string[];y:number;step:number};subtitle:{size:number;lines:string[];y:number;step:number};
  domains:{size:number;spacing:number;lines:string[][];y:number};header:number};
const heads=new WeakMap<ConceptSpec,FlatHead>();
/** Header block of the layer cake: title and subtitle wrap (never clip), domain headers shrink then wrap. */
export function flatHead(spec:ConceptSpec):FlatHead{
  const hit=heads.get(spec);if(hit)return hit;
  const g=grid(spec),W=flatWidth(g),inner=W-2*FLAT.margin;
  const title=fitText(spec.title,inner,24,17,2,{bold:true}),tStep=Math.round(title.size*1.2);
  const tY=46,tLast=tY+(title.lines.length-1)*tStep;
  const sub=spec.subtitle?fitText(spec.subtitle,inner,13,11,3):{size:13,lines:[] as string[]},sY=tLast+24,sLast=sub.lines.length?sY+(sub.lines.length-1)*16:tLast;
  const widths=spec.domains.map((_,i)=>flatX(g,g.domainStart[i]+g.domainColumns[i])-flatX(g,g.domainStart[i])-12-16);
  let size=10.5,spacing=1.3;
  const fitsAll=()=>spec.domains.every((d,i)=>textWidth(d.label.toUpperCase(),size,{bold:true,letterSpacing:spacing})<=widths[i]);
  while(!fitsAll()&&size>8.5){size-=.5;spacing=Math.max(.4,spacing-.2);}
  const lines=spec.domains.map((d,i)=>fitText(d.label.toUpperCase(),widths[i],size,size,2,{bold:true,letterSpacing:spacing}).lines);
  const two=lines.some(l=>l.length>1);
  const dY=Math.max(112,sLast+30+(two?12:0));
  const head={W,tag:{y:22},title:{...title,y:tY,step:tStep},subtitle:{size:sub.size,lines:sub.lines,y:sY,step:16},domains:{size,spacing,lines,y:dY},header:dY+6};
  heads.set(spec,head);return head;
}
/** Footer: legend row, the provenance note (full width) and the numbered annotations, all wrapped, never clipped. */
export type FlatFoot={note:string[];annotations:string[][];height:number};
const feet=new WeakMap<ConceptSpec,FlatFoot>();
export function flatFoot(spec:ConceptSpec):FlatFoot{
  const hit=feet.get(spec);if(hit)return hit;
  const W=flatWidth(grid(spec)),inner=W-2*FLAT.margin;
  const note=wrapText(spec.note,inner,10);
  const annotations=spec.annotations.map(a=>wrapText((a.target?(spec.nodes.find(x=>x.id===a.target)?.label??a.target)+': ':'')+a.text,inner-26,10.5));
  const height=40+note.length*FLAT.noteLine+annotations.reduce((s,l)=>s+l.length*FLAT.noteLine+4,0)+(annotations.length?6:0)+14;
  const foot={note,annotations,height};feet.set(spec,foot);return foot;
}
export const flatFooter=(spec:ConceptSpec)=>flatFoot(spec).height;
export const flatHeight=(spec:ConceptSpec)=>flatHead(spec).header+spec.layers.length*FLAT.row+flatFooter(spec);
/** Right edge of the main (non-side) domains: the lake and the layer rows stop here when side bands exist. */
export function flatMainRight(spec:ConceptSpec,g:Grid):number{
  const first=spec.domains.findIndex(d=>d.placement==='side');
  return first<0?flatX(g,g.columns):flatX(g,g.domainStart[first])-FLAT.domainGap/2;
}
export function flatCard(spec:ConceptSpec,g:Grid,id:string):FlatBox{
  const s=g.slots.get(id)!,cy=flatRowY(spec,s.layer)+FLAT.row/2;
  if(s.node.kind==='lake'){const x=FLAT.gutter-8,w=flatMainRight(spec,g)-x+(spec.domains.some(d=>d.placement==='side')?-8:8);return {x,y:cy-FLAT.card.h/2+4,w,h:FLAT.card.h};}
  return {x:flatX(g,s.column)-FLAT.card.w/2,y:cy-FLAT.card.h/2,w:FLAT.card.w,h:FLAT.card.h};
}
export type P2=[number,number];
/** Orthogonal flat route: ports spread along card edges (ax, bx), horizontal runs in the gap between rows
 * (offset by `lane` px so parallel flows never share a line), vertical runs in free column gaps. */
export type FlatRouteOptions={ax:number;bx:number;lane:number};
export function route2d(spec:ConceptSpec,g:Grid,flow:ConceptFlow,o:FlatRouteOptions,occupied:(layer:number,x:number)=>boolean):P2[]{
  const sa=g.slots.get(flow.from)!,sb=g.slots.get(flow.to)!,A=flatCard(spec,g,flow.from),B=flatCard(spec,g,flow.to);
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
  const candidates=[...Array(g.columns+1)].map((_,i)=>flatX(g,i)+(i>0&&g.domainStart.includes(i)?FLAT.domainGap/2:0)).sort((p,q)=>Math.abs(p-bx)-Math.abs(q-bx)||p-q);
  const laneX=(candidates.find(x=>between.every(l=>!occupied(l,x)))??bx)+lane*.6;
  return dedupe([[ax,exitY],[ax,c1],[laneX,c1],[laneX,c2],[bx,c2],[bx,enterY]]);
}
function dedupe(p:P2[]):P2[]{return p.filter((q,i)=>i===0||q[0]!==p[i-1][0]||q[1]!==p[i-1][1]);}

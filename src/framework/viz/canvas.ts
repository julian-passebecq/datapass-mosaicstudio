/** Canvas 2D backend for dense point marks: DPR-aware drawing, quadtree hit-testing and
 * rectangle queries. Pure functions over typed arrays; no React and no timers.
 */
import {quadtree,type Quadtree} from 'd3-quadtree';
export type PointCloud={x:Float64Array;y:Float64Array;length:number};
export type Viewport={width:number;height:number;dpr:number};
export type Linear=(v:number)=>number;
export function pointCloud(xs:ArrayLike<number>,ys:ArrayLike<number>):PointCloud{
  if(xs.length!==ys.length)throw new Error('Point cloud axes differ in length');
  return {x:Float64Array.from(xs),y:Float64Array.from(ys),length:xs.length};
}
/** Size the backing store at device pixel ratio; returns a context scaled to CSS pixels. */
export function prepareCanvas(canvas:HTMLCanvasElement,view:Viewport):CanvasRenderingContext2D{
  const dpr=Math.max(1,Math.min(3,view.dpr||1)),w=Math.round(view.width*dpr),h=Math.round(view.height*dpr);
  if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  canvas.style.width=view.width+'px';canvas.style.height=view.height+'px';
  const ctx=canvas.getContext('2d',{alpha:true})!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,view.width,view.height);return ctx;
}
/** Draw points in layers. `layer(i)` returns the layer index (or -1 to skip); layers draw in order. */
export function drawPoints(ctx:CanvasRenderingContext2D,cloud:PointCloud,sx:Linear,sy:Linear,layers:readonly {color:string;alpha:number;size:number}[],layer:(i:number)=>number):number[]{
  const counts=layers.map(()=>0),buckets:number[][]=layers.map(()=>[]);
  for(let i=0;i<cloud.length;i++){const l=layer(i);if(l>=0&&l<layers.length){buckets[l]!.push(i);counts[l]!++;}}
  layers.forEach((style,l)=>{
    ctx.fillStyle=style.color;ctx.globalAlpha=style.alpha;const s=style.size,o=s/2;
    for(const i of buckets[l]!){ctx.fillRect(sx(cloud.x[i]!)-o,sy(cloud.y[i]!)-o,s,s);}
  });
  ctx.globalAlpha=1;return counts;
}
export function buildIndex(cloud:PointCloud):Quadtree<number>{
  const ids=new Array<number>(cloud.length);for(let i=0;i<cloud.length;i++)ids[i]=i;
  return quadtree<number>().x(i=>cloud.x[i]!).y(i=>cloud.y[i]!).addAll(ids);
}
/** Nearest point within `radius` data units (already converted by the caller), or -1. */
export function nearest(index:Quadtree<number>,x:number,y:number,radius:number):number{const found=index.find(x,y,radius);return found===undefined?-1:found;}
/** Count / collect point ids inside a data-space rectangle using the quadtree's pruning. */
export function pointsInRect(index:Quadtree<number>,cloud:PointCloud,x0:number,x1:number,y0:number,y1:number,collect=false):{count:number;ids:number[]}{
  const lx=Math.min(x0,x1),hx=Math.max(x0,x1),ly=Math.min(y0,y1),hy=Math.max(y0,y1),ids:number[]=[];let count=0;
  index.visit((node,ax,ay,bx,by)=>{
    if(!node.length){let leaf:typeof node|undefined=node;do{const i=(leaf as {data:number}).data,px=cloud.x[i]!,py=cloud.y[i]!;if(px>=lx&&px<=hx&&py>=ly&&py<=hy){count++;if(collect)ids.push(i);}leaf=(leaf as {next?:typeof node}).next;}while(leaf);}
    return ax>hx||bx<lx||ay>hy||by<ly;
  });
  return {count,ids};
}

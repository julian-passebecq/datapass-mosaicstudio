/** Pure helpers for the 3D marks (no three.js, no DOM): lasso hit-testing, colour ramps, scales. */
import {lerp} from '../motion.ts';

export function rgb(hex:string):[number,number,number]{const n=parseInt(hex.replace('#','').slice(0,6),16);return Number.isFinite(n)&&/^#?[0-9a-f]{6}/i.test(hex)?[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]:[0.5,0.5,0.5];}
/** Sample a token ramp at t in [0,1] (sRGB, piecewise linear). */
export function ramp(stops:readonly string[],t:number):[number,number,number]{
  if(!stops.length)return [0.5,0.5,0.5];
  if(stops.length===1)return rgb(stops[0]!);
  const x=Math.max(0,Math.min(1,t))*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),f=x-i;
  const a=rgb(stops[i]!),b=rgb(stops[i+1]!);return [lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f)];
}
/** 1, 2, 2.5, 5 or 10 × 10^k at or above v (axis maximum). */
export function niceMax(v:number){if(!(v>0))return 1;const p=10**Math.floor(Math.log10(v)),m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p;}
/** Even-odd point in polygon. */
export function insidePolygon(px:number,py:number,poly:readonly (readonly [number,number])[]):boolean{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i]!,[xj,yj]=poly[j]!;if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside;}
  return inside;
}
/** Ids of kept points whose projection [x0,y0,x1,y1,…] falls inside a screen-space lasso.
 * NaN projections (behind the camera) never match. A bounding-box test prunes most points. */
export function lassoSelect(projected:ArrayLike<number>,poly:readonly (readonly [number,number])[],keep:(i:number)=>boolean):Uint32Array{
  if(poly.length<3)return new Uint32Array(0);
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const [x,y]of poly){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const out:number[]=[];
  for(let i=0;i<projected.length/2;i++){const x=projected[i*2]!,y=projected[i*2+1]!;if(!(x>=x0&&x<=x1&&y>=y0&&y<=y1))continue;if(keep(i)&&insidePolygon(x,y,poly))out.push(i);}
  return Uint32Array.from(out);
}
/** Data-space bounding box of picked ids, used to turn a lasso into interval view fields. */
export function boundsOf(ids:ArrayLike<number>,xs:ArrayLike<number>,ys:ArrayLike<number>):{x:[number,number];y:[number,number]}|null{
  if(!ids.length)return null;
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(let k=0;k<ids.length;k++){const i=ids[k]!,x=xs[i]!,y=ys[i]!;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return {x:[x0,x1],y:[y0,y1]};
}

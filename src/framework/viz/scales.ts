/** Scale and format helpers over d3 modules (never the d3 barrel). */
import {scaleBand,scaleLinear,scalePoint,scaleSequential,type ScaleBand,type ScaleLinear} from 'd3-scale';
import {format as d3format} from 'd3-format';
import {extent as d3extent,max as d3max} from 'd3-array';
export {scaleBand,scaleLinear,scalePoint,scaleSequential};
export type {ScaleBand,ScaleLinear};
export type Margin={top:number;right:number;bottom:number;left:number};
export const DEFAULT_MARGIN:Margin=Object.freeze({top:8,right:12,bottom:24,left:44});
export function inner(width:number,height:number,m:Margin=DEFAULT_MARGIN){return {w:Math.max(0,width-m.left-m.right),h:Math.max(0,height-m.top-m.bottom)};}
/** Linear scale that always includes zero for bars (magnitude must start at a baseline). */
export function zeroLinear(values:Iterable<number>,range:[number,number],nice=true){
  let lo=0,hi=0;for(const v of values){if(v<lo)lo=v;if(v>hi)hi=v;}
  if(lo===hi)hi=lo+1;
  const s=scaleLinear().domain([lo,hi]).range(range);return nice?s.nice(5):s;
}
export function fittedLinear(values:Iterable<number>,range:[number,number],pad=0.04){
  const arr=Array.from(values),[lo,hi]=d3extent(arr) as [number|undefined,number|undefined];
  if(lo===undefined||hi===undefined)return scaleLinear().domain([0,1]).range(range);
  const span=hi-lo||Math.abs(hi)||1;
  return scaleLinear().domain([lo-span*pad,hi+span*pad]).range(range).nice(5);
}
export const maxOf=(values:Iterable<number>)=>d3max(Array.from(values))??0;
const cache=new Map<string,(n:number)=>string>();
/** Number formatting: compact SI (k, M) by default, fixed digits optionally, plus a unit. */
export function formatNumber(value:number,options:{digits?:number;compact?:boolean;unit?:string;prefix?:string}={}):string{
  if(!Number.isFinite(value))return '—';
  const {digits,compact=true,unit,prefix=''}=options;
  const spec=compact&&Math.abs(value)>=1000?'.'+(digits??3)+(digits===undefined?'~s':'s'):','+'.'+(digits??(Math.abs(value)<10&&value%1?1:0))+'f';
  let f=cache.get(spec);if(!f){f=d3format(spec);cache.set(spec,f);}
  const text=f(value).replace('G','B').replace('−','-');
  return prefix+text+(unit?(unit==='%'?'%':' '+unit):'');
}
/** Ticks without collisions: about one tick per `px` pixels. */
export function tickCount(lengthPx:number,px=60){return Math.max(2,Math.min(10,Math.floor(lengthPx/px)));}

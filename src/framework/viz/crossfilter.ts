/** Pure crossfilter helpers (no React): filters over rows, own-dimension exclusion, grouping. */
import type {Interval} from '../selection.ts';
export type Filter<R>=
  | {id:string;kind:'multi';accessor:(row:R)=>string;values:ReadonlySet<string>}
  | {id:string;kind:'interval';accessor:(row:R)=>number;interval:Interval|null};
/** True when the filter keeps the row. An empty multi set or a null interval keeps everything. */
export function passes<R>(filter:Filter<R>,row:R):boolean{
  if(filter.kind==='multi')return filter.values.size===0||filter.values.has(filter.accessor(row));
  if(!filter.interval)return true;
  const value=filter.accessor(row);return value>=filter.interval[0]&&value<=filter.interval[1];
}
export function activeFilters<R>(filters:readonly Filter<R>[]){return filters.filter(f=>f.kind==='multi'?f.values.size>0:!!f.interval);}
/** Index list of rows passing every filter except those whose id is in `except` (own dimension). */
export function crossfilter<R>(rows:ArrayLike<R>,filters:readonly Filter<R>[],except:readonly string[]=[]):Uint32Array{
  const active=activeFilters(filters).filter(f=>!except.includes(f.id)),out=new Uint32Array(rows.length);let n=0;
  outer:for(let i=0;i<rows.length;i++){const row=rows[i]!;for(const f of active)if(!passes(f,row))continue outer;out[n++]=i;}
  return out.slice(0,n);
}
/** Sum `value` grouped by `key` over selected row indexes. */
export function groupSum<R>(rows:ArrayLike<R>,indexes:ArrayLike<number>,key:(row:R)=>string,value:(row:R)=>number):Map<string,number>{
  const out=new Map<string,number>();for(let i=0;i<indexes.length;i++){const row=rows[indexes[i]!]!,k=key(row);out.set(k,(out.get(k)||0)+value(row));}return out;
}


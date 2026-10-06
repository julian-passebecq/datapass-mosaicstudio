import type {Manifest,Values,Field} from './types.ts';
/** Bind a semantic selection to ONE existing runtime view field, never to a renderer store.
 * Visibility/filtering belongs to a projection and does not alter this identity.
 */
export function selectionField(manifest:Manifest,fieldId:string):Field {
  const field=manifest.fields.find(field=>field.id===fieldId);
  if(!field||field.role!=='view'||field.type!=='select')throw new Error(`Selection "${fieldId}" must name an existing view/select field; declare its semantic IDs in manifest.fields.`);
  return field;
}
export function readSelection(manifest:Manifest,values:Values,fieldId:string):string {
  const field=selectionField(manifest,fieldId),value=values[fieldId];
  if(typeof value!=='string'||!field.options?.some(option=>option.value===value))throw new Error(`Unknown semantic selection in "${fieldId}". Use a declared option, not a label or renderer index.`);
  return value;
}

/* Multi and interval selections (crossfilter / brush). Additive: a single `select` field keeps
 * working unchanged. Values stay inert scalars so saved state and validation are unchanged:
 * - multi: '' (nothing selected) or declared option values joined by '|' in declared order.
 * - interval: null (no brush) or 'lo:hi' with min <= lo <= hi <= max.
 */
export const MULTI_SEPARATOR='|';
export function parseMulti(field:Pick<Field,'id'|'options'>,value:unknown):string[]{
  if(typeof value!=='string')throw new Error(field.id+': multi selection must be a string');
  if(value==='')return [];
  const parts=value.split(MULTI_SEPARATOR),order=new Map((field.options||[]).map((o,i)=>[o.value,i]));
  let last=-1;
  for(const part of parts){const index=order.get(part);if(index===undefined)throw new Error(field.id+': unknown option in multi selection');if(index<=last)throw new Error(field.id+': multi selection must be unique and in declared order');last=index;}
  return parts;
}
export function encodeMulti(field:Pick<Field,'id'|'options'>,values:Iterable<string>):string{
  const wanted=new Set(values),known=new Set((field.options||[]).map(o=>o.value));
  for(const value of wanted)if(!known.has(value))throw new Error(field.id+': unknown option in multi selection');
  return (field.options||[]).filter(o=>wanted.has(o.value)).map(o=>o.value).join(MULTI_SEPARATOR);
}
/** Toggle one value. Additive (ctrl/shift/meta click) adds or removes; a plain click replaces
 * the selection, or clears it when that value was the only one selected. */
export function toggleMulti(field:Pick<Field,'id'|'options'>,current:string,value:string,additive=true):string{
  const set=new Set(parseMulti(field,current));
  if(additive){if(set.has(value))set.delete(value);else set.add(value);}
  else if(set.size===1&&set.has(value))set.clear();
  else{set.clear();set.add(value);}
  return encodeMulti(field,set);
}
export type Interval=readonly [number,number];
const INTERVAL=/^-?\d+(\.\d+)?(e[+-]?\d+)?:-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
export function parseInterval(field:Pick<Field,'id'|'min'|'max'>,value:unknown):Interval|null{
  if(value===null)return null;
  if(typeof value!=='string'||!INTERVAL.test(value))throw new Error(field.id+': interval must be null or "lo:hi"');
  const [lo,hi]=value.split(':').map(Number) as [number,number];
  if(!(Number.isFinite(lo)&&Number.isFinite(hi))||lo>hi||lo<field.min!||hi>field.max!)throw new Error(field.id+': interval outside its declared bounds');
  return [lo,hi];
}
/** Clamp, order and round (6 significant digits) so a brush always yields a valid value. */
export function encodeInterval(field:Pick<Field,'id'|'min'|'max'>,interval:Interval|null):string|null{
  if(!interval)return null;
  const round=(n:number)=>Number(n.toPrecision(6)),clamp=(n:number)=>Math.min(field.max!,Math.max(field.min!,n));
  const lo=clamp(round(Math.min(interval[0],interval[1]))),hi=clamp(round(Math.max(interval[0],interval[1])));
  const value=lo+':'+hi;parseInterval(field,value);return value;
}
export function viewField(manifest:Manifest,fieldId:string,type:'multi'|'interval'):Field{
  const field=manifest.fields.find(field=>field.id===fieldId);
  if(!field||field.role!=='view'||field.type!==type)throw new Error(`Selection "${fieldId}" must name an existing view/${type} field.`);
  return field;
}
export function readMulti(manifest:Manifest,values:Values,fieldId:string):string[]{return parseMulti(viewField(manifest,fieldId,'multi'),values[fieldId]);}
export function readInterval(manifest:Manifest,values:Values,fieldId:string):Interval|null{return parseInterval(viewField(manifest,fieldId,'interval'),values[fieldId]);}

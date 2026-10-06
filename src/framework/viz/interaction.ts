/** Crossfilter over view fields. Visuals write multi/interval view fields through
 * runtime.applyCue (validated, saved, restorable); every visual derives its rows from the
 * same filters and ignores its own dimension so it keeps showing its alternatives.
 */
import {useCallback,useMemo} from 'react';
import {useRuntime,useSiteState} from '../hooks.tsx';
import {readMulti,readInterval,toggleMulti,encodeInterval,encodeMulti,viewField,type Interval} from '../selection.ts';

export {passes,activeFilters,crossfilter,groupSum} from './crossfilter.ts';
export type {Filter} from './crossfilter.ts';

export function useMultiField(fieldId:string){
  const runtime=useRuntime(),snapshot=useSiteState(),field=viewField(runtime.manifest,fieldId,'multi');
  const current=String(snapshot.values[fieldId]);
  const values=useMemo(()=>new Set(readMulti(runtime.manifest,{[fieldId]:current},fieldId)),[runtime,fieldId,current]);
  const toggle=useCallback((value:string,additive=false)=>runtime.applyCue({[fieldId]:toggleMulti(field,String(runtime.getSnapshot().values[fieldId]),value,additive)}),[runtime,field,fieldId]);
  const set=useCallback((next:Iterable<string>)=>runtime.applyCue({[fieldId]:encodeMulti(field,next)}),[runtime,field,fieldId]);
  return {values,key:current,toggle,set,clear:()=>runtime.applyCue({[fieldId]:''}),options:field.options||[]};
}
export function useIntervalField(fieldId:string){
  const runtime=useRuntime(),snapshot=useSiteState(),field=viewField(runtime.manifest,fieldId,'interval');
  const raw=snapshot.values[fieldId];
  const interval=useMemo(()=>readInterval(runtime.manifest,{[fieldId]:raw},fieldId),[runtime,fieldId,raw]);
  const set=useCallback((next:Interval|null)=>runtime.applyCue({[fieldId]:encodeInterval(field,next)}),[runtime,field,fieldId]);
  return {interval,set,field};
}

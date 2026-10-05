/** Shared gallery state for the 2D and 3D pages: one set of view fields, one crossfilter.
 * Every visual reads indexes that ignore its own dimension, so it keeps showing alternatives.
 * SYNTHETIC data only.
 */
import {useCallback,useMemo} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {crossfilter,useMultiField,useIntervalField,VirtualClock,type Filter} from '../../src/framework/viz/index.ts';
import {encodeInterval,type Interval} from '../../src/framework/selection.ts';
import {CATEGORIES,CHANNELS,REGIONS,generateOrders} from './data.ts';

export const orders=generateOrders();
export const ids=Uint32Array.from({length:orders.length},(_,i)=>i);
export const sum=(idx:ArrayLike<number>,f:(i:number)=>number)=>{let s=0;for(let k=0;k<idx.length;k++)s+=f(idx[k]!);return s;};
export const monthly=(idx:ArrayLike<number>,f:(i:number)=>number)=>{const out=new Array(12).fill(0) as number[];for(let k=0;k<idx.length;k++){const i=idx[k]!;out[orders.month[i]!]+=f(i);}return out;};
/** The artifact table the gallery's chart specs are validated against. */
export const specTable={columns:[{id:'region',label:'Region',type:'string'},{id:'category',label:'Category',type:'string'},{id:'channel',label:'Channel',type:'string'},{id:'store',label:'Store',type:'string'},{id:'month',label:'Month',type:'number'},{id:'revenue',label:'Revenue',type:'number',unit:'USD'},{id:'discount',label:'Discount',type:'number',unit:'%'},{id:'margin',label:'Margin',type:'number',unit:'%'},{id:'orders',label:'Orders',type:'number'}] as const};
export type Brush={x:Interval;y:Interval}|null;

/** `?record=1`: every viz tree shares one VirtualClock that tools/record_gallery.mjs advances
 * frame by frame (window.__vizClock). Normal sessions use the real animation-frame clock. */
export const recordClock:VirtualClock|undefined=(()=>{
  if(typeof location==='undefined'||new URLSearchParams(location.search).get('record')!=='1')return undefined;
  const w=window as unknown as {__vizClock?:VirtualClock};return w.__vizClock||=new VirtualClock();
})();

export function useGallery(){
  const runtime=useRuntime(),snapshot=useSiteState();
  const mode:'light'|'dark'=snapshot.values['fg-theme']==='light'?'light':'dark';
  const region=useMultiField('fg-region'),category=useMultiField('fg-category'),channel=useMultiField('fg-channel');
  const discount=useIntervalField('fg-discount'),margin=useIntervalField('fg-margin');
  const filters=useMemo<Filter<number>[]>(()=>[
    {id:'region',kind:'multi',accessor:i=>REGIONS[orders.region[i]!]!.key,values:region.values},
    {id:'category',kind:'multi',accessor:i=>CATEGORIES[orders.category[i]!]!.key,values:category.values},
    {id:'channel',kind:'multi',accessor:i=>CHANNELS[orders.channel[i]!]!.key,values:channel.values},
    {id:'discount',kind:'interval',accessor:i=>orders.discount[i]!,interval:discount.interval},
    {id:'margin',kind:'interval',accessor:i=>orders.margin[i]!,interval:margin.interval},
  ],[region.values,category.values,channel.values,discount.interval,margin.interval]);
  const base=useMemo(()=>{
    const all=crossfilter(ids,filters),noBrush=crossfilter(ids,filters,['discount','margin']);
    const revenueByMonth=monthly(all,i=>orders.revenue[i]!),ordersByMonth=monthly(all,()=>1),marginByMonth=monthly(all,i=>orders.margin[i]!*orders.revenue[i]!),discountByMonth=monthly(all,i=>orders.discount[i]!);
    const revenue=sum(all,i=>orders.revenue[i]!);
    const brushedIn=new Uint8Array(orders.length);for(const i of all)brushedIn[i]=1;
    const active=new Uint8Array(orders.length);for(const i of noBrush)active[i]=1;
    return {all,noBrush,count:all.length,revenue,margin:revenue?sum(all,i=>orders.margin[i]!*orders.revenue[i]!)/revenue:NaN,discount:all.length?sum(all,i=>orders.discount[i]!)/all.length:NaN,
      revenueByMonth,ordersByMonth,marginByMonth:marginByMonth.map((m,k)=>revenueByMonth[k]?m/revenueByMonth[k]!:0),discountByMonth:discountByMonth.map((d,k)=>ordersByMonth[k]?d/ordersByMonth[k]!:0),
      brushedIn,active,brushing:!!(discount.interval||margin.interval)};
  },[filters,discount.interval,margin.interval]);
  const brush:Brush=discount.interval&&margin.interval?{x:discount.interval,y:margin.interval}:null;
  const onBrush=useCallback((b:Brush)=>{runtime.applyCue({'fg-discount':encodeInterval(discount.field,b?b.x:null),'fg-margin':encodeInterval(margin.field,b?b.y:null)});},[runtime,discount.field,margin.field]);
  /** 0 = filtered out by other visuals, 1 = active, 2 = inside the brush. */
  const pointState=useCallback((i:number):0|1|2=>!base.active[i]?0:!base.brushing?1:base.brushedIn[i]?2:0,[base]);
  const anyFilter=region.values.size+category.values.size+channel.values.size>0||!!brush;
  const chips=[
    ...[...region.values].map(k=>({k:'region',label:REGIONS.find(r=>r.key===k)!.label,clear:()=>region.toggle(k,true)})),
    ...[...category.values].map(k=>({k:'category',label:CATEGORIES.find(r=>r.key===k)!.label,clear:()=>category.toggle(k,true)})),
    ...[...channel.values].map(k=>({k:'channel',label:CHANNELS.find(r=>r.key===k)!.label,clear:()=>channel.toggle(k,true)})),
    ...(brush?[{k:'brush',label:`Discount ${brush.x[0].toFixed(0)}–${brush.x[1].toFixed(0)}% · Margin ${brush.y[0].toFixed(0)}–${brush.y[1].toFixed(0)}%`,clear:()=>onBrush(null)}]:[]),
  ];
  const reset=()=>runtime.applyCue({'fg-region':'','fg-category':'','fg-channel':'','fg-discount':null,'fg-margin':null});
  return {runtime,snapshot,mode,region,category,channel,discount,margin,filters,base,brush,onBrush,pointState,anyFilter,chips,reset};
}
export type Gallery=ReturnType<typeof useGallery>;

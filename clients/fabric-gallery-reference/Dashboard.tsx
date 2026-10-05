/** Fabric-app-like analytics page built only from the viz kit. All cross-visual state lives in
 * validated view fields (multi + interval), so a click or brush is saved, restorable and shared
 * with the 3D explorer page. SYNTHETIC data only.
 */
import {useCallback,useMemo} from 'react';
import {BarChart,LineChart,Donut,Heatmap,Legend,cat,crossfilter,parseChartSpec,routeSpec,formatNumber} from '../../src/framework/viz/index.ts';
import {Scatter} from '../../src/framework/viz/Scatter.tsx';
import {pointCloud} from '../../src/framework/viz/canvas.ts';
import {CATEGORIES,CHANNELS,DISCOUNT_RANGE,MARGIN_RANGE,MONTHS,REGIONS,STORES} from './data.ts';
import {ids,monthly,orders,specTable,sum,useGallery} from './gallery-state.ts';
import {Clear,Panel,Shell,usd} from './Shell.tsx';

const cloud=pointCloud(orders.discount,orders.margin);
/** Visual contracts: each spec is validated against the artifact table it reads. */
const columns={columns:[...specTable.columns]};
const SPECS={
  revenueTrend:parseChartSpec({id:'revenue-trend',mark:'area',encoding:{x:{field:'month'},y:{field:'revenue'},color:{field:'region'}},selection:{field:'fg-region',mode:'multi'}},columns),
  channelShare:parseChartSpec({id:'channel-share',mark:'arc',encoding:{theta:{field:'revenue'},color:{field:'channel'}},selection:{field:'fg-channel',mode:'multi'}},columns),
  categoryBars:parseChartSpec({id:'category-bars',mark:'bar',encoding:{x:{field:'category'},y:{field:'revenue'},color:{field:'region'}},stack:'stacked',selection:{field:'fg-category',mode:'multi'}},columns),
  heat:parseChartSpec({id:'region-month',mark:'rect',encoding:{x:{field:'month'},y:{field:'region'},color:{field:'revenue'}}},columns),
  stores:parseChartSpec({id:'stores',mark:'bar',encoding:{x:{field:'store'},y:{field:'revenue'}},sort:'descending'},columns),
  scatter:parseChartSpec({id:'discount-margin',mark:'point',encoding:{x:{field:'discount'},y:{field:'margin'}},selection:{field:'fg-discount',mode:'interval',on:'discount'}},columns),
};
const scatterRoute=routeSpec(SPECS.scatter,{length:orders.length} as unknown as never);

export function Dashboard(){
  const g=useGallery(),{runtime,snapshot,region,category,channel,filters,base,brush,onBrush,pointState}=g;
  const barMode=snapshot.values['fg-bar-mode']==='grouped'?'grouped':'stacked';
  const view=useMemo(()=>{
    const all=base.all,noRegion=crossfilter(ids,filters,['region']),noCategory=crossfilter(ids,filters,['category']),noChannel=crossfilter(ids,filters,['channel']);
    const lineByRegion=REGIONS.map((_,r)=>monthly(noRegion,i=>orders.region[i]===r?orders.revenue[i]!:0));
    const catRegion=CATEGORIES.map(()=>REGIONS.map(()=>0));for(const i of noCategory)catRegion[orders.category[i]!]![orders.region[i]!]+=orders.revenue[i]!;
    const byChannel=CHANNELS.map((_,ch)=>sum(noChannel,i=>orders.channel[i]===ch?orders.revenue[i]!:0));
    const stores=new Array(STORES.length).fill(0) as number[];for(const i of all)stores[orders.store[i]!]+=orders.revenue[i]!;
    return {lineByRegion,catRegion,byChannel,heat:lineByRegion,stores};
  },[filters,base]);
  const lineSeries=useMemo(()=>REGIONS.map((r,k)=>({key:r.key,label:r.label,color:cat(k),points:view.lineByRegion[k]!.map((y,m)=>({x:m,y}))})),[view]);
  const barSeries=useMemo(()=>REGIONS.map((r,k)=>({key:r.key,label:r.label,color:cat(k)})),[]);
  const barValue=useCallback((c:string,s:string)=>view.catRegion[CATEGORIES.findIndex(x=>x.key===c)]![REGIONS.findIndex(x=>x.key===s)]!,[view]);
  const slices=useMemo(()=>CHANNELS.map((c,k)=>({key:c.key,label:c.label,value:view.byChannel[k]!,color:cat(k+4)})),[view]);
  const heatValue=useCallback((r:string,m:string)=>view.heat[REGIONS.findIndex(x=>x.key===r)]![Number(m)]!,[view]);
  const heatCols=useMemo(()=>MONTHS.map((m,k)=>({key:String(k),label:m})),[]);
  const storeOrder=useMemo(()=>STORES.map((s,k)=>({...s,value:view.stores[k]!})).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key)),[view]);
  const storeValue=useCallback((s:string)=>view.stores[STORES.findIndex(x=>x.key===s)]!,[view]);
  const storeSeries=useMemo(()=>[{key:'revenue',label:'Revenue',color:'var(--dp-viz-accent)'}],[]);
  return <Shell g={g} page="dashboard" hint="Click bars, slices or rows to filter · Ctrl+click to add · Drag on the scatter to brush">
    <Panel className="fg-w8" title="Revenue by month" subtitle="Stacked by region · USD" testId="panel-trend" action={<Clear show={region.values.size>0} onClick={region.clear} label="region"/>}>
      <Legend items={lineSeries.map(s=>({key:s.key,label:s.label,color:s.color}))} active={region.values} onToggle={region.toggle}/>
      <div className="fg-chart"><LineChart testId="chart-trend" series={lineSeries} area="stacked" highlight={region.values} xFormat={m=>MONTHS[m]!} format={usd} label="Revenue by month and region"/></div>
    </Panel>
    <Panel className="fg-w4" title="Channel mix" subtitle="Share of revenue" testId="panel-channel" action={<Clear show={channel.values.size>0} onClick={channel.clear} label="channel"/>}>
      <div className="fg-donut"><div className="fg-chart"><Donut testId="chart-channel" slices={slices} selected={channel.values} onSelect={channel.toggle} format={usd} label="Revenue share by channel" center={<div className="fg-donut-center"><strong>{formatNumber(slices.reduce((s,x)=>s+x.value,0),usd)}</strong><span>{channel.values.size?`${channel.values.size} selected`:'All channels'}</span></div>}/></div>
      <Legend items={slices.map(s=>({key:s.key,label:s.label,color:s.color}))} active={channel.values} onToggle={channel.toggle}/></div>
    </Panel>
    <Panel className="fg-w6" title="Revenue by category" subtitle={barMode==='stacked'?'Stacked by region':'Grouped by region'} testId="panel-category" action={<div className="fg-seg" role="group" aria-label="Bar layout">{(['stacked','grouped'] as const).map(m=><button key={m} type="button" aria-pressed={barMode===m} onClick={()=>runtime.applyCue({'fg-bar-mode':m})}>{m==='stacked'?'Stacked':'Grouped'}</button>)}<Clear show={category.values.size>0} onClick={category.clear} label="category"/></div>}>
      <div className="fg-chart"><BarChart testId="chart-category" categories={CATEGORIES} series={barSeries} value={barValue} mode={barMode} selected={category.values} onSelect={category.toggle} format={usd} label="Revenue by category and region"/></div>
    </Panel>
    <Panel className="fg-w6" title="Seasonality" subtitle="Revenue by region and month · click a region" testId="panel-heat">
      <div className="fg-chart"><Heatmap testId="chart-heat" rows={REGIONS} cols={heatCols} value={heatValue} format={usd} selectedRows={region.values} onSelectRow={region.toggle} label="Revenue heatmap by region and month"/></div>
    </Panel>
    <Panel className="fg-w7" title="Discount vs margin" subtitle={`${orders.length.toLocaleString('en-US')} orders · ${scatterRoute.renderer} renderer · drag to brush`} testId="panel-scatter" action={<Clear show={!!brush} onClick={()=>onBrush(null)} label="brush"/>}>
      <div className="fg-chart fg-tall"><Scatter testId="chart-scatter" cloud={cloud} xDomain={DISCOUNT_RANGE} yDomain={MARGIN_RANGE} state={pointState} stateKey={base} brush={brush} onBrush={onBrush} themeKey={g.mode} xLabel="Discount (%)" yLabel="Margin (%)" xFormat={{compact:false}} yFormat={{compact:false}} label="Order discount versus margin"
        describe={i=>({title:`Order ${i+1}`,rows:[{label:'Store',value:STORES[orders.store[i]!]!.label},{label:'Category',value:CATEGORIES[orders.category[i]!]!.label},{label:'Revenue',value:formatNumber(orders.revenue[i]!,usd)},{label:'Discount',value:orders.discount[i]!.toFixed(1)+'%'},{label:'Margin',value:orders.margin[i]!.toFixed(1)+'%'}]})}/></div>
    </Panel>
    <Panel className="fg-w5" title="Revenue by store" subtitle={`${STORES.length} stores · sorted`} testId="panel-stores">
      <div className="fg-chart fg-tall"><BarChart testId="chart-stores" categories={storeOrder} series={storeSeries} value={storeValue} mode="grouped" format={usd} label="Revenue by store"/></div>
    </Panel>
  </Shell>;
}

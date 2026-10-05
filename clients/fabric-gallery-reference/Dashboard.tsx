/** Fabric-app-like analytics page built only from the viz kit. All cross-visual state lives in
 * validated view fields (multi + interval), so a click or brush is saved, restorable and shared.
 * SYNTHETIC data only.
 */
import {useCallback,useMemo,type ReactNode} from 'react';
import {Activity,BarChart3,Database,Filter as FilterIcon,Home,LayoutGrid,Moon,RotateCcw,Search,Sun,X} from 'lucide-react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {VizRoot,BarChart,LineChart,Donut,Heatmap,Kpi,Legend,cat,crossfilter,useMultiField,useIntervalField,parseChartSpec,routeSpec,formatNumber,type Filter,type TokenOverrides} from '../../src/framework/viz/index.ts';
import {Scatter,type Brush} from '../../src/framework/viz/Scatter.tsx';
import {pointCloud} from '../../src/framework/viz/canvas.ts';
import {encodeInterval} from '../../src/framework/selection.ts';
import {CATEGORIES,CHANNELS,DISCOUNT_RANGE,MARGIN_RANGE,MONTHS,REGIONS,STORES,generateOrders} from './data.ts';
import {THEMES} from './theme.ts';
import './gallery.css';

const orders=generateOrders();
const ids=Uint32Array.from({length:orders.length},(_,i)=>i);
const cloud=pointCloud(orders.discount,orders.margin);
const sum=(idx:ArrayLike<number>,f:(i:number)=>number)=>{let s=0;for(let k=0;k<idx.length;k++)s+=f(idx[k]!);return s;};
/** Visual contracts: each spec is validated against the artifact table it reads. */
const specTable={columns:[{id:'region',label:'Region',type:'string'},{id:'category',label:'Category',type:'string'},{id:'channel',label:'Channel',type:'string'},{id:'store',label:'Store',type:'string'},{id:'month',label:'Month',type:'number'},{id:'revenue',label:'Revenue',type:'number',unit:'USD'},{id:'discount',label:'Discount',type:'number',unit:'%'},{id:'margin',label:'Margin',type:'number',unit:'%'}] as const};
const SPECS={
  revenueTrend:parseChartSpec({id:'revenue-trend',mark:'area',encoding:{x:{field:'month'},y:{field:'revenue'},color:{field:'region'}},selection:{field:'fg-region',mode:'multi'}},{columns:[...specTable.columns]}),
  channelShare:parseChartSpec({id:'channel-share',mark:'arc',encoding:{theta:{field:'revenue'},color:{field:'channel'}},selection:{field:'fg-channel',mode:'multi'}},{columns:[...specTable.columns]}),
  categoryBars:parseChartSpec({id:'category-bars',mark:'bar',encoding:{x:{field:'category'},y:{field:'revenue'},color:{field:'region'}},stack:'stacked',selection:{field:'fg-category',mode:'multi'}},{columns:[...specTable.columns]}),
  heat:parseChartSpec({id:'region-month',mark:'rect',encoding:{x:{field:'month'},y:{field:'region'},color:{field:'revenue'}}},{columns:[...specTable.columns]}),
  stores:parseChartSpec({id:'stores',mark:'bar',encoding:{x:{field:'store'},y:{field:'revenue'}},sort:'descending'},{columns:[...specTable.columns]}),
  scatter:parseChartSpec({id:'discount-margin',mark:'point',encoding:{x:{field:'discount'},y:{field:'margin'}},selection:{field:'fg-discount',mode:'interval',on:'discount'}},{columns:[...specTable.columns]}),
};
const scatterRoute=routeSpec(SPECS.scatter,{length:orders.length} as unknown as never);
const usd={prefix:'$',digits:3};

function Panel({title,subtitle,action,children,className,testId}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string;testId?:string}){
  return <section className={'fg-panel '+(className||'')} data-testid={testId} aria-label={title}>
    <header className="fg-panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>
    <div className="fg-panel-body">{children}</div>
  </section>;
}
function Clear({show,onClick,label}:{show:boolean;onClick:()=>void;label:string}){return show?<button type="button" className="fg-chip-btn" onClick={onClick} aria-label={'Clear '+label}><X size={12}/>Clear</button>:null;}

export function Dashboard(){
  const runtime=useRuntime(),snapshot=useSiteState();
  const mode=snapshot.values['fg-theme']==='light'?'light':'dark';
  const region=useMultiField('fg-region'),category=useMultiField('fg-category'),channel=useMultiField('fg-channel');
  const discount=useIntervalField('fg-discount'),margin=useIntervalField('fg-margin');
  const barMode=snapshot.values['fg-bar-mode']==='grouped'?'grouped':'stacked';
  const filters=useMemo<Filter<number>[]>(()=>[
    {id:'region',kind:'multi',accessor:i=>REGIONS[orders.region[i]!]!.key,values:region.values},
    {id:'category',kind:'multi',accessor:i=>CATEGORIES[orders.category[i]!]!.key,values:category.values},
    {id:'channel',kind:'multi',accessor:i=>CHANNELS[orders.channel[i]!]!.key,values:channel.values},
    {id:'discount',kind:'interval',accessor:i=>orders.discount[i]!,interval:discount.interval},
    {id:'margin',kind:'interval',accessor:i=>orders.margin[i]!,interval:margin.interval},
  ],[region.values,category.values,channel.values,discount.interval,margin.interval]);
  const view=useMemo(()=>{
    const all=crossfilter(ids,filters),noRegion=crossfilter(ids,filters,['region']),noCategory=crossfilter(ids,filters,['category']),noChannel=crossfilter(ids,filters,['channel']),noBrush=crossfilter(ids,filters,['discount','margin']);
    const monthly=(idx:Uint32Array,f:(i:number)=>number)=>{const out=new Array(12).fill(0);for(const i of idx)out[orders.month[i]!]+=f(i);return out as number[];};
    const revenueByMonth=monthly(all,i=>orders.revenue[i]!),ordersByMonth=monthly(all,()=>1),marginByMonth=monthly(all,i=>orders.margin[i]!*orders.revenue[i]!);
    const lineByRegion=REGIONS.map((_,r)=>monthly(noRegion,i=>orders.region[i]===r?orders.revenue[i]!:0));
    const catRegion=CATEGORIES.map((_,c)=>REGIONS.map((_,r)=>sum(noCategory,i=>orders.category[i]===c&&orders.region[i]===r?orders.revenue[i]!:0)));
    const byChannel=CHANNELS.map((_,ch)=>sum(noChannel,i=>orders.channel[i]===ch?orders.revenue[i]!:0));
    const heat=REGIONS.map((_,r)=>monthly(noRegion,i=>orders.region[i]===r?orders.revenue[i]!:0));
    const stores=new Array(STORES.length).fill(0) as number[];for(const i of all)stores[orders.store[i]!]+=orders.revenue[i]!;
    const brushedIn=new Uint8Array(orders.length);for(const i of all)brushedIn[i]=1;const active=new Uint8Array(orders.length);for(const i of noBrush)active[i]=1;
    const revenue=sum(all,i=>orders.revenue[i]!);
    return {count:all.length,revenue,margin:revenue?sum(all,i=>orders.margin[i]!*orders.revenue[i]!)/revenue:NaN,discount:all.length?sum(all,i=>orders.discount[i]!)/all.length:NaN,
      revenueByMonth,ordersByMonth,discountByMonth:monthly(all,i=>orders.discount[i]!).map((d,k)=>ordersByMonth[k]?d/ordersByMonth[k]!:0),marginByMonth:marginByMonth.map((m,k)=>revenueByMonth[k]?m/revenueByMonth[k]!:0),lineByRegion,catRegion,byChannel,heat,stores,brushedIn,active,brushing:!!(discount.interval||margin.interval)};
  },[filters,discount.interval,margin.interval]);
  const scatterState=useCallback((i:number):0|1|2=>!view.active[i]?0:!view.brushing?1:view.brushedIn[i]?2:0,[view]);
  const brush:Brush=discount.interval&&margin.interval?{x:discount.interval,y:margin.interval}:null;
  const onBrush=useCallback((b:Brush)=>{runtime.applyCue({'fg-discount':encodeInterval(discount.field,b?b.x:null),'fg-margin':encodeInterval(margin.field,b?b.y:null)});},[runtime,discount.field,margin.field]);
  const lineSeries=useMemo(()=>REGIONS.map((r,k)=>({key:r.key,label:r.label,color:cat(k),points:view.lineByRegion[k]!.map((y,m)=>({x:m,y}))})),[view]);
  const barCats=CATEGORIES,barSeries=useMemo(()=>REGIONS.map((r,k)=>({key:r.key,label:r.label,color:cat(k)})),[]);
  const barValue=useCallback((c:string,s:string)=>view.catRegion[CATEGORIES.findIndex(x=>x.key===c)]![REGIONS.findIndex(x=>x.key===s)]!,[view]);
  const slices=useMemo(()=>CHANNELS.map((c,k)=>({key:c.key,label:c.label,value:view.byChannel[k]!,color:cat(k+4)})),[view]);
  const heatValue=useCallback((r:string,m:string)=>view.heat[REGIONS.findIndex(x=>x.key===r)]![Number(m)]!,[view]);
  const heatCols=useMemo(()=>MONTHS.map((m,k)=>({key:String(k),label:m})),[]);
  const storeOrder=useMemo(()=>STORES.map((s,k)=>({...s,value:view.stores[k]!})).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key)),[view]);
  const storeValue=useCallback((s:string)=>view.stores[STORES.findIndex(x=>x.key===s)]!,[view]);
  const storeSeries=useMemo(()=>[{key:'revenue',label:'Revenue',color:'var(--dp-viz-accent)'}],[]);
  const anyFilter=region.values.size+category.values.size+channel.values.size>0||!!brush;
  const delta=(arr:number[])=>arr[10]?((arr[11]!-arr[10])/arr[10])*100:null;
  const chips=[...[...region.values].map(k=>({k:'region',label:REGIONS.find(r=>r.key===k)!.label,clear:()=>region.toggle(k,true)})),...[...category.values].map(k=>({k:'category',label:CATEGORIES.find(r=>r.key===k)!.label,clear:()=>category.toggle(k,true)})),...[...channel.values].map(k=>({k:'channel',label:CHANNELS.find(r=>r.key===k)!.label,clear:()=>channel.toggle(k,true)})),...(brush?[{k:'brush',label:`Discount ${brush.x[0].toFixed(0)}–${brush.x[1].toFixed(0)}% · Margin ${brush.y[0].toFixed(0)}–${brush.y[1].toFixed(0)}%`,clear:()=>onBrush(null)}]:[])];
  const overrides:TokenOverrides=THEMES[mode];
  return <VizRoot mode={mode} overrides={overrides} className="fg-app" data-testid="fabric-gallery" data-theme-mode={mode}>
    <nav className="fg-rail" aria-label="Workspace">
      <span className="fg-logo" aria-hidden="true"><LayoutGrid size={18}/></span>
      {[{icon:Home,label:'Home'},{icon:BarChart3,label:'Reports',active:true},{icon:Database,label:'Data'},{icon:Activity,label:'Monitor'}].map(({icon:Icon,label,active})=><button type="button" key={label} className={'fg-rail-btn'+(active?' active':'')} aria-label={label} aria-current={active?'page':undefined}><Icon size={18}/><span>{label}</span></button>)}
    </nav>
    <div className="fg-main">
      <header className="fg-top">
        <div className="fg-crumbs"><span>Contoso sales</span><span aria-hidden="true">/</span><strong>Revenue cockpit</strong><span className="fg-badge">Synthetic data</span></div>
        <label className="fg-search"><Search size={14}/><input type="search" placeholder="Search" aria-label="Search (demo)"/></label>
        <div className="fg-actions">
          <button type="button" className="fg-btn" onClick={()=>runtime.applyCue({'fg-region':'','fg-category':'','fg-channel':'','fg-discount':null,'fg-margin':null})} disabled={!anyFilter}><RotateCcw size={14}/>Reset filters</button>
          <button type="button" className="fg-btn" aria-label={mode==='dark'?'Switch to light theme':'Switch to dark theme'} onClick={()=>runtime.applyCue({'fg-theme':mode==='dark'?'light':'dark'})}>{mode==='dark'?<Sun size={14}/>:<Moon size={14}/>}{mode==='dark'?'Light':'Dark'}</button>
        </div>
      </header>
      <div className="fg-filterbar" aria-label="Active filters">
        <FilterIcon size={14}/><span className="fg-filter-count">{chips.length?`${chips.length} filter${chips.length>1?'s':''}`:'No filters'}</span>
        {chips.map(c=><button type="button" key={c.k+c.label} className="fg-chip" onClick={c.clear} aria-label={'Remove filter '+c.label}>{c.label}<X size={12}/></button>)}
        <span className="fg-hint">Click bars, slices or rows to filter · Ctrl+click to add · Drag on the scatter to brush</span>
      </div>
      <div className="fg-grid">
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-revenue" label="Revenue" value={view.revenue} format={usd} delta={delta(view.revenueByMonth)} deltaLabel="vs Nov" spark={view.revenueByMonth}/></div>
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-orders" label="Orders" value={view.count} format={{compact:false}} delta={delta(view.ordersByMonth)} deltaLabel="vs Nov" spark={view.ordersByMonth} color={cat(2)}/></div>
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-margin" label="Gross margin" value={view.margin} format={{digits:1,unit:'%',compact:false}} spark={view.marginByMonth} color={cat(4)}/></div>
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-discount" label="Avg discount" value={view.discount} format={{digits:1,unit:'%',compact:false}} spark={view.discountByMonth} color={cat(1)}/></div>
        <Panel className="fg-w8" title="Revenue by month" subtitle="Stacked by region · USD" testId="panel-trend" action={<Clear show={region.values.size>0} onClick={region.clear} label="region"/>}>
          <Legend items={lineSeries.map(s=>({key:s.key,label:s.label,color:s.color}))} active={region.values} onToggle={region.toggle}/>
          <div className="fg-chart"><LineChart testId="chart-trend" series={lineSeries} area="stacked" highlight={region.values} xFormat={m=>MONTHS[m]!} format={usd} label="Revenue by month and region"/></div>
        </Panel>
        <Panel className="fg-w4" title="Channel mix" subtitle="Share of revenue" testId="panel-channel" action={<Clear show={channel.values.size>0} onClick={channel.clear} label="channel"/>}>
          <div className="fg-donut"><div className="fg-chart"><Donut testId="chart-channel" slices={slices} selected={channel.values} onSelect={channel.toggle} format={usd} label="Revenue share by channel" center={<div className="fg-donut-center"><strong>{formatNumber(slices.reduce((s,x)=>s+x.value,0),usd)}</strong><span>{channel.values.size?`${channel.values.size} selected`:'All channels'}</span></div>}/></div>
          <Legend items={slices.map(s=>({key:s.key,label:s.label,color:s.color}))} active={channel.values} onToggle={channel.toggle}/></div>
        </Panel>
        <Panel className="fg-w6" title="Revenue by category" subtitle={barMode==='stacked'?'Stacked by region':'Grouped by region'} testId="panel-category" action={<div className="fg-seg" role="group" aria-label="Bar layout">{(['stacked','grouped'] as const).map(m=><button key={m} type="button" aria-pressed={barMode===m} onClick={()=>runtime.applyCue({'fg-bar-mode':m})}>{m==='stacked'?'Stacked':'Grouped'}</button>)}<Clear show={category.values.size>0} onClick={category.clear} label="category"/></div>}>
          <div className="fg-chart"><BarChart testId="chart-category" categories={barCats} series={barSeries} value={barValue} mode={barMode} selected={category.values} onSelect={category.toggle} format={usd} label="Revenue by category and region"/></div>
        </Panel>
        <Panel className="fg-w6" title="Seasonality" subtitle="Revenue by region and month · click a region" testId="panel-heat">
          <div className="fg-chart"><Heatmap testId="chart-heat" rows={REGIONS} cols={heatCols} value={heatValue} format={usd} selectedRows={region.values} onSelectRow={region.toggle} label="Revenue heatmap by region and month"/></div>
        </Panel>
        <Panel className="fg-w7" title="Discount vs margin" subtitle={`${orders.length.toLocaleString('en-US')} orders · ${scatterRoute.renderer} renderer · drag to brush`} testId="panel-scatter" action={<Clear show={!!brush} onClick={()=>onBrush(null)} label="brush"/>}>
          <div className="fg-chart fg-tall"><Scatter testId="chart-scatter" cloud={cloud} xDomain={DISCOUNT_RANGE} yDomain={MARGIN_RANGE} state={scatterState} stateKey={view} brush={brush} onBrush={onBrush} themeKey={mode} xLabel="Discount (%)" yLabel="Margin (%)" xFormat={{compact:false}} yFormat={{compact:false}} label="Order discount versus margin"
            describe={i=>({title:`Order ${i+1}`,rows:[{label:'Store',value:STORES[orders.store[i]!]!.label},{label:'Category',value:CATEGORIES[orders.category[i]!]!.label},{label:'Revenue',value:formatNumber(orders.revenue[i]!,usd)},{label:'Discount',value:orders.discount[i]!.toFixed(1)+'%'},{label:'Margin',value:orders.margin[i]!.toFixed(1)+'%'}]})}/></div>
        </Panel>
        <Panel className="fg-w5" title="Revenue by store" subtitle={`${STORES.length} stores · sorted`} testId="panel-stores">
          <div className="fg-chart fg-tall"><BarChart testId="chart-stores" categories={storeOrder} series={storeSeries} value={storeValue} mode="grouped" format={usd} label="Revenue by store"/></div>
        </Panel>
      </div>
      <footer className="fg-foot">Synthetic, deterministic sample data (seed 20261005). Not customer, financial or production evidence.</footer>
    </div>
  </VizRoot>;
}

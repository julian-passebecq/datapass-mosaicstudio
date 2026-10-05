/** 3D explorer page: the same view fields and crossfilter as the 2D page, drawn by the lazy
 * WebGL renderer (three.js chunk loaded on this page only). Column clicks write `fg-region`, the
 * surface follows every filter and shows the brush, and a lasso on the 120k-point cloud writes the
 * discount/margin brush (its bounding box), so the 2D page reflects 3D selections and vice versa.
 * Without WebGL each visual renders its 2D equivalent. SYNTHETIC data only.
 */
import {useCallback,useMemo,useState} from 'react';
import {Lasso,Orbit,Play,RotateCcw,Grid3x3} from 'lucide-react';
import {BarChart,Heatmap,cat,crossfilter,parseChartSpec,routeSpec,formatNumber} from '../../src/framework/viz/index.ts';
import {Scatter} from '../../src/framework/viz/Scatter.tsx';
import {pointCloud} from '../../src/framework/viz/canvas.ts';
import {Columns3D,Surface3D,Scatter3D} from '../../src/framework/viz/webgl/Chart3D.tsx';
import {webglAvailable} from '../../src/framework/viz/webgl/detect.ts';
import {boundsOf} from '../../src/framework/viz/webgl/geometry.ts';
import {CATEGORIES,DISCOUNT_RANGE,MARGIN_RANGE,MONTHS,REGIONS,STORES} from './data.ts';
import {ids,orders,specTable,useGallery} from './gallery-state.ts';
import {Clear,Panel,Shell,usd} from './Shell.tsx';

const columns={columns:[...specTable.columns]};
const SPECS={
  columns:parseChartSpec({id:'region-month-3d',mark:'bar3d',encoding:{x:{field:'month'},y:{field:'region'},z:{field:'revenue'}},selection:{field:'fg-region',mode:'multi'}},columns),
  surface:parseChartSpec({id:'order-density-3d',mark:'surface',encoding:{x:{field:'discount'},y:{field:'margin'},z:{field:'orders'}}},columns),
  cloud:parseChartSpec({id:'orders-3d',mark:'point3d',encoding:{x:{field:'discount'},y:{field:'margin'},z:{field:'revenue'}},selection:{field:'fg-discount',mode:'interval',on:'discount'}},columns),
};
/** Surface grid: margin -40..80 step 5 across (x) × discount 0..40 step 2 in depth (y), so the
 * dense low-discount ridge sits at the back and the slope runs toward the viewer. */
const NX=25,NY=21,XSTEP=(MARGIN_RANGE[1]-MARGIN_RANGE[0])/(NX-1),YSTEP=(DISCOUNT_RANGE[1]-DISCOUNT_RANGE[0])/(NY-1);
const LOG_REVENUE=Float64Array.from(orders.revenue,v=>Math.log10(Math.max(10,v)));
const REVENUE_DOMAIN=[1,4.7] as const;
const cloud=pointCloud(orders.discount,orders.margin);
const regionRows=REGIONS.map((r,k)=>({...r,color:cat(k)}));
const monthCols=MONTHS.map((m,k)=>({key:String(k),label:m}));
const xBins=Array.from({length:NX},(_,i)=>({key:String(i),label:(MARGIN_RANGE[0]+i*XSTEP).toFixed(0)+'%'}));
const yBins=Array.from({length:NY},(_,j)=>({key:String(j),label:(DISCOUNT_RANGE[0]+j*YSTEP).toFixed(0)+'%'}));
const money=(v:number)=>formatNumber(v,{prefix:'$',compact:true});
const pct=(v:number)=>v.toFixed(0)+'%';

export function Dashboard3D(){
  const g=useGallery(),{region,filters,base,brush,onBrush,pointState}=g;
  const webgl=webglAvailable();
  const routes=useMemo(()=>({columns:routeSpec(SPECS.columns,{length:48} as never,{webgl}),surface:routeSpec(SPECS.surface,{length:NX*NY} as never,{webgl}),cloud:routeSpec(SPECS.cloud,{length:orders.length} as never,{webgl})}),[webgl]);
  const [tourKey,setTourKey]=useState(0),[resetKey,setResetKey]=useState(0),[touring,setTouring]=useState(false);
  const [wireframe,setWireframe]=useState(false),[pointer,setPointer]=useState<'orbit'|'lasso'>('orbit');
  const view=useMemo(()=>{
    const noRegion=crossfilter(ids,filters,['region']);
    const heat=REGIONS.map(()=>new Array(12).fill(0) as number[]);for(const i of noRegion)heat[orders.region[i]!]![orders.month[i]!]+=orders.revenue[i]!;
    // Order density over the discount × margin grid (ignores the brush, which it highlights instead).
    const raw=new Float64Array(NX*NY);
    for(const i of base.noBrush){const x=Math.round((orders.margin[i]!-MARGIN_RANGE[0])/XSTEP),y=Math.round((orders.discount[i]!-DISCOUNT_RANGE[0])/YSTEP);if(x>=0&&x<NX&&y>=0&&y<NY)raw[y*NX+x]!++;}
    const density=new Float64Array(NX*NY);
    for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){let s=0,w=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=NX||yy>=NY)continue;const k=(dx?1:2)*(dy?1:2);s+=raw[yy*NX+xx]!*k;w+=k;}density[y*NX+x]=s/w;}
    const byCategory=CATEGORIES.map(()=>0);for(const i of base.all)byCategory[orders.category[i]!]+=orders.revenue[i]!;
    return {heat,density,byCategory};
  },[filters,base]);
  const heatValue=useCallback((r:string,m:string)=>view.heat[REGIONS.findIndex(x=>x.key===r)]![Number(m)]!,[view]);
  const densityValue=useCallback((y:string,x:string)=>view.density[Number(y)*NX+Number(x)]!,[view]);
  const highlight=useMemo(()=>brush?{x:brush.y,y:brush.x}:null,[brush]);
  const onLasso=useCallback((picked:Uint32Array|null)=>{
    onBrush(picked?boundsOf(picked,orders.discount,orders.margin):null);
  },[onBrush]);
  const colorIndex=useCallback((i:number)=>orders.category[i]!,[]);
  const describe=useCallback((i:number)=>({title:`Order ${i+1}`,rows:[{label:'Store',value:STORES[orders.store[i]!]!.label},{label:'Category',value:CATEGORIES[orders.category[i]!]!.label,color:cat(orders.category[i]!)},{label:'Revenue',value:formatNumber(orders.revenue[i]!,usd)},{label:'Discount',value:orders.discount[i]!.toFixed(1)+'%'},{label:'Margin',value:orders.margin[i]!.toFixed(1)+'%'}]}),[]);
  const catSeries=useMemo(()=>[{key:'revenue',label:'Revenue',color:'var(--dp-viz-accent)'}],[]);
  const catValue=useCallback((c:string)=>view.byCategory[CATEGORIES.findIndex(x=>x.key===c)]!,[view]);
  const tour=()=>{setTouring(true);setTourKey(k=>k+1);};
  return <Shell g={g} page="explorer-3d" hint="Drag to orbit · Click a column to filter its region · Lasso points to brush">
    <Panel className="fg-w7" title="Revenue by region and month" subtitle={`48 columns · ${routes.columns.renderer} renderer · click to filter`} testId="panel-columns"
      action={<div className="fg-seg" role="group" aria-label="Camera"><button type="button" onClick={tour} aria-pressed={touring} data-testid="tour-columns"><Play size={12}/>Tour</button><button type="button" onClick={()=>setResetKey(k=>k+1)} aria-label="Reset view"><RotateCcw size={12}/>Reset</button><Clear show={region.values.size>0} onClick={region.clear} label="region"/></div>}>
      <div className="fg-chart fg-3d"><Columns3D testId="chart-columns3d" label="Revenue by region and month, 3D columns" rows={regionRows} cols={monthCols} value={heatValue} format={usd} valueLabel="Revenue"
        selected={region.values} onSelect={region.toggle} themeKey={g.mode} tourKey={tourKey} resetKey={resetKey} onTourDone={()=>setTouring(false)}
        fallback={<Heatmap testId="chart-columns3d-2d" rows={REGIONS} cols={monthCols} value={heatValue} format={usd} selectedRows={region.values} onSelectRow={region.toggle} label="Revenue heatmap by region and month"/>}/></div>
    </Panel>
    <Panel className="fg-w5" title="Order density" subtitle={`Margin × discount surface · ${routes.surface.renderer} · brush highlighted`} testId="panel-surface"
      action={<div className="fg-seg" role="group" aria-label="Surface style"><button type="button" aria-pressed={wireframe} onClick={()=>setWireframe(w=>!w)} data-testid="toggle-wireframe"><Grid3x3 size={12}/>Wireframe</button></div>}>
      <div className="fg-chart fg-3d"><Surface3D testId="chart-surface3d" label="Order density over margin and discount" nx={NX} ny={NY} values={view.density} xDomain={MARGIN_RANGE} yDomain={DISCOUNT_RANGE}
        xLabel="Margin" yLabel="Discount" zLabel="Orders" format={{compact:true}} xFormat={pct} yFormat={pct} highlight={highlight} wireframe={wireframe} themeKey={g.mode} resetKey={resetKey}
        fallback={<Heatmap testId="chart-surface3d-2d" rows={yBins} cols={xBins} value={densityValue} format={{compact:true}} label="Order density heatmap"/>}/></div>
    </Panel>
    <Panel className="fg-w8" title="Orders in 3D" subtitle={`${orders.length.toLocaleString('en-US')} points · ${routes.cloud.renderer} renderer · discount × margin × revenue`} testId="panel-cloud"
      action={<div className="fg-seg" role="group" aria-label="Pointer mode">{([['orbit','Orbit',Orbit],['lasso','Lasso',Lasso]] as const).map(([m,label,Icon])=><button key={m} type="button" aria-pressed={pointer===m} onClick={()=>setPointer(m)} data-testid={'mode-'+m}><Icon size={12}/>{label}</button>)}<Clear show={!!brush} onClick={()=>onBrush(null)} label="brush"/></div>}>
      <div className="fg-chart fg-3d-tall"><Scatter3D testId="chart-cloud3d" label="Orders by discount, margin and revenue" x={orders.discount} y={orders.margin} z={LOG_REVENUE}
        xDomain={DISCOUNT_RANGE} yDomain={MARGIN_RANGE} zDomain={REVENUE_DOMAIN} xLabel="Discount" yLabel="Margin" zLabel="Revenue (log)" xFormat={pct} yFormat={pct} zFormat={v=>money(10**v)}
        state={pointState} stateKey={base} colorIndex={colorIndex} mode={pointer} onLasso={onLasso} describe={describe} themeKey={g.mode} resetKey={resetKey}
        fallback={<Scatter testId="chart-cloud3d-2d" cloud={cloud} xDomain={DISCOUNT_RANGE} yDomain={MARGIN_RANGE} state={pointState} stateKey={base} brush={brush} onBrush={onBrush} themeKey={g.mode} xLabel="Discount (%)" yLabel="Margin (%)" xFormat={{compact:false}} yFormat={{compact:false}} label="Order discount versus margin"/>}/></div>
    </Panel>
    <Panel className="fg-w4" title="Selection" subtitle={brush?'Orders inside the brush':'All filtered orders · lasso to select'} testId="panel-selection">
      <dl className="fg-stats">
        <div><dt>Orders</dt><dd data-testid="sel-orders">{base.count.toLocaleString('en-US')}</dd></div>
        <div><dt>Revenue</dt><dd>{formatNumber(base.revenue,usd)}</dd></div>
        <div><dt>Margin</dt><dd>{Number.isFinite(base.margin)?base.margin.toFixed(1)+'%':'–'}</dd></div>
      </dl>
      <div className="fg-chart fg-short"><BarChart testId="chart-selection" categories={CATEGORIES} series={catSeries} value={catValue} mode="grouped" format={usd} label="Selected revenue by category"/></div>
    </Panel>
  </Shell>;
}

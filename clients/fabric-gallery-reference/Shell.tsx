/** Fabric-app-like shell shared by the 2D and 3D pages: rail, header with page tabs, active
 * filter chips, KPI row and footer. Theme tokens and the motion clock come from VizRoot.
 */
import type {ReactNode} from 'react';
import {Activity,BarChart3,Box,Database,Filter as FilterIcon,Home,LayoutDashboard,LayoutGrid,Moon,RotateCcw,Search,Sun,X} from 'lucide-react';
import {useNavigatePage} from '../../src/framework/ui';
import {VizRoot,Kpi,cat,type TokenOverrides} from '../../src/framework/viz/index.ts';
import {THEMES} from './theme.ts';
import {recordClock,type Gallery} from './gallery-state.ts';
import './gallery.css';

export const usd={prefix:'$',digits:3};
export const PAGES=[{id:'dashboard',label:'Overview',icon:LayoutDashboard},{id:'explorer-3d',label:'3D explorer',icon:Box}] as const;
export type PageId=typeof PAGES[number]['id'];

export function Panel({title,subtitle,action,children,className,testId}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string;testId?:string}){
  return <section className={'fg-panel '+(className||'')} data-testid={testId} aria-label={title}>
    <header className="fg-panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>
    <div className="fg-panel-body">{children}</div>
  </section>;
}
export function Clear({show,onClick,label}:{show:boolean;onClick:()=>void;label:string}){return show?<button type="button" className="fg-chip-btn" onClick={onClick} aria-label={'Clear '+label}><X size={12}/>Clear</button>:null;}

export function Shell({g,page,hint,children}:{g:Gallery;page:PageId;hint:string;children:ReactNode}){
  const navigate=useNavigatePage(),{runtime,mode,base,chips,anyFilter}=g;
  const delta=(arr:number[])=>arr[10]?((arr[11]!-arr[10])/arr[10])*100:null;
  const overrides:TokenOverrides=THEMES[mode];
  return <VizRoot mode={mode} overrides={overrides} clock={recordClock} className="fg-app" data-testid="fabric-gallery" data-theme-mode={mode} data-page={page}>
    <nav className="fg-rail" aria-label="Workspace">
      <span className="fg-logo" aria-hidden="true"><LayoutGrid size={18}/></span>
      {[{icon:Home,label:'Home'},{icon:BarChart3,label:'Reports',active:true},{icon:Database,label:'Data'},{icon:Activity,label:'Monitor'}].map(({icon:Icon,label,active})=><button type="button" key={label} className={'fg-rail-btn'+(active?' active':'')} aria-label={label} aria-current={active?'page':undefined}><Icon size={18}/><span>{label}</span></button>)}
    </nav>
    <div className="fg-main">
      <header className="fg-top">
        <div className="fg-crumbs"><span>Contoso sales</span><span aria-hidden="true">/</span><strong>Revenue cockpit</strong><span className="fg-badge">Synthetic data</span></div>
        <nav className="fg-tabs" aria-label="Report pages">{PAGES.map(({id,label,icon:Icon})=><button type="button" key={id} className="fg-tab" aria-current={page===id?'page':undefined} data-testid={'tab-'+id} onClick={()=>{if(page!==id)navigate(id);}}><Icon size={14}/>{label}</button>)}</nav>
        <label className="fg-search"><Search size={14}/><input type="search" placeholder="Search" aria-label="Search (demo)"/></label>
        <div className="fg-actions">
          <button type="button" className="fg-btn" onClick={g.reset} disabled={!anyFilter}><RotateCcw size={14}/>Reset filters</button>
          <button type="button" className="fg-btn" aria-label={mode==='dark'?'Switch to light theme':'Switch to dark theme'} onClick={()=>runtime.applyCue({'fg-theme':mode==='dark'?'light':'dark'})}>{mode==='dark'?<Sun size={14}/>:<Moon size={14}/>}{mode==='dark'?'Light':'Dark'}</button>
        </div>
      </header>
      <div className="fg-filterbar" aria-label="Active filters">
        <FilterIcon size={14}/><span className="fg-filter-count">{chips.length?`${chips.length} filter${chips.length>1?'s':''}`:'No filters'}</span>
        {chips.map(c=><button type="button" key={c.k+c.label} className="fg-chip" onClick={c.clear} aria-label={'Remove filter '+c.label}>{c.label}<X size={12}/></button>)}
        <span className="fg-hint">{hint}</span>
      </div>
      <div className="fg-grid">
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-revenue" label="Revenue" value={base.revenue} format={usd} delta={delta(base.revenueByMonth)} deltaLabel="vs Nov" spark={base.revenueByMonth}/></div>
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-orders" label="Orders" value={base.count} format={{compact:false}} delta={delta(base.ordersByMonth)} deltaLabel="vs Nov" spark={base.ordersByMonth} color={cat(2)}/></div>
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-margin" label="Gross margin" value={base.margin} format={{digits:1,unit:'%',compact:false}} spark={base.marginByMonth} color={cat(4)}/></div>
        <div className="fg-kpi fg-panel"><Kpi testId="kpi-discount" label="Avg discount" value={base.discount} format={{digits:1,unit:'%',compact:false}} spark={base.discountByMonth} color={cat(1)}/></div>
        {children}
      </div>
      <footer className="fg-foot">Synthetic, deterministic sample data (seed 20261005). Not customer, financial or production evidence.</footer>
    </div>
  </VizRoot>;
}

/** Galaxy Navigator: one client-owned component over the registry snapshot.
 * Graph and List are two projections of the same selection (field gn-focus); switching keeps it.
 * Search is literal and local. Focus frames the node and its neighbours (viz motion clock; settles at
 * once under reduced motion or ?capture=1). Export writes the current 2D view as SVG or PNG.
 */
import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {VizRoot,Kpi,BarChart,useMotion,cat,v,lerp} from '../../src/framework/viz/index.ts';
import {FIELDS} from './fields.ts';
import {REGISTRY} from './registry.generated.ts';
import {GROUPS,OTHER_GROUP,STATUS_DASH,STATUS_FILTERS,STATUS_LABEL,STATUS_ORDER,contractsOf,curve,labelSpot,focusBox,layout,neighbours,search,type Graph,type Placed,type StatusFilter} from './registry.ts';
import {exportPng,exportSvg} from './export.ts';
import './galaxy.css';

const GROUP_INDEX=new Map([...GROUPS,OTHER_GROUP].map((g,i)=>[g.id,i]));
const groupColor=(id:string)=>cat(GROUP_INDEX.get(id)??7);
const shortName=(name:string)=>name.replace(/\s*\(.*\)\s*$/,'');
const asView=(x:unknown)=>x==='list'?'list':'graph';
const asFilter=(x:unknown):StatusFilter=>x==='live'||x==='pending'?x:'all';

function useSystemDark(){
  const q=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
  const [dark,setDark]=useState(!!q?.matches);
  useEffect(()=>{if(!q)return;const on=(e:MediaQueryListEvent)=>setDark(e.matches);q.addEventListener('change',on);return()=>q.removeEventListener('change',on);},[q]);
  return dark;
}

export function GalaxyNavigator(){
  const runtime=useRuntime(),snapshot=useSiteState(),dark=useSystemDark();
  const view=asView(snapshot.values[FIELDS.view]),filter=asFilter(snapshot.values[FIELDS.status]);
  const focusValue=String(snapshot.values[FIELDS.focus]??'none'),focus=REGISTRY.nodes.some(n=>n.id===focusValue)?focusValue:null;
  const graph=useMemo(()=>layout(REGISTRY,{allowed:STATUS_FILTERS[filter]}),[filter]);
  const [query,setQuery]=useState(''),[contract,setContract]=useState<string|null>(null),[note,setNote]=useState('');
  const hits=useMemo(()=>search(REGISTRY,query),[query]);
  const matched=useMemo(()=>new Set(hits.map(h=>h.node)),[hits]);
  const svgRef=useRef<SVGSVGElement>(null);
  const select=(id:string|null)=>{setContract(null);runtime.set(FIELDS.focus,id??'none');};
  useEffect(()=>{setContract(null);},[filter]);
  const onSearchKey=(e:KeyboardEvent<HTMLInputElement>)=>{
    if(e.key==='Enter'&&hits[0]){e.preventDefault();select(hits[0].node);}
    if(e.key==='Escape'){setQuery('');}
  };
  const doExport=async(kind:'svg'|'png')=>{
    const svg=svgRef.current;if(!svg){setNote('Switch to the Graph projection to export.');return;}
    const caption=`App Galaxy · ${REGISTRY.source.name}, updated ${REGISTRY.source.updated.slice(0,10)} · ${STATUS_FILTERS[filter].length===STATUS_ORDER.length?'all statuses':filter}${focus?' · focus '+focus:''}`;
    const name=`galaxy-navigator-${focus||'all'}`;
    try{if(kind==='svg')exportSvg(svg,name,caption);else await exportPng(svg,name,caption);setNote(`Exported ${name}.${kind}`);}catch(err){setNote('Export failed: '+(err as Error).message);}
  };
  return <VizRoot mode={dark?'dark':'light'} className="gn" data-testid="galaxy-navigator" data-focus={focus||'none'} data-view={view}>
    <div className="gn-bar">
      <div className="gn-search" role="search">
        <input type="search" data-testid="gn-search" value={query} onChange={e=>setQuery(e.currentTarget.value)} onKeyDown={onSearchKey}
          placeholder="Search apps, repos, contracts" aria-label="Search apps, repositories and contracts" aria-controls="gn-hits" autoComplete="off"/>
        {query.trim()&&<ul id="gn-hits" className="gn-hits" data-testid="gn-hits" aria-label={`${hits.length} results`}>
          {hits.length?hits.map(h=><li key={h.via+h.label}><button type="button" onClick={()=>{select(h.node);if(h.via==='contract')setContract(h.label);}}>
            <span className="gn-hit-label">{h.label}</span><span className="gn-hit-detail">{h.via==='contract'?'contract · ':''}{h.detail}</span></button></li>)
            :<li className="gn-empty">No match</li>}
        </ul>}
      </div>
      <div className="gn-seg" role="group" aria-label="Projection">
        {(['graph','list'] as const).map(p=><button type="button" key={p} data-testid={'gn-view-'+p} aria-pressed={view===p} onClick={()=>runtime.set(FIELDS.view,p)}>{p==='graph'?'Graph':'List'}</button>)}
      </div>
      <label className="gn-filter">Contracts
        <select data-testid="gn-status" value={filter} onChange={e=>runtime.set(FIELDS.status,e.currentTarget.value)}>
          <option value="all">All statuses</option><option value="live">Live only</option><option value="pending">Branch, planned, proposed</option>
        </select>
      </label>
      <div className="gn-export" role="group" aria-label="Export">
        <button type="button" data-testid="gn-export-svg" onClick={()=>void doExport('svg')} disabled={view!=='graph'}>Export SVG</button>
        <button type="button" data-testid="gn-export-png" onClick={()=>void doExport('png')} disabled={view!=='graph'}>Export PNG</button>
      </div>
    </div>
    <p className="gn-source" data-testid="gn-source">Registry snapshot: {REGISTRY.source.name}, updated {REGISTRY.source.updated.slice(0,10)}. {REGISTRY.nodes.length} nodes, {REGISTRY.contracts.length} contracts. Positions are a computed cluster layout, not live data.{note&&<span className="gn-note" role="status"> {note}</span>}</p>
    <div className="gn-main">
      <div className="gn-stage">
        {view==='graph'
          ?<GraphView graph={graph} focus={focus} matched={query.trim()?matched:null} contract={contract} onSelect={select} svgRef={svgRef}/>
          :<ListView graph={graph} focus={focus} matched={query.trim()?matched:null} onSelect={select}/>}
        <Legend/>
      </div>
      <Inspector graph={graph} focus={focus} contract={contract} onContract={setContract} onSelect={select}/>
    </div>
  </VizRoot>;
}

type Box={x:number;y:number;w:number;h:number};
function GraphView({graph,focus,matched,contract,onSelect,svgRef}:{graph:Graph;focus:string|null;matched:Set<string>|null;contract:string|null;onSelect:(id:string|null)=>void;svgRef:React.RefObject<SVGSVGElement|null>}){
  const motion=useMotion();
  const near=useMemo(()=>focus?new Set([focus,...neighbours(REGISTRY,focus)]):null,[focus]);
  const target=useMemo(()=>focus&&near?focusBox(graph,[...near]):{x:0,y:0,w:graph.width,h:graph.height},[graph,focus,near]);
  const [box,setBox]=useState<Box>(target),shown=useRef<Box>(target),[settled,setSettled]=useState(true);
  useEffect(()=>{
    const from={...shown.current};setSettled(false);
    const tween=motion.tween({duration:'slow',curve:'decelerate',onFrame:t=>{const b={x:lerp(from.x,target.x,t),y:lerp(from.y,target.y,t),w:lerp(from.w,target.w,t),h:lerp(from.h,target.h,t)};shown.current=b;setBox(b);},onDone:()=>setSettled(true)});
    return()=>tween.cancel();
  },[target,motion]);
  const dimmed=(id:string)=>near?!near.has(id):matched?!matched.has(id):false;
  const key=(id:string)=>(e:KeyboardEvent<SVGGElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(focus===id?null:id);}};
  const scale=box.w/graph.width;
  return <div className="gn-frame"><svg ref={svgRef} className="gn-svg" data-testid="gn-graph" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="group" aria-label="App Galaxy graph. Nodes are apps and repositories, edges are shared contracts."
    style={{aspectRatio:`${graph.width}/${graph.height}`}} data-viz-settled={settled?'true':'false'} onClick={e=>{if(e.target===e.currentTarget)onSelect(null);}}>
    <defs>
      <marker id="gn-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill={v('inkMuted')}/></marker>
      <marker id="gn-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill={v('accent')}/></marker>
    </defs>
    <rect className="gn-bg" x={box.x} y={box.y} width={box.w} height={box.h} fill={v('surface')} onClick={()=>onSelect(null)}/>
    <g className="gn-clusters" aria-hidden="true">
      {graph.clusters.map(c=><g key={c.group.id}>
        <circle cx={c.x} cy={c.y} r={c.r} fill={groupColor(c.group.id)} fillOpacity={0.06} stroke={groupColor(c.group.id)} strokeOpacity={0.35} strokeDasharray="3 5"/>
        <text x={c.x} y={c.labelBelow?c.y+c.r+18:c.y-c.r-8} textAnchor="middle" className="gn-cluster-label" fill={v('inkSecondary')}>{c.group.label}</text>
      </g>)}
    </g>
    <g className="gn-edges" data-testid="gn-edges">
      {graph.pairs.map(p=>{
        const a=graph.byId.get(p.from)!,b=graph.byId.get(p.to)!;
        const on=(!!focus&&(p.from===focus||p.to===focus)&&(!contract||p.edges.some(e=>e.contract===contract)))||(!!contract&&!focus&&p.edges.some(e=>e.contract===contract));
        const off=!on&&(!!near||!!matched&&!(matched.has(p.from)&&matched.has(p.to)));
        return <path key={p.id} d={curve(a,b)} data-pair={p.id} data-status={p.status} fill="none"
          stroke={on?v('accent'):v('inkMuted')} strokeWidth={(on?1.8:1)+Math.min(3,p.edges.length-1)*0.6} strokeDasharray={STATUS_DASH[p.status]||undefined}
          strokeOpacity={off?0.12:on?0.95:0.55} markerEnd={on?'url(#gn-arrow-on)':'url(#gn-arrow)'} vectorEffect="non-scaling-stroke">
          <title>{`${p.from} → ${p.to}: ${p.edges.map(e=>e.contract).join(', ')}`}</title>
        </path>;
      })}
    </g>
    <g className="gn-nodes">
      {graph.nodes.map(n=>{
        const selected=focus===n.id,dim=dimmed(n.id),hit=!!matched?.has(n.id);
        return <g key={n.id} className="gn-node" data-node={n.id} data-kind={n.kind} data-dimmed={dim?'true':'false'} transform={`translate(${n.x},${n.y})`}
          role="button" tabIndex={0} aria-pressed={selected} aria-label={`${n.name}, ${n.kind==='app'?'app':'repository'}, ${n.group.label}, ${n.degree} links`}
          onClick={e=>{e.stopPropagation();onSelect(selected?null:n.id);}} onKeyDown={key(n.id)} opacity={dim?0.25:1}>
          <circle className="gn-hit" r={n.r+8} fill="transparent"/>
          {(selected||hit)&&<circle r={n.r+5*Math.max(scale,0.6)} fill="none" stroke={selected?v('selection'):v('accent')} strokeWidth={selected?2.5:1.5} strokeDasharray={selected?undefined:'2 2'} vectorEffect="non-scaling-stroke"/>}
          {n.kind==='app'
            ?<circle r={n.r} fill={groupColor(n.group.id)} stroke={v('surface')} strokeWidth={1.5}/>
            :<rect x={-n.r} y={-n.r} width={n.r*2} height={n.r*2} rx={3} fill={v('surface')} stroke={groupColor(n.group.id)} strokeWidth={2}/>}
          {n.hub&&<circle r={n.r*0.38} fill={v('surface')}/>}
          <text {...(l=>({x:l.x,y:l.y,textAnchor:l.anchor}))(labelSpot(n))} className="gn-label" fill={v('ink')} stroke={v('surface')} strokeWidth={3} paintOrder="stroke">{shortName(n.name)}</text>
        </g>;
      })}
    </g>
  </svg></div>;
}

function ListView({graph,focus,matched,onSelect}:{graph:Graph;focus:string|null;matched:Set<string>|null;onSelect:(id:string|null)=>void}){
  const rows=useMemo(()=>[...graph.nodes].sort((a,b)=>b.degree-a.degree||a.name.localeCompare(b.name)).map(n=>{const c=contractsOf(REGISTRY,n.id);return {n,provides:c.provides.length,consumes:c.consumes.length};}),[graph]);
  return <div className="gn-list" data-testid="gn-list">
    <table>
      <caption className="gn-sr">Apps and repositories, sorted by number of links</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Group</th><th scope="col" className="gn-num">Provides</th><th scope="col" className="gn-num">Consumes</th><th scope="col" className="gn-num">Links</th></tr></thead>
      <tbody>{rows.filter(r=>!matched||matched.has(r.n.id)).map(({n,provides,consumes})=><tr key={n.id} data-node={n.id} aria-selected={focus===n.id}>
        <td><button type="button" aria-pressed={focus===n.id} onClick={()=>onSelect(focus===n.id?null:n.id)}><span className="gn-swatch" data-kind={n.kind} style={{['--gn-c' as string]:groupColor(n.group.id)}}/>{n.name}</button></td>
        <td>{n.kind==='app'?'App':'Repository'}</td><td>{n.group.label}</td><td className="gn-num">{provides}</td><td className="gn-num">{consumes}</td><td className="gn-num">{n.degree}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Legend(){
  return <div className="gn-legend" aria-label="Legend">
    <ul>{[...GROUPS,OTHER_GROUP].map(g=><li key={g.id}><span className="gn-swatch" style={{['--gn-c' as string]:groupColor(g.id)}}/>{g.label}</li>)}
      <li><span className="gn-swatch" data-kind="repo" style={{['--gn-c' as string]:v('inkMuted')}}/>Repository</li></ul>
    <ul>{STATUS_ORDER.slice(0,4).map(s=><li key={s}><svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke={v('inkMuted')} strokeWidth="2" strokeDasharray={STATUS_DASH[s]||undefined}/></svg>{STATUS_LABEL[s]}</li>)}</ul>
  </div>;
}

function Inspector({graph,focus,contract,onContract,onSelect}:{graph:Graph;focus:string|null;contract:string|null;onContract:(id:string|null)=>void;onSelect:(id:string|null)=>void}){
  const counts=useMemo(()=>STATUS_ORDER.map(s=>({s,n:REGISTRY.contracts.filter(c=>c.status===s).length})).filter(x=>x.n>0),[]);
  if(!focus){
    const apps=REGISTRY.nodes.filter(n=>n.kind==='app').length;
    return <aside className="gn-inspector" data-testid="gn-inspector" aria-label="Overview">
      <h2>Overview</h2>
      <div className="gn-kpis"><Kpi label="Apps" value={apps} testId="gn-kpi-apps"/><Kpi label="Repos" value={REGISTRY.nodes.length-apps} testId="gn-kpi-repos"/><Kpi label="Contracts" value={REGISTRY.contracts.length} testId="gn-kpi-contracts"/></div>
      <div className="gn-bars"><BarChart testId="gn-status-bars" categories={counts.map(c=>({key:c.s,label:STATUS_LABEL[c.s]}))} series={[{key:'n',label:'Contracts'}]} value={k=>counts.find(c=>c.s===k)?.n||0} format={{digits:0}} label="Contracts by status"/></div>
      <p className="gn-hint">Search, or select a node to focus it with its neighbours. {graph.loops.length?`${graph.loops.length} internal contract(s) are listed on their app.`:''}</p>
    </aside>;
  }
  const node=graph.byId.get(focus)||{...REGISTRY.nodes.find(n=>n.id===focus)!,group:OTHER_GROUP,degree:0} as Placed;
  const {provides,consumes}=contractsOf(REGISTRY,focus);
  const nameOf=(id:string)=>shortName(REGISTRY.nodes.find(n=>n.id===id)?.name||id);
  const pill=(s:keyof typeof STATUS_LABEL)=><span className="gn-pill" data-status={s}>{STATUS_LABEL[s]}</span>;
  return <aside className="gn-inspector" data-testid="gn-inspector" aria-label={`Details for ${node.name}`}>
    <div className="gn-head"><h2 data-testid="gn-inspector-title">{node.name}</h2><button type="button" className="gn-close" onClick={()=>onSelect(null)} aria-label="Clear focus">Clear</button></div>
    <dl className="gn-facts">
      <dt>Kind</dt><dd>{node.kind==='app'?'App':'Repository'}{node.hub?' · hub':''}</dd>
      <dt>Group</dt><dd>{groupOfLabel(focus)}</dd>
      {node.stack&&<><dt>Stack</dt><dd>{node.stack}</dd></>}
      {node.repo&&<><dt>Repo</dt><dd>{node.repo}</dd></>}
    </dl>
    <h3>Provides <span className="gn-count">{provides.length}</span></h3>
    <ul className="gn-contracts" data-testid="gn-provides">{provides.map(c=><li key={c.id}>
      <button type="button" aria-pressed={contract===c.id} onClick={()=>onContract(contract===c.id?null:c.id)}><code>{c.id}</code>{pill(c.status)}</button>
      <span className="gn-cname">{c.name}</span>
      {c.consumers.length>0&&<span className="gn-to">to {c.consumers.map((x,i)=><span key={x}>{i?', ':''}{x===focus?'itself':<a href={'#'+x} onClick={e=>{e.preventDefault();onSelect(x);}}>{nameOf(x)}</a>}</span>)}</span>}
    </li>)}{!provides.length&&<li className="gn-empty">None in the registry</li>}</ul>
    <h3>Consumes <span className="gn-count">{consumes.length}</span></h3>
    <ul className="gn-contracts" data-testid="gn-consumes">{consumes.map(c=><li key={c.contract+c.from}>
      <button type="button" aria-pressed={contract===c.contract} onClick={()=>onContract(contract===c.contract?null:c.contract)}><code>{c.contract}</code>{pill(c.status)}</button>
      <span className="gn-to">from <a href={'#'+c.from} onClick={e=>{e.preventDefault();onSelect(c.from);}}>{nameOf(c.from)}</a></span>
    </li>)}{!consumes.length&&<li className="gn-empty">None in the registry</li>}</ul>
  </aside>;
}
const groupOfLabel=(id:string)=>(GROUPS.find(g=>g.members.includes(id))||OTHER_GROUP).label;

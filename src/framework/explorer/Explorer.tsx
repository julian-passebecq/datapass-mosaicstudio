import {lazy,Suspense,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Search,ChevronRight,Layers,BookOpen,Box,Waypoints,ArrowUpRight,ArrowLeft,ArrowRight,Link as LinkIcon,PanelLeftClose,X} from 'lucide-react';
import {useRuntime,useSiteState,useReducedMotion,useNavigatePage} from '../hooks';
import {validateExplorer,readExplorerState,explorerStatePatch,type ExplorerBlock,type ExplorerItem,type ExplorerDocument} from './model';
import {navigateExplorer,ancestors,contextDocuments,isInBranch,explorerCamera,journeyStops,searchExplorer,explorerLink,readExplorerLink,type ExplorerAction} from './navigation';
import {validateScene,scenePartLimit} from '../scene';
import {useJourney} from './useJourney';
import './explorer.css';
import '../blocks/scene3d.css';
const MapView=lazy(()=>import('./MapView'));
const SceneViewport=__STUDIO_3D__?lazy(()=>import('../scene-renderer/SceneViewport')):null;
const consumedLinks=new WeakMap<object,Set<string>>();
const empty=(text:string)=><div className="explorer-empty"><BookOpen size={22}/><p>{text}</p></div>;
function DocumentView({doc}:{doc:ExplorerDocument}){
  return <article className="explorer-document" aria-label={doc.title}><header><span className="explorer-eyebrow">{doc.provenance} / {doc.facet}</span><h2>{doc.title}</h2><p>{doc.summary}</p></header>{doc.sections.map((section,index)=><section key={index}><h3>{section.title}</h3><p>{section.text}</p>{section.code&&<div className="explorer-code"><small>{section.language||'text'} / read-only</small><pre><code>{section.code}</code></pre></div>}</section>)}<footer>Source: {doc.source}. Displayed content is not an execution receipt.</footer></article>;
}
export default function Explorer({block}:{block:ExplorerBlock}){
  const runtime=useRuntime(),snapshot=useSiteState(),reduced=useReducedMotion(),navigate=useNavigatePage();
  const spec=useMemo(()=>validateExplorer(runtime.definition.resources!.explorers![block.resource]),[runtime,block.resource]);
  const scene=useMemo(()=>spec.scene?validateScene(runtime.definition.resources!.scenes![spec.scene],{maxParts:scenePartLimit(runtime.definition)}):null,[runtime,spec]);
  const state=readExplorerState(block,snapshot.values),stateRef=useRef(state);stateRef.current=state;
  const [query,setQuery]=useState(''),[error,setError]=useState(''),[link,setLink]=useState(''),[outline,setOutline]=useState(true),[wide,setWide]=useState(()=>matchMedia('(min-width: 1100px) and (min-height: 720px)').matches);
  const search=useRef<HTMLInputElement>(null),root=useRef<HTMLElement>(null),track=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),readLink=useRef(false);
  const appearance=runtime.manifest.theme.mode||'light';
  const stops=useMemo(()=>journeyStops(spec,state.group),[spec,state.group]);
  function publish(action:ExplorerAction){const next=navigateExplorer(spec,stateRef.current,action);runtime.patch(explorerStatePatch(block,next));}
  const tour=useJourney(track,stage,stops,id=>publish(id==='overview'?{type:'overview'}:{type:'select',id}),snapshot.restoreEpoch,!!block.scroll&&wide&&!reduced&&state.view!=='library');
  function act(action:ExplorerAction){tour.pause();if(action.type==='view'&&action.value==='library'||action.type==='document')tour.disable();publish(action);setQuery('');setError('');}
  useEffect(()=>{
    const media=matchMedia('(min-width: 1100px) and (min-height: 720px)'),update=()=>setWide(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    if(readLink.current)return;readLink.current=true;
    const consumed=consumedLinks.get(runtime)||new Set<string>();if(consumed.has(block.id))return;consumed.add(block.id);consumedLinks.set(runtime,consumed);
    try{const linked=readExplorerLink(location.href,block.id,spec,stateRef.current);if(linked)runtime.patch(explorerStatePatch(block,linked));}
    catch(e){setError('View link was not applied: '+(e instanceof Error?e.message:String(e)));}
  },[runtime,spec,block]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&root.current&&root.current.getBoundingClientRect().bottom>0&&root.current.getBoundingClientRect().top<innerHeight){e.preventDefault();search.current?.focus();}
    if(e.key==='Escape'){setQuery('');setLink('');}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const focused=spec.items.find(i=>i.id===state.focus),path=ancestors(spec,state.focus),docs=contextDocuments(spec,state);
  const chosen=spec.documents.find(d=>d.id===state.document),hits=useMemo(()=>searchExplorer(spec,query,state.group),[spec,query,state.group]);
  const eligible=spec.items.filter(i=>state.group==='all'||i.group===state.group);
  const roots=eligible.filter(i=>!i.parent),children=eligible.filter(i=>i.parent===state.focus);
  const highlighted=focused?eligible.filter(i=>isInBranch(spec,i.id,state.focus)).map(i=>i.scene?.entity).filter((id):id is string=>!!id):state.group!=='all'?eligible.map(i=>i.scene?.entity).filter((id):id is string=>!!id):null;
  const anchors=useMemo(()=>spec.items.filter(i=>i.scene&&!i.parent).map(i=>({entity:i.scene!.entity,label:i.label})),[spec]);
  const selectEntity=(entity:string)=>{const item=spec.items.find(i=>i.scene?.entity===entity);if(item)act({type:'select',id:item.id});};
  const stopIndex=stops.indexOf(state.focus),currentIndex=stopIndex<0?0:stopIndex;
  function step(delta:number){const id=stops[Math.max(0,Math.min(stops.length-1,currentIndex+delta))];act(id==='overview'?{type:'overview'}:{type:'select',id});}
  function share(){setLink(explorerLink(location.href,block.id,spec,state));tour.pause();}
  const itemButton=(item:ExplorerItem,depth=0)=><button type="button" key={item.id} style={{'--depth':depth} as CSSProperties} aria-label={'Explore '+item.label} aria-current={state.focus===item.id?'true':undefined} onClick={()=>act({type:'select',id:item.id})}><span className="explorer-node-dot"/><span>{item.label}</span><ChevronRight size={12}/></button>;
  const renderTree=(item:ExplorerItem,depth=0):import('react').ReactNode=><div key={item.id}>{itemButton(item,depth)}{(state.view==='library'||path.some(p=>p.id===item.id)||state.focus==='overview')&&eligible.filter(i=>i.parent===item.id).map(i=>renderTree(i,depth+1))}</div>;
  const inspector=<aside className="explorer-inspector" aria-label="Context details"><header><span className="explorer-eyebrow">{state.level==='overview'?'System overview':focused?.kind}</span><h2>{focused?.label||spec.title}</h2><p>{focused?.description||spec.description}</p></header>
    <div className="explorer-facets" role="group" aria-label="Context facets">{spec.facets.map(f=><button type="button" key={f.id} aria-pressed={state.facet===f.id} onClick={()=>act({type:'facet',id:f.id})}>{f.label}</button>)}</div>
    {focused?.facts.length? <dl className="explorer-facts">{focused.facts.map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>:null}
    {focused?.tags.length? <div className="explorer-tags">{focused.tags.map(t=><span key={t}>{t}</span>)}</div>:null}
    {children.length>0&&<section><h3>Inside this component</h3>{children.map(i=><button className="explorer-detail-link" type="button" key={i.id} onClick={()=>act({type:'select',id:i.id})}><span>{i.label}</span><ChevronRight size={14}/></button>)}</section>}
    <section><h3>{spec.facets.find(f=>f.id===state.facet)?.label} <small>{docs.length}</small></h3>{docs.length?docs.map(doc=><button type="button" className="explorer-doc-link" key={doc.id} onClick={()=>act({type:'document',id:doc.id})}><BookOpen size={15}/><span><strong>{doc.title}</strong><small>{doc.summary}</small></span><ChevronRight size={12}/></button>):<p className="explorer-muted">No document was supplied for this facet. Missing evidence is not a certification or a completed project.</p>}</section>
    {focused?.open&&<button type="button" className="explorer-open-page" onClick={()=>{tour.disable();navigate(focused.open!.page);}}>{focused.open.label}<ArrowUpRight size={15}/></button>}
    <footer>{spec.provenance} content / authored relationships. No live infrastructure or performance is inferred.</footer>
  </aside>;
  return <section ref={root} className={'site-explorer '+appearance} aria-label={block.title||spec.title} data-testid="explorer" data-view={state.view} data-focus={state.focus} data-facet={state.facet} data-level={state.level}>
    <header className="explorer-top"><div className="explorer-title"><Layers size={17}/><strong>{block.title||spec.title}</strong><span>{spec.provenance}</span></div><div className="explorer-search"><Search size={14}/><input ref={search} type="search" maxLength={160} aria-label="Search components and documents" placeholder="Find a component or document" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>Ctrl K</kbd>{query&&<div className="explorer-search-results"><small>{hits.length} results in the selected domain</small>{hits.length?<ul aria-label="Search results">{hits.map(hit=><li key={hit.kind+hit.id}><button type="button" onClick={()=>act(hit.kind==='item'?{type:'select',id:hit.id}:{type:'document',id:hit.id})}><span>{hit.kind==='item'?<Box size={15}/>:<BookOpen size={15}/>}</span><span><strong>{hit.label}</strong><small>{hit.detail}</small></span></button></li>)}</ul>:<p>No matching content.</p>}</div>}</div><button type="button" onClick={share} aria-label="Share this explorer view"><LinkIcon size={14}/><span>View link</span></button></header>
    {error&&<div className="explorer-alert" role="alert">{error}<button type="button" onClick={()=>setError('')}>Dismiss view error</button></div>}
    {link&&<div className="explorer-share"><label>Presentation link<input readOnly aria-label="Presentation link" value={link} onFocus={e=>e.currentTarget.select()}/></label><p>Contains only view IDs, not data, calculations or private evidence. Content must already be approved for this website.</p><button type="button" onClick={()=>setLink('')} aria-label="Close presentation link"><X size={14}/></button></div>}
    <div className="explorer-viewbar"><div role="group" aria-label="Explorer views">{scene&&<button type="button" aria-pressed={state.view==='spatial'} onClick={()=>act({type:'view',value:'spatial'})}><Box size={14}/>Spatial</button>}<button type="button" aria-pressed={state.view==='map'} onClick={()=>act({type:'view',value:'map'})}><Waypoints size={14}/>Map</button><button type="button" aria-pressed={state.view==='library'} onClick={()=>act({type:'view',value:'library'})}><BookOpen size={14}/>Library</button></div><div role="group" aria-label="Detail level">{(['overview','focus','evidence'] as const).map((level,index)=><button type="button" key={level} aria-pressed={state.level===level} disabled={level!=='overview'&&!focused} onClick={()=>act({type:'level',value:level})}><small>L{index+1}</small>{level[0].toUpperCase()+level.slice(1)}</button>)}</div></div>
    <div className="explorer-filterbar"><label>Domain<select aria-label="Explorer domain" value={state.group} onChange={e=>act({type:'group',id:e.target.value})}><option value="all">All domains</option>{spec.groups.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label><nav aria-label="Explorer breadcrumb"><button type="button" onClick={()=>act({type:'overview'})}>Overview</button>{path.map(i=><span key={i.id}><ChevronRight size={12}/><button type="button" aria-current={i.id===state.focus?'location':undefined} onClick={()=>act({type:'select',id:i.id})}>{i.label}</button></span>)}</nav><button type="button" className="explorer-outline-toggle" aria-pressed={outline} onClick={()=>setOutline(v=>!v)}><PanelLeftClose size={14}/>Outline</button></div>
    <div ref={track} className={'explorer-tour-track'+(tour.guided?' guided':'')} style={{'--tour-height':Math.max(220,stops.length*66)+'vh'} as CSSProperties}>
      <div ref={stage} className="explorer-stage">
        {block.scroll&&state.view!=='library'&&<div className="explorer-tour-bar"><span>{tour.guided?(tour.following?'Scroll tour active':'Tour paused for direct exploration'):'Explore freely, or move through the map with native page scrolling.'}</span><div><button type="button" onClick={()=>step(-1)} disabled={currentIndex===0} aria-label="Previous explorer stop"><ArrowLeft size={13}/></button><small>{currentIndex+1} / {stops.length}</small><button type="button" onClick={()=>step(1)} disabled={currentIndex===stops.length-1} aria-label="Next explorer stop"><ArrowRight size={13}/></button>{!tour.guided?<button type="button" disabled={!wide||reduced} title={reduced?'Reduced motion: use the previous/next controls.':!wide?'Use previous/next on small screens.':'Native page scroll; no wheel interception.'} onClick={tour.start}>Start scroll tour</button>:<><button type="button" onClick={tour.following?tour.pause:tour.start}>{tour.following?'Pause tour':'Resume scroll tour'}</button><button type="button" onClick={()=>{tour.disable();root.current?.scrollIntoView({behavior:'instant',block:'start'});}}>Exit tour</button></>}</div></div>}
        <div className={'explorer-layout'+(!outline?' no-outline':'')}>
          {outline&&<nav className="explorer-outline" aria-label="Component outline"><span className="explorer-eyebrow">Contents</span><button type="button" aria-current={state.focus==='overview'?'true':undefined} onClick={()=>act({type:'overview'})}><Layers size={13}/><span>Overview</span></button>{roots.map(i=>renderTree(i))}<p>{eligible.length} components / {spec.documents.length} authored documents</p></nav>}
          <div role="region" className="explorer-content" aria-label="Explorer content"><Suspense fallback={empty('Preparing the selected view...')}>
            {state.view==='spatial'&&scene&&SceneViewport&&<><SceneViewport scene={scene} view={{camera:explorerCamera(spec,state)!,selection:focused?.scene?.entity||'none',explode:state.level==='evidence'?.5:0,phase:0}} onSelect={selectEntity} title="Interactive system" fileName={block.resource} appearance={appearance} anchors={anchors.filter(a=>eligible.some(i=>i.scene?.entity===a.entity))} highlighted={highlighted} pageScroll interactive={!tour.guided||!tour.following}/><p className="explorer-stage-caption">{focused?focused.summary:'Select a component to focus it. The same selection follows you into Map and Library.'}</p></>}
            {state.view==='map'&&<MapView spec={spec} state={state} onSelect={id=>act({type:'select',id})} reduced={reduced}/>}
            {state.view==='library'&&(chosen?<DocumentView doc={chosen}/>:<div className="explorer-library"><span className="explorer-eyebrow">{focused?.label||'Knowledge library'} / {spec.facets.find(f=>f.id===state.facet)?.label}</span><h2>{focused?'Inside '+focused.label:'From the system to the evidence'}</h2><p>Choose a document, change the facet, or search across the authored collection.</p>{docs.length?<div>{docs.map(doc=><button type="button" key={doc.id} className="explorer-library-card" onClick={()=>act({type:'document',id:doc.id})}><BookOpen size={19}/><span><small>{spec.items.find(i=>i.id===doc.item)?.label}</small><strong>{doc.title}</strong><p>{doc.summary}</p></span><ArrowUpRight size={16}/></button>)}</div>:empty('No documents in this context. Try another facet or return to the overview.')}</div>)}
          </Suspense></div>{inspector}
        </div>
      </div>
    </div>
  </section>;
}

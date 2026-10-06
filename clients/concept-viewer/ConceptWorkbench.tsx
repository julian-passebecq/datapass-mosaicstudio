import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ClipboardPaste,Download,FolderOpen,Home,Link,PanelRight,Play,X} from 'lucide-react';
import {useReducedMotion} from '../../src/framework/hooks.tsx';
import {readConceptJson,ConceptSpecError,type ConceptSpec,type ConceptIssue} from '../../src/framework/concept/schema.ts';
import {layerCakeSvg} from '../../src/framework/concept/flat.ts';
import {isometricSvg} from '../../src/framework/concept/iso.ts';
import {layerTint,layerRoleText} from '../../src/framework/concept/kinds.ts';
import {step,OVERVIEW,FILM_DURATION,type Nav} from '../../src/framework/concept/navigation.ts';
import {NodeDetails} from '../../src/framework/concept/react/NodeDetails.tsx';
import '../../src/framework/concept/react/concept.css';
import './viewer.css';
import {RENDERINGS,type Rendering} from './examples.ts';
import {PanZoom} from './PanZoom.tsx';

const Stage=lazy(()=>import('../../src/framework/concept/react/ConceptStage.tsx'));
const Film=lazy(()=>import('../../src/framework/concept/react/ConceptFilm.tsx'));
function download(name:string,text:string){
  const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** A place a spec can come from: a bundled example, a file, a URL or pasted text. `read` returns the raw JSON text. */
export type SpecSource={key:string;read():Promise<string>};
export type SpecExample=SpecSource&{label:string;provenance:string};
export type Problem={source:string;issues:ConceptIssue[]};
/** Outcome of every load attempt, reported to the host (the standalone embed API forwards it to the parent page). */
export type LoadResult={source:string;ok:true;id:string;warnings:ConceptIssue[]}|{source:string;ok:false;issues:ConceptIssue[]};
type Loaded={spec:ConceptSpec;source:string;warnings:ConceptIssue[]};
/** Frame width below which the embed chrome collapses the details panel into a toggle. */
export const EMBED_PANEL_MIN_WIDTH=1100;
function useMedia(query:string){
  const [on,setOn]=useState(()=>typeof matchMedia==='function'&&matchMedia(query).matches);
  useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia(query),f=()=>setOn(m.matches);f();m.addEventListener('change',f);return()=>m.removeEventListener('change',f);},[query]);
  return on;
}
const toProblem=(source:string,e:unknown):Problem=>({source,issues:e instanceof ConceptSpecError?e.issues:[{path:'',message:e instanceof Error?e.message:String(e)}]});

/**
 * Concept spec v1 workbench shared by the concept-viewer client and the standalone file. The host decides where
 * specs come from (examples, the first source) and owns the rendering choice; the workbench validates, renders the
 * three views, lists errors (path + message) and warnings, and exports SVG. A file that fails validation never
 * replaces the current spec. `openUrl` and `paste` add the standalone inputs.
 * `chrome="embed"` (host pages) drops the example gallery, the open/URL/paste inputs and drag-and-drop, and collapses
 * the details panel below EMBED_PANEL_MIN_WIDTH. `fit` shows the whole diagram in every view (no readable zoom-in).
 */
export function ConceptWorkbench({view,onView,examples,initial,initialProblem=null,onOpened,onResult,incoming,openUrl,paste=false,brand='CONCEPT VIEWER',chrome='full',fit=false,theme='light'}:{
  view:Rendering;onView(view:Rendering):void;examples:readonly SpecExample[];initial:SpecSource|null;initialProblem?:Problem|null;
  onOpened?(key:string):void;onResult?(result:LoadResult):void;
  /** A spec pushed by the host (embed API). Each new `seq` is opened like a picked file. */
  incoming?:SpecSource&{seq:number};
  openUrl?(url:string):SpecSource|Problem;paste?:boolean;brand?:string;
  chrome?:'full'|'embed';fit?:boolean;theme?:'light'|'dark'|'auto';
}){
  const embed=chrome==='embed';
  const narrow=useMedia(`(max-width:${EMBED_PANEL_MIN_WIDTH-.02}px)`),prefersDark=useMedia('(prefers-color-scheme: dark)');
  const dark=theme==='dark'||(theme==='auto'&&prefersDark);
  const collapsible=embed&&narrow;
  const [panelOpen,setPanelOpen]=useState(false);
  const reduced=useReducedMotion();
  const [loaded,setLoaded]=useState<Loaded|null>(null),[problem,setProblem]=useState<Problem|null>(initialProblem),[dragging,setDragging]=useState(false);
  const [showWarnings,setShowWarnings]=useState(true),[input,setInput]=useState<'url'|'paste'|null>(null),[draft,setDraft]=useState('');
  const [nav,setNav]=useState<Nav>({layer:OVERVIEW,domain:-1,selection:'none'});
  const query=useMemo(()=>new URLSearchParams(typeof location==='undefined'?'':location.search),[]);
  const [film,setFilm]=useState(()=>query.get('film')==='1'?{start:Math.max(0,Math.min(FILM_DURATION,Number(query.get('t')??0)||0)),autoplay:query.get('paused')!=='1',chrome:query.get('chrome')!=='0'}:null);
  const fileInput=useRef<HTMLInputElement>(null);
  const open=useCallback(async(source:SpecSource)=>{
    try{const {spec,warnings}=readConceptJson(await source.read());setLoaded({spec,source:source.key,warnings});setProblem(null);setShowWarnings(true);
      setNav({layer:OVERVIEW,domain:-1,selection:'none'});onOpened?.(source.key);onResult?.({source:source.key,ok:true,id:spec.id,warnings});return true;}
    catch(e){const p=toProblem(source.key,e);setProblem(p);onResult?.({source:source.key,ok:false,issues:p.issues});return false;}
  },[onOpened,onResult]);
  useEffect(()=>{if(incoming)void open(incoming);
    // Only a new seq opens again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[incoming?.seq]);
  const openFile=useCallback((file:File)=>open({key:file.name,read:()=>file.text()}),[open]);
  useEffect(()=>{if(initial)void open(initial);
    // The first source is read once; later choices go through open().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // Drag and drop anywhere on the page.
  useEffect(()=>{
    if(embed)return;
    let depth=0;
    const enter=(e:DragEvent)=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();depth++;setDragging(true);};
    const over=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();};
    const leave=()=>{depth=Math.max(0,depth-1);if(!depth)setDragging(false);};
    const drop=(e:DragEvent)=>{e.preventDefault();depth=0;setDragging(false);const f=e.dataTransfer?.files?.[0];if(f)void openFile(f);};
    window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
  },[openFile,embed]);
  const spec=loaded?.spec??null;
  const select=useCallback((id:string)=>{if(!spec)return;setPanelOpen(true);setNav(n=>{if(n.selection===id)return {...n,selection:'none'};const node=spec.nodes.find(x=>x.id===id);if(!node)return n;
    return {selection:id,layer:spec.layers.findIndex(l=>l.id===node.layer),domain:spec.domains.findIndex(d=>d.id===node.domain)};});},[spec]);
  const go=useCallback((dir:'up'|'down'|'left'|'right'|'home')=>{if(spec)setNav(n=>step(spec,n,dir));},[spec]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(film||(e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]'))return;
      const map:Record<string,'up'|'down'|'left'|'right'|'home'>={ArrowUp:'up',PageUp:'up',ArrowDown:'down',PageDown:'down',ArrowLeft:'left',ArrowRight:'right',Home:'home'};
      if(map[e.key]&&view==='3d'){e.preventDefault();go(map[e.key]);}
      else if(e.key==='Escape')setNav(n=>({...n,selection:'none'}));
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[go,film,view]);
  const svg=useMemo(()=>!spec||view==='3d'?'':view==='layered'?layerCakeSvg(spec,nav.selection):isometricSvg(spec,nav.selection),[spec,view,nav.selection]);
  const svgClick=(e:React.MouseEvent)=>{const el=(e.target as Element).closest('[data-node],[data-entity]');const id=el?.getAttribute('data-node')??el?.getAttribute('data-entity');if(id)select(id);};
  const closeFilm=useCallback(()=>setFilm(null),[]);
  const submit=async()=>{
    const text=draft.trim();if(!text)return;
    if(input==='paste'){if(await open({key:'pasted JSON',read:async()=>text}))setInput(null);return;}
    const target=openUrl?.(text);if(!target)return;
    if('issues' in target){setProblem(target);return;}
    if(await open(target))setInput(null);
  };
  const activeLayer=spec&&nav.selection!=='none'?spec.layers.findIndex(l=>l.id===spec.nodes.find(n=>n.id===nav.selection)?.layer):nav.layer;
  const warnings=loaded?.warnings??[];
  const panelHidden=collapsible&&!panelOpen;
  return <section className={'aa cv'+(embed?' cv-embed':'')+(collapsible?' cv-narrow':'')+(fit?' cv-fit':'')+(dark?' cv-dark':'')} data-testid="concept-viewer" data-chrome={chrome} data-fit={fit?'true':'false'} data-theme={dark?'dark':'light'} data-panel={panelHidden?'collapsed':'shown'} data-spec={spec?.id??''} data-view={view} data-selection={nav.selection} data-layer={nav.layer} data-source={loaded?.source??''} data-problem={problem?'true':'false'} data-warnings={warnings.length}>
    <header className="aa-top">
      <div className="aa-brand"><span className="aa-mark"><i/><i/><i/></span><span>{brand}<small>concept spec v1 · any app or cloud</small></span></div>
      {!embed&&<nav className="aa-tabs" aria-label="Examples">{examples.map(x=><button key={x.key} aria-pressed={loaded?.source===x.key} onClick={()=>void open(x)}>{x.label}<small>{x.provenance}</small></button>)}
        <button onClick={()=>fileInput.current?.click()} title="Open a .json concept spec (or drop it anywhere)"><FolderOpen size={13}/> Open file</button>
        {openUrl&&<button aria-pressed={input==='url'} onClick={()=>{setInput(input==='url'?null:'url');setDraft('');}} title="Open a concept spec from an https:// URL"><Link size={13}/> URL</button>}
        {paste&&<button aria-pressed={input==='paste'} onClick={()=>{setInput(input==='paste'?null:'paste');setDraft('');}} title="Paste concept spec JSON"><ClipboardPaste size={13}/> Paste</button>}
        <input ref={fileInput} type="file" accept=".json,application/json" hidden data-testid="concept-file" onChange={e=>{const f=e.target.files?.[0];if(f)void openFile(f);e.target.value='';}}/></nav>}
      <div className="aa-views" role="group" aria-label="Rendering">{RENDERINGS.map(r=><button key={r.id} aria-pressed={view===r.id} onClick={()=>onView(r.id)}>{r.label}</button>)}</div>
      <div className="aa-actions">
        <button disabled={!spec} onClick={()=>spec&&download(spec.id+'.isometric.svg',isometricSvg(spec))} title="Download the isometric SVG"><Download size={13}/> Isometric SVG</button>
        <button disabled={!spec} onClick={()=>spec&&download(spec.id+'.layered.svg',layerCakeSvg(spec))} title="Download the layer cake SVG"><Download size={13}/> Layer cake SVG</button>
        <button className="aa-play" disabled={!spec} onClick={()=>setFilm({start:0,autoplay:true,chrome:true})}><Play size={12}/> Film</button>
        {collapsible&&<button aria-pressed={panelOpen} aria-controls="cv-panel" data-testid="concept-panel-toggle" onClick={()=>setPanelOpen(o=>!o)} title="Show or hide the details panel"><PanelRight size={13}/> Details</button>}
      </div>
    </header>
    <div className="aa-body">
      <nav className="aa-rail" aria-label="Layers (top to bottom)">
        <span className="aa-eyebrow">LAYERS</span>
        {spec&&<><button className={'aa-rail-home'+(nav.layer===OVERVIEW&&nav.selection==='none'?' on':'')} onClick={()=>go('home')}><Home size={12}/> Overview</button>
          {spec.layers.map((l,i)=>({l,i})).reverse().map(({l,i})=><button key={l.id} className={i===activeLayer?'on':''} style={{'--tint':layerTint(l,i)} as React.CSSProperties} onClick={()=>setNav({layer:i,domain:-1,selection:'none'})}>
            <i/><span><b>{l.label}</b><small>{layerRoleText(l)} · h {l.height}</small></span><em>{spec.nodes.filter(n=>n.layer===l.id).length}</em></button>)}</>}
      </nav>
      <div className="aa-stage">
        {!spec?<div className="aa-loading" role="status">{problem?'No valid spec loaded. Drop, open or paste a .concept.json file.':initial?'Loading…':'Drop a .concept.json file anywhere, or use Open file.'}</div>
          :view==='3d'?<Suspense fallback={<div className="aa-loading" role="status">Raising the layers…</div>}><Stage spec={spec} nav={nav} reduced={reduced} onSelect={select} onStep={go} whole={fit}/></Suspense>
          :view==='isometric'?<PanZoom svg={svg} resetKey={spec.id+'|'+(loaded?.source??'')} testId="concept-isometric" onClick={svgClick} whole={fit}/>
          :<div className="aa-svg" data-testid={'concept-'+view} onClick={svgClick} dangerouslySetInnerHTML={{__html:svg}}/>}
        <div className="aa-hint">{view==='3d'?'Scroll or ↑ ↓ between layers · ← → across domains · click a node':view==='isometric'?(embed?'Wheel to zoom · drag to pan · Fit for the whole diagram · click a node':'Wheel to zoom · drag to pan · Fit for the full width · click a node · drop a .json spec anywhere'):embed?'Click a node · download as SVG':'Drop a .json concept spec anywhere · click a node · download as SVG'}</div>
        {input&&<form className="cv-input" data-testid={'concept-'+input} onSubmit={e=>{e.preventDefault();void submit();}}>
          <b>{input==='url'?'Open a concept spec from a URL':'Paste concept spec JSON'}</b>
          {input==='url'?<input autoFocus type="url" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="https://raw.githubusercontent.com/…/my-app.concept.json" aria-label="Concept spec URL"/>
            :<textarea autoFocus value={draft} onChange={e=>setDraft(e.target.value)} rows={10} spellCheck={false} placeholder='{"format": "datapass.concept-spec", …}' aria-label="Concept spec JSON"/>}
          <span><button type="submit" disabled={!draft.trim()}>{input==='url'?'Open':'Load'}</button><button type="button" onClick={()=>setInput(null)}>Cancel</button>
            {input==='url'&&<small>The server must allow cross-origin reads (Access-Control-Allow-Origin).</small>}</span>
        </form>}
        {problem&&<div className="cv-problem" role="alert" data-testid="concept-problem">
          <button className="aa-close" onClick={()=>setProblem(null)} aria-label="Dismiss"><X size={14}/></button>
          <b>{problem.source} was not loaded</b>{spec&&<small> · still showing {spec.title}</small>}
          <ul>{problem.issues.slice(0,12).map((i,k)=><li key={k}>{i.path&&<code>{i.path}</code>} {i.message}</li>)}</ul>
          {problem.issues.length>12&&<small>… and {problem.issues.length-12} more</small>}
        </div>}
        {!problem&&showWarnings&&warnings.length>0&&<div className="cv-problem cv-warning" role="status" data-testid="concept-warnings">
          <button className="aa-close" onClick={()=>setShowWarnings(false)} aria-label="Dismiss warnings"><X size={14}/></button>
          <b>{loaded?.source} loaded with {warnings.length} warning{warnings.length>1?'s':''}</b>
          <ul>{warnings.slice(0,8).map((i,k)=><li key={k}>{i.path&&<code>{i.path}</code>} {i.message}</li>)}</ul>
          {warnings.length>8&&<small>… and {warnings.length-8} more</small>}
        </div>}
        {dragging&&<div className="cv-drop" data-testid="concept-drop">Drop a concept spec (.json)</div>}
      </div>
      <aside className="aa-panel" id="cv-panel" hidden={panelHidden} aria-label={nav.selection!=='none'?'Node properties':'Spec overview'}>
        {spec&&(nav.selection!=='none'?<>
          <button className="aa-close" onClick={()=>{setNav(n=>({...n,selection:'none'}));if(collapsible)setPanelOpen(false);}} aria-label="Clear selection"><X size={14}/></button>
          <NodeDetails spec={spec} id={nav.selection} onSelect={select}/>
        </>:<div className="aa-about">
          <span className="aa-eyebrow">{spec.provenance==='documented'?'DOCUMENTED FROM THE REPOSITORY':'SYNTHETIC ILLUSTRATION'}</span><code className="cv-source">{loaded?.source}</code>
          <h2>{spec.title}</h2>{spec.subtitle&&<p>{spec.subtitle}</p>}
          <dl><div><dt>Layers</dt><dd>{spec.layers.length}</dd></div><div><dt>Nodes</dt><dd>{spec.nodes.length}</dd></div><div><dt>Flows</dt><dd>{spec.flows.length}</dd></div></dl>
          <h4>Domains</h4>
          <ul className="aa-groups">{spec.domains.map((d,i)=><li key={d.id}><button onClick={()=>setNav({layer:Math.min(1,spec.layers.length-1),domain:i,selection:'none'})}><b>{d.label}{d.placement==='side'?' (side band)':''}</b><small>{d.description}</small></button></li>)}</ul>
          {spec.annotations.length>0&&<><h4>Notes</h4><ol className="aa-notes">{spec.annotations.map(a=><li key={a.id}>{a.text}</li>)}</ol></>}
          <p className="aa-note">{spec.note}</p>
        </div>)}
      </aside>
    </div>
    {film&&spec&&<Suspense fallback={null}><Film spec={spec} start={film.start} autoplay={film.autoplay} chrome={film.chrome} reduced={reduced} brand={brand} onClose={closeFilm}/></Suspense>}
  </section>;
}

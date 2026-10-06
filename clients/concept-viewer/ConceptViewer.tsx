import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Download,FolderOpen,Home,Play,X} from 'lucide-react';
import {useRuntime,useSiteState,useReducedMotion} from '../../src/framework/ui';
import {parseConceptJson,ConceptSpecError,type ConceptSpec,type ConceptIssue} from '../../src/framework/concept/schema.ts';
import {layerCakeSvg} from '../../src/framework/concept/flat.ts';
import {isometricSvg} from '../../src/framework/concept/iso.ts';
import {layerTint,layerRoleText} from '../../src/framework/concept/kinds.ts';
import {step,OVERVIEW,FILM_DURATION,type Nav} from '../../src/framework/concept/navigation.ts';
import {NodeDetails} from '../../src/framework/concept/react/NodeDetails.tsx';
import '../../src/framework/concept/react/concept.css';
import './viewer.css';
import {EXAMPLES,RENDERINGS,safeSpecPath,type Rendering} from './examples.ts';

const Stage=lazy(()=>import('../../src/framework/concept/react/ConceptStage.tsx'));
const Film=lazy(()=>import('../../src/framework/concept/react/ConceptFilm.tsx'));
const asset=(p:string)=>(import.meta.env?.BASE_URL??'./')+p;
function download(name:string,text:string){
  const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
type Loaded={spec:ConceptSpec;source:string};
type Problem={source:string;issues:ConceptIssue[]};
const toProblem=(source:string,e:unknown):Problem=>({source,issues:e instanceof ConceptSpecError?e.issues:[{path:'',message:e instanceof Error?e.message:String(e)}]});

/**
 * Reference viewer for concept spec v1 files: open an example, a dropped file or `?spec=<relative path>`,
 * then switch between the isometric SVG, the flat layer cake and the lazy 3D scene (plus the film).
 * A file that fails validation never replaces the current spec; its issues are listed instead.
 */
export function ConceptViewer(){
  const runtime=useRuntime(),{values}=useSiteState(),reduced=useReducedMotion();
  const view=String(values['concept-rendering']) as Rendering;
  const [loaded,setLoaded]=useState<Loaded|null>(null),[problem,setProblem]=useState<Problem|null>(null),[dragging,setDragging]=useState(false);
  const [nav,setNav]=useState<Nav>({layer:OVERVIEW,domain:-1,selection:'none'});
  const query=useMemo(()=>new URLSearchParams(typeof location==='undefined'?'':location.search),[]);
  const [film,setFilm]=useState(()=>query.get('film')==='1'?{start:Math.max(0,Math.min(FILM_DURATION,Number(query.get('t')??0)||0)),autoplay:query.get('paused')!=='1',chrome:query.get('chrome')!=='0'}:null);
  const fileInput=useRef<HTMLInputElement>(null);
  const accept=useCallback((spec:ConceptSpec,source:string)=>{setLoaded({spec,source});setProblem(null);setNav({layer:OVERVIEW,domain:-1,selection:'none'});},[]);
  const open=useCallback(async(path:string)=>{
    try{const r=await fetch(asset(path),{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status+' for '+path);accept(parseConceptJson(await r.text()),path);
      const q=new URLSearchParams(location.search);if(q.get('spec')!==path){q.set('spec',path);history.replaceState(history.state,'',location.pathname+'?'+q.toString());}}
    catch(e){setProblem(toProblem(path,e));}
  },[accept]);
  const openFile=useCallback(async(file:File)=>{
    try{accept(parseConceptJson(await file.text()),file.name);}catch(e){setProblem(toProblem(file.name,e));}
  },[accept]);
  useEffect(()=>{
    const v=query.get('view');if(v&&RENDERINGS.some(r=>r.id===v))runtime.set('concept-rendering',v);
    const requested=query.get('spec'),path=safeSpecPath(requested);
    if(requested&&!path)setProblem({source:requested,issues:[{path:'',message:'?spec= must be a relative .json path on this site'}]});
    void open(path??EXAMPLES[0].path);
  },[open,query,runtime]);
  // Drag and drop anywhere on the page.
  useEffect(()=>{
    let depth=0;
    const enter=(e:DragEvent)=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();depth++;setDragging(true);};
    const over=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();};
    const leave=()=>{depth=Math.max(0,depth-1);if(!depth)setDragging(false);};
    const drop=(e:DragEvent)=>{e.preventDefault();depth=0;setDragging(false);const f=e.dataTransfer?.files?.[0];if(f)void openFile(f);};
    window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
  },[openFile]);
  const spec=loaded?.spec??null;
  const select=useCallback((id:string)=>{if(!spec)return;setNav(n=>{if(n.selection===id)return {...n,selection:'none'};const node=spec.nodes.find(x=>x.id===id);if(!node)return n;
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
  /** The rendering is mirrored into ?view= so a reload (or a shared link) keeps it. */
  const setRendering=(id:Rendering)=>{runtime.set('concept-rendering',id);const q=new URLSearchParams(location.search);q.set('view',id);history.replaceState(history.state,'',location.pathname+'?'+q.toString());};
  const activeLayer=spec&&nav.selection!=='none'?spec.layers.findIndex(l=>l.id===spec.nodes.find(n=>n.id===nav.selection)?.layer):nav.layer;
  return <section className="aa cv" data-testid="concept-viewer" data-spec={spec?.id??''} data-view={view} data-selection={nav.selection} data-layer={nav.layer} data-source={loaded?.source??''} data-problem={problem?'true':'false'}>
    <header className="aa-top">
      <div className="aa-brand"><span className="aa-mark"><i/><i/><i/></span><span>CONCEPT VIEWER<small>concept spec v1 · any app or cloud</small></span></div>
      <nav className="aa-tabs" aria-label="Examples">{EXAMPLES.map(x=><button key={x.path} aria-pressed={loaded?.source===x.path} onClick={()=>void open(x.path)}>{x.label}<small>{x.provenance}</small></button>)}
        <button onClick={()=>fileInput.current?.click()} title="Open a .json concept spec (or drop it anywhere)"><FolderOpen size={13}/> Open file</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden data-testid="concept-file" onChange={e=>{const f=e.target.files?.[0];if(f)void openFile(f);e.target.value='';}}/></nav>
      <div className="aa-views" role="group" aria-label="Rendering">{RENDERINGS.map(r=><button key={r.id} aria-pressed={view===r.id} onClick={()=>setRendering(r.id)}>{r.label}</button>)}</div>
      <div className="aa-actions">
        <button disabled={!spec} onClick={()=>spec&&download(spec.id+'.isometric.svg',isometricSvg(spec))} title="Download the isometric SVG"><Download size={13}/> Isometric SVG</button>
        <button disabled={!spec} onClick={()=>spec&&download(spec.id+'.layered.svg',layerCakeSvg(spec))} title="Download the layer cake SVG"><Download size={13}/> Layer cake SVG</button>
        <button className="aa-play" disabled={!spec} onClick={()=>setFilm({start:0,autoplay:true,chrome:true})}><Play size={12}/> Film</button>
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
        {!spec?<div className="aa-loading" role="status">{problem?'No valid spec loaded.':'Loading…'}</div>
          :view==='3d'?<Suspense fallback={<div className="aa-loading" role="status">Raising the layers…</div>}><Stage spec={spec} nav={nav} reduced={reduced} onSelect={select} onStep={go}/></Suspense>
          :<div className="aa-svg" data-testid={'concept-'+view} onClick={svgClick} dangerouslySetInnerHTML={{__html:svg}}/>}
        <div className="aa-hint">{view==='3d'?'Scroll or ↑ ↓ between layers · ← → across domains · click a node':'Drop a .json concept spec anywhere · click a node · download as SVG'}</div>
        {problem&&<div className="cv-problem" role="alert" data-testid="concept-problem">
          <button className="aa-close" onClick={()=>setProblem(null)} aria-label="Dismiss"><X size={14}/></button>
          <b>{problem.source} was not loaded</b>{spec&&<small> · still showing {spec.title}</small>}
          <ul>{problem.issues.slice(0,12).map((i,k)=><li key={k}>{i.path&&<code>{i.path}</code>} {i.message}</li>)}</ul>
          {problem.issues.length>12&&<small>… and {problem.issues.length-12} more</small>}
        </div>}
        {dragging&&<div className="cv-drop" data-testid="concept-drop">Drop a concept spec (.json)</div>}
      </div>
      <aside className="aa-panel" aria-label={nav.selection!=='none'?'Node properties':'Spec overview'}>
        {spec&&(nav.selection!=='none'?<>
          <button className="aa-close" onClick={()=>setNav(n=>({...n,selection:'none'}))} aria-label="Clear selection"><X size={14}/></button>
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
    {film&&spec&&<Suspense fallback={null}><Film spec={spec} start={film.start} autoplay={film.autoplay} chrome={film.chrome} reduced={reduced} brand="CONCEPT VIEWER" onClose={closeFilm}/></Suspense>}
  </section>;
}

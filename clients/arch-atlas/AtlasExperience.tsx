import {lazy,Suspense,useCallback,useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,ChevronUp,Download,Home,Play,X} from 'lucide-react';
import {useRuntime,useSiteState,useReducedMotion} from '../../src/framework/ui';
import {specs,specById} from './specs/index';
import {layerCakeSvg as layeredSvg} from '../../src/framework/concept/flat.ts';
import {isometricSvg} from '../../src/framework/concept/iso.ts';
import {layerTint,layerRoleText} from '../../src/framework/concept/kinds.ts';
import {step,OVERVIEW,type Nav} from '../../src/framework/concept/navigation.ts';
import {NodeDetails} from '../../src/framework/concept/react/NodeDetails.tsx';
import {parseFilmParams} from './filmParams';
import '../../src/framework/concept/react/concept.css';

const AtlasStage=lazy(()=>import('../../src/framework/concept/react/ConceptStage.tsx'));
const AtlasFilm=lazy(()=>import('../../src/framework/concept/react/ConceptFilm.tsx'));
export const VIEWS=[{id:'3d',label:'3D atlas'},{id:'layered',label:'Layered 2D'},{id:'isometric',label:'Isometric 2D'}] as const;

function download(name:string,text:string){
  const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function AtlasExperience(){
  const runtime=useRuntime(),{values}=useSiteState(),reduced=useReducedMotion();
  const spec=specById(String(values['atlas-spec'])),view=String(values['atlas-view']),selection=String(values['atlas-selection']);
  const nav:Nav={layer:Number(values['atlas-layer']),domain:Number(values['atlas-group']),selection};
  const [film,setFilm]=useState(()=>{const p=parseFilmParams(typeof location==='undefined'?'':location.search);return p.open?{start:p.t,autoplay:!p.paused,chrome:p.chrome,spec:p.spec}:null;});
  const closeFilm=useCallback(()=>{setFilm(null);const q=new URLSearchParams(location.search);if(q.has('film')){['film','t','paused','chrome'].forEach(k=>q.delete(k));history.replaceState(history.state,'',location.pathname+'?'+q.toString());}},[]);
  const apply=useCallback((n:Nav)=>runtime.applyCue({'atlas-layer':n.layer,'atlas-group':n.domain,'atlas-selection':n.selection}),[runtime]);
  const go=useCallback((dir:'up'|'down'|'left'|'right'|'home')=>apply(step(spec,{layer:Number(runtime.getSnapshot().values['atlas-layer']),domain:Number(runtime.getSnapshot().values['atlas-group']),selection:String(runtime.getSnapshot().values['atlas-selection'])},dir)),[apply,spec,runtime]);
  const select=useCallback((id:string)=>{const cur=String(runtime.getSnapshot().values['atlas-selection']);if(cur===id){runtime.set('atlas-selection','none');return;}
    const node=spec.nodes.find(n=>n.id===id);if(!node)return;runtime.applyCue({'atlas-selection':id,'atlas-layer':spec.layers.findIndex(l=>l.id===node.layer),'atlas-group':spec.domains.findIndex(g=>g.id===node.domain)});},[runtime,spec]);
  const switchSpec=(id:string)=>runtime.applyCue({'atlas-spec':id,'atlas-selection':'none','atlas-layer':OVERVIEW,'atlas-group':-1});
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(film||(e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]'))return;
      const map:Record<string,'up'|'down'|'left'|'right'|'home'>={ArrowUp:'up',PageUp:'up',ArrowDown:'down',PageDown:'down',ArrowLeft:'left',ArrowRight:'right',Home:'home'};
      if(map[e.key]&&view==='3d'){e.preventDefault();go(map[e.key]);}
      else if(e.key==='Escape')runtime.set('atlas-selection','none');
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[go,film,view,runtime]);
  const svg=useMemo(()=>view==='layered'?layeredSvg(spec,selection):view==='isometric'?isometricSvg(spec,selection):'',[view,spec,selection]);
  const svgClick=(e:React.MouseEvent)=>{const el=(e.target as Element).closest('[data-node],[data-entity]');const id=el?.getAttribute('data-node')??el?.getAttribute('data-entity');if(id)select(id);};
  const activeLayer=selection!=='none'?spec.layers.findIndex(l=>l.id===spec.nodes.find(n=>n.id===selection)?.layer):nav.layer;
  return <section className="aa" data-testid="arch-atlas" data-spec={spec.id} data-view={view} data-selection={selection} data-layer={nav.layer} data-group={nav.domain} data-provenance={spec.provenance}>
    <header className="aa-top">
      <div className="aa-brand"><span className="aa-mark"><i/><i/><i/></span><span>ARCHITECTURE ATLAS<small>layered · natural · static-ready</small></span></div>
      <nav className="aa-tabs" aria-label="Architecture">{specs.map(s=><button key={s.id} aria-pressed={s.id===spec.id} onClick={()=>switchSpec(s.id)}>{s.title}<small>{s.provenance}</small></button>)}</nav>
      <div className="aa-views" role="group" aria-label="Representation">{VIEWS.map(v=><button key={v.id} aria-pressed={view===v.id} onClick={()=>runtime.set('atlas-view',v.id)}>{v.label}</button>)}</div>
      <div className="aa-actions">
        <button onClick={()=>download(spec.id+'.layered.svg',layeredSvg(spec))} title="Download the flat layered SVG"><Download size={13}/> Layered SVG</button>
        <button onClick={()=>download(spec.id+'.isometric.svg',isometricSvg(spec))} title="Download the isometric SVG"><Download size={13}/> Isometric SVG</button>
        <button className="aa-play" onClick={()=>setFilm({start:0,autoplay:true,chrome:true,spec:null})}><Play size={12}/> Film</button>
      </div>
    </header>
    <div className="aa-body">
      <nav className="aa-rail" aria-label="Layers (top to bottom)">
        <span className="aa-eyebrow">LAYERS</span>
        <button className={'aa-rail-home'+(nav.layer===OVERVIEW&&selection==='none'?' on':'')} onClick={()=>go('home')}><Home size={12}/> Overview</button>
        {spec.layers.map((l,i)=>({l,i})).reverse().map(({l,i})=><button key={l.id} className={i===activeLayer?'on':''} style={{'--tint':layerTint(l,i)} as React.CSSProperties} onClick={()=>apply({layer:i,domain:-1,selection:'none'})} aria-current={i===activeLayer?'true':undefined}>
          <i/><span><b>{l.label}</b><small>{layerRoleText(l)}</small></span><em>{spec.nodes.filter(n=>n.layer===l.id).length}</em></button>)}
        <div className="aa-rail-keys"><span><ChevronUp size={11}/><ChevronDown size={11}/> layers</span><span><ChevronLeft size={11}/><ChevronRight size={11}/> domains</span></div>
      </nav>
      <div className="aa-stage">
        {view==='3d'?<Suspense fallback={<div className="aa-loading" role="status">Raising the layers…</div>}><AtlasStage spec={spec} nav={nav} reduced={reduced} onSelect={select} onStep={go}/></Suspense>
          :<div className="aa-svg" data-testid={'atlas-'+view} onClick={svgClick} dangerouslySetInnerHTML={{__html:svg}}/>}
        {view==='3d'&&<div className="aa-domains" role="group" aria-label="Domains">
          <button aria-label="Previous domain" onClick={()=>go('left')}><ChevronLeft size={14}/></button>
          {spec.domains.map((g,i)=><button key={g.id} aria-pressed={nav.domain===i} onClick={()=>apply({layer:nav.layer===OVERVIEW?Math.min(1,spec.layers.length-1):activeLayer,domain:i,selection:'none'})}>{g.label}</button>)}
          <button aria-label="Next domain" onClick={()=>go('right')}><ChevronRight size={14}/></button>
        </div>}
        <div className="aa-hint">{view==='3d'?'Scroll or ↑ ↓ to move between layers · ← → across domains · click a node':'Same spec, same ids as the 3D atlas · click a node · download as SVG'}</div>
      </div>
      <aside className="aa-panel" aria-label={selection!=='none'?'Node properties':'Architecture overview'}>
        {selection!=='none'?<>
          <button className="aa-close" onClick={()=>runtime.set('atlas-selection','none')} aria-label="Clear selection"><X size={14}/></button>
          <NodeDetails spec={spec} id={selection} onSelect={select}/>
        </>:<div className="aa-about">
          <span className="aa-eyebrow">{spec.provenance==='documented'?'DOCUMENTED FROM THE REPOSITORY':'SYNTHETIC ILLUSTRATION'}</span>
          <h2>{spec.title}</h2><p>{spec.subtitle}</p>
          <dl><div><dt>Layers</dt><dd>{spec.layers.length}</dd></div><div><dt>Nodes</dt><dd>{spec.nodes.length}</dd></div><div><dt>Flows</dt><dd>{spec.flows.length}</dd></div></dl>
          <h4>Domains</h4>
          <ul className="aa-groups">{spec.domains.map((g,i)=><li key={g.id}><button onClick={()=>apply({layer:Math.min(1,spec.layers.length-1),domain:i,selection:'none'})}><b>{g.label}</b><small>{g.description}</small></button></li>)}</ul>
          <p className="aa-note">{spec.note}</p>
        </div>}
      </aside>
    </div>
    {film&&<Suspense fallback={null}><AtlasFilm spec={film.spec?specById(film.spec):spec} start={film.start} autoplay={film.autoplay} chrome={film.chrome} reduced={reduced} brand="ARCHITECTURE ATLAS" onClose={closeFilm}/></Suspense>}
  </section>;
}

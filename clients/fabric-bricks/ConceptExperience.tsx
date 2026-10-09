import {lazy,Suspense} from 'react';
import {useRuntime,useSiteState,useReducedMotion} from '../../src/framework/ui';
import {concepts,conceptOwner,conceptRelations,conceptSources,type FabricConcept} from './concepts';
import './concepts.css';
const ConceptModel=lazy(()=>import('./ConceptModel'));
const selectLabel=(c:FabricConcept)=>'Explorer '+c.title;
function ConceptPlan({selection,explode,onSelect}:{selection:string;explode:number;onSelect:(id:string)=>void}){
 const selected=conceptOwner(selection);
 const card=(c:FabricConcept,x:number,y:number,w:number,label:string,id:string)=> <g key={id} role="button" tabIndex={0} aria-label={id===c.id?selectLabel(c):'Sélectionner '+label} aria-pressed={selection===id} onClick={()=>onSelect(id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(id);}}} className="fc-svg-card">
  <rect x={x+5} y={y+6} width={w} height="85" rx="12" fill={c.color} opacity=".12"/><rect x={x} y={y} width={w} height="85" rx="12" fill="white" stroke={selection===id?c.color:'#d7e4e6'} strokeWidth={selection===id?2:1}/>
  <rect x={x} y={y+15} width="3" height="54" rx="2" fill={c.color}/><text x={x+15} y={y+25} fill={c.color} fontSize="11">{c.category}</text>
  <text x={x+15} y={y+47} fill="#23424a" fontSize={w>200?18:14} fontWeight="600">{c.title}</text><text x={x+15} y={y+68} fill="#728c92" fontSize={w>200?13:10}>{label}</text>
 </g>;
 return <svg className="fc-plan" viewBox="0 0 960 660" role="group" aria-label="Plan des concepts Fabric" data-testid="concept-plan" data-concept={selected?.id??'none'}>
  <rect x="18" y="25" width="924" height="610" rx="22" fill="#f2f7f7"/>
  <text x="40" y="53" fontSize="11" fill="#799297" letterSpacing="2">PLATEFORME FABRIC · OBJETS ET FONDATION</text>
  {concepts.map((c,i)=>{const active=selected?.id===c.id;return <g key={c.id} opacity={selected?active ? .18 : .72:1}>{card(c,40+(i%4)*230,75+Math.floor(i/4)*110,210,c.layers[2].label,c.id)}</g>;})}
  {selected&&<g data-testid="foreground-concept"><rect x="290" y="402" width="380" height="205" rx="22" fill="#dcebed" opacity=".6"/>{selected.layers.map((l,i)=>card(selected,310+i*7,470-i*(18+explode*50),340,l.label,selected.id+'--'+l.id))}<text x="320" y="584" fontSize="12" fill="#476971">{selected.title} · au premier plan · décomposition fonctionnelle</text></g>}
  <path d="M45 617 H915" stroke="#71b5bf" strokeWidth="2"/><text x="48" y="645" fontSize="13" fill="#487d87">OneLake · fondation de stockage partagée</text>
 </svg>;
}
export function ConceptExperience({onBricks}:{onBricks:()=>void}){
 const runtime=useRuntime(),{values}=useSiteState(),reduced=useReducedMotion();
 const selection=String(values['fabric-selection']),selected=conceptOwner(selection),explode=Number(values['fabric-explode']),representation=String(values['fabric-representation']);
 const selectedLayer=selected?.layers.find(l=>selected.id+'--'+l.id===selection);
 const select=(id:string)=>runtime.applyCue({'fabric-selection':id,'fabric-level':'detail','fabric-camera':'focus-a','fabric-explode':1});
 const reset=()=>runtime.applyCue({'fabric-selection':'none','fabric-level':'overview','fabric-camera':'overview','fabric-explode':0});
 const relations=selected?conceptRelations.filter(r=>r.from===selected.id||r.to===selected.id):conceptRelations;
 return <section className="fc-experience" data-testid="fabric-concepts" data-reduced-motion={reduced} data-concept={selected?.id??'none'}>
  <header className="fc-header"><strong>FABRIC <span>EXPLORER</span></strong><span>Du concept à ses composants</span><button onClick={onBricks}>Maquette en briques</button></header>
  <div className="fc-body"><div className="fc-main"><div className="fc-heading"><span className="fc-eyebrow">MICROSOFT FABRIC · CARTE PÉDAGOGIQUE</span><h1>{selected?selected.title:<>Un plan.<br/>Les vrais concepts.</>}</h1><p>{selected?'Cet objet vient devant les autres. Sélectionne ses composants pour comprendre leur rôle.':'Clique sur un objet : il vient au premier plan et se décompose. Les autres restent visibles.'}</p></div>
   <div className="fc-switch" role="group" aria-label="Représentation"><button aria-pressed={representation==='2d'} onClick={()=>runtime.set('fabric-representation','2d')}>Plan 2D</button><button aria-pressed={representation==='3d'} onClick={()=>runtime.set('fabric-representation','3d')}>Plan 3D</button></div>
   <div className="fc-stage">{representation==='3d'?<Suspense fallback={<div className="fb-loading" role="status">Préparation du plan…</div>}><ConceptModel selection={selection} explode={explode} camera={String(values['fabric-camera'])} onSelect={select}/></Suspense>:<ConceptPlan selection={selection} explode={explode} onSelect={select}/>}</div>
   <div className="fc-controls"><button onClick={reset}>Vue d’ensemble</button><button disabled={representation!=='3d'} onClick={()=>runtime.set('fabric-camera','near')}>Zoom +</button><button disabled={representation!=='3d'} onClick={()=>runtime.set('fabric-camera','far')}>Zoom −</button><button disabled={!selected} aria-pressed={explode>0} onClick={()=>runtime.set('fabric-explode',explode>0?0:1)}>{explode>0?'Réassembler':'Décomposer'}</button></div>
   <footer>Concepts documentés · Géométrie illustrative · Aucun environnement Fabric connecté</footer>
  </div><aside className="fc-inspector" aria-label="Concepts et composants"><div className="fc-inspector-heading"><span className="fc-eyebrow">{selected?'OBJET AU PREMIER PLAN':'LES OBJETS DU PLAN'}</span><h2>{selected?selected.title:'Explorer Fabric'}</h2><p>{selected?selected.description:'11 concepts sélectionnés. Cette carte présente des objets et fonctions clés, sans prétendre couvrir tout Fabric.'}</p></div>
   {selected?<><div className="fc-components" aria-label="Composants fonctionnels">{selected.layers.map(l=><button key={l.id} aria-pressed={selection===selected.id+'--'+l.id} onClick={()=>select(selected.id+'--'+l.id)}><span style={{background:selected.color}}/><strong>{l.label}</strong><small>{l.description}</small></button>)}</div>
    {selectedLayer&&<div className="fc-component-detail" data-testid="concept-component"><strong>{selectedLayer.label}</strong><p>{selectedLayer.description}</p><code>{selection}</code></div>}
    <label className="fc-separation">Décomposition <output>{Math.round(explode*100)} %</output><input aria-label="Décomposition" type="range" min="0" max="1" step=".01" value={explode} onChange={e=>runtime.set('fabric-explode',Number(e.target.value))}/></label>
    <a className="fc-source" href={selectedLayer?.source??selected.source} target="_blank" rel="noreferrer">Source : Microsoft Learn ↗</a>
   </>:null}
   <div className="fc-relations"><h3>Relations possibles</h3>{relations.map(r=><p key={r.from+r.to}><strong>{conceptOwner(r.from)?.title}</strong> <span>{r.label}</span> <strong>{conceptOwner(r.to)?.title}</strong></p>)}<small>Ces relations sont des possibilités documentées, pas les connexions d’un environnement réel.</small></div>
   <nav className="fc-object-list" aria-label="Tous les concepts">{concepts.map(c=><button key={c.id} aria-label={selectLabel(c)} aria-pressed={selected?.id===c.id} onClick={()=>select(c.id)}><span style={{background:c.color}}/>{c.title}<small>{c.category}</small></button>)}</nav>
   <p className="fc-note">Décomposition fonctionnelle illustrative : les panneaux représentent des fonctions ou objets associés, pas des couches physiques du service.</p><a className="fc-source" href={conceptSources.overview} target="_blank" rel="noreferrer">Vue officielle de Microsoft Fabric ↗</a>
  </aside></div><span className="fb-sr" aria-live="polite">{selected?selected.title+' au premier plan. '+(selectedLayer?.label??'Composants visibles'):'Plan complet des concepts Fabric.'}</span>
 </section>;
}

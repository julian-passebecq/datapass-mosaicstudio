import {lazy,Suspense,useState,type CSSProperties} from 'react';
import {ArrowLeft,ArrowRight,Box,Check,ChevronLeft,ChevronRight,Expand,Layers,MousePointer2,RotateCcw,X} from 'lucide-react';
import {useRuntime,useSiteState,useReducedMotion} from '../../src/framework/ui';
import {kits,getKit,getBOM,kitCost,buildSteps,type KitId} from './kits';
import {KitIllustration} from './KitIllustration';
import './experience.css';

const KitModel=lazy(()=>import('./KitModel'));
const money=(v:number)=>'$'+v.toFixed(2);
export function FabricExperience(){
  const runtime=useRuntime(),{values}=useSiteState(),reduced=useReducedMotion();
  const kitId=String(values['fabric-kit']) as KitId,kit=getKit(kitId),gallery=values['fabric-screen']==='gallery',selection=String(values['fabric-selection']);
  const representation=String(values['fabric-representation']),explode=Number(values['fabric-explode']),step=Number(values['fabric-step']),isolate=Boolean(values['fabric-isolate']);
  const bom=getBOM(kitId),selectedLot=bom.find(l=>l.id===selection);
  const [about,setAbout]=useState(false),[saved,setSaved]=useState(false);
  const open=(id:KitId)=>runtime.applyCue({'fabric-kit':id,'fabric-screen':'detail','fabric-representation':'3d','fabric-selection':'none','fabric-camera':'overview','fabric-level':'overview','fabric-step':6,'fabric-explode':0,'fabric-isolate':false});
  const back=()=>runtime.applyCue({'fabric-screen':'gallery','fabric-representation':'2d','fabric-selection':'none','fabric-camera':'overview','fabric-level':'overview','fabric-explode':0,'fabric-isolate':false,'fabric-step':6});
  const select=(id:string)=>runtime.applyCue({'fabric-selection':selection===id?'none':id,'fabric-camera':'overview','fabric-level':selection===id?'overview':'detail'});
  const showAll=()=>runtime.applyCue({'fabric-selection':'none','fabric-camera':'overview','fabric-level':'overview','fabric-isolate':false});
  return <section className="fb-experience" data-testid="fabric-experience" data-reduced-motion={reduced} data-source-status="synthetic/provisional" data-screen={gallery?'gallery':'detail'}>
    <header className="fb-header">
      <button className="fb-brand" onClick={back} aria-label="Fabric Bricks gallery"><span className="fb-brand-mark"><i/><i/><i/></span>FABRIC BRICKS<span className="fb-edition">STUDIES / 001</span></button>
      <nav aria-label="Kit navigation"><button onClick={back} aria-current={gallery?'page':undefined}>Kits</button>{!gallery&&<><span className="fb-nav-slash">/</span><span className="fb-nav-current">{kit.title}</span></>}</nav>
      <button className="fb-about" onClick={()=>setAbout(!about)} aria-expanded={about}>About this study <span>↗</span></button>
    </header>
    {about&&<div className="fb-provenance"><strong>PROVISIONAL / SYNTHETIC</strong><p>A visual study inspired by the supplied Brickworks video. Procedural models and illustrative parts/costs are generated client content, not approved Microsoft, LEGO or BrickLink assets. The Lakehouse gallery image is AI generated. Selection, explode and build steps are presentation state in the shared MosaicStudio runtime.</p><button onClick={()=>setAbout(false)} aria-label="Close source information"><X size={15}/></button></div>}
    <div className="fb-body">
      <div className="fb-main">
        <div className="fb-intro" key={gallery?'gallery':kitId}>
          <span className="fb-eyebrow">{gallery?'A SMALL WORLD OF DATA':'MICROSOFT FABRIC · '+kit.category.toUpperCase()}</span>
          <h1>{gallery?<>Big ideas.<br/>Small bricks.</>:kit.title}</h1>
          <p>{gallery?'Explore the architecture of data, one playful little kit at a time. Pick a model. Take it apart. See how it all fits.':kit.description}</p>
          {!gallery&&<div className="fb-intro-actions"><button onClick={()=>setSaved(!saved)} aria-pressed={saved}>{saved?<Check size={12}/>:<Box size={12}/>} {saved?'On your build list':'Add to build list'}</button><span>Concept kit · {kit.number}</span></div>}
          {!gallery&&selectedLot&&<div className="fb-selection-chip"><span style={{background:selectedLot.color}}/>{selectedLot.quantity}× {selectedLot.name}<button onClick={showAll} aria-label="Clear selection"><X size={12}/></button></div>}
        </div>
        {gallery?<div className="fb-gallery" aria-label="Choose a kit">
          {kits.map(k=><button className={'fb-kit-card fb-kit-'+k.id} key={k.id} onClick={()=>open(k.id)} aria-label={'Open '+k.title}>
            <div className="fb-card-image">{k.id==='lakehouse'?<img src={new URL('./assets/lakehouse-generated.png',import.meta.url).href} alt="AI-generated concept of a brick Lakehouse"/>:<KitIllustration kit={k.id}/>}</div>
            <div className="fb-card-caption"><span><small>{k.category}</small><strong>{k.title}</strong></span><span className="fb-card-arrow"><ArrowRight size={17}/></span></div>
          </button>)}
        </div>:<>
          <div className="fb-stage" key={kitId}>
            {representation==='3d'?<Suspense fallback={<div className="fb-loading" role="status">Preparing your bricks…</div>}><KitModel kit={kitId} selection={selection} explode={explode} step={step} isolate={isolate} camera={String(values['fabric-camera'])} onSelect={select}/></Suspense>:<KitIllustration kit={kitId} step={step} explode={explode} selection={selection} isolate={isolate} onSelect={select}/>}
          </div>
          <div className="fb-view-controls" role="group" aria-label="Model controls">
            <div className="fb-representation"><button aria-pressed={representation==='2d'} onClick={()=>runtime.set('fabric-representation','2d')}>2D</button><button aria-pressed={representation==='3d'} onClick={()=>runtime.set('fabric-representation','3d')}>3D</button></div>
            <button title="Reset model view" aria-label="Reset model view" onClick={()=>runtime.applyCue({'fabric-camera':'overview','fabric-explode':0,'fabric-step':6,'fabric-isolate':false,'fabric-selection':'none','fabric-level':'overview'})}><RotateCcw size={14}/></button>
            <button aria-label="Focus selected part" disabled={!selectedLot} onClick={()=>runtime.set('fabric-camera',selection)}><Expand size={14}/></button>
          </div>
          <div className="fb-stage-hint"><MousePointer2 size={11}/>{representation==='3d'?'Drag to orbit · Scroll to zoom · Pick a part':'Pick a part · Switch to 3D to explore'}</div>
          <div className="fb-timeline" aria-label="Build steps">
            <button className="fb-step-arrow" aria-label="Previous build step" disabled={step===1} onClick={()=>runtime.set('fabric-step',step-1)}><ChevronLeft size={16}/></button>
            <div className="fb-step-center"><div className="fb-step-label"><span>STEP {step} OF 6</span><strong>{buildSteps[step-1]}</strong><small>{kit.parts.filter(p=>p.step===step).length} parts</small></div>
              <div className="fb-step-track">{buildSteps.map((name,i)=><button key={name} aria-label={'Build step '+(i+1)+': '+name} aria-current={step===i+1?'step':undefined} className={i<step?'complete':''} onClick={()=>runtime.set('fabric-step',i+1)}/>)}</div>
            </div>
            <button className="fb-step-arrow" aria-label="Next build step" disabled={step===6} onClick={()=>runtime.set('fabric-step',step+1)}><ChevronRight size={16}/></button>
            <button className="fb-explode-toggle" aria-pressed={explode>0} onClick={()=>runtime.applyCue({'fabric-explode':explode>0?0:1,'fabric-camera':'overview'})}><Layers size={12}/>{explode>0?'Exploded':'Assembled'}</button>
          </div>
        </>}
        <footer className="fb-main-footer"><span>DESIGNED TO BE TAKEN APART.</span><button onClick={()=>setAbout(!about)}>Synthetic concept · Preview</button></footer>
      </div>
      <aside className="fb-inspector" aria-label={gallery?'Kit collection':'Parts inspector'}>
        {gallery?<>
          <div className="fb-inspector-title"><span className="fb-eyebrow">THE COLLECTION</span><h2>Choose a kit.</h2><p>Small builds, big connections.<br/>Find your starting point.</p></div>
          <div className="fb-kit-list">{kits.map(k=><button key={k.id} onClick={()=>open(k.id)}><span className="fb-list-number">{k.number}</span><span><strong>{k.title}</strong><small>{k.category}</small></span><ArrowRight size={14}/></button>)}</div>
          <div className="fb-editorial-note"><span className="fb-eyebrow">FROM DATA TO SOMETHING TANGIBLE</span><p>Look closer.<br/>There’s a story<br/>in every piece.</p><small>Three concept kits.<br/>One shared architecture.</small></div>
          <button className="fb-primary" onClick={()=>open('lakehouse')}>Explore Lakehouse <ArrowRight size={14}/></button>
        </>:<>
          <div className="fb-metrics"><div><span>PIECES</span><strong>{kit.parts.length}</strong></div><div><span>LOTS</span><strong>{bom.length}</strong></div><div><span>PARTS COST*</span><strong>≈ {money(kitCost(kitId))}</strong></div></div>
          <div className="fb-size">{kitId==='powerbi'?'5 wide × 4 deep':'8 wide × 7 deep'} · synthetic scale</div>
          <div className="fb-parts-heading"><h2>PARTS</h2><button onClick={showAll}>{selectedLot?'Show all':'Pick a row or a part'}</button></div>
          <div className="fb-parts-list">{bom.map(l=><button key={l.id} className="fb-part-row" aria-pressed={selection===l.id} onClick={()=>select(l.id)} style={{opacity:isolate&&selection!=='none'&&selection!==l.id? .32:1}}>
            <span className="fb-part-swatch" style={{'--brick-color':l.color} as CSSProperties}><i/><i/></span><span className="fb-part-quantity">{l.quantity}×</span><span className="fb-part-name"><strong>{l.name}</strong><small>{l.code} · {l.id}</small></span><span className="fb-part-price">{money(l.price*l.quantity)}</span>
          </button>)}</div>
          <div className="fb-inspector-tools"><button aria-pressed={isolate} disabled={!selectedLot} onClick={()=>runtime.set('fabric-isolate',!isolate)}>Isolate selected <span>{isolate?'ON':'OFF'}</span></button><label>Layer separation <output>{Math.round(explode*100)}%</output><input aria-label="Layer separation" type="range" min="0" max="1" step=".01" value={explode} onChange={e=>runtime.applyCue({'fabric-explode':Number(e.target.value),'fabric-camera':'overview'})}/></label></div>
          <div className="fb-inspector-bottom"><p>* Illustrative costs, not live prices. Geometry and parts are synthetic; no purchasable kit is claimed.</p><button className="fb-primary" onClick={back}><ArrowLeft size={14}/>Back to all kits</button></div>
        </>}
      </aside>
    </div>
    <span className="fb-sr" aria-live="polite">{gallery?'Kit gallery':`${kit.title}. Step ${step}: ${buildSteps[step-1]}. ${selectedLot?selectedLot.name+' selected.':'All parts shown.'} ${explode>0?'Exploded.':'Assembled.'} ${isolate?'Isolated.':''}`}</span>
  </section>;
}

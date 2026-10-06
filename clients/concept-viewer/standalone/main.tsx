import {StrictMode,useCallback,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConceptWorkbench,type LoadResult,type Problem,type SpecExample,type SpecSource} from '../ConceptWorkbench.tsx';
import {embeddedSpecText,readyMessage} from './embed.ts';
import {EXAMPLES,RENDERINGS,type Rendering} from '../examples.ts';
import {checkSpecUrl,fetchSpecText} from './source.ts';
import forecastApp from '../public/examples/forecast-app.concept.json';
import cloudPlatform from '../public/examples/cloud-data-platform.concept.json';
import datapassStack from '../public/examples/datapass-stack.concept.json';

/**
 * Standalone concept viewer: one self-contained HTML file, opened by double-click (file://) or from any static host.
 * Specs come from the embedded examples, a picked or dropped file, pasted JSON, or `?src=<https URL>`.
 * `?view=isometric|layered|3d` picks the rendering. Nothing is stored and nothing is sent anywhere.
 * Inside an iframe it also accepts specs from the parent page (embed API, see ./embed.ts).
 */
const BUNDLED:Record<string,unknown>={
  'examples/forecast-app.concept.json':forecastApp,
  'examples/cloud-data-platform.concept.json':cloudPlatform,
  'examples/datapass-stack.concept.json':datapassStack
};
const examples:SpecExample[]=EXAMPLES.map(x=>({key:x.path.replace(/^examples\//,''),label:x.label,provenance:x.provenance,read:async()=>JSON.stringify(BUNDLED[x.path])}));
const EMBED_SOURCE='embedded spec';
const fromUrl=(raw:string|null):SpecSource|Problem=>{
  const c=checkSpecUrl(raw);
  return c.ok?{key:c.url,read:()=>fetchSpecText(c.url)}:{source:raw||'URL',issues:[{path:'src',message:c.message}]};
};
const setQuery=(key:string,value:string)=>{
  try{const q=new URLSearchParams(location.search);q.set(key,value);history.replaceState(history.state,'','?'+q.toString()+location.hash);}catch{/* some file:// contexts refuse history updates */}
};

function Standalone(){
  const query=useMemo(()=>new URLSearchParams(location.search),[]);
  const [view,setView]=useState<Rendering>(()=>{const v=query.get('view');return RENDERINGS.some(r=>r.id===v)?v as Rendering:'isometric';});
  const onView=useCallback((id:Rendering)=>{setView(id);setQuery('view',id);},[]);
  const [start]=useState(()=>{
    const src=query.get('src');if(src===null)return {initial:examples[0] as SpecSource,problem:null};
    const target=fromUrl(src);return 'issues' in target?{initial:null,problem:target}:{initial:target,problem:null};
  });
  // Embed API: only when framed, only from the direct parent, only the exact message type.
  const embedded=typeof window!=='undefined'&&window.parent!==window;
  const [incoming,setIncoming]=useState<(SpecSource&{seq:number})|undefined>();
  useEffect(()=>{
    if(!embedded)return;
    const receive=(e:MessageEvent)=>{
      if(e.source!==window.parent)return;
      const text=embeddedSpecText(e.data);if(text===null)return;
      setIncoming(prev=>({key:EMBED_SOURCE,read:async()=>text,seq:(prev?.seq??0)+1}));
    };
    window.addEventListener('message',receive);
    window.parent.postMessage(readyMessage(),'*');
    return()=>window.removeEventListener('message',receive);
  },[embedded]);
  // After each load: ready again. Details only for specs the parent sent; a file the visitor opened is not described.
  const onResult=useCallback((r:LoadResult)=>{if(!embedded)return;
    window.parent.postMessage(r.source!==EMBED_SOURCE?readyMessage():readyMessage(r.ok?{ok:true,id:r.id,warnings:r.warnings}:{ok:false,issues:r.issues}),'*');},[embedded]);
  return <ConceptWorkbench view={view} onView={onView} examples={examples} initial={start.initial} initialProblem={start.problem} openUrl={fromUrl} paste incoming={incoming} onResult={onResult}/>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><div className="studio-site"><Standalone/></div></StrictMode>);

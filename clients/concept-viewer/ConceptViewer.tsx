import {useCallback,useEffect,useMemo} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {EXAMPLES,RENDERINGS,safeSpecPath,type Rendering} from './examples.ts';
import {ConceptWorkbench,type SpecExample,type SpecSource} from './ConceptWorkbench.tsx';

const asset=(p:string)=>(import.meta.env?.BASE_URL??'./')+p;
const fromSite=(path:string):SpecSource=>({key:path,read:async()=>{
  const r=await fetch(asset(path),{credentials:'same-origin'});if(!r.ok)throw new Error('HTTP '+r.status+' for '+path);return r.text();
}});
const setQuery=(key:string,value:string)=>{const q=new URLSearchParams(location.search);if(q.get(key)===value)return;q.set(key,value);history.replaceState(history.state,'',location.pathname+'?'+q.toString());};

/**
 * Reference viewer for concept spec v1 files inside the site runtime: open an example, a dropped file or
 * `?spec=<relative path>`, then switch between the isometric SVG, the flat layer cake and the lazy 3D scene.
 * The rendering is the only saved view state and is mirrored into `?view=`; the opened example into `?spec=`.
 */
export function ConceptViewer(){
  const runtime=useRuntime(),{values}=useSiteState();
  const view=String(values['concept-rendering']) as Rendering;
  const query=useMemo(()=>new URLSearchParams(location.search),[]);
  const examples=useMemo<SpecExample[]>(()=>EXAMPLES.map(x=>({...fromSite(x.path),label:x.label,provenance:x.provenance})),[]);
  const requested=query.get('spec'),path=safeSpecPath(requested);
  useEffect(()=>{const v=query.get('view');if(v&&RENDERINGS.some(r=>r.id===v))runtime.set('concept-rendering',v);},[query,runtime]);
  const onView=useCallback((id:Rendering)=>{runtime.set('concept-rendering',id);setQuery('view',id);},[runtime]);
  const onOpened=useCallback((key:string)=>{if(examples.some(x=>x.key===key)||key===path)setQuery('spec',key);},[examples,path]);
  return <ConceptWorkbench view={view} onView={onView} examples={examples} initial={fromSite(path??EXAMPLES[0].path)} onOpened={onOpened}
    initialProblem={requested&&!path?{source:requested,issues:[{path:'',message:'?spec= must be a relative .json path on this site'}]}:null}/>;
}

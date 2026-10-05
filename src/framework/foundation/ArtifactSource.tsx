import {Suspense,useEffect,useMemo,useRef,useState,type ComponentType} from 'react';
import {RuntimeContext} from '../hooks';
import {SiteRuntime} from '../runtime';
import {RenderBlock} from '../registry';
import {artifactDefinition,type Artifact} from './artifact';
import {loadArtifactSource,type ArtifactSourceSpec} from './artifact-loader';
import {ArtifactView} from './ArtifactView';
import './foundation.css';

function Provenance({artifact,url}:{artifact:Artifact;url:string}){
  const p=artifact.provenance;
  return <dl className="foundation-artifact-provenance" data-testid="artifact-provenance">
    <div><dt>Provenance</dt><dd data-provenance-kind={p.kind}>{p.kind}</dd></div>
    <div><dt>Source</dt><dd>{p.source}</dd></div>
    {p.runId?<div><dt>Run</dt><dd>{p.runId}</dd></div>:null}
    {new URL(url).origin!==location.origin
      ?<div><dt>Service</dt><dd><code>{new URL(url).host+new URL(url).pathname}</code></dd></div>
      :<div><dt>File</dt><dd><code>{new URL(url).pathname.split('/').slice(-2).join('/')}</code></dd></div>}
  </dl>;
}
function AllViews({artifact,show}:{artifact:Artifact;show:readonly string[]}){
  const runtime=useMemo(()=>new SiteRuntime(artifactDefinition(artifact)),[artifact]);
  const blocks=runtime.manifest.pages[0].sections[0].blocks.filter(b=>show.includes(b.id));
  return <RuntimeContext.Provider value={runtime}><Suspense fallback={<p role="status">Loading result representation...</p>}>
    {blocks.map(block=><div key={block.id} className="foundation-artifact-view" data-representation={block.id}><h4>{block.title}</h4><RenderBlock block={block}/></div>)}
  </Suspense></RuntimeContext.Provider>;
}
type Loaded={artifact:Artifact;url:string};
type SourceState={status:'loading'}|{status:'ready';result:Loaded;pending:boolean}|{status:'error';message:string;fallback?:Loaded};
const message=(error:unknown)=>String((error as Error)?.message||error);
/**
 * Load one artifact source with latest-wins semantics: every change aborts the previous request,
 * and only the newest request may update the state. Live (http) sources are debounced and keep the
 * previous result on screen while recomputing. When the primary source fails and `fallback` is set,
 * the fallback is loaded and the error is kept for the banner.
 */
export function useArtifactSource(source:ArtifactSourceSpec,fallback?:ArtifactSourceSpec,debounceMs=200):SourceState{
  const key=JSON.stringify(source),fallbackKey=fallback?JSON.stringify(fallback):'';
  const [state,setState]=useState<SourceState>({status:'loading'});
  const sequence=useRef(0);
  useEffect(()=>{
    const spec=JSON.parse(key) as ArtifactSourceSpec,backup=fallbackKey?JSON.parse(fallbackKey) as ArtifactSourceSpec:undefined;
    const run=++sequence.current,abort=new AbortController(),latest=()=>run===sequence.current&&!abort.signal.aborted;
    setState(previous=>previous.status==='ready'?{...previous,pending:true}:previous.status==='error'&&previous.fallback?previous:{status:'loading'});
    const options={base:document.baseURI,signal:abort.signal};
    const timer=setTimeout(()=>{
      loadArtifactSource(spec,options).then(
        result=>{if(latest())setState({status:'ready',result,pending:false});},
        async error=>{
          if(!latest()||(error as Error)?.name==='AbortError')return;
          const reason=message(error);
          if(!backup){setState({status:'error',message:reason});return;}
          try{const result=await loadArtifactSource(backup,options);if(latest())setState({status:'error',message:reason,fallback:result});}
          catch(second){if(latest())setState({status:'error',message:reason+' / fallback: '+message(second)});}
        });
    },spec.kind==='http'?debounceMs:0);
    return()=>{clearTimeout(timer);abort.abort();};
  },[key,fallbackKey,debounceMs]);
  return state;
}
function Rendered({result,show,pending}:{result:Loaded;show?:readonly string[];pending?:boolean}){
  const {artifact,url}=result;
  return <section className="foundation-artifact-source" data-testid="artifact-source" data-artifact-id={artifact.id} data-run-id={artifact.provenance.runId??''} aria-busy={pending||undefined}>
    {show?.length?<><header><span className="foundation-kicker">Python result / {artifact.provenance.kind}{pending?' / recomputing...':''}</span><h3>{artifact.title}</h3></header><AllViews artifact={artifact} show={show}/></>:<ArtifactView artifact={artifact}/>}
    <Provenance artifact={artifact} url={url}/>
  </section>;
}
/**
 * Render a Python-written artifact: a static file by `id` (public/artifacts/<id>.json) or any `source`
 * (static or a loopback live service). No calculation in TS. `show` lists representation ids to render
 * together (absent ids are skipped); without it, the switchable ArtifactView is used. `fallback` is
 * shown with a banner when `source` fails (e.g. the live service is down).
 */
export function ArtifactSource({id,source,fallback,show}:{id?:string;source?:ArtifactSourceSpec;fallback?:ArtifactSourceSpec;show?:readonly string[]}){
  const spec:ArtifactSourceSpec=source??{kind:'static',id:id??''};
  const label=spec.kind==='static'?spec.id:spec.id??spec.url;
  const state=useArtifactSource(spec,fallback);
  if(state.status==='loading')return <p role="status" data-testid="artifact-loading">Loading artifact {label}...</p>;
  if(state.status==='error'){
    if(state.fallback)return <>
      <div role="alert" className="foundation-artifact-fallback" data-testid="artifact-fallback-banner"><strong>Live result unavailable, showing the precomputed artifact.</strong> {state.message}</div>
      <Rendered result={state.fallback} show={show}/>
    </>;
    return <div role="alert" className="foundation-artifact-error" data-testid="artifact-error" data-artifact-id={label}><strong>Artifact unavailable.</strong> {state.message}</div>;
  }
  return <Rendered result={state.result} show={show} pending={state.pending}/>;
}
/** Client helper: `components:{aep:artifactSource('wind-aep-weibull',['aep-8','table'])}`. */
export function artifactSource(id:string,show?:readonly string[]):ComponentType{
  const Bound=()=><ArtifactSource id={id} show={show}/>;Bound.displayName='ArtifactSource('+id+')';return Bound;
}

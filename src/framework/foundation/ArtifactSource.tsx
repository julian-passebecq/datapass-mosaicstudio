import {Suspense,useEffect,useMemo,useRef,useState,type ComponentType} from 'react';
import {RuntimeContext} from '../hooks';
import {SiteRuntime} from '../runtime';
import {RenderBlock} from '../registry';
import {artifactDefinition,type Artifact} from './artifact';
import {loadArtifactSource,type ArtifactSourceSpec} from './artifact-loader';
import {ArtifactView} from './ArtifactView';
import {artifactWatchAvailable,onArtifactChanged} from './artifact-live';
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
/** `liveError`: a watched file was rewritten with an invalid artifact; the last valid result stays on screen. */
type SourceState={status:'loading'}|{status:'ready';result:Loaded;pending:boolean;updatedAt:number;liveError?:string}|{status:'error';message:string;fallback?:Loaded};
const message=(error:unknown)=>String((error as Error)?.message||error);
/**
 * Load one artifact source with latest-wins semantics: every change aborts the previous request,
 * and only the newest request may update the state. Live (http) sources are debounced and keep the
 * previous result on screen while recomputing. When the primary source fails and `fallback` is set,
 * the fallback is loaded and the error is kept for the banner.
 * Dev only (bridge level 2.5): a static source refetches when the dev server reports its file changed;
 * a failed refresh keeps the last valid result and sets `liveError`.
 */
export function useArtifactSource(source:ArtifactSourceSpec,fallback?:ArtifactSourceSpec,debounceMs=200):SourceState{
  const key=JSON.stringify(source),fallbackKey=fallback?JSON.stringify(fallback):'';
  const [state,setState]=useState<SourceState>({status:'loading'});
  const sequence=useRef(0),lastKey=useRef('');
  const [revision,setRevision]=useState(0);
  const current=useRef(state);current.current=state;
  const watchedId=artifactWatchAvailable&&source.kind==='static'?source.id:'';
  useEffect(()=>watchedId?onArtifactChanged(watchedId,()=>setRevision(r=>r+1)):undefined,[watchedId]);
  useEffect(()=>{
    const refresh=lastKey.current===key+'|'+fallbackKey;lastKey.current=key+'|'+fallbackKey;
    const spec=JSON.parse(key) as ArtifactSourceSpec,backup=fallbackKey?JSON.parse(fallbackKey) as ArtifactSourceSpec:undefined;
    const run=++sequence.current,abort=new AbortController(),latest=()=>run===sequence.current&&!abort.signal.aborted;
    setState(previous=>previous.status==='ready'?{...previous,pending:true}:previous.status==='error'&&previous.fallback?previous:{status:'loading'});
    const options={base:document.baseURI,signal:abort.signal};
    const timer=setTimeout(()=>{
      loadArtifactSource(spec,options).then(
        result=>{if(latest())setState({status:'ready',result,pending:false,updatedAt:Date.now()});},
        async error=>{
          if(!latest()||(error as Error)?.name==='AbortError')return;
          const reason=message(error);
          if(refresh&&current.current.status==='ready'){setState(previous=>previous.status==='ready'?{...previous,pending:false,liveError:reason}:previous);return;}
          if(!backup){setState({status:'error',message:reason});return;}
          try{const result=await loadArtifactSource(backup,options);if(latest())setState({status:'error',message:reason,fallback:result});}
          catch(second){if(latest())setState({status:'error',message:reason+' / fallback: '+message(second)});}
        });
    },spec.kind==='http'?debounceMs:0);
    return()=>{clearTimeout(timer);abort.abort();};
  },[key,fallbackKey,debounceMs,revision]);
  return state;
}
function Rendered({result,show,pending,liveSince}:{result:Loaded;show?:readonly string[];pending?:boolean;liveSince?:number}){
  const {artifact,url}=result;
  return <section className="foundation-artifact-source" data-testid="artifact-source" data-artifact-id={artifact.id} data-run-id={artifact.provenance.runId??''} aria-busy={pending||undefined}>
    {liveSince!==undefined?<p className="foundation-artifact-live" data-testid="artifact-live-badge" data-updated-at={liveSince} title="Dev server: this file is watched; any producer that rewrites it updates this view.">
      <span aria-hidden="true">{'●'}</span> Live file <span>updated {new Date(liveSince).toLocaleTimeString()}</span></p>:null}
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
  // Same element structure with or without the toast, so view state (table sort, chosen representation) survives updates.
  return <>
    {state.liveError?<div role="alert" className="foundation-artifact-toast" data-testid="artifact-live-error"><strong>Rejected file update, keeping the last valid result.</strong> {state.liveError}</div>:null}
    <Rendered result={state.result} show={show} pending={state.pending} liveSince={artifactWatchAvailable&&spec.kind==='static'?state.updatedAt:undefined}/>
  </>;
}
/** Client helper: `components:{aep:artifactSource('wind-aep-weibull',['aep-8','table'])}`. */
export function artifactSource(id:string,show?:readonly string[]):ComponentType{
  const Bound=()=><ArtifactSource id={id} show={show}/>;Bound.displayName='ArtifactSource('+id+')';return Bound;
}

import {Suspense,useEffect,useMemo,useState,type ComponentType} from 'react';
import {RuntimeContext} from '../hooks';
import {SiteRuntime} from '../runtime';
import {RenderBlock} from '../registry';
import {artifactDefinition,type Artifact} from './artifact';
import {loadArtifact,type ArtifactLoadState} from './artifact-loader';
import {ArtifactView} from './ArtifactView';
import './foundation.css';

function Provenance({artifact,url}:{artifact:Artifact;url:string}){
  const p=artifact.provenance;
  return <dl className="foundation-artifact-provenance" data-testid="artifact-provenance">
    <div><dt>Provenance</dt><dd data-provenance-kind={p.kind}>{p.kind}</dd></div>
    <div><dt>Source</dt><dd>{p.source}</dd></div>
    {p.runId?<div><dt>Run</dt><dd>{p.runId}</dd></div>:null}
    <div><dt>File</dt><dd><code>{new URL(url).pathname.split('/').slice(-2).join('/')}</code></dd></div>
  </dl>;
}
function AllViews({artifact,show}:{artifact:Artifact;show:readonly string[]}){
  const runtime=useMemo(()=>new SiteRuntime(artifactDefinition(artifact)),[artifact]);
  const blocks=runtime.manifest.pages[0].sections[0].blocks.filter(b=>show.includes(b.id));
  return <RuntimeContext.Provider value={runtime}><Suspense fallback={<p role="status">Loading result representation...</p>}>
    {blocks.map(block=><div key={block.id} className="foundation-artifact-view" data-representation={block.id}><h4>{block.title}</h4><RenderBlock block={block}/></div>)}
  </Suspense></RuntimeContext.Provider>;
}
/**
 * Render a Python-written static artifact by id (public/artifacts/<id>.json). No calculation in TS.
 * `show` lists representation ids to render together; without it, the switchable ArtifactView is used.
 */
export function ArtifactSource({id,show}:{id:string;show?:readonly string[]}){
  const [state,setState]=useState<ArtifactLoadState>({status:'loading',id});
  useEffect(()=>{
    const abort=new AbortController();setState({status:'loading',id});
    loadArtifact(id,{base:document.baseURI,signal:abort.signal}).then(
      ({artifact,url})=>{if(!abort.signal.aborted)setState({status:'ready',id,artifact,url});},
      error=>{if(!abort.signal.aborted)setState({status:'error',id,message:String((error as Error)?.message||error)});});
    return()=>abort.abort();
  },[id]);
  if(state.status==='loading')return <p role="status" data-testid="artifact-loading">Loading artifact {id}...</p>;
  if(state.status==='error')return <div role="alert" className="foundation-artifact-error" data-testid="artifact-error" data-artifact-id={id}><strong>Artifact unavailable.</strong> {state.message}</div>;
  return <section className="foundation-artifact-source" data-testid="artifact-source" data-artifact-id={state.artifact.id}>
    {show?.length?<><header><span className="foundation-kicker">Python result / {state.artifact.provenance.kind}</span><h3>{state.artifact.title}</h3></header><AllViews artifact={state.artifact} show={show}/></>:<ArtifactView artifact={state.artifact}/>}
    <Provenance artifact={state.artifact} url={state.url}/>
  </section>;
}
/** Client helper: `components:{aep:artifactSource('wind-aep-weibull',['aep-8','table'])}`. */
export function artifactSource(id:string,show?:readonly string[]):ComponentType{
  const Bound=()=><ArtifactSource id={id} show={show}/>;Bound.displayName='ArtifactSource('+id+')';return Bound;
}

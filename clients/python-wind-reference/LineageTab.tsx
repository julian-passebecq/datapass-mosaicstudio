import {useEffect,useState} from 'react';
import {useArtifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
import {LineageExplorer} from '../../src/framework/foundation/lineage/LineageExplorer.tsx';
import {loadEvidenceSources} from '../../src/framework/foundation/lineage/sources.ts';
import type {SourceArtifact} from '../../src/framework/evidence/model.ts';

/** Lineage tab: the static artifact's declared chain (value -> view -> artifact -> producer/inputs -> cited lines).
 * The cited file is a copy published by py/wind_reference_model.py into public/sources/ (datapass_artifact.write_sources). */
export function LineageTab(){
  const state=useArtifactSource({kind:'static',id:'wind-aep-weibull'});
  const artifact=state.status==='ready'?state.result.artifact:null;
  const [sources,setSources]=useState<{sources:SourceArtifact[];missing:string[]}|null>(null);
  useEffect(()=>{
    if(!artifact)return;
    const abort=new AbortController();
    loadEvidenceSources(artifact,{base:document.baseURI,signal:abort.signal}).then(setSources,error=>{if((error as Error)?.name!=='AbortError')setSources({sources:[],missing:[String((error as Error)?.message||error)]});});
    return()=>abort.abort();
  },[artifact]);
  if(state.status==='error')return <div role="alert" data-testid="artifact-error">Artifact unavailable. {state.message}</div>;
  if(!artifact||!sources)return <p role="status" data-testid="lineage-loading">Loading lineage...</p>;
  return <LineageExplorer artifact={artifact} sources={sources.sources} missing={sources.missing}/>;
}

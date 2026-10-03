import {Suspense,useMemo,useState} from 'react';
import {RuntimeContext} from '../hooks';
import {SiteRuntime} from '../runtime';
import {RenderBlock} from '../registry';
import {createBrowserHost} from '../../core/host';
import {artifactDefinition,artifactExport,validateArtifact,type Artifact} from './artifact';
import './foundation.css';

/** Existing renderers consume one result. No task handler or source computation is copied. */
export function ArtifactView({artifact}:{artifact:Artifact}){
  const normalized=useMemo(()=>validateArtifact(artifact),[artifact]);
  const runtime=useMemo(()=>new SiteRuntime(artifactDefinition(normalized)),[normalized]);
  const [preferred,setPreferred]=useState('');
  const rep=normalized.representations.find(r=>r.id===preferred)||normalized.representations[0];
  const block=runtime.manifest.pages[0].sections[0].blocks.find(b=>b.id===rep.id)!;
  return <section className="foundation-artifact" data-testid="artifact" data-artifact-id={normalized.id} data-representation={rep.id}>
    <header><div><span className="foundation-kicker">Immutable result / {normalized.provenance.kind}</span><h3>{normalized.title}</h3></div><label>Representation<select aria-label="Artifact representation" value={rep.id} onChange={e=>setPreferred(e.target.value)}>{normalized.representations.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label></header>
    <RuntimeContext.Provider value={runtime}><Suspense fallback={<p role="status">Loading result representation...</p>}><RenderBlock key={rep.id} block={block}/></Suspense></RuntimeContext.Provider>
    <footer><p>{normalized.provenance.source}</p><button type="button" onClick={()=>createBrowserHost().saveDownload(normalized.id+'-artifact.json',new Blob([artifactExport(normalized)],{type:'application/json'}))}>Export artifact JSON</button><small>Exports all result rows, not just the active view. Review before sharing.</small></footer>
  </section>;
}

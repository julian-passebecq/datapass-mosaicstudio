import {useMemo,useState} from 'react';
import type {SourceArtifact} from '../../evidence/model';
import type {Artifact,EvidenceLink} from '../artifact';
import {artifactLineage,evidenceKey,lineagePath} from './model';
import {LineageGraph} from './LineageGraph';
import {SourcePanel} from './SourcePanel';
import './lineage.css';

/**
 * Values, lineage graph, evidence chips and citation source panel for one artifact. Clicking a value highlights
 * its path and opens its first cited lines; clicking an evidence chip or node opens that exact range. No AI,
 * no calculation: the graph is the producer's declared metadata.
 */
export function LineageExplorer({artifact,sources,missing=[]}:{artifact:Artifact;sources:readonly SourceArtifact[];missing?:readonly string[]}){
  const graph=useMemo(()=>artifactLineage(artifact),[artifact]);
  const values=graph.nodes.filter(n=>n.kind==='value');
  const [selected,setSelected]=useState<string|null>(null);
  const [focus,setFocus]=useState<EvidenceLink|null>(null);
  const path=useMemo(()=>selected?lineagePath(graph,selected):null,[graph,selected]);
  const chips=graph.nodes.filter(n=>n.kind==='evidence'&&(!path||path.has(n.id)));
  const select=(id:string)=>{
    setSelected(id);
    const node=graph.nodes.find(n=>n.id===id);
    if(node?.evidence){setFocus(node.evidence);return;}
    const onPath=lineagePath(graph,id),first=graph.nodes.find(n=>n.kind==='evidence'&&onPath.has(n.id));
    if(node?.kind==='value'&&first?.evidence)setFocus(first.evidence);
  };
  const p=artifact.provenance;
  return <section className="lineage-explorer" data-testid="lineage-explorer" data-artifact-id={artifact.id}>
    <header>
      <span className="foundation-kicker">Lineage / declared by the producer</span>
      <h3>{artifact.title}</h3>
      {!p.producer&&!p.inputs?.length?<p className="lineage-note" data-testid="lineage-legacy">This artifact declares no producer or inputs (older format); only its representations are shown.</p>:null}
    </header>
    {values.length?<div className="lineage-values" role="group" aria-label="Displayed values">{values.map(v=><button key={v.id} type="button" data-testid="lineage-value" data-node-id={v.id} aria-pressed={selected===v.id} onClick={()=>select(v.id)}>
      <small>{v.detail}</small><strong>{v.label}</strong></button>)}</div>:null}
    <div className="lineage-body">
      <LineageGraph graph={graph} selected={selected} onSelect={select}/>
      <div className="lineage-side">
        <div className="lineage-chips" role="group" aria-label={path?'Evidence on the selected path':'All evidence'}>
          <span className="foundation-kicker">{path?'Evidence on this path':'Evidence'} ({chips.length})</span>
          {chips.map(c=><button key={c.id} type="button" data-testid="evidence-chip" data-evidence={evidenceKey(c.evidence!)} aria-pressed={!!focus&&evidenceKey(focus)===evidenceKey(c.evidence!)}
            onClick={()=>{setSelected(c.id);setFocus(c.evidence!);}}>{c.label}<small>{c.detail}</small></button>)}
          {missing.length?<p className="lineage-note" role="status">Not supplied: {missing.join(', ')}</p>:null}
        </div>
        <SourcePanel sources={sources} focus={focus} onClose={()=>setFocus(null)}/>
      </div>
    </div>
  </section>;
}

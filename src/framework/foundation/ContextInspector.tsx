import {useMemo} from 'react';
import type {EvidenceRef,SourceArtifact} from '../evidence/model';
import {validateContext,type ContextModel} from './context';
import './foundation.css';
export function ContextInspector({model,sources=[],onEvidence,onRelated}:{model:ContextModel;sources?:readonly SourceArtifact[];onEvidence?(ref:EvidenceRef):void;onRelated?(id:string):void}){
  const context=useMemo(()=>validateContext(model,sources),[model,sources]);
  return <section className="foundation-context" aria-label="Context inspector" data-context-id={context.id}>
    <span className="foundation-kicker">{context.kind}</span><h3>{context.title}</h3>{context.summary&&<p>{context.summary}</p>}
    <dl>{context.facts.map((fact,index)=><div key={index}><dt>{fact.label}</dt><dd>{fact.value||'Not supplied'}</dd></div>)}</dl>
    {context.references.length>0&&<section><h4>Evidence</h4>{context.references.map(ref=><div key={ref.artifact+':'+ref.start+':'+ref.end}>{onEvidence?<button type="button" onClick={()=>onEvidence(ref)}>{ref.label} <small>{ref.artifact}:{ref.start}-{ref.end}</small></button>:<p>{ref.label} / {ref.artifact}:{ref.start}-{ref.end}</p>}</div>)}</section>}
    {context.related.length>0&&<section><h4>Related</h4>{context.related.map(item=>onRelated?<button type="button" key={item.id} onClick={()=>onRelated(item.id)}>{item.label}</button>:<p key={item.id}>{item.label}</p>)}</section>}
    {context.note&&<p className="foundation-context-note">{context.note}</p>}
  </section>;
}

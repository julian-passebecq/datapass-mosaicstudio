import type {ConceptSpec,EvidenceRef} from '../schema.ts';
import {inputsOf,outputsOf,nodeById} from '../schema.ts';
import {KINDS,STATUS_TEXT,layerTint,statusColor} from '../kinds.ts';
import {flatGlyph} from '../flat-glyphs.ts';

/** One evidence ref. Inert text; only an https:// ref becomes a link (opened in a new tab, no referrer). */
function evidenceItem(e:EvidenceRef,key:number,context?:string){
  return <li key={key} data-evidence-kind={e.kind}>
    <small className="aa-eyebrow">{e.kind}{context?' · '+context:''}</small>
    {/^https:\/\/[^\s]+$/.test(e.ref)?<a href={e.ref} target="_blank" rel="noopener noreferrer"><code>{e.ref}</code></a>:<code>{e.ref}</code>}
    {e.label&&<small>{e.label}</small>}
  </li>;
}

/** Properties of one node: kind, description, inputs/outputs, notes and source refs. Same content in the app and the film. */
export function NodeDetails({spec,id,onSelect}:{spec:ConceptSpec;id:string;onSelect?(id:string):void}){
  const node=nodeById(spec,id);if(!node)return null;
  const li=spec.layers.findIndex(l=>l.id===node.layer),layer=spec.layers[li],domain=spec.domains.find(d=>d.id===node.domain)!;
  const info=KINDS[node.kind],color=statusColor(info.color,node.status);
  const link=(other:string,label:string,kind:string,dir:'in'|'out',key:string)=>{const o=nodeById(spec,other)!;
    const body=<><i className={'aa-edge-'+kind}/>{dir==='in'?'from ':'to '}<b>{o.label}</b><small>{label}</small></>;
    return <li key={key}>{onSelect?<button onClick={()=>onSelect(other)}>{body}</button>:<span>{body}</span>}</li>;};
  const ins=inputsOf(spec,id),outs=outputsOf(spec,id),notes=spec.annotations.filter(a=>a.target===id);
  const flowEvidence=[...ins,...outs].flatMap(flow=>flow.evidence.map(e=>({flow,e})));
  return <div className="aa-details" data-testid="atlas-details" data-node={id}>
    <div className="aa-details-head">
      <span className="aa-glyph" style={{background:color+'33'}}><svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="#24333d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{__html:flatGlyph(info.flat,color)}}/></span>
      <span><small className="aa-eyebrow">{info.label}{STATUS_TEXT[node.status]&&<span className="aa-details-status">{STATUS_TEXT[node.status]}</span>}</small><h3>{node.label}</h3></span>
    </div>
    <div className="aa-details-where"><span style={{borderColor:layerTint(layer,li)}}>{layer.label}</span><span>{domain.label}</span><code>{node.id}</code></div>
    {node.description&&<p className="aa-details-purpose">{node.description}</p>}
    {node.kind==='lake'&&<p className="aa-details-note">Drawn as the ground under every layer: items above it keep their tables here.</p>}
    {notes.length>0&&<ol className="aa-notes">{notes.map(a=><li key={a.id}>{a.text}</li>)}</ol>}
    <h4>Inputs <small>{ins.length}</small></h4>
    {ins.length?<ul className="aa-links">{ins.map(f=>link(f.from,f.label,f.kind,'in',f.id))}</ul>:<p className="aa-empty">None declared.</p>}
    <h4>Outputs <small>{outs.length}</small></h4>
    {outs.length?<ul className="aa-links">{outs.map(f=>link(f.to,f.label,f.kind,'out',f.id))}</ul>:<p className="aa-empty">None declared.</p>}
    <h4>Sources</h4>
    {node.sources.length?<ul className="aa-sources">{node.sources.map(s=><li key={s.path}><code>{s.path}</code>{s.note&&<small>{s.note}</small>}</li>)}</ul>:<p className="aa-empty">{node.evidence.length?'See evidence below.':spec.provenance==='synthetic'?'Synthetic illustration: no source file.':'No source declared.'}</p>}
    {node.evidence.length>0&&<><h4>Evidence <small>{node.evidence.length}</small></h4><ul className="aa-sources" data-testid="node-evidence">{node.evidence.map((e,k)=>evidenceItem(e,k))}</ul></>}
    {flowEvidence.length>0&&<><h4>Flow evidence <small>{flowEvidence.length}</small></h4><ul className="aa-sources" data-testid="flow-evidence">{flowEvidence.map(({flow,e},k)=>evidenceItem(e,k,flow.label))}</ul></>}
  </div>;
}

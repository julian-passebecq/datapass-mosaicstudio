import type {ArchSpec} from './spec';
import {KIND_LABELS,inputsOf,outputsOf,nodeById} from './spec';
import {glyph} from './glyphs';
import {KIND_COLOR,LAYER_TINT} from './palette';

/** Properties of one node: kind, purpose, inputs/outputs and source refs. Same content in the app and the film. */
export function NodeDetails({spec,id,onSelect}:{spec:ArchSpec;id:string;onSelect?(id:string):void}){
  const node=nodeById(spec,id);if(!node)return null;
  const layer=spec.layers.find(l=>l.id===node.layer)!,group=spec.groups.find(g=>g.id===node.group)!;
  const link=(other:string,label:string,kind:string,dir:'in'|'out')=>{const o=nodeById(spec,other)!;
    const body=<><i className={'aa-edge-'+kind}/>{dir==='in'?'from ':'to '}<b>{o.label}</b><small>{label}</small></>;
    return <li key={other+label}>{onSelect?<button onClick={()=>onSelect(other)}>{body}</button>:<span>{body}</span>}</li>;};
  const ins=inputsOf(spec,id),outs=outputsOf(spec,id);
  return <div className="aa-details" data-testid="atlas-details" data-node={id}>
    <div className="aa-details-head">
      <span className="aa-glyph" style={{background:KIND_COLOR[node.kind]+'33'}}><svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="#24333d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{__html:glyph(node.kind,KIND_COLOR[node.kind])}}/></span>
      <span><small className="aa-eyebrow">{KIND_LABELS[node.kind]}</small><h3>{node.label}</h3></span>
    </div>
    <div className="aa-details-where"><span style={{borderColor:LAYER_TINT[layer.role]}}>{layer.label}</span><span>{group.label}</span><code>{node.id}</code></div>
    <p className="aa-details-purpose">{node.purpose}</p>
    {node.kind==='lake'&&<p className="aa-details-note">Drawn as the ground under every layer: items above it keep their tables here.</p>}
    <h4>Inputs <small>{ins.length}</small></h4>
    {ins.length?<ul className="aa-links">{ins.map(e=>link(e.from,e.label,e.kind,'in'))}</ul>:<p className="aa-empty">None declared.</p>}
    <h4>Outputs <small>{outs.length}</small></h4>
    {outs.length?<ul className="aa-links">{outs.map(e=>link(e.to,e.label,e.kind,'out'))}</ul>:<p className="aa-empty">None declared.</p>}
    <h4>Sources</h4>
    {node.sources.length?<ul className="aa-sources">{node.sources.map(s=><li key={s.path}><code>{s.path}</code>{s.note&&<small>{s.note}</small>}</li>)}</ul>:<p className="aa-empty">{spec.provenance==='synthetic'?'Synthetic illustration: no source file.':'No source declared.'}</p>}
  </div>;
}

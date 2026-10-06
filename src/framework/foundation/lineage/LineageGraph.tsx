import {useMemo,useRef,type KeyboardEvent} from 'react';
import type {EvidenceLink} from '../artifact';
import {layoutLineage,lineagePath,LINEAGE_LAYER_TITLES,type LineageGraph as Graph,type LineageNode} from './model';
import './lineage.css';

const clip=(text:string,max:number)=>text.length>max?text.slice(0,max-1)+'…':text;

/**
 * Compact left-to-right lineage DAG (own SVG, deterministic layered layout). Every node is a focusable button:
 * Enter/Space selects (an evidence node also opens its source), arrows move between columns (left/right) and
 * within a column (up/down). Narrow containers (< 560 px) show the same nodes as an ordered list instead.
 */
export function LineageGraph({graph,selected,onSelect,onEvidence,label='Artifact lineage'}:{graph:Graph;selected?:string|null;onSelect?(id:string):void;onEvidence?(ref:EvidenceLink):void;label?:string}){
  const layout=useMemo(()=>layoutLineage(graph),[graph]);
  const path=useMemo(()=>selected?lineagePath(graph,selected):new Set<string>(),[graph,selected]);
  const refs=useRef(new Map<string,SVGGElement|HTMLButtonElement>());
  const byId=useMemo(()=>new Map(graph.nodes.map(n=>[n.id,n])),[graph]);
  const activate=(node:LineageNode)=>{onSelect?.(node.id);if(node.evidence)onEvidence?.(node.evidence);};
  const neighbours=(id:string,direction:'from'|'to')=>graph.edges.filter(e=>e[direction==='from'?'to':'from']===id).map(e=>e[direction]);
  const move=(event:KeyboardEvent,node:LineageNode,list:boolean)=>{
    const point=layout.points[node.id];let target:string|undefined;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(node);return;}
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      const next=neighbours(node.id,event.key==='ArrowRight'?'to':'from');
      target=next.find(id=>path.has(id))??next.sort((a,b)=>layout.points[a].order-layout.points[b].order)[0];
    }else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      const layer=layout.layers[point.layer],flat=list?layout.layers.flat():layer,at=flat.indexOf(node.id);
      target=flat[at+(event.key==='ArrowDown'?1:-1)];
    }else if(event.key==='Home'||event.key==='End'){const flat=layout.layers.flat();target=event.key==='Home'?flat[0]:flat.at(-1);}
    if(target){event.preventDefault();refs.current.get((list?'list:':'svg:')+target)?.focus();}
  };
  const state=(id:string)=>({'data-node-id':id,'data-kind':byId.get(id)!.kind,'data-selected':selected===id,'data-in-path':path.has(id)});
  const describe=(n:LineageNode)=>`${n.kind}: ${n.label}. ${n.detail}`;
  return <div className="lineage" data-testid="lineage" data-selected={selected??''} data-path-size={path.size}>
    <div className="lineage-canvas">
      <svg role="group" aria-label={label} viewBox={`-2 -2 ${layout.width+4} ${layout.height+4}`} width={layout.width+4} height={layout.height+4} className="lineage-svg">
        <g aria-hidden="true">{layout.edges.map(e=><path key={e.from+'>'+e.to} d={e.path} className="lineage-edge" data-in-path={path.has(e.from)&&path.has(e.to)}/>)}</g>
        {graph.nodes.map(node=>{const p=layout.points[node.id];return <g key={node.id} ref={el=>{if(el)refs.current.set('svg:'+node.id,el);else refs.current.delete('svg:'+node.id);}}
          transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0} aria-pressed={selected===node.id} aria-label={describe(node)} data-testid="lineage-node" className="lineage-node" {...state(node.id)}
          onClick={()=>activate(node)} onKeyDown={event=>move(event,node,false)}>
          <title>{describe(node)}</title>
          <rect width={layout.nodeWidth} height={layout.nodeHeight} rx={5}/>
          <text x={10} y={19} className="lineage-node-label">{clip(node.label,24)}</text>
          <text x={10} y={35} className="lineage-node-detail">{clip(node.detail,30)}</text>
        </g>;})}
      </svg>
    </div>
    <ol className="lineage-list" aria-label={label}>{layout.layers.map((layer,l)=>{
      const rank=byId.get(layer[0])!.rank;
      return <li key={l}><span className="lineage-list-title">{LINEAGE_LAYER_TITLES[rank]??'Layer '+(l+1)}</span><ul>{layer.map(id=>{const node=byId.get(id)!;return <li key={id}>
        <button type="button" ref={el=>{if(el)refs.current.set('list:'+id,el);else refs.current.delete('list:'+id);}} aria-pressed={selected===id} data-testid="lineage-item" {...state(id)}
          onClick={()=>activate(node)} onKeyDown={event=>move(event,node,true)}><strong>{node.label}</strong><small>{node.detail}</small></button></li>;})}</ul></li>;
    })}</ol>
  </div>;
}

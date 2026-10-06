/** Contract matrix (apps x contracts) and status board. Pure projections of the same registry snapshot and
 * the same focused node; nothing recomputes the registry. Sorting is view-local state. */
import {useMemo,useState} from 'react';
import {REGISTRY} from './registry.generated.ts';
import {STATUS_LABEL,shortName,type StatusFilter} from './registry.ts';
import {KIND_LABEL,STATUS_COLOR,boardLanes,buildWorld,matrixColumns,matrixRows,type MatrixSort} from './world.ts';

const ROLE_LABEL={P:'provides',C:'consumes',PC:'provides and consumes'} as const;
const nameOf=(id:string)=>shortName(REGISTRY.nodes.find(n=>n.id===id)?.name||id);

export function MatrixView({filter,focus,matched,contract,onSelect,onContract}:{filter:StatusFilter;focus:string|null;matched:Set<string>|null;contract:string|null;onSelect(id:string|null):void;onContract(id:string|null):void}){
  const [sort,setSort]=useState<{key:MatrixSort;desc:boolean}>({key:'status',desc:false});
  const columns=useMemo(()=>matrixColumns(buildWorld(REGISTRY,filter)),[filter]);
  const rows=useMemo(()=>matrixRows(REGISTRY,filter,sort.key,focus,sort.desc).filter(r=>!matched||matched.has(r.owner)||r.consumers.some(c=>matched.has(c))),[filter,sort,focus,matched]);
  const head=(key:MatrixSort,label:string)=><th scope="col" aria-sort={sort.key===key?(sort.desc?'descending':'ascending'):'none'}>
    <button type="button" data-testid={'gn-sort-'+key} onClick={()=>setSort(s=>({key,desc:s.key===key?!s.desc:false}))}>{label}{sort.key===key?(sort.desc?' ▾':' ▴'):''}</button></th>;
  return <div className="gn-matrix" data-testid="gn-matrix">
    <div className="gn-matrix-bar">
      <span>{rows.length} contracts × {columns.length} apps and repos. <b>P</b> provides, <b>C</b> consumes; colour is the contract status.</span>
      <button type="button" data-testid="gn-sort-focus" disabled={!focus} aria-pressed={sort.key==='focus'} onClick={()=>setSort({key:'focus',desc:false})}>{focus?`Rows of ${nameOf(focus)} first`:'Focus a node to sort by it'}</button>
    </div>
    <div className="gn-matrix-scroll">
      <table>
        <caption className="gn-sr">Contract matrix: one row per contract, one column per app or repository</caption>
        <thead><tr>
          {head('id','Contract')}{head('status','Status')}{head('owner','Owner')}{head('consumers','Uses')}
          {columns.map(c=><th key={c.id} scope="col" className="gn-col" data-node={c.id} aria-selected={focus===c.id}>
            <button type="button" title={`${c.node.name} (${KIND_LABEL[c.kind]})`} aria-pressed={focus===c.id} onClick={()=>onSelect(focus===c.id?null:c.id)}><span>{shortName(c.node.name)}</span></button></th>)}
        </tr></thead>
        <tbody>{rows.map(r=><tr key={r.id} data-contract={r.id} data-status={r.status} aria-selected={contract===r.id}>
          <th scope="row"><button type="button" aria-pressed={contract===r.id} onClick={()=>{onContract(contract===r.id?null:r.id);if(!focus)onSelect(r.owner);}}><code>{r.id}</code></button></th>
          <td><span className="gn-dot" style={{background:STATUS_COLOR[r.status]}}/>{STATUS_LABEL[r.status]}</td>
          <td>{nameOf(r.owner)}</td><td className="gn-num">{r.consumers.length}</td>
          {columns.map(c=>{const role=r.roles[c.id];return <td key={c.id} className="gn-cell" data-role={role||''} aria-selected={focus===c.id}
            style={role?{['--gn-s' as string]:STATUS_COLOR[r.status]}:undefined} title={role?`${nameOf(c.id)} ${ROLE_LABEL[role]} ${r.id} (${STATUS_LABEL[r.status]})`:undefined}>
            {role?<button type="button" onClick={()=>{onSelect(c.id);onContract(r.id);}} aria-label={`${nameOf(c.id)} ${ROLE_LABEL[role]} ${r.id}`}>{role==='PC'?'P·C':role}</button>:null}</td>;})}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export function BoardView({filter,focus,matched,contract,onSelect,onContract}:{filter:StatusFilter;focus:string|null;matched:Set<string>|null;contract:string|null;onSelect(id:string|null):void;onContract(id:string|null):void}){
  const lanes=useMemo(()=>boardLanes(REGISTRY,filter),[filter]);
  return <div className="gn-board" data-testid="gn-board">
    {lanes.map(l=><section key={l.status} className="gn-lane" data-status={l.status} aria-label={`${STATUS_LABEL[l.status]}: ${l.contracts.length} contracts`} style={{['--gn-s' as string]:STATUS_COLOR[l.status]}}>
      <h3><span className="gn-dot"/>{STATUS_LABEL[l.status]}<span className="gn-count">{l.contracts.length}</span></h3>
      <ul>{l.contracts.map(c=>{
        const involved=!!focus&&(c.owner===focus||c.consumers.includes(focus)),hit=!matched||matched.has(c.owner)||c.consumers.some(x=>matched.has(x));
        return <li key={c.id} className="gn-card" data-contract={c.id} data-involved={involved?'true':'false'} data-dimmed={(focus&&!involved)||!hit?'true':'false'} aria-current={contract===c.id?'true':undefined}>
          <button type="button" className="gn-card-id" aria-pressed={contract===c.id} onClick={()=>{onContract(contract===c.id?null:c.id);if(!focus)onSelect(c.owner);}}><code>{c.id}</code></button>
          <span className="gn-cname">{c.name}</span>
          <span className="gn-to"><a href={'#'+c.owner} onClick={e=>{e.preventDefault();onSelect(c.owner);}}>{nameOf(c.owner)}</a>
            {c.consumers.length?<> → {c.consumers.map((x,i)=><span key={x}>{i?', ':''}{x===c.owner?'itself':<a href={'#'+x} onClick={e=>{e.preventDefault();onSelect(x);}}>{nameOf(x)}</a>}</span>)}</>:' (no consumer)'}</span>
        </li>;})}
        {!l.contracts.length&&<li className="gn-empty">None</li>}</ul>
    </section>)}
  </div>;
}

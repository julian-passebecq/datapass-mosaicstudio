import {useRef,useState,type KeyboardEvent} from 'react';
import {useSiteState} from '../../src/framework/ui';
import {useSelection,useReducedMotion} from '../../src/framework/visual';
import {readSelectionBinding,resolveBinding,mayAnimate,designDigest,type SelectionBinding} from '../../src/framework/engineering/index.ts';
import {model} from './model';
import {genericBinding,SYNTHETIC_SAMPLES} from './bindings';
import './engineering.css';

/** Generic datapass.engineering/1 selection-binding consumer (client-owned, SYNTHETIC). The part tree, 2D schematic,
 * results table and the existing 3D model block share ONE identity: the `model-selection` view field. Bindings come only
 * from a validated record (the generic one below or an imported one, e.g. a FOIL adapter fixture); nothing is inferred
 * from similar IDs. Signal, opt-in and time cursor are local presentation state; no task, store or clock is added. */
const SELECTION='model-selection';
const LAYOUT:Record<string,{x:number;y:number;w:number;h:number}>={
  frame:{x:20,y:30,w:56,h:160},carriage:{x:100,y:150,w:130,h:36},plate:{x:118,y:44,w:92,h:20},module:{x:262,y:120,w:78,h:62},linkage:{x:222,y:70,w:26,h:76},
};
const GENERIC='Generic model-reference record (synthetic)';
const MAX_IMPORT=1048576;
type Loaded={binding:SelectionBinding;origin:string};
const STATUS_TEXT={sourced:'sourced',inferred:'inferred',unmapped:'unmapped'} as const;

export function EngineeringConsumer(){
  const values=useSiteState().values,reduced=useReducedMotion();
  const {selected,select}=useSelection(SELECTION);
  const [loaded,setLoaded]=useState<Loaded>(()=>({binding:readSelectionBinding(genericBinding),origin:GENERIC}));
  const [signal,setSignal]=useState(loaded.binding.bindings[0]?.signal??'');
  const [optIn,setOptIn]=useState(false);
  const [time,setTime]=useState(loaded.binding.timeCursor??0);
  const [error,setError]=useState('');
  const [focus,setFocus]=useState(0);
  const items=useRef<(HTMLLIElement|null)[]>([]);
  const record=loaded.binding;
  // View state is folded in on purpose: designDigest drops it, so camera/selection/explode/time never change the digest.
  const design=designDigest({...model,camera:values['model-camera'],selection:selected,explode:values['model-explode'],isolate:values['model-mode']==='isolate',timeCursor:time,viewToken:record.viewToken});
  const sameGeometry=record.geometryRevision.over==='datapass-c14n/1'&&record.geometryRevision.value===design.value;
  const resolution=resolveBinding(signal,record);
  const known=(id:string|null)=>id!==null&&model.parts.some(p=>p.id===id);
  const animate=sameGeometry&&known(resolution.entityId)&&mayAnimate(resolution,{inferredOptIn:optIn});
  const sample=(id:string)=>{const series=SYNTHETIC_SAMPLES[id];return series&&loaded.origin===GENERIC?series[Math.round(time)]??null:null;};
  const offset=animate?-(sample(signal)??0)*18:0;
  const label=(id:string|null)=>model.parts.find(p=>p.id===id)?.label??(id===null?'none':id+' (not in this geometry)');
  const why=resolution.status==='unmapped'?'Unmapped signal: no geometry moves.':!sameGeometry?'This record names another geometry revision: nothing is animated.':!known(resolution.entityId)?'The bound entity is not a part of this geometry: nothing is animated.':resolution.status==='inferred'&&!optIn?'Inferred binding: shown as inferred and not animated until you opt in.':resolution.status==='inferred'?'Inferred binding animated after your explicit opt-in. It is not a sourced relation.':'Sourced binding: the bound part follows the illustrative cursor.';

  async function importRecord(file:File|undefined){
    if(!file)return;
    try{
      if(file.size>MAX_IMPORT)throw new Error('Record larger than 1 MiB');
      const next=readSelectionBinding(JSON.parse(await file.text()));
      setLoaded({binding:next,origin:'Imported: '+file.name});setSignal(next.bindings[0]?.signal??'');setOptIn(false);setTime(next.timeCursor??0);setError('');
    }catch(e){setError('Import refused; the current record is unchanged. '+(e instanceof Error?e.message:String(e)));}
  }
  function reset(){setLoaded({binding:readSelectionBinding(genericBinding),origin:GENERIC});setSignal(genericBinding.bindings[0].signal);setOptIn(false);setTime(genericBinding.timeCursor??0);setError('');}
  const tree=['none',...model.parts.map(p=>p.id)];
  function treeKey(event:KeyboardEvent<HTMLUListElement>){
    const keys:Record<string,number>={ArrowDown:focus+1,ArrowUp:focus-1,Home:0,End:tree.length-1};
    if(event.key in keys){event.preventDefault();const next=Math.max(0,Math.min(tree.length-1,keys[event.key]));setFocus(next);items.current[next]?.focus();}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();select(tree[focus]);}
  }
  const treeItem=(id:string,index:number,text:string)=><li role="treeitem" key={id} ref={el=>{items.current[index]=el;}} tabIndex={focus===index?0:-1} aria-selected={selected===id} aria-level={id==='none'?1:2} data-entity={id}
    onClick={event=>{event.stopPropagation();setFocus(index);select(id);}} onFocus={()=>setFocus(index)}>{text}</li>;

  return <section className="eng-consumer" data-testid="engineering-consumer" data-selection={selected} data-design-digest={design.value} data-signal={signal} data-binding-status={resolution.status} data-animated-entity={animate?resolution.entityId!:''} data-motion={reduced?'reduced':'full'}>
    <header className="eng-head"><div><span className="foundation-kicker">SYNTHETIC engineering consumer / datapass.engineering/1</span><h3>Part, 2D and results share one selection</h3>
      <p>Bindings come only from the record: sourced, inferred or unmapped. Unmapped signals never animate; inferred ones animate only after an explicit opt-in. Camera, selection, exploded amount and the time cursor are view state and leave the design digest unchanged.</p></div>
      <dl className="eng-facts"><dt>Record</dt><dd data-testid="binding-origin">{loaded.origin}</dd><dt>View token (not authorization)</dt><dd><code>{record.viewToken}</code></dd><dt>Design digest (datapass-c14n/1)</dt><dd><code data-testid="design-digest">{design.value}</code></dd><dt>Geometry revision</dt><dd data-testid="geometry-match">{sameGeometry?'matches this geometry':'different geometry revision'}</dd></dl>
    </header>
    <div className="eng-controls">
      <label>Active signal<select aria-label="Active signal" value={signal} onChange={e=>setSignal(e.target.value)}>{record.bindings.map(b=><option key={b.signal} value={b.signal}>{b.signal} ({STATUS_TEXT[b.status]})</option>)}</select></label>
      <label className="eng-check"><input type="checkbox" checked={optIn} onChange={e=>setOptIn(e.target.checked)}/>Allow inferred bindings to animate (explicit opt-in)</label>
      <label>Illustrative time cursor<input type="range" aria-label="Time cursor" min="0" max="10" step="1" value={time} onChange={e=>setTime(Number(e.target.value))}/><output>{time} s</output></label>
      <label>Import selection-binding record<input type="file" accept="application/json,.json" aria-label="Import selection-binding record" onChange={e=>{void importRecord(e.target.files?.[0]);e.target.value='';}}/></label>
      <button type="button" onClick={reset} disabled={loaded.origin===GENERIC}>Use generic record</button>
    </div>
    {error&&<p role="alert" className="eng-error">{error}</p>}
    <p className="eng-status" role="status" data-testid="binding-explanation">{why}</p>
    <div className="eng-grid">
      <nav aria-label="Part tree navigation" className="eng-tree"><ul role="tree" aria-label="Part tree" onKeyDown={treeKey}>
        {treeItem('none',0,'Complete assembly')}{model.parts.map((p,i)=>treeItem(p.id,i+1,p.label))}
      </ul></nav>
      <figure className="eng-2d" data-capture-state="ready"><svg viewBox="0 0 360 220" role="group" aria-label="2D schematic (authored positions, not CAD)">
        {model.parts.map(p=>{const r=LAYOUT[p.id];if(!r)return null;const moving=animate&&resolution.entityId===p.id;
          return <g key={p.id} role="button" tabIndex={0} aria-label={'Select '+p.label+' in 2D'} aria-pressed={selected===p.id} data-part={p.id} data-animated={moving?'true':'false'}
            className={'eng-part'+(moving?' moving':'')+(reduced?' reduced':'')} transform={`translate(0,${moving?offset:0})`}
            onClick={()=>select(p.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(p.id);}}}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="5"/><text x={r.x+r.w/2} y={r.y+r.h/2+4} textAnchor="middle">{p.label.split(' ')[0]}</text></g>;})}
      </svg><figcaption>Authored 2D positions. Motion is a finite offset from the selected sample, not a simulation; no autoplay.</figcaption></figure>
    </div>
    <div className="eng-table-wrap"><table className="eng-results"><caption>SYNTHETIC signal results and their bindings</caption>
      <thead><tr><th scope="col">Signal</th><th scope="col">Bound part</th><th scope="col">Binding</th><th scope="col">Value at {time} s</th><th scope="col">Source</th></tr></thead>
      <tbody>{record.bindings.map(b=>{const v=sample(b.signal);return <tr key={b.signal} data-signal={b.signal} data-entity={b.entityId??''} aria-selected={b.entityId!==null&&b.entityId===selected}>
        <th scope="row">{b.signal}</th>
        <td>{known(b.entityId)?<button type="button" aria-label={'Select '+label(b.entityId)+' from results'} aria-pressed={selected===b.entityId} onClick={()=>select(b.entityId!)}>{label(b.entityId)}</button>:label(b.entityId)}</td>
        <td><span className="eng-badge" data-status={b.status}>{STATUS_TEXT[b.status]}</span></td>
        <td>{v===null?'no sample':v.toFixed(2)}</td>
        <td className="eng-source">{b.source??'none'}</td>
      </tr>;})}</tbody></table></div>
    <p className="foundation-note">Selecting a part here moves the 3D model selection too (one view field). Results are illustrative SYNTHETIC samples; an imported record shows its bindings without inventing samples. Saved inputs keep the selection only.</p>
  </section>;
}

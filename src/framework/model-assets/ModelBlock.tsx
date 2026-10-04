import {lazy,Suspense,useMemo} from 'react';
import {useRuntime,useSiteState} from '../hooks';
import {WorkspaceShell} from '../workspace';
import {SourceReader} from '../evidence/SourceReader';
import {ContextInspector} from '../foundation/ContextInspector';
import {modelContext} from './context';
import {validateModel,readModelState,MODEL_MODES,type ModelBlock} from './model.ts';
import './model.css';
const Viewport=lazy(()=>import('./ModelViewport'));
export default function Model({block}:{block:ModelBlock}) {
  const runtime=useRuntime(),snapshot=useSiteState();
  const spec=useMemo(()=>validateModel(runtime.definition.resources!.models![block.resource]),[runtime,block.resource]);
  const state=readModelState(block,snapshot.values),selected=spec.parts.find(p=>p.id===state.selection);
  const select=(id:string)=>runtime.set(block.selection,id);
  return <section className="site-model" data-testid="model-workbench" data-selection={state.selection} data-view={state.view} data-mode={state.mode}>
    <WorkspaceShell title={block.title??spec.title} tabs={[{id:'outline',label:'Parts'},{id:'model',label:'3D model'},{id:'source',label:'Sources'}]} activeTab={state.view} onTab={value=>runtime.set(block.view,value)}
      sidebarLabel="Model parts" sidebar={<><h3>Assembly</h3><button type="button" className="model-part" aria-pressed={state.selection==='none'} onClick={()=>select('none')}>Complete assembly</button>{spec.parts.map(p=><button type="button" className="model-part" key={p.id} aria-label={'Inspect '+p.label} aria-pressed={state.selection===p.id} onClick={()=>select(p.id)}>{p.label}</button>)}</>}
      inspectorLabel="Model context" inspector={<ContextInspector model={modelContext(spec,state)} sources={spec.sources} onEvidence={ref=>runtime.patch({[block.view]:'source',[block.source]:ref.artifact})}/>}
      status={<><span>{spec.provenance} / {spec.parts.length} semantic parts</span><span>{spec.credit}</span></>}>
      {state.view==='model'?<>
        <div className="model-controls"><label>Scene mode<select aria-label="Model mode" value={state.mode} onChange={e=>runtime.set(block.mode,e.target.value)}>{MODEL_MODES.map(m=><option value={m} key={m}>{m==='section'?'Visual cutaway':m}</option>)}</select></label><label>Camera<select aria-label="Model camera" value={state.camera} onChange={e=>runtime.set(block.camera,e.target.value)}>{spec.cameras.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label><label><input type="checkbox" checked={state.annotations} onChange={e=>runtime.set(block.annotations,e.target.checked)}/>Part labels</label>
          {state.mode==='exploded'&&<label className="model-slider">Exploded amount<input aria-label="Model exploded amount" type="range" min="0" max="1" step="0.01" value={state.explode} onChange={e=>runtime.set(block.explode,Number(e.target.value))}/><output>{Math.round(state.explode*100)}%</output></label>}
          {state.mode==='section'&&<label className="model-slider">Cutaway position<input aria-label="Model cutaway position" type="range" min="0" max="1" step="0.01" value={state.section} onChange={e=>runtime.set(block.section,Number(e.target.value))}/><output>{Math.round(state.section*100)}%</output></label>}
        </div><Suspense fallback={<p role="status" className="model-note" data-capture-state="busy">Loading optional model viewer...</p>}><Viewport spec={spec} state={state} onSelect={select}/></Suspense>
        <p className="model-note">{state.mode==='section'?'Visual clipping only: the cut has no filled cross-section and is not a CAD measurement.':state.mode==='isolate'&&state.selection==='none'?'Choose a part to isolate it. The complete assembly stays visible until then.':spec.note}</p>
      </>:state.view==='source'?<SourceReader sources={spec.sources} selected={state.source} onSelect={id=>runtime.set(block.source,id)} highlights={selected?.evidence??[]}/>:<div className="model-outline"><span className="foundation-kicker">Inspect before loading 3D</span><h3>{spec.title}</h3><p>{spec.note}</p><button type="button" className="site-primary" onClick={()=>runtime.set(block.view,'model')}>Load verified 3D model</button><table><caption>Authored model parts</caption><thead><tr><th>Part</th><th>Role</th></tr></thead><tbody>{spec.parts.map(part=><tr key={part.id}><th><button type="button" onClick={()=>select(part.id)}>{part.label}</button></th><td>{part.description}</td></tr>)}</tbody></table><details><summary>Asset contract and limitations</summary><p>Static GLB 2.0, opaque PBR materials and bounded geometry. No external files, textures, decoders, animation tracks, skins or morphs are accepted by this first profile.</p><p>SHA-256: <code>{spec.asset.sha256}</code></p><p>Identity verification checks the approved file, not its scientific accuracy or usage rights.</p></details></div>}
    </WorkspaceShell>
  </section>;
}

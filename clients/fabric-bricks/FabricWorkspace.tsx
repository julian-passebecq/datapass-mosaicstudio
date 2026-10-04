import {lazy,Suspense,useState} from 'react';
import {useRuntime,useSiteState,useReducedMotion} from '../../src/framework/ui';
import {useSelection} from '../../src/framework/visual';
import {ContextInspector} from '../../src/framework/foundation/ContextInspector';
import {bricks,brickById,cameraForSelection,evidenceExcerpt,fabricSources,SOURCE_STATUS} from './fixture';
import './fabric.css';

const Fabric3D=lazy(()=>import('./Fabric3D'));
const SELECTION='fabric-selection',REPRESENTATION='fabric-representation',LEVEL='fabric-level',CAMERA='fabric-camera',EXPLODE='fabric-explode';

function Overview2D({selected,onSelect}:{selected:string;onSelect:(id:string)=>void}){
  return <svg className="fabric-svg" viewBox="0 0 720 410" role="group" aria-label="Synthetic Fabric Bricks 2D overview">
    <rect className="fabric-board" x="20" y="20" width="680" height="370" rx="24"/>
    {bricks.map(brick=>{
      const active=selected===brick.id;
      return <g key={brick.id} className="fabric-brick" role="button" tabIndex={0} aria-label={'Inspect '+brick.label} aria-pressed={active}
        onClick={()=>onSelect(brick.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(brick.id);}}}>
        <rect className="fabric-brick-shadow" x={brick.x+8} y={brick.y+10} width={brick.width} height={brick.height} rx="16"/>
        <rect className="fabric-brick-face" x={brick.x} y={brick.y} width={brick.width} height={brick.height} rx="16" style={{fill:brick.color}}/>
        {[.18,.4,.62,.84].map((fraction,index)=><circle key={index} className="fabric-stud" cx={brick.x+brick.width*fraction} cy={brick.y+24} r="9"/>)}
        <text className="fabric-brick-label" x={brick.x+20} y={brick.y+76}>{brick.label}</text>
        <text className="fabric-brick-id" x={brick.x+20} y={brick.y+98}>{brick.id}</text>
      </g>;
    })}
  </svg>;
}

function Detail2D({id}:{id:string}){
  const brick=brickById(id)!;
  return <div className="fabric-detail-visual" data-testid="fabric-2d-detail">
    <svg className="fabric-svg fabric-svg-detail" viewBox="0 0 720 410" role="img" aria-label={'Synthetic detail of '+brick.label}>
      <rect className="fabric-board" x="20" y="20" width="680" height="370" rx="24"/>
      <rect className="fabric-brick-shadow" x="146" y="135" width="440" height="154" rx="22"/>
      <rect className="fabric-brick-face" x="134" y="123" width="440" height="154" rx="22" style={{fill:brick.color}}/>
      {[190,266,342,418,494,550].map(x=><circle key={x} className="fabric-stud fabric-stud-large" cx={x} cy="158" r="13"/>)}
      <text className="fabric-detail-title" x="174" y="225">{brick.label}</text>
      <text className="fabric-detail-id" x="174" y="251">{brick.id}</text>
      <path className="fabric-dimension" d="M134 314 H574 M134 306 V322 M574 306 V322"/>
      <text className="fabric-dimension-label" x="354" y="342" textAnchor="middle">provisional fixture geometry</text>
    </svg>
  </div>;
}

export function FabricWorkspace(){
  const runtime=useRuntime(),snapshot=useSiteState(),reducedMotion=useReducedMotion();
  const {selected}=useSelection(SELECTION);
  const representation=String(snapshot.values[REPRESENTATION]);
  const level=String(snapshot.values[LEVEL]);
  const explode=Number(snapshot.values[EXPLODE]);
  const selectedBrick=brickById(selected);
  const [threeRequested,setThreeRequested]=useState(()=>representation==='3d');
  const selectBrick=(id:string)=>runtime.applyCue({
    [SELECTION]:id,
    [LEVEL]:'detail',
    [CAMERA]:cameraForSelection(id)
  });
  const setRepresentation=(value:'2d'|'3d')=>{
    if(value==='3d')setThreeRequested(true);
    runtime.set(REPRESENTATION,value);
  };
  const backToOverview=()=>runtime.applyCue({[LEVEL]:'overview',[SELECTION]:'none',[CAMERA]:'overview',[EXPLODE]:0});
  const context={
    id:selectedBrick?.id??'fabric-overview',
    kind:selectedBrick?'Synthetic fixture object':'Synthetic fixture overview',
    title:selectedBrick?.label??'Fabric Bricks provisional assembly',
    summary:selectedBrick?.summary??'Four neutral fixture objects pressure-test stable identity, detail and representation switching.',
    facts:[
      {label:'Source status',value:SOURCE_STATUS},
      {label:'Semantic ID',value:selectedBrick?.id??'none'},
      {label:'Representation',value:representation.toUpperCase()},
      {label:'View',value:level},
      {label:'Reduced motion',value:reducedMotion?'requested':'not requested'}
    ],
    references:selectedBrick?[selectedBrick.evidence]:[],
    related:bricks.filter(brick=>brick.id!==selectedBrick?.id).map(brick=>({id:brick.id,label:brick.label})),
    note:'Selection, camera and presentation fields are view state only. No task, simulation or domain computation runs when you navigate this fixture.'
  };
  return <section className="fabric-workspace" data-fabric-source-status={SOURCE_STATUS} data-representation={representation} data-level={level} data-3d-requested={threeRequested}>
    <header className="fabric-hero">
      <div><span className="fabric-kicker">Fabric Bricks · thin slice v1</span><h2>One semantic assembly, two representations</h2><p>This client is intentionally provisional: interaction behavior is testable; domain content is not source-approved.</p></div>
      <div className="fabric-source-badge" role="status"><strong>PROVISIONAL</strong><span>synthetic fixture</span></div>
    </header>

    <div className="fabric-toolbar" role="group" aria-label="Fabric Bricks view controls">
      <div className="fabric-segment" role="group" aria-label="Representation">
        <button type="button" aria-pressed={representation==='2d'} onClick={()=>setRepresentation('2d')}>2D</button>
        <button type="button" aria-pressed={representation==='3d'} onClick={()=>setRepresentation('3d')}>3D</button>
      </div>
      {level==='detail'&&<button type="button" className="fabric-secondary" onClick={backToOverview}>Back to overview</button>}
      <span className="fabric-runtime-note">{representation==='2d'?(threeRequested?'3D module already requested this session':'3D module not requested'):'Shared Three.js viewport active'}</span>
    </div>

    <div className="fabric-layout">
      <main className="fabric-stage" data-capture-state={representation==='2d'?'ready':undefined}>
        {representation==='2d'?(level==='detail'&&selectedBrick?<Detail2D id={selectedBrick.id}/>:<Overview2D selected={selected} onSelect={selectBrick}/>):
          <Suspense fallback={<div className="fabric-loading" role="status" data-capture-state="busy"><strong>Loading optional 3D representation…</strong><span>The shared spatial renderer is fetched only after 3D is requested.</span></div>}>
            <Fabric3D selectionField={SELECTION} cameraField={CAMERA} explodeField={EXPLODE} levelField={LEVEL}/>
          </Suspense>}
        {representation==='3d'&&<div className="fabric-explode">
          <label>Separate fixture objects <input aria-label="Separate fixture objects" type="range" min="0" max="1" step="0.01" value={explode} onChange={event=>runtime.set(EXPLODE,Number(event.target.value))}/><output>{Math.round(explode*100)}%</output></label>
          <small>Presentation-only separation; it does not assert a real assembly or construction sequence.</small>
        </div>}
      </main>

      <aside className="fabric-context">
        <ContextInspector model={context} sources={fabricSources} onRelated={selectBrick}/>
        {selectedBrick&&<div className="fabric-evidence" aria-label="Selection evidence"><span className="fabric-kicker">Evidence boundary</span><p>{evidenceExcerpt(selectedBrick.evidence)}</p><code>{selectedBrick.evidence.artifact}:{selectedBrick.evidence.start}</code></div>}
      </aside>
    </div>
  </section>;
}

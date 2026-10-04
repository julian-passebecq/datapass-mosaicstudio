/** Qualification-only client compositions. Never part of the public reference registry. */
import {readFile,writeFile,rename} from 'node:fs/promises';

// Keep synthetic stories inside the pinned VizForge schema; never relax its limits.
export const engineStoryIntervalMs=2500;

export async function addD3Geometry(id){
  const file=`clients/${id}/ClientNote.tsx`,source=await readFile(file,'utf8');
  await writeFile(file,"import {scaleLinear} from 'd3';\n"+source.replace("const objects=[{id:'alpha',label:'Alpha',x:180},{id:'beta',label:'Beta',x:420}];","const x=scaleLinear().domain([0,1]).range([180,420]);\nconst objects=[{id:'alpha',label:'Alpha',x:x(0)},{id:'beta',label:'Beta',x:x(1)}];"));
}

export async function addPlainPage(id){
  const root=`clients/${id}`;await rename(root+'/app.ts',root+'/starter.ts');
  await writeFile(root+'/app.ts',`import base from './starter.ts';
import {defineApp,type AppDefinition} from '../../src/framework/authoring.ts';
const definition:AppDefinition={...base,manifest:{...base.manifest,pages:[...base.manifest.pages,{id:'other',title:'Other page',description:'Unmount and restore the custom consumer.',sections:[{id:'plain',columns:1,blocks:[{id:'plain-text',type:'text',text:'No custom visual is mounted on this page.'}]}]}]}};
export default defineApp(definition);
`);
}

export async function addModelStoryConsumer(id){
  const root=`clients/${id}`;await rename(root+'/app.ts',root+'/composed.ts');
  await writeFile(root+'/app.ts',`import base from './composed.ts';
import {defineApp,type AppDefinition} from '../../src/framework/authoring.ts';
import type {StoryResource} from '../../src/framework/types.ts';
import {ModelPlan,Witness} from './ModelPlan.tsx';
const story:StoryResource={indexField:'engine-step',spec:{id:'engine-story',version:'1.0',title:'Shared representation story',description:'Synthetic qualification steps, not a physical simulation.',intervalMs:${engineStoryIntervalMs},
  visuals:[{id:'parts',version:'1.0',type:'ranking',title:'Illustrative parts',subtitle:'Synthetic labels',takeaway:'One semantic identity across representations.',source:'Qualification fixture',note:'No measured values.',accessibility:{summary:'Two illustrative parts'},data:[{id:'plate',label:'Plate',time:0,value:1},{id:'module',label:'Module',time:0,value:2}],encodings:{id:'id',label:'label',time:'time',value:'value'},topN:2}],
  scenes:[{id:'whole',visualId:'parts',title:'Whole assembly',caption:'Inspect first without loading 3D.'},{id:'plate',visualId:'parts',title:'Plate concept',caption:'A shared semantic ID, not an engineering claim.'},{id:'module',visualId:'parts',title:'Conversion concept',caption:'View changes do not run the task.'}]},
  cues:{whole:{'model-selection':'none','model-camera':'overview','model-mode':'assembled'},plate:{'model-selection':'plate','model-camera':'plate','model-mode':'assembled'},module:{'model-selection':'module','model-camera':'side','model-mode':'exploded'}}};
let runs=0;
const definition:AppDefinition={...base,manifest:{...base.manifest,fields:[...base.manifest.fields,{id:'engine-step',label:'Engine story step',role:'view',type:'number',default:0,min:0,max:2,step:1},{id:'engine-hide-plate',label:'Hide plate in plan',role:'view',type:'toggle',default:false},{id:'engine-gain',label:'Synthetic gain',role:'input',type:'number',default:2,min:1,max:3,step:1}],
  datasets:[{id:'engine-result',title:'Execution witness',description:'A test counter, not a model result.',layer:'Test',source:'task',provenance:'synthetic',rowKey:'id',columns:[{id:'id',label:'ID',type:'string'},{id:'value',label:'Value',type:'number'},{id:'runs',label:'Runs',type:'number'}],inputs:['engine-gain'],dependsOn:[]}],tasks:[{id:'engine-compute',label:'Evaluate once',output:'engine-result',timeoutMs:1000}],
  pages:base.manifest.pages.map((page,index)=>index? page:{...page,sections:[{id:'engine-guide',columns:2,blocks:[{id:'engine-story',type:'story-controls',resource:'engineStory'},{id:'engine-plan',type:'custom',resource:'modelPlan'}]},{id:'engine-proof',columns:2,blocks:[{id:'engine-task',type:'task',task:'engine-compute'},{id:'engine-witness',type:'custom',resource:'witness'}]},...page.sections]})},
  bindings:{...base.bindings,tasks:{...base.bindings.tasks,'engine-compute':async({values})=>[{id:'result',value:Number(values['engine-gain'])*2,runs:++runs}]}},
  resources:{...base.resources,stories:{...base.resources?.stories,engineStory:story}},components:{...base.components,modelPlan:ModelPlan,witness:Witness},customCapabilities:{...base.customCapabilities,modelPlan:['stories'],witness:[]}};
export default defineApp(definition);
`);
  await writeFile(root+'/ModelPlan.tsx',`import {useCallback,useEffect,useRef} from 'react';
import {scalePoint} from 'd3';
import {useRuntime,useSiteState,useReducedMotion,useDataset} from '../../src/framework/ui';
import {useSelection} from '../../src/framework/visual';
import {useStory} from '../../src/framework/stories/react';
import {useScrollSteps} from '../../src/framework/scroll';
import {ContextInspector} from '../../src/framework/foundation/ContextInspector';
import {model} from './model.ts';
const positions=scalePoint<string>().domain(model.parts.map(part=>part.id)).range([38,562]);
const identities=new WeakMap<object,number>();let nextIdentity=0;
export function Witness(){const {rows,error}=useDataset('engine-result');if(rows?.length&&!identities.has(rows))identities.set(rows,++nextIdentity);return <section data-testid="execution-witness" data-runs={rows?.[0]?.runs??0} data-result-identity={rows?.length?identities.get(rows):'none'}><h2>Calculation witness</h2><p>{rows?.length?'The explicit test calculation has completed.':'No calculation has run.'}</p><p>Result: {rows?.[0]?.value??'Not evaluated'}</p>{error&&<p>{error}</p>}</section>;}
export function ModelPlan(){
  const runtime=useRuntime(),snapshot=useSiteState(),reduced=useReducedMotion(),{player,state,scene,story}=useStory('engineStory');
  const track=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),authored=useRef(false);
  const visit=useCallback((id:string)=>{authored.current=true;try{player.pause();player.seek(story.scenes.findIndex(item=>item.id===id));}finally{authored.current=false;}},[player,story]);
  const guide=useScrollSteps(track,stage,story.scenes.map(item=>item.id),visit,snapshot.restoreEpoch,!reduced);
  const {selected,select}=useSelection('model-selection',()=>{guide.pause();player.pause();});
  useEffect(()=>{let previous=runtime.getSnapshot();return runtime.subscribe(()=>{const next=runtime.getSnapshot(),changed=['model-selection','model-camera','model-mode','engine-step'].some(id=>next.values[id]!==previous.values[id]);previous=next;if(changed&&!authored.current)guide.pause();});},[runtime,guide.pause]);
  useEffect(()=>{if(state.playing)guide.pause();},[state.playing,guide.pause]);
  const hidden=Boolean(snapshot.values['engine-hide-plate']);
  return <section data-testid="model-plan" data-selection={selected} data-story-index={state.index} data-following={String(guide.following)} data-capture-state="ready">
    <h2>Client-owned semantic plan</h2><p>{scene.title}. The original StoryPlayer owns this step.</p>
    <div><button type="button" disabled={reduced} onClick={guide.start}>Enable scroll steps</button><button type="button" onClick={guide.disable}>Use direct controls</button><button type="button" onClick={()=>{guide.pause();player.pause();runtime.applyCue({'engine-hide-plate':!hidden});}}>{hidden?'Show plate in plan':'Hide plate in plan'}</button></div>
    <div ref={track} data-testid="scroll-track" style={{height:guide.guided?1800:250,position:'relative'}}><div ref={stage} style={{height:250,position:guide.guided?'sticky':'relative',top:16}}>
    <svg viewBox="0 0 600 210" width="100%" height="210" aria-label="D3 semantic part plan">{model.parts.filter(part=>!hidden||part.id!=='plate').map(part=><g key={part.id} role="button" tabIndex={0} aria-label={'Plan select '+part.label} aria-pressed={selected===part.id} onClick={()=>select(part.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(part.id);}}}><rect x={positions(part.id)!-28} y={70} width={56} height={64} rx={8} fill={selected===part.id?'#286f89':'#e6eef2'} stroke="#286f89"/><text x={positions(part.id)} y={160} textAnchor="middle" fontSize={12}>{part.id}</text></g>)}</svg>
    </div></div>
    {hidden&&selected==='plate'&&<p role="status">Selected plate is hidden in this plan and retained globally.</p>}
    <ContextInspector model={{id:selected,kind:'Synthetic semantic object',summary:'The same identity in the plan and native model.',title:model.parts.find(part=>part.id===selected)?.label||'Whole assembly',facts:[{label:'Semantic ID',value:selected},{label:'Story step',value:scene.id}],references:[],related:model.parts.filter(part=>part.id!==selected).map(part=>({id:part.id,label:part.label})),note:'No domain task is started by this plan.'}} onRelated={select}/>
  </section>;
}
`);
}

export async function addReplayGraphConsumer(id){
  const root=`clients/${id}`;await rename(root+'/app.ts',root+'/composed.ts');
  await writeFile(root+'/app.ts',`import base from './composed.ts';
import {defineApp,type AppDefinition} from '../../src/framework/authoring.ts';
import {ReplayGraph} from './ReplayGraph.tsx';
const definition:AppDefinition={...base,manifest:{...base.manifest,fields:[...base.manifest.fields,{id:'engine-graph',label:'Extra replay representation',role:'view',type:'toggle',default:true}],pages:base.manifest.pages.map((page,index)=>index?page:{...page,sections:[{id:'engine-consumer',columns:1,blocks:[{id:'replay-graph',type:'custom',resource:'replayGraph'}]},...page.sections]})},components:{...base.components,replayGraph:ReplayGraph},customCapabilities:{...base.customCapabilities,replayGraph:['replay','architecture']}};
export default defineApp(definition);
`);
  await writeFile(root+'/ReplayGraph.tsx',`import {ReactFlow,type Node} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {useSelection} from '../../src/framework/visual';
import {useReplayTime} from '../../src/framework/replay/react';
import {ContextInspector} from '../../src/framework/foundation/ContextInspector';
export function ReplayGraph(){
  const runtime=useRuntime(),snapshot=useSiteState(),time=useReplayTime('recording'),{selected,select}=useSelection('replay-selection',time.controller.pause);
  const visible=Boolean(snapshot.values['engine-graph']),value=time.sample(selected);
  const nodes:Node[]=time.spec.entities.map((entity,index)=>({id:entity.id,position:{x:index*220,y:index*40},selected:entity.id===selected,ariaLabel:'Replay node '+entity.label,data:{label:entity.label+' / '+(time.sample(entity.id)??'Unavailable')}}));
  return <section data-testid="replay-consumer" data-frame={time.frame} data-time={time.timeSeconds} data-selection={selected} data-value={value??'missing'} data-playing={String(time.playing)} data-capture-state="ready">
    <h2>Client-owned graph and readout</h2><p>Supplied sample {time.frame+1}, {time.timeSeconds} seconds. {value===null?'Unavailable':value+' '+time.spec.channels.find(channel=>channel.id===time.channel)!.unit}. No interpolation.</p>
    <button type="button" onClick={()=>runtime.applyCue({'engine-graph':!visible})}>{visible?'Use readout only':'Show controlled graph'}</button>
    {visible&&<div style={{height:260}}><ReactFlow nodes={nodes} edges={[{id:'a-b',source:time.spec.entities[0].id,target:time.spec.entities[1].id}]} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_,node)=>select(node.id)} fitView fitViewOptions={{maxZoom:1}} zoomOnScroll={false} preventScrolling={false}/></div>}
    <div role="group" aria-label="Replay graph entities">{time.spec.entities.map(entity=><button type="button" key={entity.id} aria-pressed={selected===entity.id} onClick={()=>select(entity.id)}>{'Graph select '+entity.label}</button>)}</div>
    <ContextInspector model={{id:selected,kind:'Supplied synthetic sample',summary:'A graph projection of the existing sampled replay.',title:time.spec.entities.find(entity=>entity.id===selected)!.label,facts:[{label:'Sample index',value:String(time.frame)},{label:'Time',value:String(time.timeSeconds)+' seconds'},{label:'Value',value:value===null?'Unavailable':String(value)}],references:[],related:time.spec.entities.filter(entity=>entity.id!==selected).map(entity=>({id:entity.id,label:entity.label})),note:'The graph consumes the original replay controller.'}} onRelated={select}/>
  </section>;
}
`);
}

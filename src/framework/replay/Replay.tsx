import {lazy,Suspense,useEffect,useMemo,useRef,useSyncExternalStore,useState,type CSSProperties} from 'react';
import {Figure} from '@vizforge/adapters/react';
import {parseVisualization,type Scene} from '@vizforge/core/spec';
import {useRuntime,useSiteState,useReducedMotion} from '../hooks';
import {useReplay} from './Scope';
import {readReplayState,sampleValue,nearestSample,replayOffsets,type ReplayBlock} from './model';
import {replayChartInput} from './visual';
import {withSiteChartTheme} from '../visual-theme';
import {validateScene,scenePartLimit} from '../scene';
import './replay.css';
import './camera-controls.css';
import '../blocks/scene3d.css';
const Spatial=__STUDIO_3D__?lazy(()=>import('../scene-renderer/SceneViewport')):null;
const valueText=(value:number|null,digits:number)=>value===null?'Unavailable':new Intl.NumberFormat('en',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
export default function Replay({block}:{block:ReplayBlock}){
  const runtime=useRuntime(),state=useSiteState(),reduced=useReducedMotion(),root=useRef<HTMLElement>(null);
  const [cameraScope,setCameraScope]=useState<'site'|'selection'>('site');
  const {controller}=useReplay(block.resource),clock=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),spec=controller.spec;
  const view=readReplayState(block,state.values),entity=spec.entities.find(e=>e.id===view.selection)!,channel=spec.channels.find(c=>c.id===view.channel)!,time=spec.time[view.frame];
  const chart=useMemo(()=>{const input=replayChartInput(spec,view.selection,view.channel);return input?parseVisualization(withSiteChartTheme(input,runtime.manifest.theme)):null;},[spec,view.selection,view.channel,runtime]);
  const scene=useMemo(()=>spec.scene?validateScene(runtime.definition.resources!.scenes![spec.scene],{maxParts:scenePartLimit(runtime.definition)}):null,[runtime,spec]);
  const offsets=useMemo(()=>replayOffsets(spec,view.frame),[spec,view.frame]);
  const eventList=spec.events.filter(e=>e.entity===null||e.entity===view.selection).slice().sort((a,b)=>a.time-b.time);
  const missing=spec.channels.filter(c=>sampleValue(spec,entity.id,c.id,view.frame)===null).length;
  const gap=view.frame>0&&time-spec.time[view.frame-1]>spec.maxGapSeconds;
  const domain=useMemo(()=>{const xs=spec.entities.map(e=>e.position[0]),ys=spec.entities.map(e=>e.position[1]);const x0=Math.min(...xs),y0=Math.min(...ys);return {x0,y0,w:Math.max(1,Math.max(...xs)-x0),h:Math.max(1,Math.max(...ys)-y0)};},[spec]);
  function seek(index:number,entityId?:string){controller.pause();runtime.patch({[block.frame]:index,...(entityId?{[block.selection]:entityId}:{})});controller.seek(index);}
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.every(e=>!e.isIntersecting))controller.pause();});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[controller]);
  const cursor:Scene={id:'replay-cursor',visualId:'replay-channel',title:'Sample '+(view.frame+1),caption:time+' seconds',state:{time},focusIds:[],annotationIds:[],transition:{intent:'morph-update',durationMs:0}};
  return <section ref={root} className="site-replay" aria-label={block.title||spec.title} data-testid="replay" data-frame={view.frame} data-time={time} data-selection={entity.id} data-view={view.view}>
    <header className="replay-header"><div><span className="site-kicker">{spec.provenance==='synthetic'?'Synthetic recording':'Author-supplied recording'} / read-only replay</span><h2>{block.title||spec.title}</h2><p>{spec.description}</p></div><div className="replay-mode" role="group" aria-label="Replay presentation"><button type="button" aria-pressed={view.view==='plan'} onClick={()=>runtime.set(block.view,'plan')}>2D plan</button>{scene&&<button type="button" aria-pressed={view.view==='scene'} onClick={()=>runtime.set(block.view,'scene')}>3D scene</button>}</div></header>
    <div className="replay-transport" role="group" aria-label="Replay transport">
      <button type="button" onClick={()=>seek(0)} disabled={view.frame===0&&!clock.playing} aria-label="Restart replay">Start</button>
      <button type="button" disabled={view.frame===0} onClick={()=>seek(view.frame-1)} aria-label="Previous replay sample">Previous</button>
      <button type="button" className="replay-primary" disabled={!clock.playing&&(reduced||view.frame===spec.time.length-1)} onClick={()=>clock.playing?controller.pause():controller.play()}>{clock.playing?'Pause replay':'Play replay'}</button>
      <button type="button" disabled={view.frame===spec.time.length-1} onClick={()=>seek(view.frame+1)} aria-label="Next replay sample">Next</button>
      <label>Speed<select aria-label="Replay speed" value={view.speed} onChange={e=>runtime.set(block.speed,e.target.value)}>{runtime.manifest.fields.find(f=>f.id===block.speed)!.options!.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <output className="replay-time" aria-label="Replay time">{time.toFixed(1)} <small>s</small></output><span className="replay-frame">Sample {view.frame+1} / {spec.time.length}</span>
      <label className="replay-scrubber"><span className="site-sr">Sample position</span><input aria-label="Replay sample position" type="range" min={0} max={spec.time.length-1} step={1} value={view.frame} onChange={e=>seek(Number(e.target.value))}/><span>{spec.time[0]} s</span><span>{spec.time.at(-1)} s</span></label>
    </div>
    {(reduced||gap||missing>0)&&<p className="replay-message" role="status">{reduced?'Reduced motion: manual samples remain available. ':''}{gap?'There is a gap before this supplied sample. ':''}{missing>0?missing+' signal(s) unavailable at this sample. No values are filled in.':''}</p>}
    <div className="replay-workspace"><div className="replay-main">
      {view.view==='plan'?<div className="replay-plan" aria-label="Installation plan"><div className="replay-plan-grid"/>{spec.entities.map(item=>{const value=sampleValue(spec,item.id,view.channel,view.frame);return <button key={item.id} type="button" className="replay-unit" aria-label={'Select installation '+item.label} aria-pressed={item.id===entity.id} style={{left:(20+(item.position[0]-domain.x0)/domain.w*60)+'%',top:(22+(item.position[1]-domain.y0)/domain.h*56)+'%'} as CSSProperties} onClick={()=>runtime.set(block.selection,item.id)}><span className="replay-unit-glyph" aria-hidden="true"><i/><i/><i/></span><strong>{item.label}</strong><span>{valueText(value,channel.digits)} {value!==null&&<small>{channel.unit}</small>}</span></button>;})}<div className="replay-plan-caption">Schematic positions / {channel.label} / one supplied sample</div></div>:
        scene&&Spatial?<Suspense fallback={<div className="site-loading">Loading the optional 3D renderer...</div>}><div className="replay-camera-controls"><span>Illustrative geometry / sampled motion</span><label>Framing<select aria-label="Replay camera framing" value={cameraScope} onChange={e=>setCameraScope(e.target.value as typeof cameraScope)}><option value="site">Entire site</option><option value="selection">Selected installation</option></select></label></div><Spatial scene={scene} view={{camera:cameraScope==='site'?spec.overviewCamera!:entity.camera||spec.overviewCamera!,selection:entity.id,phase:0,explode:0}} offsets={offsets} onSelect={id=>{if(spec.entities.some(e=>e.id===id))runtime.set(block.selection,id);}} appearance={runtime.manifest.theme.mode||'light'} title="Signal-driven illustration" fileName={block.resource} pageScroll/></Suspense>:<p>3D was not included in this client build. The plan and measurements remain available.</p>}
      <div className="replay-chart-head"><strong>{entity.label} / signal history</strong><label>Signal<select aria-label="Replay signal" value={channel.id} onChange={e=>runtime.set(block.channel,e.target.value)}>{spec.channels.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div>
      {chart?<div className="site-viz replay-trace" data-theme={runtime.manifest.theme.mode||'light'} data-cursor={time}><Figure spec={chart} scene={cursor} options={{animate:false,reducedMotion:true}}/></div>:<p className="replay-message">No supplied values for this signal.</p>}
    </div><aside className="replay-inspector" aria-label="Replay measurements"><span className="site-kicker">Selected installation</span><h3>{entity.label}</h3><p>{entity.description}</p>
      <label className="replay-select-label">Installation<select aria-label="Selected replay installation" value={entity.id} onChange={e=>runtime.set(block.selection,e.target.value)}>{spec.entities.map(e=><option value={e.id} key={e.id}>{e.label}</option>)}</select></label>
      <dl className="replay-measures">{spec.channels.map(c=>{const value=sampleValue(spec,entity.id,c.id,view.frame);return <div key={c.id} data-signal={c.id} data-value={value===null?'missing':value}><dt>{c.label}</dt><dd>{valueText(value,c.digits)}{value!==null&&<small>{c.unit}</small>}</dd></div>;})}</dl>
      <section className="replay-events"><h4>Annotated events</h4>{eventList.length?eventList.map(e=><button type="button" key={e.id} aria-label={'Go to event '+e.label} data-reached={time>=e.time} onClick={()=>seek(nearestSample(spec,e.time),e.entity||undefined)}><small>{e.time.toFixed(1)} s</small><span><strong>{e.label}</strong><small>{e.detail}</small></span></button>):<p>No authored events for this installation.</p>}</section>
      <p className="replay-source"><strong>Source</strong>{spec.source}</p>
    </aside></div>
    <footer>Samples drive the numbers. 3D transitions are interpolated for presentation only. This replay does not run a physical model, connect to a live service, or diagnose equipment.</footer>
  </section>;
}

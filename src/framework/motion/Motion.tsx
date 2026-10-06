import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {useRuntime, useSiteState, useReducedMotion} from '../hooks';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {SourceReader} from '../evidence/SourceReader';
import type {EvidenceRef} from '../evidence/model';
import {readMotionState, motionStepEvidence, type MotionBlock, type MotionStep, type MotionSpec} from './model';
import {useMotionController} from './Scope';
import MotionViewport from './Viewport';
import {motionSvg, motionReport} from './export';
import {createBrowserHost} from '../../core/host';
import './motion.css';

function AnnotationText({step, spec}: {step: MotionStep; spec: MotionSpec}) {
  if (!step.annotations?.length) return null;
  return <div className="motion-callout-text" aria-label="Step annotations">{step.annotations.map(a => <p key={a.id}><strong>{spec.entities.find(e => e.id === a.entity)!.label}:</strong> {a.text}</p>)}</div>;
}
export default function Motion({block}: {block: MotionBlock}) {
  const runtime = useRuntime(), snapshot = useSiteState(), reduced = useReducedMotion();
  const controller = useMotionController(block.resource), {compiled, player} = controller;
  const playback = useSyncExternalStore(player.subscribe, player.getState, player.getState);
  const spec = compiled.spec, state = readMotionState(block, snapshot.values), step = spec.steps[state.step], frame = compiled.frames[state.step];
  const selected = spec.entities.find(e => e.id === state.selection), root = useRef<HTMLElement>(null);
  const [includeSource, setIncludeSource] = useState(false);
  const refs = useMemo(() => {
    const all = [...(selected?.evidence || []), ...motionStepEvidence(step)];
    return [...new Map(all.map(ref => [ref.artifact + ':' + ref.start + ':' + ref.end, ref])).values()];
  }, [selected, step]);
  function select(id: string) {player.pause(); runtime.set(block.selection, id);}
  function openEvidence(ref: EvidenceRef) {player.pause(); runtime.patch({[block.panel]: 'source', [block.source]: ref.artifact});}
  function panel(id: string) {player.pause(); runtime.set(block.panel, id);}
  useEffect(() => {
    const observer = new IntersectionObserver(entries => controller.setVisible(block.id, entries.some(e => e.isIntersecting)));
    if (root.current) observer.observe(root.current);
    return () => {observer.disconnect(); controller.setVisible(block.id, false);};
  }, [controller, block.id]);
  useEffect(() => {if (state.panel !== 'scene') player.pause();}, [state.panel, player]);
  const outline = <>
    <h3>Objects</h3><button type="button" className="motion-outline-item" aria-pressed={state.selection === 'none'} onClick={() => select('none')}>Overview</button>
    {(['station', 'token'] as const).map(kind => <div className="motion-outline-group" key={kind}><small>{kind === 'station' ? 'Components' : 'Moving objects'}</small>{spec.entities.filter(e => e.kind === kind).map(entity => <button key={entity.id} type="button" className="motion-outline-item" aria-label={'Inspect ' + entity.label} aria-pressed={state.selection === entity.id} onClick={() => select(entity.id)}><i style={{background: entity.color}}/><span>{entity.label}</span><small>{frame.poses[entity.id].visible ? '' : 'hidden'}</small></button>)}</div>)}
  </>;
  const inspector = <div className="motion-inspector-body">
    <span className="motion-eyebrow">{selected?.kind || 'Explanation overview'}</span><h3>{selected?.label || spec.title}</h3><p>{selected?.description || spec.description}</p>
    {selected && <dl><div><dt>Identity</dt><dd>{selected.id}</dd></div><div><dt>Authored state</dt><dd>{frame.poses[selected.id].status}</dd></div><div><dt>Visible at target</dt><dd>{frame.poses[selected.id].visible ? 'Yes' : 'No'}</dd></div></dl>}
    <section><h4>Source references</h4>{refs.length ? refs.map(ref => <button key={ref.artifact + ref.start + ref.end} type="button" className="motion-reference" onClick={() => openEvidence(ref)}><strong>{ref.label}</strong><span>{spec.sources.find(s => s.id === ref.artifact)!.path}:{ref.start}-{ref.end}</span></button>) : <p>No source excerpt supplied for this context. An authored state is not proof of execution.</p>}</section>
    <section className="motion-export"><h4>Share this explanation</h4><button type="button" onClick={() => {player.pause(); createBrowserHost().saveDownload(block.resource + '-snapshot.svg', new Blob([motionSvg(compiled, state.step, state.projection, state.selection)], {type: 'image/svg+xml'}));}}>Export SVG snapshot</button>
      <label><input type="checkbox" checked={includeSource} onChange={e => setIncludeSource(e.target.checked)}/>Include referenced source text in HTML</label>
      <button type="button" onClick={() => {player.pause(); createBrowserHost().saveDownload(block.resource + '-review.html', new Blob([motionReport(compiled, state.step, state.projection, includeSource)], {type: 'text/html;charset=utf-8'}));}}>Export review HTML</button>
      <small>Snapshot exports the target state. Labels and narrative are included. Review content before sharing.</small>
    </section>
  </div>;
  const rail = <div role="group" aria-label="Motion projection"><button type="button" title="2D diagram" aria-label="Use 2D diagram" aria-pressed={state.projection === 'diagram'} onClick={() => runtime.set(block.projection, 'diagram')}>2D</button><button type="button" title="Isometric SVG" aria-label="Use isometric projection" aria-pressed={state.projection === 'isometric'} onClick={() => runtime.set(block.projection, 'isometric')}>ISO</button></div>;
  return <section ref={root} className="site-motion" data-testid="motion" data-step-index={state.step} data-step-id={step.id} data-selection={state.selection} data-panel={state.panel}>
    <WorkspaceShell title={block.title || spec.title} rail={rail} sidebar={outline} sidebarLabel="Motion objects" inspector={inspector} inspectorLabel="Motion context" tabs={[{id: 'scene', label: 'Scene'}, {id: 'source', label: 'Sources'}, {id: 'transcript', label: 'Steps'}]} activeTab={state.panel} onTab={panel} status={<><span>{spec.provenance} / {spec.entities.length} objects / {spec.steps.length} authored steps</span><span>SVG + D3 / no WebGL / source text is never executed</span></>}>
      {state.panel === 'scene' ? <>
        <div className="motion-transport" role="group" aria-label="Motion playback"><button type="button" disabled={state.step === 0} onClick={() => player.previous()} aria-label="Previous motion step">Previous</button><button type="button" disabled={reduced || !playback.playing && state.step === spec.steps.length - 1} onClick={() => playback.playing ? player.pause() : controller.play()}>{playback.playing ? 'Pause motion' : 'Play motion'}</button><button type="button" disabled={state.step === spec.steps.length - 1} onClick={() => player.next()} aria-label="Next motion step">Next</button><span>{state.step + 1} / {spec.steps.length}</span><label>Step<select aria-label="Motion step" value={state.step} onChange={e => player.seek(Number(e.target.value))}>{spec.steps.map((s, index) => <option key={s.id} value={index}>{index + 1}. {s.title}</option>)}</select></label></div>
        <MotionViewport compiled={compiled} view={{index: state.step, selection: state.selection, projection: state.projection, reduced, advance: playback.index === state.step && ['next', 'tick'].includes(playback.reason)}} onSelect={select}/>
        <div className="motion-caption" aria-live={playback.playing ? 'off' : 'polite'}><span className="motion-eyebrow">Step {String(state.step + 1).padStart(2, '0')}</span><h3>{step.title}</h3><p>{step.caption}</p><AnnotationText step={step} spec={spec}/></div>
        {reduced && <p className="motion-notice">Reduced motion: automatic playback is disabled. Steps and both projections remain available.</p>}
        <p className="motion-note">{spec.note}</p>
      </> : state.panel === 'source' ? <SourceReader sources={spec.sources} selected={state.source} onSelect={id => runtime.set(block.source, id)} highlights={refs}/> : <div className="motion-transcript"><h3>The complete explanation</h3><p>These are authored steps, not a log of executed code. Choosing a step opens its exact snapshot.</p><ol>{spec.steps.map((s, index) => <li key={s.id}><button type="button" onClick={() => {player.seek(index); runtime.set(block.panel, 'scene');}}>{s.title}</button><p>{s.caption}</p><AnnotationText step={s} spec={spec}/>{motionStepEvidence(s).map(ref => <button type="button" className="motion-inline-source" key={ref.artifact + ':' + ref.start + ':' + ref.end} onClick={() => openEvidence(ref)}>{ref.label}</button>)}</li>)}</ol></div>}
    </WorkspaceShell>
  </section>;
}

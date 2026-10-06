import {useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode} from 'react';
import {useRuntime, useSiteState, useReducedMotion, useNavigatePage} from '../../src/framework/ui.ts';
import {useArtifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
import {loadEvidenceSources} from '../../src/framework/foundation/lineage/sources.ts';
import type {Artifact} from '../../src/framework/foundation/artifact.ts';
import {MotionViewport, createMotionController, type MotionController} from '../../src/framework/motion/react.ts';
import {SourceReader} from '../../src/framework/evidence/react.ts';
import {parseTrace, labMotion, stepView, lineSteps, nextStepAtLine, formatValue, SPEEDS, type LabTrace, type Speed, type TraceValue} from './trace.ts';
import './lab.css';

export const SNIPPET = 'py/examples/normalize_rows.py';
export const FIELDS = {step: 'lab-step', projection: 'lab-projection', speed: 'lab-speed', reduced: 'lab-reduced'} as const;
const KEYWORDS = new Set(['def', 'return', 'for', 'in', 'if', 'else', 'elif', 'while', 'import', 'from', 'as', 'and', 'or', 'not', 'None', 'True', 'False', 'lambda', 'with', 'class', 'pass']);
const BUILTINS = new Set(['round', 'min', 'max', 'len', 'sum', 'range', 'print', 'abs']);

/** Minimal Python tokens for readable code; React text nodes only, never HTML. */
function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [], pattern = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  let match: RegExpExecArray | null, key = 0, defName = false;
  while ((match = pattern.exec(line))) {
    const [text, comment, string, number, word] = match;
    const cls = comment ? 'tok-comment' : string ? 'tok-string' : number ? 'tok-number' : word && KEYWORDS.has(word) ? 'tok-keyword' : word && (BUILTINS.has(word)) ? 'tok-builtin' : word && defName ? 'tok-def' : '';
    if (word) defName = word === 'def';
    out.push(cls ? <span key={key++} className={cls}>{text}</span> : text);
  }
  return out;
}

function useTrace(): {state: 'busy'; message?: undefined} | {state: 'error'; message: string} | {state: 'ready'; trace: LabTrace; artifact: Artifact} {
  const source = useArtifactSource({kind: 'static', id: 'coding-lab-trace'});
  const artifact = source.status === 'ready' ? source.result.artifact : null;
  const [loaded, setLoaded] = useState<{trace: LabTrace} | {error: string} | null>(null);
  useEffect(() => {
    if (!artifact) return;
    const abort = new AbortController();
    loadEvidenceSources(artifact, {base: document.baseURI, signal: abort.signal}).then(({sources}) => {
      const snippet = sources.find(s => s.path === SNIPPET);
      if (!snippet) {setLoaded({error: 'The traced source file ' + SNIPPET + ' was not published beside the artifact.'}); return;}
      try {setLoaded({trace: parseTrace(artifact, SNIPPET, snippet.text)});} catch (error) {setLoaded({error: String((error as Error).message)});}
    }, error => {if ((error as Error)?.name !== 'AbortError') setLoaded({error: String((error as Error)?.message || error)});});
    return () => abort.abort();
  }, [artifact]);
  if (source.status === 'error') return {state: 'error', message: source.message};
  if (loaded && 'error' in loaded) return {state: 'error', message: loaded.error};
  if (!artifact || !loaded) return {state: 'busy'};
  return {state: 'ready', trace: loaded.trace, artifact};
}

export function CodingLab() {
  const loaded = useTrace();
  if (loaded.state === 'error') return <div className="lab-notice" role="alert" data-testid="lab-error" data-capture-state="error">Trace unavailable. {loaded.message}</div>;
  if (loaded.state === 'busy') return <p className="lab-notice" role="status" data-capture-state="busy">Loading the recorded trace...</p>;
  return <Lab trace={loaded.trace} artifact={loaded.artifact}/>;
}

function Lab({trace, artifact}: {trace: LabTrace; artifact: Artifact}) {
  const runtime = useRuntime(), snapshot = useSiteState(), systemReduced = useReducedMotion(), navigate = useNavigatePage();
  const values = snapshot.values, last = trace.steps.length - 1;
  const index = Math.min(Math.max(0, Number(values[FIELDS.step]) || 0), last);
  const speed = (SPEEDS.includes(values[FIELDS.speed] as Speed) ? values[FIELDS.speed] : '1') as Speed;
  const projection = values[FIELDS.projection] === 'isometric' ? 'isometric' : 'diagram';
  const reduced = systemReduced || values[FIELDS.reduced] === true;
  // One controller per trace; speed is a playback rate on the same clock, not a recompiled spec.
  const controller = useMemo<MotionController>(() => createMotionController(labMotion(trace), reduced, undefined, {speed: Number(speed)}), [trace]);
  const playback = useSyncExternalStore(controller.player.subscribe, controller.player.getState, controller.player.getState);
  const syncing = useRef(false), root = useRef<HTMLElement>(null);
  const view = stepView(trace, index), step = view.step, hits = useMemo(() => lineSteps(trace), [trace]);

  // One clock: the pinned StoryPlayer. Its index is mirrored into the view field; field changes seek it.
  useEffect(() => {
    const {player} = controller;
    if (player.getState().index !== index) {syncing.current = true; try {player.seek(index);} finally {syncing.current = false;}}
    let previous = player.getState().index;
    const off = player.subscribe(() => {
      const next = player.getState().index;
      if (next !== previous) {previous = next; if (!syncing.current) runtime.set(FIELDS.step, next);}
    });
    const hidden = () => {if (document.hidden) player.pause();};
    document.addEventListener('visibilitychange', hidden);
    return () => {off(); document.removeEventListener('visibilitychange', hidden); player.pause(); player.dispose?.();};
  }, [controller, runtime]);
  useEffect(() => {
    if (controller.player.getState().index !== index) {syncing.current = true; try {controller.player.seek(index);} finally {syncing.current = false;}}
  }, [controller, index]);
  useEffect(() => {controller.setSpeed(Number(speed));}, [controller, speed]);
  useEffect(() => {controller.player.setReducedMotion(reduced); if (reduced) controller.player.pause();}, [controller, reduced]);
  useEffect(() => {controller.player.pause();}, [controller, snapshot.restoreEpoch]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {if (entries.every(e => !e.isIntersecting)) controller.player.pause();});
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [controller]);

  const seek = (target: number) => {controller.player.pause(); runtime.set(FIELDS.step, Math.min(Math.max(0, target), last));};
  const focusLine = (line: number) => {const target = nextStepAtLine(trace, line, index); if (target !== null) seek(target);};
  const advance = playback.index === index && (playback.reason === 'next' || playback.reason === 'tick');
  const playing = playback.playing;
  const prov = artifact.provenance;
  const table = (rows: [string, TraceValue][], empty: string) => rows.length ? <dl className="lab-io">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{formatValue(v)}</dd></div>)}</dl> : <p className="lab-muted">{empty}</p>;

  return <section ref={root} className="lab" data-testid="coding-lab" data-step={index} data-line={step.line} data-event={step.event} data-playing={String(playing)} data-reduced={String(reduced)} data-capture-state="ready" aria-label="Animated coding lab">
    <div className="lab-transport" role="group" aria-label="Trace playback">
      <button type="button" className="lab-play" data-testid="lab-play" disabled={reduced || !playing && index === last} onClick={() => playing ? controller.player.pause() : controller.play()}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Previous step" data-testid="lab-prev" disabled={index === 0} onClick={() => {controller.player.pause(); controller.player.previous();}}>&#8592;</button>
      <button type="button" aria-label="Next step" data-testid="lab-next" disabled={index === last} onClick={() => {controller.player.pause(); controller.player.next();}}>&#8594;</button>
      <label className="lab-scrub"><span className="lab-sr">Trace step</span>
        <input type="range" data-testid="lab-scrubber" min={0} max={last} step={1} value={index} aria-valuetext={`Step ${index + 1} of ${last + 1}, line ${step.line}`} onChange={e => seek(Number(e.currentTarget.value))}/>
      </label>
      <span className="lab-counter" data-testid="lab-counter">{index + 1} / {last + 1}</span>
      <label className="lab-select">Speed<select data-testid="lab-speed" value={speed} onChange={e => runtime.set(FIELDS.speed, e.currentTarget.value)}>{SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}</select></label>
      <div className="lab-toggle" role="group" aria-label="Projection">
        <button type="button" aria-pressed={projection === 'diagram'} onClick={() => runtime.set(FIELDS.projection, 'diagram')}>2D</button>
        <button type="button" aria-pressed={projection === 'isometric'} onClick={() => runtime.set(FIELDS.projection, 'isometric')}>ISO</button>
      </div>
      <label className="lab-check"><input type="checkbox" data-testid="lab-reduced" checked={reduced} disabled={systemReduced} onChange={e => runtime.set(FIELDS.reduced, e.currentTarget.checked)}/>Reduced motion</label>
    </div>

    <div className="lab-grid">
      <section className="lab-pane lab-code" aria-label="Code">
        <header><span className="lab-eyebrow">Code</span><code>{trace.sourcePath}</code></header>
        <div className="lab-lines" data-testid="lab-code">
          <SourceReader compact sources={controller.compiled.spec.sources} selected="snippet" onSelect={() => {}} currentLine={step.line} renderLine={highlight} onLineClick={focusLine}
            lineInfo={line => {const ran = hits.get(line), text = trace.lines[line - 1] || ''; return ran ? {badge: ran.length + 'x', label: `Focus line ${line}: ${text.trim() || 'blank'} (ran ${ran.length} times)`} : {disabled: true, label: `Line ${line} did not run`};}}/>
        </div>
        <p className="lab-hint">Select a line to jump to the next time it ran.</p>
      </section>

      <section className="lab-pane lab-visual" aria-label="Visual execution">
        <header><span className="lab-eyebrow">Visual execution</span><span className="lab-muted">{step.scope === '<module>' ? 'module frame' : step.scope + '() frame'}</span></header>
        <div className="lab-kpis" data-testid="lab-kpis">
          <div><span>processed</span><strong data-testid="kpi-processed">{view.kpi.processed} / {view.kpi.rows}</strong></div>
          <div><span>total</span><strong data-testid="kpi-total">{formatValue(view.kpi.total)}</strong></div>
          <div><span>mean</span><strong data-testid="kpi-mean">{formatValue(view.kpi.mean)}</strong></div>
        </div>
        <MotionViewport compiled={controller.compiled} view={{index, selection: 'none', projection, reduced, advance, speed: Number(speed)}} onSelect={() => {}}/>
      </section>

      <section className="lab-pane lab-explain" aria-label="Explanation" aria-live={playing ? 'off' : 'polite'}>
        <header><span className="lab-eyebrow">Step {index + 1} · line {step.line} · {step.event}</span></header>
        <div className="lab-ex-cols"><div className="lab-ex-main">
        <h3 data-testid="lab-title">{view.title}</h3>
        <p className="lab-caption">{view.caption}</p>
        <pre className="lab-source-line" data-testid="lab-source-line"><span>{step.line}</span>{highlight(step.code)}</pre>
        </div><div className="lab-ex-data">
        <h4>Input</h4>{table(view.inputs, step.event === 'line' ? 'No call arguments on this step.' : 'No arguments.')}
        <h4>Output</h4>{table(view.outputs, 'Nothing written on this step.')}
        <h4>Variables after this step</h4>
        <table className="lab-vars" data-testid="lab-vars"><tbody>{Object.entries(step.vars).map(([name, value]) => <tr key={name} data-changed={step.changed.includes(name)}><th scope="row">{name}</th><td>{formatValue(value)}</td></tr>)}</tbody></table>
        {!Object.keys(step.vars).length && <p className="lab-muted">No data variables yet.</p>}
        </div><div className="lab-ex-prov">
        <h4>Provenance</h4>
        <dl className="lab-prov" data-testid="lab-provenance">
          <div><dt>Artifact</dt><dd><code>{artifact.id}</code></dd></div>
          {prov.runId && <div><dt>Run</dt><dd><code>{prov.runId}</code></dd></div>}
          {prov.producer && <div><dt>Producer</dt><dd>{prov.producer.name}</dd></div>}
          {prov.inputHash && <div><dt>Input hash</dt><dd><code title={prov.inputHash}>{prov.inputHash.slice(0, 12)}</code></dd></div>}
          <div><dt>Evidence</dt><dd><code>{trace.sourcePath}:{step.line}</code></dd></div>
        </dl>
        <button type="button" className="lab-link" data-testid="lab-lineage" onClick={() => navigate('lineage')}>Open lineage</button>
        </div></div>
      </section>
    </div>

    <details className="lab-transcript" data-testid="lab-transcript" open>
      <summary>Full transcript · {trace.steps.length} recorded steps</summary>
      <ol>{trace.steps.map(s => {const v = stepView(trace, s.index); return <li key={s.index} data-step={s.index} aria-current={s.index === index ? 'step' : undefined}>
        <button type="button" onClick={() => seek(s.index)}><span className="lab-t-line">L{s.line}</span><strong>{v.title}</strong><span className="lab-t-caption">{v.caption}</span></button>
      </li>;})}</ol>
    </details>
    {reduced && <p className="lab-muted lab-reduced-note" data-testid="lab-reduced-note">Reduced motion: automatic playback is off and each step settles immediately. Step, scrub and transcript controls stay available.</p>}
    <p className="lab-muted lab-foot">Recorded by <code>py/coding_lab_trace.py</code> (sys.settrace) and validated against the exact source text before display. Studio does not run Python. ILLUSTRATIVE readings.</p>
  </section>;
}

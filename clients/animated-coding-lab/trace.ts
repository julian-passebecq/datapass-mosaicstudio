import type {Artifact} from '../../src/framework/foundation/artifact.ts';
import type {MotionSpec, MotionStep, MotionCommand, MotionAnnotation, MotionEntity} from '../../src/framework/motion/model.ts';
import type {SourceArtifact} from '../../src/framework/evidence/model.ts';

/** A recorded trace, read from a validated datapass.artifact. Nothing here runs Python or invents a step. */
export type TraceScalar = number | string | boolean | null;
export type TraceValue = TraceScalar | TraceScalar[];
export type TraceEvent = 'line' | 'call' | 'return';
export type TraceStep = {
  index: number; line: number; event: TraceEvent; scope: string; code: string;
  changed: string[]; vars: Record<string, TraceValue>; returned?: TraceValue;
};
export type LabTrace = {artifactId: string; runId: string; sourcePath: string; source: string; lines: string[]; steps: TraceStep[]};
/** Playback rates for the controller (createMotionController speed); the spec itself has one authored timing. */
export type Speed = '0.5' | '1' | '2';
export const SPEEDS: readonly Speed[] = ['0.5', '1', '2'];
export const MAX_TRACE_STEPS = 64;
const COLUMNS = ['step', 'line', 'event', 'scope', 'code', 'changed', 'vars', 'returned'];
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function fail(message: string): never {throw new Error('Trace rejected: ' + message);}
function scalar(value: unknown): value is TraceScalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
}
function traceValue(value: unknown, label: string): TraceValue {
  if (scalar(value)) return value;
  if (Array.isArray(value) && value.length <= 32 && value.every(scalar)) return [...value];
  fail(label + ' is not a scalar or a short list of scalars');
}
function json(text: unknown, label: string): unknown {
  if (typeof text !== 'string' || text.length > 4000) fail(label + ' must be JSON text');
  try {return JSON.parse(text);} catch {fail(label + ' is not valid JSON');}
}

/**
 * Validate the trace rows against the exact source text they claim to come from:
 * contiguous steps, known events, in-range lines whose recorded `code` equals that source line,
 * JSON variables, `changed` names that exist, and a returned value only on return events.
 */
export function parseTrace(artifact: Artifact, sourcePath: string, source: string): LabTrace {
  if (artifact.payload.kind !== 'table') fail('payload must be a table');
  const {columns, rows, rowKey} = artifact.payload;
  if (rowKey !== 'step' || columns.map(c => c.id).join() !== COLUMNS.join()) fail('unexpected columns');
  if (!rows.length || rows.length > MAX_TRACE_STEPS) fail(`1..${MAX_TRACE_STEPS} steps required`);
  const text = source.replace(/\r\n/g, '\n'), lines = text.replace(/\n$/, '').split('\n');
  const steps = rows.map((row, index): TraceStep => {
    const label = 'step ' + index;
    if (row.step !== index) fail(label + ' is out of order');
    const line = row.line;
    if (typeof line !== 'number' || !Number.isSafeInteger(line) || line < 1 || line > lines.length) fail(label + ' line is outside ' + sourcePath);
    if (row.event !== 'line' && row.event !== 'call' && row.event !== 'return') fail(label + ' has an unknown event');
    if (typeof row.scope !== 'string' || !(row.scope === '<module>' || NAME.test(row.scope))) fail(label + ' scope');
    if (typeof row.code !== 'string' || row.code !== lines[line - 1].trim()) fail(label + ' code differs from ' + sourcePath + ':' + line);
    if (row.event === 'call' && !/^def\s/.test(row.code)) fail(label + ' call must point at a def line');
    const parsed = json(row.vars, label + ' vars');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(label + ' vars must be an object');
    const vars: Record<string, TraceValue> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (!NAME.test(name)) fail(label + ' variable name');
      vars[name] = traceValue(value, label + ' ' + name);
    }
    if (typeof row.changed !== 'string') fail(label + ' changed');
    const changed = row.changed ? row.changed.split(',') : [];
    if (changed.some(name => !Object.hasOwn(vars, name))) fail(label + ' changed names a missing variable');
    const step: TraceStep = {index, line, event: row.event, scope: row.scope, code: row.code, changed, vars};
    if (row.event === 'return') step.returned = traceValue(json(row.returned, label + ' returned'), label + ' returned');
    else if (row.returned !== null) fail(label + ' has a returned value without a return event');
    return step;
  });
  return {artifactId: artifact.id, runId: artifact.provenance.runId || '', sourcePath, source: text, lines, steps};
}

export const formatValue = (value: TraceValue | undefined): string =>
  value === undefined ? '-' : Array.isArray(value) ? '[' + value.map(v => formatValue(v)).join(', ') + ']'
    : typeof value === 'number' ? (Number.isInteger(value) ? value.toFixed(1) : String(value)) : typeof value === 'string' ? JSON.stringify(value) : String(value);

/** Names a line writes, read from its own source text: `a, b = ...`, `a += ...`, `a.append(...)`, `for a in ...`. */
export function writtenNames(code: string): string[] {
  const loop = /^for\s+([\w\s,]+?)\s+in\s/.exec(code);
  if (loop) return loop[1].split(',').map(s => s.trim());
  const call = /^(\w+)\.\w+\(/.exec(code);
  if (call) return [call[1]];
  const assign = /^([\w\s,]+?)\s*(?:\+|-|\*|\/)?=(?!=)/.exec(code);
  return assign ? assign[1].split(',').map(s => s.trim()) : [];
}

export type StepView = {
  step: TraceStep; title: string; caption: string;
  inputs: [string, TraceValue][]; outputs: [string, TraceValue][];
  kpi: {processed: number; rows: number; total: TraceValue | undefined; mean: TraceValue | undefined};
};
/** The frame's variables at the last module-level step at or before `index` (calls have their own frame). */
function moduleVars(trace: LabTrace, index: number): Record<string, TraceValue> {
  for (let i = index; i >= 0; i--) if (trace.steps[i].scope === '<module>') return trace.steps[i].vars;
  return {};
}
function args(step: TraceStep): string {return Object.entries(step.vars).map(([k, v]) => k + '=' + formatValue(v)).join(', ');}

/** Pure: the same trace and index always give the same explanation, independent of visited steps. */
export function stepView(trace: LabTrace, index: number): StepView {
  if (!Number.isSafeInteger(index) || index < 0 || index >= trace.steps.length) throw new Error('Step out of range');
  const step = trace.steps[index], module = moduleVars(trace, index);
  const rows = Array.isArray(module.rows) ? module.rows.length : 0, processed = Array.isArray(module.results) ? module.results.length : 0;
  const kpi = {processed, rows, total: module.total, mean: module.mean};
  const written = writtenNames(step.code).filter(name => Object.hasOwn(step.vars, name));
  if (step.event === 'call') {
    const inputs = Object.entries(step.vars);
    return {step, kpi, inputs, outputs: [], title: `Call ${step.scope}(${args(step)})`, caption: `Python enters ${step.scope}() with ${inputs.length} arguments. The function has its own frame; the caller's variables are untouched.`};
  }
  if (step.event === 'return') {
    return {step, kpi, inputs: Object.entries(step.vars), outputs: [['return', step.returned!]], title: `${step.scope}() returns ${formatValue(step.returned)}`,
      caption: `Line ${step.line} evaluates ${step.code.replace(/^return\s+/, '')} and hands ${formatValue(step.returned)} back to the caller.`};
  }
  const outputs = written.map(name => [name, step.vars[name]] as [string, TraceValue]);
  if (/^def\s+(\w+)/.test(step.code)) {
    const name = /^def\s+(\w+)/.exec(step.code)![1];
    return {step, kpi, inputs: [], outputs: [], title: `Define ${name}()`, caption: `Line ${step.line} creates the function ${name}. Nothing inside it runs yet.`};
  }
  if (/^for\s/.test(step.code)) {
    const name = writtenNames(step.code)[0];
    if (loopExhausted(trace, index)) return {step, kpi, inputs: [], outputs: [], title: 'Loop finished', caption: `No rows remain, so the for loop on line ${step.line} ends and execution continues after it.`};
    return {step, kpi, inputs: [], outputs, title: `Next row: ${name} = ${formatValue(step.vars[name])}`, caption: `The for loop on line ${step.line} takes the next element of rows (${processed + 1} of ${rows}).`};
  }
  const changedText = outputs.map(([k, v]) => k + ' = ' + formatValue(v)).join(', ');
  const unchanged = outputs.filter(([k]) => !step.changed.includes(k)).map(([k]) => k);
  const caption = !outputs.length ? `Line ${step.line} ran.`
    : unchanged.length && unchanged.length === outputs.length ? `Line ${step.line} ran; ${unchanged.join(', ')} keeps the value ${outputs.map(([, v]) => formatValue(v)).join(', ')}.`
      : `Line ${step.line} ran; after it ${changedText}.`;
  return {step, kpi, inputs: [], outputs, title: step.code, caption};
}

const indent = (line: string) => line.length - line.trimStart().length;
/** A `for` visit ends the loop when the next step in the same frame is not inside the loop body (by indentation). */
export function loopExhausted(trace: LabTrace, index: number): boolean {
  const step = trace.steps[index], header = trace.lines[step.line - 1];
  const next = trace.steps.slice(index + 1).find(s => s.scope === step.scope);
  if (!next) return true;
  const body = trace.lines[next.line - 1];
  return !(next.line > step.line && indent(body) > indent(header));
}

/** Every step at each source line (one-based). */
export function lineSteps(trace: LabTrace): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const step of trace.steps) map.set(step.line, [...(map.get(step.line) || []), step.index]);
  return map;
}
/** Focus a line: the next step at that line after `from`, wrapping around; null when the line never ran. */
export function nextStepAtLine(trace: LabTrace, line: number, from: number): number | null {
  const hits = lineSteps(trace).get(line);
  if (!hits) return null;
  return hits.find(i => i > from) ?? hits[0];
}

/** Authored 1x timing; playback speed is applied by the controller and the viewport, never by recompiling. */
const TIMING = {holdMs: 1600, transitionMs: 700};
const TOKEN = .42, GAP = .5;
/** Container width that holds `n` value tokens side by side on its top face. */
const shelf = (n: number) => Math.max(1.3, n * GAP + .2);
/** Token slot ON a container's top face (the renderer draws a resting token above its container). */
const slot = (x: number, i: number, n: number, z: number): [number, number, number] => [x + (i - (n - 1) / 2) * GAP, -.9, z];

/**
 * Compose the recorded trace into the ConceptMotion v2 grammar (move / state / visibility / label).
 * Each row value is one stable semantic identity `row-i`: it enters normalize(), its label becomes the
 * returned value, and it lands in results. Playback speed is not part of the spec (see createMotionController).
 */
export function labMotion(trace: LabTrace): MotionSpec {
  const timing = TIMING;
  const first = trace.steps.find(s => Array.isArray(s.vars.rows));
  const values = first ? first.vars.rows as TraceScalar[] : [];
  const calls = trace.steps.filter(s => s.event === 'call'), returns = trace.steps.filter(s => s.event === 'return');
  if (!values.length || calls.length !== values.length || returns.length !== values.length) fail('the lab expects one function call per input row');
  const fn = calls[0].scope, n = values.length;
  const ref = (line: number, label: string) => ({artifact: 'snippet', start: line, end: line, label});
  const entities: MotionEntity[] = [
    {id: 'input', kind: 'station', label: 'rows', description: 'The input list, as recorded in the trace.', position: [0, -.9, 0], size: [shelf(n), .8, .2], color: '#9fbccc', evidence: [ref(first!.line, 'Input list')]},
    {id: 'fn', kind: 'station', label: fn + '()', description: 'The traced function. Each call has its own frame.', position: [3.2, -.9, 0], size: [1.6, .8, .4], color: '#8fb6a8', evidence: [ref(calls[0].line, 'Function definition')]},
    {id: 'output', kind: 'station', label: 'results', description: 'Values appended by the loop.', position: [6.4, -.9, 0], size: [shelf(n), .8, .2], color: '#b9b0d3', evidence: []},
    {id: 'kpi', kind: 'station', label: 'total / mean', description: 'Running aggregate read from the recorded variables.', position: [9.2, -.9, 0], size: [1.6, .8, .4], color: '#d4bd8f', evidence: []},
    ...values.map((v, i): MotionEntity => ({id: 'row-' + i, kind: 'token', label: formatValue(v), description: `rows[${i}] as recorded; after its call it shows ${fn}(rows[${i}]) as returned in the trace.`, at: 'input', size: TOKEN, color: '#3d7d9c', evidence: []})),
  ];
  const links = [
    {id: 'feed', from: 'input', to: 'fn', label: 'item', via: []},
    {id: 'emit', from: 'fn', to: 'output', label: 'append', via: []},
    {id: 'sum', from: 'output', to: 'kpi', label: 'aggregate', via: []},
  ];
  let iteration = -1;
  const steps = trace.steps.map((step, index): MotionStep => {
    const view = stepView(trace, index), commands: MotionCommand[] = [], annotations: MotionAnnotation[] = [], activeLinks: string[] = [];
    let focus = 'none';
    const note = (entity: string, text: string, offset: [number, number]) => annotations.push({id: 'note-' + annotations.length, entity, text: text.slice(0, 160), offset, evidence: [ref(step.line, 'Line ' + step.line)]});
    const written = writtenNames(step.code);
    if (index === 0) values.forEach((_, i) => commands.push({type: 'move', entity: 'row-' + i, position: slot(0, i, n, .48)}, {type: 'visibility', entity: 'row-' + i, visible: step.vars.rows !== undefined}));
    if (step.event === 'call') {
      focus = 'fn'; commands.push({type: 'state', entity: 'fn', value: 'active'}); note('fn', view.title, [0, -88]);
    } else if (step.event === 'return') {
      focus = 'fn'; commands.push({type: 'label', entity: 'row-' + iteration, text: formatValue(step.returned)}, {type: 'state', entity: 'fn', value: 'complete'});
      note('fn', 'returns ' + formatValue(step.returned), [0, -88]);
    } else if (/^for\s/.test(step.code)) {
      if (loopExhausted(trace, index)) {
        commands.push({type: 'state', entity: 'input', value: 'complete'}, {type: 'state', entity: 'fn', value: 'idle'});
      } else {
        iteration += 1; focus = 'fn'; activeLinks.push('feed');
        commands.push({type: 'move', entity: 'row-' + iteration, position: [3.2, -.9, .68]}, {type: 'state', entity: 'input', value: 'active'}, {type: 'state', entity: 'fn', value: 'idle'});
        note('input', view.title, [0, -96]);
      }
    } else if (index > 0) {
      if (written.includes('rows')) {focus = 'input'; values.forEach((_, i) => commands.push({type: 'visibility', entity: 'row-' + i, visible: true})); commands.push({type: 'state', entity: 'input', value: 'active'});}
      else if (written.includes('lo') || written.includes('hi')) {focus = 'input'; note('input', view.outputs.map(([k, v]) => k + ' = ' + formatValue(v)).join(' · '), [0, -96]);}
      else if (written.includes('results') && step.code.includes('.append(')) {
        focus = 'output'; activeLinks.push('emit');
        commands.push({type: 'move', entity: 'row-' + iteration, position: slot(6.4, iteration, n, .48)}, {type: 'state', entity: 'output', value: 'active'});
      } else if (written.includes('results')) {focus = 'output'; commands.push({type: 'state', entity: 'output', value: 'idle'});}
      else if (written.includes('total')) {focus = 'kpi'; activeLinks.push('sum'); commands.push({type: 'state', entity: 'kpi', value: 'active'}); note('kpi', 'total = ' + formatValue(step.vars.total), [0, -88]);}
      else if (written.includes('mean')) {focus = 'kpi'; activeLinks.push('sum'); commands.push({type: 'state', entity: 'kpi', value: 'complete'}, {type: 'state', entity: 'output', value: 'complete'}); note('kpi', 'mean = ' + formatValue(step.vars.mean), [0, -88]);}
      else if (written.length) {focus = 'fn'; note('fn', view.outputs.map(([k, v]) => k + ' = ' + formatValue(v)).join(' · ') || step.code, [0, 88]);}
    }
    return {id: 'step-' + index, title: ('Line ' + step.line + ' · ' + view.title).slice(0, 160), caption: view.caption, focus, holdMs: timing.holdMs, transitionMs: index === 0 ? 0 : timing.transitionMs,
      commands, activeLinks, evidence: [ref(step.line, 'Line ' + step.line)], annotations};
  });
  const sources: SourceArtifact[] = [{id: 'snippet', path: trace.sourcePath, language: 'python', title: trace.sourcePath, text: trace.source, provenance: 'provided'}];
  return {format: 'datapass.motion', version: 2, title: 'Recorded execution of ' + trace.sourcePath,
    description: `${trace.steps.length} steps recorded by sys.settrace in artifact ${trace.artifactId}${trace.runId ? ' (run ' + trace.runId + ')' : ''}.`,
    provenance: 'recorded', note: 'Positions and timings are presentation. Every value, line and step order comes from the recorded trace artifact; Studio does not run Python.',
    entities, links, steps, sources};
}

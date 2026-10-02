import {StoryPlayer, type Scheduler} from '@vizforge/core/player';
import {compileMotion, type CompiledMotion} from './compile';

/** Original player with authored dwell times; no new autoplay or game loop. */
export function createMotionController(input: unknown, reduced = false, scheduler: Scheduler = {set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>)}) {
  const compiled = compileMotion(input), spec = compiled.spec;
  const player: StoryPlayer = new StoryPlayer({
    id: 'authored-motion', version: '1.0', title: spec.title, description: spec.description, intervalMs: 2500,
    visuals: [{id: 'motion-index', version: '1.0', type: 'time-series', title: 'Authored steps', subtitle: 'Internal player index', source: 'Client-authored motion document', note: 'Index positions are not measurements.', takeaway: 'Each step selects one deterministic target snapshot.', accessibility: {summary: 'Authored motion step index'}, data: spec.steps.map((s, i) => ({id: 'step', label: 'Step', time: i, value: i})), encodings: {id: 'id', label: 'label', time: 'time', value: 'value'}}],
    scenes: spec.steps.map((step, index) => ({id: step.id, visualId: 'motion-index', title: step.title, caption: step.caption, state: {time: index}, transition: {intent: 'morph-update', durationMs: step.transitionMs}})),
  }, reduced, {
    set: (callback, _delay) => scheduler.set(callback, spec.steps[player.getState().index].holdMs),
    clear: handle => scheduler.clear(handle),
  });
  return {compiled, player, play() {if (!player.getState().reducedMotion) player.play();}};
}
export type MotionController = ReturnType<typeof createMotionController>;

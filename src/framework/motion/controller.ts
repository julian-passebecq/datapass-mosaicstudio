import {StoryPlayer, type Scheduler} from '@vizforge/core/player';
import {compileMotion, type CompiledMotion} from './compile';

/** Playback rate bounds. Speed scales the player's (virtual) time only, never which snapshot a step selects. */
export const MOTION_SPEED = Object.freeze({min: .25, max: 4});
export type MotionControllerOptions = {speed?: number};
function rate(speed: unknown): number {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < MOTION_SPEED.min || speed > MOTION_SPEED.max) throw new Error('Invalid motion playback speed');
  return speed;
}

/**
 * Original player with authored dwell times; no new autoplay or game loop. Works for static
 * resources and for specs built at runtime (e.g. composed from a loaded artifact).
 * `speed` divides each authored hold before it reaches the scheduler, so a scheduler sees exactly
 * holdMs / speed; renderers divide transition durations by the same rate (MotionView.speed).
 */
export function createMotionController(input: unknown, reduced = false, scheduler: Scheduler = {set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>)}, options: MotionControllerOptions = {}) {
  let speed = rate(options.speed ?? 1);
  const compiled: CompiledMotion = compileMotion(input), spec = compiled.spec;
  const player: StoryPlayer = new StoryPlayer({
    id: 'authored-motion', version: '1.0', title: spec.title, description: spec.description, intervalMs: 2500,
    visuals: [{id: 'motion-index', version: '1.0', type: 'time-series', title: 'Authored steps', subtitle: 'Internal player index', source: 'Client-authored motion document', note: 'Index positions are not measurements.', takeaway: 'Each step selects one deterministic target snapshot.', accessibility: {summary: 'Authored motion step index'}, data: spec.steps.map((s, i) => ({id: 'step', label: 'Step', time: i, value: i})), encodings: {id: 'id', label: 'label', time: 'time', value: 'value'}}],
    scenes: spec.steps.map((step, index) => ({id: step.id, visualId: 'motion-index', title: step.title, caption: step.caption, state: {time: index}, transition: {intent: 'morph-update', durationMs: step.transitionMs}})),
  }, reduced, {
    set: (callback, _delay) => scheduler.set(callback, spec.steps[player.getState().index].holdMs / speed),
    clear: handle => scheduler.clear(handle),
  });
  return {
    compiled, player,
    play() {if (!player.getState().reducedMotion) player.play();},
    /** Current playback rate (1 = authored timing). */
    getSpeed: (): number => speed,
    /** Applies from the next scheduled hold; a running hold keeps its delay, so no second timer exists. */
    setSpeed(next: number): void {speed = rate(next);},
  };
}
export type MotionController = ReturnType<typeof createMotionController>;

import type {MotionTiming} from './model.ts';

/** Pure local progress on the single D3 step transition. Zero-width windows are exact cuts. */
export function timingProgress(timing: MotionTiming, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(timing.startMs) || !Number.isFinite(timing.endMs) || timing.startMs < 0 || timing.endMs < timing.startMs || !['linear', 'cubic-in-out'].includes(timing.easing)) throw new Error('Invalid motion timing sample');
  if (elapsedMs < timing.startMs) return 0;
  if (elapsedMs >= timing.endMs) return 1;
  const t = (elapsedMs - timing.startMs) / (timing.endMs - timing.startMs);
  return timing.easing === 'linear' ? t : t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

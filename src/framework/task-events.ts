import type {Dataset, Rows, Values} from './types.ts';

/** An observation seam over SiteRuntime tasks, not another execution engine.
 * Revisions are runtime-local dataset versions, NOT content hashes or cloud lineage.
 * No observer is registered by default; payloads are not part of saved UI state.
 */
export type TaskRunEvent = {
  execution: number;
  taskId: string;
  at: string;
  elapsedMs: number;
} & (
  | {phase: 'started'; parameters: Values; dependencies: Readonly<Record<string, number>>; output: Dataset}
  | {phase: 'succeeded'; rows: Rows}
  | {phase: 'failed' | 'cancelled' | 'superseded' | 'timed-out'; message: string}
);

/**
 * One run-state vocabulary for display (F203). Pure mapping, no execution: SiteRuntime, the local Python
 * runtime and Jupyter keep their own lifecycles and their stored `status`/`outcome` values are unchanged.
 *
 * Input unions are spelled here as string literals on purpose: `src/framework` ships in the SDK archive and
 * must not import `src/workspace` (runtime.ts, jupyter.ts) or Python (`result_store.py` JOB_FINAL).
 *
 * Rule: an outcome that was not observed (page reloaded, connection closed, unknown) is `not-observed`,
 * never `cancelled` and never `failed`.
 */
export const RUN_STATES=['queued','running','succeeded','failed','cancelled','interrupted','superseded','timed-out','not-observed'] as const;
export type RunState=typeof RUN_STATES[number];

/** Display labels, lower case like the existing run lists; identical in the notebook and the site runs. */
export const RUN_STATE_LABELS:Readonly<Record<RunState,string>>={
  queued:'queued',running:'running',succeeded:'succeeded',failed:'failed',cancelled:'cancelled',
  interrupted:'interrupted',superseded:'superseded','timed-out':'timed out','not-observed':'not observed',
};

/** Local Python runtime run status (`RunStatus` in src/workspace/runtime.ts). */
export type RuntimeRunStatus='queued'|'running'|'succeeded'|'failed'|'cancelled';
/** Jupyter execute outcome (`ExecuteStatus` in src/workspace/jupyter.ts). */
export type JupyterExecuteStatus='ok'|'error'|'interrupted'|'disconnected'|'unknown';
/** Saved run reference outcome (`RunOutcome` in foundation/run-history.ts). */
export type RunOutcomeValue='succeeded'|'failed'|'cancelled'|'superseded'|'timed-out'|'unobserved';
/** In-memory journal record status (foundation/journal.ts). */
export type JournalRunStatus='running'|RunOutcomeValue;
/** Result-store job status (py/service/result_store.py: running, then one of JOB_FINAL). */
export type StoreJobStatus='running'|'succeeded'|'failed'|'interrupted'|'cancelled'|'disconnected'|'unknown';
/** Notebook cell result status (src/panels/Notebook.tsx). Some are not run outcomes and map to null. */
export type NotebookCellStatus='running'|'done'|'error'|'cancelled'|'skipped'|'failed'|'interrupted'|'disconnected'|'unknown'|'imported'|'missing';

const RUNTIME:Readonly<Record<RuntimeRunStatus,RunState>>={queued:'queued',running:'running',succeeded:'succeeded',failed:'failed',cancelled:'cancelled'};
const JUPYTER:Readonly<Record<JupyterExecuteStatus,RunState>>={ok:'succeeded',error:'failed',interrupted:'interrupted',disconnected:'not-observed',unknown:'not-observed'};
const OUTCOME:Readonly<Record<JournalRunStatus,RunState>>={running:'running',succeeded:'succeeded',failed:'failed',cancelled:'cancelled',superseded:'superseded','timed-out':'timed-out',unobserved:'not-observed'};
const STORE_JOB:Readonly<Record<StoreJobStatus,RunState>>={running:'running',succeeded:'succeeded',failed:'failed',interrupted:'interrupted',cancelled:'cancelled',disconnected:'not-observed',unknown:'not-observed'};
const CELL:Readonly<Record<NotebookCellStatus,RunState|null>>={running:'running',done:'succeeded',error:'failed',failed:'failed',cancelled:'cancelled',interrupted:'interrupted',disconnected:'not-observed',unknown:'not-observed',skipped:null,imported:null,missing:null};

const own=<T extends object>(table:T,key:string):key is Extract<keyof T,string>=>Object.prototype.hasOwnProperty.call(table,key);
/** Unknown input values (newer producer, corrupted record) are displayed as not observed, never as a failure. */
const pick=<T extends object>(table:T,value:string):RunState=>own(table,value)?(table as Record<string,RunState>)[value]:'not-observed';

export const runStateFromRuntime=(status:RuntimeRunStatus|string):RunState=>pick(RUNTIME,status);
export const runStateFromJupyter=(status:JupyterExecuteStatus|string):RunState=>pick(JUPYTER,status);
/** Journal record status or saved RunOutcome (both use the same literals). */
export const runStateFromOutcome=(status:JournalRunStatus|string):RunState=>pick(OUTCOME,status);
export const runStateFromStoreJob=(status:StoreJobStatus|string):RunState=>pick(STORE_JOB,status);
/** Null for cell states that are not a run outcome: skipped (never ran), imported (file output), missing (saved file absent). */
export const runStateFromCell=(status:NotebookCellStatus|string):RunState|null=>own(CELL,status)?CELL[status]:'not-observed';

export const isRunState=(value:unknown):value is RunState=>typeof value==='string'&&(RUN_STATES as readonly string[]).includes(value);
export const runStateLabel=(state:RunState):string=>RUN_STATE_LABELS[state];
/** Terminal states: no further change will be observed for this run. */
export const isTerminalRunState=(state:RunState):boolean=>state!=='queued'&&state!=='running';

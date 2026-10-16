import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RUN_STATES,RUN_STATE_LABELS,isRunState,isTerminalRunState,runStateLabel,runStateFromRuntime,runStateFromJupyter,runStateFromOutcome,runStateFromStoreJob,runStateFromCell} from '../src/framework/compute/index.ts';

const src=p=>readFile(new URL(p,import.meta.url),'utf8');
/** Literal list from a source declaration such as `type X='a'|'b'` or `X=new Set(['a','b'])`, so the test follows the code. */
const literals=text=>[...text.matchAll(/'([a-z-]+)'/g)].map(m=>m[1]);
const line=(text,re)=>{const m=text.match(re);assert.ok(m,'declaration not found: '+re);return literals(m[0]);};

test('the display set is exactly the nine approved states with one label each',()=>{
  assert.deepEqual([...RUN_STATES],['queued','running','succeeded','failed','cancelled','interrupted','superseded','timed-out','not-observed']);
  assert.deepEqual(Object.keys(RUN_STATE_LABELS).sort(),[...RUN_STATES].sort());
  assert.equal(runStateLabel('timed-out'),'timed out');assert.equal(runStateLabel('not-observed'),'not observed');
  assert.equal(new Set(Object.values(RUN_STATE_LABELS)).size,RUN_STATES.length);
  assert.ok(isRunState('superseded'));assert.ok(!isRunState('unobserved'));assert.ok(!isRunState(undefined));
  assert.ok(!isTerminalRunState('queued'));assert.ok(!isTerminalRunState('running'));assert.ok(isTerminalRunState('not-observed'));
});

test('every local runtime RunStatus literal maps (workspace/runtime.ts STATUSES)',async()=>{
  const statuses=line(await src('../src/workspace/runtime.ts'),/STATUSES=new Set\(\[[^\]]*\]\)/);
  assert.deepEqual(statuses,['queued','running','succeeded','failed','cancelled']);
  for(const s of statuses)assert.equal(runStateFromRuntime(s),s);
});

test('every Jupyter ExecuteStatus literal maps; disconnected and unknown are not observed',async()=>{
  const statuses=line(await src('../src/workspace/jupyter.ts'),/export type ExecuteStatus=[^;]*;/);
  assert.deepEqual(statuses,['ok','error','interrupted','disconnected','unknown']);
  assert.deepEqual(statuses.map(runStateFromJupyter),['succeeded','failed','interrupted','not-observed','not-observed']);
});

test('every RunOutcome (run-history.ts OUTCOMES) and journal status maps; unobserved is not observed',async()=>{
  const outcomes=line(await src('../src/framework/foundation/run-history.ts'),/const OUTCOMES:[^=]*=\[[^\]]*\]/);
  assert.deepEqual(outcomes,['succeeded','failed','cancelled','superseded','timed-out','unobserved']);
  assert.deepEqual(outcomes.map(runStateFromOutcome),['succeeded','failed','cancelled','superseded','timed-out','not-observed']);
  const journal=line(await src('../src/framework/foundation/journal.ts'),/const STATUSES=\[[^\]]*\]/);
  assert.equal(journal.length,7);
  for(const s of journal)assert.ok(isRunState(runStateFromOutcome(s)),s);
  assert.equal(runStateFromOutcome('running'),'running');
});

test('every result-store JOB_FINAL literal maps (py/service/result_store.py)',async()=>{
  const m=(await src('../py/service/result_store.py')).match(/JOB_FINAL = \(([^)]*)\)/);assert.ok(m);
  const finals=[...m[1].matchAll(/"([a-z-]+)"/g)].map(x=>x[1]);
  assert.deepEqual(finals,['succeeded','failed','interrupted','cancelled','disconnected','unknown']);
  assert.deepEqual(finals.map(runStateFromStoreJob),['succeeded','failed','interrupted','cancelled','not-observed','not-observed']);
  assert.equal(runStateFromStoreJob('running'),'running');
});

test('every notebook cell status maps to a run state or to none (skipped, imported, missing)',async()=>{
  const statuses=line(await src('../src/panels/Notebook.tsx'),/type Status=[^;]*;/);
  const expected={running:'running',done:'succeeded',error:'failed',cancelled:'cancelled',skipped:null,failed:'failed',interrupted:'interrupted',disconnected:'not-observed',unknown:'not-observed',imported:null,missing:null};
  assert.deepEqual(statuses.sort(),Object.keys(expected).sort());
  for(const s of statuses)assert.equal(runStateFromCell(s),expected[s],s);
});

test('not observed never maps to cancelled or failed, from any surface, including unknown inputs',()=>{
  const notObserved=[runStateFromJupyter('disconnected'),runStateFromJupyter('unknown'),runStateFromOutcome('unobserved'),runStateFromStoreJob('disconnected'),runStateFromStoreJob('unknown'),runStateFromCell('disconnected'),runStateFromCell('unknown')];
  for(const s of notObserved)assert.equal(s,'not-observed');
  for(const f of [runStateFromRuntime,runStateFromJupyter,runStateFromOutcome,runStateFromStoreJob,runStateFromCell])
    for(const odd of ['','aborted','__proto__','toString','CANCELLED'])assert.equal(f(odd),'not-observed',f.name+' '+odd);
});

test('same observed outcome gets the same label in the notebook and the site runs',()=>{
  const pairs=[[runStateFromCell('done'),runStateFromOutcome('succeeded')],[runStateFromCell('failed'),runStateFromOutcome('failed')],[runStateFromCell('cancelled'),runStateFromOutcome('cancelled')],[runStateFromCell('unknown'),runStateFromOutcome('unobserved')],[runStateFromRuntime('succeeded'),runStateFromJupyter('ok')],[runStateFromStoreJob('interrupted'),runStateFromCell('interrupted')]];
  for(const [a,b] of pairs)assert.equal(runStateLabel(a),runStateLabel(b));
});

test('the framework module stays pure and both surfaces use it; stored values keep their spelling',async()=>{
  assert.doesNotMatch(await src('../src/framework/compute/run-state.ts'),/^\s*import /m);
  const workbench=await src('../src/framework/foundation/RunWorkbench.tsx');
  assert.match(workbench,/from '\.\.\/compute\/run-state'/);
  assert.match(workbench,/'Outcome not observed \(page reloaded\)'/);
  assert.match(workbench,/data-outcome=\{r\.outcome\}/);
  const notebook=await src('../src/panels/Notebook.tsx');
  assert.match(notebook,/from '\.\.\/framework\/compute\/run-state'/);
  assert.match(notebook,/data-status=\{result\?\.status\?\?'idle'\}/);
  assert.match(await src('../src/panels/NotebookJupyter.tsx'),/data-status=\{j\.status\}/);
});

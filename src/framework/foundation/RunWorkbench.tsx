import {useMemo,useState,useSyncExternalStore} from 'react';
import {useRuntime,useSiteState} from '../hooks';
import {RenderBlock} from '../registry';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {createBrowserHost} from '../../core/host';
import {useRunJournal,useSavedRunHistory} from './RunScope';
import {referenceContext,runContext,type ContextModel} from './context';
import type {RunReference} from './run-history';
import {compareRuns,type RunRecord} from './journal';
import {ArtifactView} from './ArtifactView';
import {ContextInspector} from './ContextInspector';
import {DurableRuns} from './DurableRuns';
import {SavedComparison} from './SavedComparison';
import {runStateFromOutcome,runStateLabel} from '../compute/run-state';
import './foundation.css';
const noRun:ContextModel={id:'no-run',kind:'run history',title:'No run yet',summary:'Choose parameters, then run the task explicitly.',facts:[],references:[],related:[],note:'In-memory history is optional. A visualization change never creates a run.'};
const RESTORED_BADGE='Restored reference, not rerun, result not kept';
const NOT_OBSERVED_REASON='Outcome not observed (page reloaded)';
const outcomeText=(r:RunReference)=>r.outcome==='unobserved'?runStateLabel('not-observed')+': '+NOT_OBSERVED_REASON:runStateLabel(runStateFromOutcome(r.outcome));
/** One label for the same observed outcome as the notebook (F203); the stored status/outcome value is unchanged. */
const StateTag=({status}:{status:string})=>{const state=runStateFromOutcome(status);return <span className="run-state" data-run-state={state}>{runStateLabel(state)}</span>;};
const numberText=(v:unknown)=>v===null?'Unavailable':typeof v==='number'?new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(v):String(v);
function Comparison({records,selected}:{records:readonly RunRecord[];selected:RunRecord}){
  const [preferred,setPreferred]=useState('');
  const choices=records.filter(r=>r.id!==selected.id&&r.status==='succeeded'&&r.taskId===selected.taskId);
  const baseline=choices.find(r=>r.id===preferred)||choices.at(-1);
  if(selected.status!=='succeeded'||!baseline)return <p className="foundation-empty">Complete two runs of the same task to compare their captured inputs and declared metrics.</p>;
  const comparison=compareRuns(baseline,selected);
  return <section className="foundation-comparison" data-testid="run-comparison"><label>Baseline<select aria-label="Comparison baseline" value={baseline.id} onChange={e=>setPreferred(e.target.value)}>{choices.map((run,i)=><option key={run.id} value={run.id}>{i+1}. {run.startedAt} / {runStateLabel(runStateFromOutcome(run.status))}</option>)}</select></label>
    <h3>Captured parameters</h3><table><thead><tr><th>Parameter</th><th>Baseline</th><th>Selected run</th></tr></thead><tbody>{comparison.parameters.map(p=><tr key={p.id} data-changed={p.changed}><th>{p.id}</th><td>{numberText(p.before)}</td><td>{numberText(p.after)}</td></tr>)}</tbody></table>
    <h3>Declared result metrics</h3>{comparison.metrics.length?<table><thead><tr><th>Metric</th><th>Baseline</th><th>Selected</th><th>Difference</th></tr></thead><tbody>{comparison.metrics.map(m=><tr key={m.id}><th>{m.title} {m.unit}</th><td>{numberText(m.before)}</td><td>{numberText(m.after)}</td><td>{numberText(m.delta)}</td></tr>)}</tbody></table>:<p>No retained, schema-compatible metric pair. No automatic unit conversion or aggregation is performed.</p>}
    <p className="foundation-note">Both records use the same declared model, task and provider versions. This is not scientific validation or a performance benchmark.</p>
  </section>;
}
export default function RunWorkbench({resource}:{resource:string}){
  const runtime=useRuntime(),site=useSiteState(),{journal,resource:config}=useRunJournal(resource),saved=useSavedRunHistory(resource);
  const history=useSyncExternalStore(journal.subscribe,journal.getSnapshot,journal.getSnapshot);
  const [tab,setTab]=useState('result'),[taskId,setTaskId]=useState(config.specs[0].taskId),[allowExport,setAllowExport]=useState(false);
  const task=runtime.manifest.tasks.find(t=>t.id===taskId)!,dataset=runtime.manifest.datasets.find(d=>d.id===task.output)!;
  const selected=history.records.find(r=>r.id===history.selectedId);
  // A restored reference is shown, never loaded, compared or exported: it has no result.
  const restored=selected?undefined:history.restored.find(r=>r.id===history.selectedId);
  const context=useMemo(()=>selected?runContext(selected):restored?referenceContext(restored):noRun,[selected,restored]);
  const outline=<div className="foundation-run-list"><h3>Runs</h3><button type="button" aria-pressed={history.followingLatest} onClick={()=>journal.select(null)}>Follow latest</button>{history.records.slice().reverse().map((r,i)=><button type="button" key={r.id} aria-label={'Inspect run '+(history.records.length-i)} aria-pressed={history.selectedId===r.id} onClick={()=>journal.select(r.id)}><strong>{r.taskId} / #{history.records.length-i}</strong><StateTag status={r.status}/><small>{r.startedAt.slice(11,23)}</small></button>)}{!history.records.length&&<p>No task has run.</p>}{history.restored.length>0&&<div className="foundation-restored" data-testid="restored-runs"><h4>Restored after reload</h4>{history.restored.slice().reverse().map((r,i)=><button type="button" key={r.id} data-restored="true" data-outcome={r.outcome} aria-label={'Inspect restored run '+(history.restored.length-i)} aria-pressed={history.selectedId===r.id} onClick={()=>journal.select(r.id)}><strong>{r.taskId} / restored #{history.restored.length-i}</strong><StateTag status={r.outcome}/>{r.outcome==='unobserved'&&<small className="run-state-reason">{NOT_OBSERVED_REASON}</small>}<em className="foundation-badge">{RESTORED_BADGE}</em><small>{r.startedAt.slice(11,23)}</small></button>)}</div>}</div>;
  return <section className="foundation-runs" data-testid="runs" data-run-count={history.records.length} data-restored-count={history.restored.length} data-selected-status={selected?.status||(restored?'restored-'+restored.outcome:'none')}>
    <WorkspaceShell title="Runs and result views" sidebar={outline} sidebarLabel="Run history" inspector={<ContextInspector model={context}/>} inspectorLabel="Run context" tabs={[{id:'result',label:'Result'},{id:'comparison',label:'Compare'},{id:'record',label:'Record'}]} activeTab={tab} onTab={setTab} status={<><span>{history.records.length} retained / {history.evicted} evicted / {history.notCaptured} not captured</span><span>{saved?'Run references saved in this browser (no results) / no automatic publishing':'In-memory history / no automatic publishing or persistence'}</span></>}>
      {saved?.notice&&<p className="foundation-notice" role="status" data-testid="run-history-notice">{saved.notice}</p>}
      <section className="foundation-parameters"><label>Task<select aria-label="Observed task" value={taskId} onChange={e=>setTaskId(e.target.value)}>{config.specs.map(s=><option key={s.taskId} value={s.taskId}>{runtime.manifest.tasks.find(t=>t.id===s.taskId)!.label}</option>)}</select></label><div className="foundation-input-grid">{dataset.inputs.map(id=><RenderBlock key={id} block={{id:'parameter-'+id,type:'input',field:id}}/>)}</div><RenderBlock block={{id:'run-task',type:'task',task:taskId}}/><p className="foundation-note">Current task: {site.tasks[taskId].status}. Below is a captured run, which can differ from current inputs.</p></section>
      {runtime.definition.durableRuns?.[resource]&&<DurableRuns resource={resource} taskId={taskId}/>}
      {tab==='result'&&restored?<p className="foundation-empty" data-testid="restored-result">{RESTORED_BADGE}. {outcomeText(restored)}. Run the task again explicitly to produce a new result.</p>:tab==='comparison'&&restored?<p className="foundation-empty">Restored references cannot be compared: their results were not kept.</p>:tab==='result'?selected?.artifact?<ArtifactView artifact={selected.artifact}/>:<p className="foundation-empty">{selected?selected.status==='running'?'Task running. No result is fabricated while waiting.':selected.message||'This run has no retained artifact.':history.restored.length?`Run the task to produce a result. ${history.restored.length} restored reference${history.restored.length===1?'':'s'} from before the reload ${history.restored.length===1?'is':'are'} listed under Runs: not rerun, result not kept.`:'Run the task to produce a result.'}</p>:tab==='comparison'?selected?<Comparison records={history.records} selected={selected}/>:<p className="foundation-empty">Choose a run first.</p>:<section className="foundation-record"><h3>Explicit export</h3><p>A run record contains captured parameter values, result data and declared model/provider metadata. Saved UI inputs remain separate.</p><label><input type="checkbox" checked={allowExport} onChange={e=>setAllowExport(e.target.checked)}/>I reviewed the captured inputs and result data for sharing.</label><button type="button" disabled={!allowExport||!selected||selected.status==='running'} onClick={()=>{if(selected)createBrowserHost().saveDownload(selected.id+'.json',new Blob([journal.exportRecord(selected.id)],{type:'application/json'}));}}>Export selected run JSON</button><p className="foundation-note">No import executes a task. Use the source validator to inspect external records. Closing the app loses this in-memory journal unless it was exported or a client binds its own approved storage.</p><button type="button" onClick={()=>journal.clear()}>Clear local history</button>{saved&&<><p className="foundation-note">This client saves run references in this browser: ids, captured input values, declared model/provider, outcome and times. Result rows, artifact payloads and task messages are never saved. Restored references are not rerun.</p><button type="button" onClick={()=>saved.reset()}>Reset saved run history</button></>}</section>}
      {tab==='comparison'&&runtime.definition.durableRuns?.[resource]&&<SavedComparison resource={resource} taskId={taskId}/>}
    </WorkspaceShell>
  </section>;
}

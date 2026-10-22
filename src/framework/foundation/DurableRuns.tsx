import {useCallback,useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {useRuntime,useSiteState} from '../hooks';
import {ArtifactView} from './ArtifactView';
import {capabilityReason} from '../compute/adapter';
import {SITE_TASK_CAPABILITIES} from '../compute/site-task';
import type {RuntimeConnection} from '../compute/runtime-client';
import type {RuntimeTask,RuntimeTaskActivity,RuntimeTaskRun} from '../compute/runtime-task';
import {runtimeDisplayLabel} from '../compute/run-state';
import {SiteRunError,SiteRunStore,relinkCandidates,type ReopenedSiteRun,type SavedSiteRun} from '../storage/site-runs';
import type {Scalar} from '../types';

/** F206: opt-in durable runs of a client site (shown only when the client binds `durableRuns[resource]`).
 * Save is explicit and per run; reopen reads the immutable result back by hash and never recomputes. A missing or
 * corrupt result offers Relink (another saved result of the task, chosen by the user) or Run again; no fallback. */
const NOT_RECOMPUTED='Not recomputed: reopened from the result store by hash';
/** S03: after a failed or cancelled run the last valid result stays visible under this label; the failed run itself
 * keeps its own outcome and is never relabelled. */
export const PREVIOUS_RESULT='Previous result — not this run\'s output';
const noLatest={subscribe:()=>()=>{},latest:()=>null,active:()=>null} as const;
const noActivity=()=>null;
const short=(sha:string)=>sha.slice(0,12);
const valuesText=(values:Readonly<Record<string,Scalar>>)=>Object.entries(values).map(([k,v])=>`${k}=${String(v)}`).join(', ')||'no inputs';
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

export function DurableRuns({resource,taskId}:{resource:string;taskId:string}){
  const runtime=useRuntime(),site=useSiteState();
  const binding=runtime.definition.durableRuns![resource]!;
  const app=useMemo(()=>({id:runtime.manifest.id,version:runtime.manifest.version}),[runtime]);
  const [connection,setConnection]=useState<RuntimeConnection|null>(()=>binding.link.get());
  const [pending,setPending]=useState<RuntimeConnection|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [saved,setSaved]=useState<{runs:SavedSiteRun[];otherVersions:number}|null>(null);
  const [listError,setListError]=useState<SiteRunError|null>(null);
  const [opened,setOpened]=useState<ReopenedSiteRun|null>(null);
  const [problem,setProblem]=useState<{entry:SavedSiteRun;error:SiteRunError}|null>(null);
  const [busy,setBusy]=useState(false);

  // Pairing: read #runtime=...&token=... once, remove it from the address bar, and wait for an explicit Connect.
  useEffect(()=>{
    if(typeof location==='undefined'||!/[#&]runtime=/.test(location.hash))return;
    try{const p=binding.link.pending(location.hash);if(p)setPending(p);}catch(error){setNotice('The runtime link is malformed: '+message(error));}
    finally{try{history.replaceState(history.state,'',location.pathname+location.search);}catch{/* address bar unchanged */}}
  },[binding]);

  const store=useMemo(()=>connection?new SiteRunStore(connection):null,[connection]);
  const refresh=useCallback(async()=>{
    if(!store){setSaved(null);return;}
    try{setSaved(await store.list(app));setListError(null);}
    catch(error){setSaved(null);setListError(error instanceof SiteRunError?error:new SiteRunError(message(error),'refused'));}
  },[store,app]);
  useEffect(()=>{void refresh();},[refresh]);

  const handle:RuntimeTask|undefined=binding.tasks.find(t=>t.taskId===taskId);
  const source=handle??noLatest;
  const latest:RuntimeTaskRun|null=useSyncExternalStore(source.subscribe,source.latest,source.latest);
  const activeOf=source.active?()=>source.active!():noActivity;
  const active:RuntimeTaskActivity|null=useSyncExternalStore(source.subscribe,activeOf,activeOf);
  const task=runtime.manifest.tasks.find(t=>t.id===taskId)!,inputs=runtime.manifest.datasets.find(d=>d.id===task.output)!.inputs;
  const status=site.tasks[taskId].status;
  const current=!!latest&&status==='ready'&&inputs.every(id=>Object.is(latest.values[id],site.values[id]));
  const previous=latest&&(status==='error'||status==='cancelled')?latest:null;

  async function save(){
    if(!store||!latest)return;
    setBusy(true);
    try{const receipt=await store.save(app,latest);setNotice(`Saved run ${latest.record.runId} as result ${short(receipt.resultSha256)}. It reopens from the store without recomputation.`);await refresh();}
    catch(error){setNotice('Not saved: '+message(error));}
    finally{setBusy(false);}
  }
  async function reopen(entry:SavedSiteRun){
    if(!store)return;
    setBusy(true);setProblem(null);setOpened(null);
    try{setOpened(await store.open(app,entry));}
    catch(error){setProblem({entry,error:error instanceof SiteRunError?error:new SiteRunError(message(error),'refused')});}
    finally{setBusy(false);}
  }
  function runAgain(entry:SavedSiteRun){
    const values=entry.run?.site.values??{};
    const patch=Object.fromEntries(Object.entries(values).filter(([id])=>inputs.includes(id)));
    try{runtime.patch(patch);setProblem(null);setOpened(null);setNotice(`Running ${entry.taskId} again with ${valuesText(patch)}. The new result is not saved until you save it.`);void runtime.runTask(entry.taskId);}
    catch(error){setNotice('Cannot run again: '+message(error));}
  }

  const browserTaskReason=capabilityReason(SITE_TASK_CAPABILITIES,'durableResult');
  const resultProblem=problem&&['missing','corrupt','mismatch'].includes(problem.error.kind);
  const candidates=problem&&saved?relinkCandidates(saved.runs,problem.entry):[];
  return <section className="foundation-durable" data-testid="durable-runs" data-paired={connection?'true':'false'} data-store={saved?'ready':listError?listError.kind:'none'}>
    <h3>Saved runs</h3>
    {notice&&<p className="foundation-notice" role="status" data-testid="durable-notice">{notice}</p>}
    {pending&&!connection&&<p className="foundation-note" data-testid="durable-consent">Connect this page to the local runtime at {pending.origin}? Its token is kept for this tab only and never saved. <button type="button" onClick={()=>{setConnection(binding.link.connect(pending));setPending(null);setNotice(null);}}>Connect</button></p>}
    {connection?<p className="foundation-note">Runtime {connection.origin} paired for this tab. Saving is off until you press Save for a run. <button type="button" onClick={()=>{binding.link.clear();setConnection(null);setSaved(null);setOpened(null);setProblem(null);}}>Disconnect</button></p>
      :!pending&&<p className="foundation-note">No local runtime is paired. Start it with a result store (--results-dir) and open the link it prints.</p>}
    {listError&&<p className="foundation-notice" role="alert" data-testid="durable-store-error">{listError.message}</p>}
    {handle?<p><button type="button" data-testid="durable-save" disabled={!store||!current||busy} onClick={()=>void save()}>Save this run to the result store</button> <small className="foundation-note">{!latest?'Run the task on the runtime first.':!current?'The latest runtime result does not match the current inputs; run the task again.':`Run ${latest.record.runId}, ${latest.model.title}, model ${latest.record.modelVersion}.`}</small></p>
      :<p className="foundation-note" data-testid="durable-unsupported">Durable result: not available for this task. {browserTaskReason}</p>}
    {active&&<p className="foundation-note" role="status" data-testid="durable-run-state" data-state={active.state}>Latest submit{active.runId?` (run ${active.runId})`:''}: <span className="run-state" data-run-state={active.state}>{runtimeDisplayLabel(active.state)}</span>{active.message?'. '+active.message:''}</p>}
    {previous&&<section className="foundation-previous" data-testid="durable-previous" data-run-id={previous.record.runId}><p><em className="foundation-badge">{PREVIOUS_RESULT}</em> This run did not produce a result. Shown below: run {previous.record.runId}, model {previous.record.modelVersion}, inputs {valuesText(previous.values)}.</p><ArtifactView artifact={previous.artifact}/></section>}
    {saved&&<div data-testid="durable-saved">{saved.runs.length?<ul>{saved.runs.map(r=><li key={r.cellId+r.resultSha256} data-testid="durable-saved-run" data-result-sha={r.resultSha256} data-present={r.present}>
        <strong>{r.taskId}</strong> <small>{r.savedAt} / {r.run?valuesText(r.run.site.values):'no run reference'} / result {short(r.resultSha256)}{r.present?'':' (file missing)'}</small> <button type="button" disabled={busy} onClick={()=>void reopen(r)}>Reopen</button></li>)}</ul>
      :<p className="foundation-note">No saved run for this site yet.</p>}
      {saved.otherVersions>0&&<p className="foundation-note">{saved.otherVersions} saved run{saved.otherVersions===1?' was':'s were'} saved by another version of this site and {saved.otherVersions===1?'is':'are'} not shown.</p>}
      <button type="button" onClick={()=>void refresh()}>Refresh</button></div>}
    {problem&&<div className="foundation-notice" role="alert" data-testid="durable-problem" data-kind={problem.error.kind}><p>{problem.error.message}</p>
      {resultProblem?<>{candidates.length>0&&<div data-testid="durable-relink">Relink to another saved result of {problem.entry.taskId}: {candidates.map(c=><button type="button" key={c.run.resultSha256} onClick={()=>void reopen(c.run)}>{short(c.run.resultSha256)}{c.sameInputs?' (same inputs)':''}</button>)}</div>}
        {problem.entry.run&&<button type="button" data-testid="durable-run-again" onClick={()=>runAgain(problem.entry)}>Run again with the saved inputs</button>}</>
      :<button type="button" onClick={()=>void reopen(problem.entry)}>Try again</button>}</div>}
    {opened&&<section data-testid="durable-reopened" data-result-sha={opened.resultSha256}><p><em className="foundation-badge">{NOT_RECOMPUTED}</em> Run {opened.run.runId}, model {opened.run.model} {opened.run.modelVersion}, finished {opened.finishedAt}, result {short(opened.resultSha256)}. <button type="button" onClick={()=>setOpened(null)}>Close</button></p><ArtifactView artifact={opened.artifact}/></section>}
  </section>;
}

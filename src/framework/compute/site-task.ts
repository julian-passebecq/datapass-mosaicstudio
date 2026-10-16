/** ComputeAdapter over one SiteRuntime task (F202). It only calls patch/runTask/cancelTask/dataset and reads
 * run events; SiteRuntime keeps its own ticket, timeout, supersede and abort logic. */
import type {SiteRuntime} from '../runtime.ts';
import type {TaskRunEvent} from '../task-events.ts';
import type {Rows, Scalar} from '../types.ts';
import {describeCapabilities,errorMessage,refuse,supported,unsupported,type ComputeAdapter,type ComputeInputSpec,type ComputeObservation,type ComputeOutcome,type ComputeSubmitOptions} from './adapter.ts';
import {runStateFromOutcome,type RunState} from './run-state.ts';

export const SITE_TASK_CAPABILITIES=describeCapabilities({
  submit:supported('Runs the task in this page through SiteRuntime.runTask.'),
  progress:supported('A fraction only when the task handler reports one; otherwise the state alone.'),
  cancel:supported('SiteRuntime aborts the task and discards its result.'),
  interrupt:unsupported('A browser task has no kernel to interrupt; Cancel stops it and discards its result.'),
  result:supported('The latest run only, while its declared inputs are unchanged; kept in page memory.'),
  history:unsupported('SiteRuntime keeps no run history; attach a RunJournal to record runs in this page.'),
  durableResult:unsupported('Browser task results stay in page memory; saving them needs an ADR for a new stored result origin.'),
  inputs:supported('The input fields declared by the task output dataset.'),
});

export type SiteTaskAdapter=ComputeAdapter<Readonly<Record<string,Scalar>>,Rows>&{readonly taskId:string};

export function createSiteTaskAdapter(runtime:SiteRuntime,taskId:string):SiteTaskAdapter{
  const task=runtime.manifest.tasks.find(t=>t.id===taskId);
  if(!task)throw new Error('Unknown task: '+taskId);
  const output=runtime.manifest.datasets.find(d=>d.id===task.output)!;
  const declared=new Set(output.inputs);
  const path='site-task' as const,capabilities=SITE_TASK_CAPABILITIES;
  let current:string|null=null,latestSucceeded:string|null=null;
  const runId=(execution:number)=>`${taskId}:${execution}`;

  const inputs=():readonly ComputeInputSpec[]=>runtime.manifest.fields.filter(f=>declared.has(f.id)).map(f=>({id:f.id,label:f.label,type:f.type,...(f.unit===undefined?{}:{unit:f.unit}),...(f.min===undefined?{}:{min:f.min}),...(f.max===undefined?{}:{max:f.max}),default:f.default}));

  async function submit(values:Readonly<Record<string,Scalar>>={},options:ComputeSubmitOptions={}):Promise<ComputeOutcome<Rows>>{
    const unknown=Object.keys(values).filter(k=>!declared.has(k));
    if(unknown.length)throw new Error(`Task ${taskId} does not declare input ${unknown.join(', ')}.`);
    if(options.signal?.aborted)return {runId:runId(0),state:'cancelled',result:null,message:'Stopped before the task started; nothing ran.'};
    if(Object.keys(values).length)runtime.patch(values);
    let execution=0,terminal:TaskRunEvent|null=null;
    // Observers are read-only: only record here; onUpdate is called from the snapshot listener below.
    const stopEvents=runtime.subscribeTaskRuns(event=>{
      if(event.taskId!==taskId)return;
      if(event.phase==='started'){if(!execution)execution=event.execution;return;}
      if(event.execution===execution)terminal=event;
    });
    const stopSnapshot=runtime.subscribe(()=>{
      const state=runtime.getSnapshot().tasks[taskId];
      if(execution&&!terminal&&state.status==='running')options.onUpdate?.({runId:runId(execution),state:'running',progress:state.progress>0?state.progress:null,message:state.message});
    });
    const onAbort=()=>{if(execution&&!terminal&&current===runId(execution))runtime.cancelTask(taskId);};
    options.signal?.addEventListener('abort',onAbort,{once:true});
    try{
      const pending=runtime.runTask(taskId);
      if(execution)current=runId(execution);
      const final=await pending;
      const id=runId(execution);
      if(!execution)return {runId:id,state:'failed',result:null,message:final.message};
      const event=terminal as TaskRunEvent|null;
      const state:RunState=event?runStateFromOutcome(event.phase):'not-observed';
      if(state==='succeeded'){latestSucceeded=id;return {runId:id,state,result:runtime.dataset(output.id),message:final.message};}
      return {runId:id,state,result:null,message:event&&'message' in event?event.message:final.message};
    }catch(error){
      return {runId:runId(execution),state:'failed',result:null,message:errorMessage(error)};
    }finally{
      stopEvents();stopSnapshot();options.signal?.removeEventListener('abort',onAbort);
      if(current===runId(execution))current=null;
    }
  }
  return {
    path,taskId,capabilities,label:task.label,inputs,submit,
    async cancel(id){if(id!==current)throw new Error(`Run ${id} is not running in this page.`);runtime.cancelTask(taskId);},
    async interrupt(){refuse(path,capabilities,'interrupt');},
    async result(id){
      if(id!==latestSucceeded||runtime.getSnapshot().tasks[taskId].status!=='ready')throw new Error(`The result of run ${id} is no longer current (inputs changed or a newer run replaced it). Run the task again.`);
      return runtime.dataset(output.id);
    },
    async history():Promise<readonly ComputeObservation[]>{return refuse(path,capabilities,'history');},
  };
}

/** ComputeAdapter over one model of the trusted local Python runtime (F202). It calls RuntimeClient and
 * waitForRun only; the runtime keeps its own bounded queue (8 active), workers and retained records. */
import type {Artifact} from '../foundation/artifact.ts';
import {describeCapabilities,errorMessage,isAbort,refuse,supported,unsupported,type ComputeAdapter,type ComputeObservation,type ComputeOutcome,type ComputeSubmitOptions} from './adapter.ts';
import {CANCEL_REQUESTED,runStateFromRuntime,runtimeDisplayState} from './run-state.ts';
import {checkInputs,newIdempotencyKey,waitForRun,type RunRecord,type RuntimeClient,type RuntimeModel} from './runtime-client.ts';

export const RUNTIME_RUN_CAPABILITIES=describeCapabilities({
  submit:supported('Submits an allowlisted model run to the local runtime; the browser never sends code.'),
  progress:unsupported('The runtime reports queued, running and the final state only, no progress fraction.'),
  cancel:supported('Asks the runtime to cancel the run; the final state is whatever the runtime reports.'),
  interrupt:unsupported('A runtime model run has no kernel to interrupt; use Cancel.'),
  result:supported('The validated artifact while the runtime retains the run (in memory, cleared at restart).'),
  history:supported('The runs the runtime still retains (at most 50, in memory, cleared at restart).'),
  durableResult:unsupported('The runtime keeps results in memory only; the notebook can save the validated artifact to its result store.'),
  inputs:supported('The numeric inputs and bounds the model declares.'),
});

/** A cancel the runtime accepted but has not confirmed stays `running` (S03); the observation message says so. */
export const CANCEL_REQUESTED_MESSAGE='Cancel requested; waiting for the runtime to confirm.';
const observe=(record:RunRecord):ComputeObservation=>({runId:record.runId,state:runStateFromRuntime(record.status),progress:null,
  message:record.error??(runtimeDisplayState(record.status,record.cancelRequested)===CANCEL_REQUESTED?CANCEL_REQUESTED_MESSAGE:'')});

export type RuntimeRunAdapter=ComputeAdapter<Readonly<Record<string,number>>,Artifact>&{readonly model:RuntimeModel;readonly origin:string};

export function createRuntimeRunAdapter(client:RuntimeClient,model:RuntimeModel,options:{intervalMs?:number;maxPolls?:number}={}):RuntimeRunAdapter{
  const path='runtime-run' as const,capabilities=RUNTIME_RUN_CAPABILITIES;
  async function submit(values:Readonly<Record<string,number>>={},submitOptions:ComputeSubmitOptions={}):Promise<ComputeOutcome<Artifact>>{
    const checked=checkInputs(model,values);
    const {signal,onUpdate}=submitOptions;
    // One Idempotency-Key per user submit; the client reuses it if it has to send this same submit again.
    const submitted=await client.submit(model.id,checked,signal,{idempotencyKey:newIdempotencyKey()});
    onUpdate?.(observe(submitted));
    let final:RunRecord;
    try{final=await waitForRun(client,submitted,{signal,onUpdate:r=>onUpdate?.(observe(r)),intervalMs:options.intervalMs,maxPolls:options.maxPolls});}
    catch(error){
      // Stopping the poll is not a cancellation: the run may still finish on the runtime.
      return {runId:submitted.runId,state:'not-observed',result:null,message:(isAbort(error)?'Stopped following the run; it may still finish on the runtime.':errorMessage(error))};
    }
    const state=runStateFromRuntime(final.status);
    if(state!=='succeeded')return {runId:final.runId,state,result:null,message:final.error??`Run ${final.runId} ended ${final.status}.`};
    return {runId:final.runId,state,result:await client.artifact(final,signal),message:''};
  }
  return {
    path,model,origin:client.origin,capabilities,label:model.title,
    inputs:()=>model.inputs.map(i=>({id:i.id,label:i.label,unit:i.unit??null,type:i.type,min:i.min,max:i.max,default:i.default})),
    submit,
    async cancel(runId){await client.cancel(runId);},
    async interrupt(){refuse(path,capabilities,'interrupt');},
    async result(runId,signal){
      const record=await client.status(runId,signal);
      if(record.status!=='succeeded')throw new Error(`Run ${runId} is ${record.status}; it has no result.`);
      return client.artifact(record,signal);
    },
    async history(signal){return (await client.runs(signal)).filter(r=>r.model===model.id).map(observe);},
  };
}

/** ComputeAdapter over the paired Jupyter kernel (F202). It lives in src/workspace because src/framework
 * (shipped in the SDK) must not import the workbench's JupyterClient. It calls execute/interrupt only. */
import {describeCapabilities,refuse,supported,unsupported,type ComputeAdapter,type ComputeObservation,type ComputeOutcome,type ComputeSubmitOptions} from '../framework/compute/adapter.ts';
import {runStateFromJupyter} from '../framework/compute/run-state.ts';
import type {ExecuteOutcome,JupyterClient} from './jupyter.ts';

export const JUPYTER_KERNEL_CAPABILITIES=describeCapabilities({
  submit:supported('Sends the cell source to the kernel this page paired with.'),
  progress:unsupported('A kernel reports busy and idle plus streamed outputs, no progress fraction.'),
  cancel:unsupported('A kernel execution cannot be cancelled; Interrupt sends KeyboardInterrupt and variables set before it may remain.'),
  interrupt:supported('Asks the Jupyter Server to interrupt the kernel; the reply reports the outcome.'),
  result:unsupported('Outputs arrive with the run; the kernel keeps nothing for the page to fetch again.'),
  history:unsupported('The kernel keeps execution counts only, no run history the page can list.'),
  durableResult:unsupported('Kernel state is lost when it stops; the notebook can save outputs to its result store.'),
  inputs:unsupported('A cell\'s code is its input; it declares no parameters.'),
});

export type JupyterKernelAdapter=ComputeAdapter<string,ExecuteOutcome>;

export function createJupyterAdapter(client:JupyterClient):JupyterKernelAdapter{
  const path='jupyter-kernel' as const,capabilities=JUPYTER_KERNEL_CAPABILITIES;
  const running=new Set<string>();
  return {
    path,capabilities,label:'Jupyter kernel',
    inputs:()=>refuse(path,capabilities,'inputs'),
    async submit(code:string,options:ComputeSubmitOptions={}):Promise<ComputeOutcome<ExecuteOutcome>>{
      if(options.signal?.aborted)return {runId:'',state:'cancelled',result:null,message:'Stopped before the cell was sent to the kernel; nothing ran.'};
      const {id,done}=client.execute(code);
      running.add(id);options.onUpdate?.({runId:id,state:'running',progress:null,message:''});
      // Stopping a kernel run is an explicit interrupt, never a silent detach.
      const onAbort=()=>{void client.interrupt(id).catch(()=>{/* the reply or a disconnect reports the outcome */});};
      options.signal?.addEventListener('abort',onAbort,{once:true});
      try{
        const outcome=await done;
        const state=runStateFromJupyter(outcome.status);
        return {runId:id,state,result:outcome,message:outcome.detail??(outcome.error?`${outcome.error.ename}: ${outcome.error.evalue}`:'')};
      }finally{running.delete(id);options.signal?.removeEventListener('abort',onAbort);}
    },
    async cancel(){refuse(path,capabilities,'cancel');},
    async interrupt(runId){
      if(!running.has(runId))throw new Error(`Execution ${runId} is not running on the kernel.`);
      await client.interrupt(runId);
    },
    async result(){return refuse(path,capabilities,'result');},
    async history():Promise<readonly ComputeObservation[]>{return refuse(path,capabilities,'history');},
  };
}

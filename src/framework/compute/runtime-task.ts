/** F206: a SiteRuntime task handler that runs one allowlisted model on the paired local runtime (`datapass.runtime/1`).
 * It is a binding, not a scheduler: SiteRuntime keeps its ticket, timeout, supersede and abort logic, and the run
 * goes through the F202 runtime-run adapter (RuntimeClient + waitForRun). Abort (Cancel, supersede, timeout) stops
 * following the run AND sends an explicit cancel to the runtime. The browser never sends code.
 *
 * Pairing: the runtime prints `#runtime=<origin>&token=<token>`. The page reads it, removes it from the address bar
 * and asks before connecting; the token is then kept in sessionStorage only (this tab, AD-05), never in saved state. */
import type {Artifact} from '../foundation/artifact.ts';
import type {Rows,TaskContext,Values} from '../types.ts';
import {describeCapabilities,supported,type CapabilityDescriptor} from './adapter.ts';
import {CANCEL_REQUESTED,runStateLabel,runtimeDisplayState,type RuntimeDisplayState} from './run-state.ts';
import {CANCEL_REQUESTED_MESSAGE,RUNTIME_RUN_CAPABILITIES,createRuntimeRunAdapter} from './runtime-run.ts';
import {RuntimeClient,connectionFromHash,runtimeOrigin,validToken,type RunRecord,type RuntimeConnection,type RuntimeModel} from './runtime-client.ts';

export const RUNTIME_LINK_KEY='datapass.site-runtime-link';
export const NOT_PAIRED='No local runtime is paired with this page. Open it with the link the runtime prints (#runtime=...&token=...) and connect.';

/** Same shape as sessionStorage. */
export type SessionPort={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
export type RuntimeLink={
  /** The connection this tab consented to, or null. */
  get():RuntimeConnection|null;
  /** Parse a pairing fragment without connecting. Null when the fragment has none; throws when it is malformed. */
  pending(hash:string):RuntimeConnection|null;
  /** Explicit consent: keep this connection for the tab. */
  connect(connection:RuntimeConnection):RuntimeConnection;
  clear():void;
};

function checked(value:unknown):RuntimeConnection|null{
  if(!value||typeof value!=='object')return null;
  const {origin,token}=value as Record<string,unknown>;
  try{return typeof origin==='string'&&typeof token==='string'&&validToken(token)?{origin:runtimeOrigin(origin),token}:null;}catch{return null;}
}
/** `session` is sessionStorage (or null when unavailable: the connection then lives in page memory only). */
export function createRuntimeLink(session:SessionPort|null):RuntimeLink{
  let memory:RuntimeConnection|null=null,memoryOnly=!session;
  const read=():RuntimeConnection|null=>{
    if(memoryOnly||!session)return memory;
    let raw:string|null=null;
    try{raw=session.getItem(RUNTIME_LINK_KEY);}catch{memoryOnly=true;return memory;}
    if(raw===null){memory=null;return null;}
    let value:RuntimeConnection|null=null;
    try{value=checked(JSON.parse(raw));}catch{value=null;}
    memory=value;
    if(!value)try{session.removeItem(RUNTIME_LINK_KEY);}catch{memoryOnly=true;}
    return value;
  };
  return {
    get:read,
    pending:hash=>connectionFromHash(hash),
    connect(connection){
      const value=checked(connection);
      if(!value)throw new Error('The runtime connection is malformed.');
      memory=value;
      // A failed write must not silently restore the previous runtime on the next read.
      if(session&&!memoryOnly)try{session.setItem(RUNTIME_LINK_KEY,JSON.stringify(value));}catch{memoryOnly=true;}
      // Remove an older persisted pairing before reload whenever the browser still permits it.
      // If removal is denied too, only this page's memory can remain authoritative.
      if(session&&memoryOnly)try{session.removeItem(RUNTIME_LINK_KEY);}catch{/* Storage cannot be revoked across reload. */}
      return value;
    },
    clear(){memory=null;if(session)try{session.removeItem(RUNTIME_LINK_KEY);}catch{memoryOnly=true;}},
  };
}

/** Same as the runtime-run adapter, except that the validated artifact can be saved on request (F206). */
export const RUNTIME_TASK_CAPABILITIES:CapabilityDescriptor=describeCapabilities({
  ...RUNTIME_RUN_CAPABILITIES,
  cancel:supported('Cancel stops the task in this page and sends an explicit cancel to the runtime; the runtime reports the final state.'),
  durableResult:supported('On an explicit Save, the validated artifact and its run reference go to the paired ResultStore as a datapass.cell-result v1 document.'),
});

/** The last run this handler observed to completion. It belongs to `values`; a later input change makes it stale. */
export type RuntimeTaskRun={readonly taskId:string;readonly values:Values;readonly inputs:Readonly<Record<string,number>>;readonly record:RunRecord;readonly artifact:Artifact;readonly model:RuntimeModel;readonly origin:string};
export type RuntimeTask={
  readonly taskId:string;readonly model:string;readonly capabilities:CapabilityDescriptor;
  /** Bind it as `bindings.tasks[taskId]`. */
  readonly handler:(context:TaskContext)=>Promise<Rows>;
  latest():RuntimeTaskRun|null;
  /** What the newest submit of this task looks like right now (display only; cancel-requested included). */
  active?():RuntimeTaskActivity|null;
  subscribe(listener:()=>void):()=>void;
};
/** Display of the newest submit: `cancel-requested` while the runtime accepted a cancel without confirming it. */
export type RuntimeTaskActivity={readonly runId:string|null;readonly state:RuntimeDisplayState;readonly message:string};
export const LATE_RESULT='A newer run or a cancel replaced this run; its late result was not applied.';

/** S03 late-response rule, as a pure gate. Each user submit opens a ticket for its input key; an outcome is published
 * only if its ticket is still the newest one, its input key is still the current one and it was not cancelled. A late,
 * retried, cancelled or out-of-order response never wins by arriving last. It schedules nothing. */
export type OutcomeTicket={readonly ticket:number;readonly inputKey:string};
export type OutcomeGate={open(inputKey:string):OutcomeTicket;cancel(ticket:OutcomeTicket):void;accepts(ticket:OutcomeTicket,currentInputKey?:string):boolean;current():OutcomeTicket|null};
export function createOutcomeGate():OutcomeGate{
  let sequence=0,current:OutcomeTicket|null=null;
  const cancelled=new WeakSet<OutcomeTicket>();
  return Object.freeze({
    open(inputKey:string){current=Object.freeze({ticket:++sequence,inputKey});return current;},
    cancel(ticket:OutcomeTicket){cancelled.add(ticket);},
    accepts(ticket:OutcomeTicket,currentInputKey?:string){
      return current!==null&&ticket===current&&!cancelled.has(ticket)&&(currentInputKey===undefined||currentInputKey===ticket.inputKey);
    },
    current:()=>current,
  });
}
/** Input key of a submit: the model and its inputs, keys sorted. */
export const inputKey=(model:string,inputs:Readonly<Record<string,number>>)=>JSON.stringify([model,Object.keys(inputs).sort().map(k=>[k,inputs[k]])]);
type ClientOptions=ConstructorParameters<typeof RuntimeClient>[1];
export type RuntimeTaskOptions={
  taskId:string;model:string;link:RuntimeLink;
  /** Map the task's declared field values to the model inputs. Default: the fields named like the model inputs. */
  inputs?:(values:Values,model:RuntimeModel)=>Record<string,number>;
  client?:ClientOptions;intervalMs?:number;maxPolls?:number;
};
const defaultInputs=(values:Values,model:RuntimeModel)=>Object.fromEntries(model.inputs.filter(i=>typeof values[i.id]==='number').map(i=>[i.id,values[i.id] as number]));
const freeze=<T>(value:T):T=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};

export function createRuntimeTask(options:RuntimeTaskOptions):RuntimeTask{
  const {taskId,model:modelId,link}=options;
  let client:RuntimeClient|null=null,key='',model:Promise<RuntimeModel>|null=null,latest:RuntimeTaskRun|null=null,active:RuntimeTaskActivity|null=null;
  const listeners=new Set<()=>void>();
  const clientFor=(connection:RuntimeConnection)=>{
    const k=connection.origin+' '+connection.token;
    if(!client||k!==key){client=new RuntimeClient(connection,options.client);key=k;model=null;}
    return client;
  };
  const modelFor=(c:RuntimeClient,signal:AbortSignal)=>{
    model??=c.models(signal).then(list=>{
      const found=list.find(m=>m.id===modelId);
      if(!found)throw new Error(`The paired runtime does not offer the model ${modelId}.`);
      return found;
    });
    model.catch(()=>{model=null;});
    return model;
  };
  const gate=createOutcomeGate();
  const cancelAnswer=(r:RunRecord)=>r.status==='cancelled'?'The runtime confirmed the cancel.'
    :r.status==='queued'||r.status==='running'?(r.cancelRequested?'The runtime accepted the cancel and has not confirmed it yet.':'The runtime did not report the cancel request (older runtime); the run may still finish there.')
    :`The run had already ended on the runtime (${r.status}); this page does not apply its result.`;
  const notify=()=>{for(const fn of [...listeners])try{fn();}catch{/* presentation only */}};
  const show=(ticket:OutcomeTicket,next:RuntimeTaskActivity)=>{if(gate.current()===ticket){active=freeze(next);notify();}};
  async function handler({values,signal}:TaskContext):Promise<Rows>{
    const connection=link.get();
    if(!connection)throw new Error(NOT_PAIRED);
    const c=clientFor(connection),m=await modelFor(c,signal);
    const inputs=(options.inputs??defaultInputs)(values,m);
    const ticket=gate.open(inputKey(m.id,inputs));
    let runId:string|null=null;
    show(ticket,{runId:null,state:'queued',message:'Submitting to the runtime.'});
    // Following stops with the signal; the run itself is cancelled on the runtime by an explicit request, and the
    // outcome of this ticket can no longer be published, whatever arrives later.
    const cancel=()=>{
      gate.cancel(ticket);
      if(!runId){show(ticket,{runId:null,state:'not-observed',message:'Stopped before the runtime answered the submit; if it accepted the run, it may still finish there.'});return;}
      const id=runId;
      show(ticket,{runId:id,state:CANCEL_REQUESTED,message:'Cancel sent; waiting for the runtime to confirm.'});
      void c.cancel(id).then(r=>show(ticket,{runId:id,state:runtimeDisplayState(r.status,r.cancelRequested),message:cancelAnswer(r)}),
        ()=>show(ticket,{runId:id,state:'not-observed',message:'The cancel request did not reach the runtime; the run may still finish there.'}));
    };
    signal.addEventListener('abort',cancel,{once:true});
    try{
      const outcome=await createRuntimeRunAdapter(c,m,{intervalMs:options.intervalMs,maxPolls:options.maxPolls}).submit(inputs,{signal,onUpdate:o=>{runId=o.runId;if(!signal.aborted)show(ticket,{runId:o.runId,state:o.message===CANCEL_REQUESTED_MESSAGE?CANCEL_REQUESTED:o.state,message:o.message});}});
      if(signal.aborted)throw new Error('Task stopped; a cancel request was sent to the runtime.');
      show(ticket,{runId:outcome.runId,state:outcome.state,message:outcome.message});
      if(outcome.state!=='succeeded'||!outcome.result)throw new Error(outcome.message||`The runtime run ${outcome.runId} ended: ${runStateLabel(outcome.state)}.`);
      const artifact=outcome.result;
      if(artifact.payload.kind!=='table')throw new Error(`The runtime artifact ${artifact.id} has no table for task ${taskId}.`);
      const record=await c.status(outcome.runId,signal);
      if(record.status!=='succeeded')throw new Error(`Run ${record.runId} is ${record.status} on the runtime.`);
      // Late-response rule: only the current ticket with the current inputs, never a cancelled one, is published.
      if(signal.aborted||record.cancelRequested||!gate.accepts(ticket,inputKey(m.id,inputs)))throw new Error(LATE_RESULT);
      latest=freeze({taskId,values:{...values},inputs:{...inputs},record,artifact,model:m,origin:c.origin});
      notify();
      return artifact.payload.rows;
    }catch(error){
      // A submit the runtime never accepted (unreachable, refused, conflict) is shown as this submit's failure.
      if(!signal.aborted&&runId===null)show(ticket,{runId:null,state:'failed',message:'The submit failed: '+(error instanceof Error?error.message:String(error))});
      throw error;
    }finally{signal.removeEventListener('abort',cancel);}
  }
  return Object.freeze({taskId,model:modelId,capabilities:RUNTIME_TASK_CAPABILITIES,handler,latest:()=>latest,active:()=>active,
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}});
}

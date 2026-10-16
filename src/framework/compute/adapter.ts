/**
 * ComputeAdapter (F202): one capability descriptor over the compute paths that already exist. It is a
 * description plus thin wrappers, NOT an executor: no queue, scheduler, retry, process or progress clock.
 * Each wrapper only calls the path's own API (SiteRuntime.runTask/cancelTask, RuntimeClient,
 * JupyterClient.interrupt, loadHttpArtifact, loadArtifact/onArtifactChanged).
 *
 * Rule: a capability the path does not have is reported `{supported:false, reason}` and calling it throws
 * UnsupportedCapabilityError with that reason. Nothing is simulated (no fake progress, no fake cancel).
 * Run states use the F203 vocabulary (run-state.ts).
 */
import type {RunState} from './run-state.ts';

export const COMPUTE_CAPABILITIES=['submit','progress','cancel','interrupt','result','history','durableResult','inputs'] as const;
export type ComputeCapability=typeof COMPUTE_CAPABILITIES[number];
/** User-facing names, so a missing control can say which one is missing. */
export const COMPUTE_CAPABILITY_LABELS:Readonly<Record<ComputeCapability,string>>={
  submit:'Run',progress:'Progress',cancel:'Cancel',interrupt:'Interrupt',result:'Fetch result',history:'Run history',durableResult:'Durable result',inputs:'Declared inputs',
};
export const COMPUTE_PATHS=['site-task','runtime-run','jupyter-kernel','http-source','live-file'] as const;
export type ComputePathKind=typeof COMPUTE_PATHS[number];

export type Capability={readonly supported:true;readonly note?:string}|{readonly supported:false;readonly reason:string};
export type CapabilityDescriptor=Readonly<Record<ComputeCapability,Capability>>;

const REASON_CHARS=300;
const text=(value:unknown,label:string):string=>{
  if(typeof value!=='string'||!value.trim()||value.length>REASON_CHARS)throw new Error(`A compute capability ${label} must be 1-${REASON_CHARS} characters.`);
  return value;
};
export const supported=(note?:string):Capability=>Object.freeze(note===undefined?{supported:true as const}:{supported:true as const,note:text(note,'note')});
/** An unsupported capability always carries the reason shown to the user. */
export const unsupported=(reason:string):Capability=>Object.freeze({supported:false as const,reason:text(reason,'reason')});

/** Validate and freeze a descriptor: every capability is declared, and every unsupported one has a reason. */
export function describeCapabilities(entries:Record<ComputeCapability,Capability>):CapabilityDescriptor{
  if(!entries||typeof entries!=='object')throw new Error('A compute capability descriptor must be an object.');
  const extra=Object.keys(entries).filter(k=>!(COMPUTE_CAPABILITIES as readonly string[]).includes(k));
  if(extra.length)throw new Error('Unknown compute capability: '+extra.join(', '));
  const out={} as Record<ComputeCapability,Capability>;
  for(const key of COMPUTE_CAPABILITIES){
    const c=entries[key] as Capability|undefined;
    if(!c||typeof c!=='object'||typeof c.supported!=='boolean')throw new Error(`Compute capability "${key}" is not declared.`);
    out[key]=c.supported?supported(c.note):unsupported(c.reason);
  }
  return Object.freeze(out);
}

export class UnsupportedCapabilityError extends Error{
  readonly path:ComputePathKind;readonly capability:ComputeCapability;readonly reason:string;
  constructor(path:ComputePathKind,capability:ComputeCapability,reason:string){
    super(`${COMPUTE_CAPABILITY_LABELS[capability]} is not available for ${path}: ${reason}`);
    this.name='UnsupportedCapabilityError';this.path=path;this.capability=capability;this.reason=reason;
  }
}
/** The reason a capability is missing, or null when it is supported. */
export function capabilityReason(descriptor:CapabilityDescriptor,capability:ComputeCapability):string|null{
  const c=descriptor[capability];return c.supported?null:c.reason;
}
/** Throw the declared reason. Used by wrappers for every capability their path lacks. */
export function refuse(path:ComputePathKind,descriptor:CapabilityDescriptor,capability:ComputeCapability):never{
  const c=descriptor[capability];
  throw new UnsupportedCapabilityError(path,capability,c.supported?'The adapter declared it but did not implement it.':c.reason);
}
/** Unsupported capabilities with their reasons, in descriptor order (for a "what this source cannot do" list). */
export function missingCapabilities(descriptor:CapabilityDescriptor):{capability:ComputeCapability;label:string;reason:string}[]{
  return COMPUTE_CAPABILITIES.flatMap(capability=>{const c=descriptor[capability];return c.supported?[]:[{capability,label:COMPUTE_CAPABILITY_LABELS[capability],reason:c.reason}];});
}

/** What an adapter observed about one run. `progress` is null unless the path itself reported a fraction. */
export type ComputeObservation={readonly runId:string;readonly state:RunState;readonly progress:number|null;readonly message:string};
export type ComputeOutcome<R>={readonly runId:string;readonly state:RunState;readonly result:R|null;readonly message:string};
/** `signal` stops following the run. Whether the run itself stops depends on the path (see `cancel`). */
export type ComputeSubmitOptions={readonly signal?:AbortSignal;readonly onUpdate?:(observation:ComputeObservation)=>void};
export type ComputeInputSpec={readonly id:string;readonly label:string;readonly unit?:string|null;readonly type?:string;readonly min?:number;readonly max?:number;readonly default?:unknown};

/**
 * The shared surface. Every method exists on every adapter; a method whose capability is unsupported throws
 * UnsupportedCapabilityError with the declared reason, so callers check `capabilities` first.
 */
export interface ComputeAdapter<I=unknown,R=unknown>{
  readonly path:ComputePathKind;
  readonly label:string;
  readonly capabilities:CapabilityDescriptor;
  inputs():readonly ComputeInputSpec[];
  submit(inputs:I,options?:ComputeSubmitOptions):Promise<ComputeOutcome<R>>;
  cancel(runId:string):Promise<void>;
  interrupt(runId:string):Promise<void>;
  result(runId:string,signal?:AbortSignal):Promise<R>;
  history(signal?:AbortSignal):Promise<readonly ComputeObservation[]>;
}
export const isAbort=(error:unknown):boolean=>(error as Error)?.name==='AbortError'||(error as {kind?:unknown})?.kind==='aborted';
export const errorMessage=(error:unknown):string=>error instanceof Error?error.message:String(error);

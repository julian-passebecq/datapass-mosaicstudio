/** Selection-binding consumer helpers over the frozen `datapass.engineering/1` contract (spec/engineering/v1).
 * Pure: no React, store, scheduler or renderer. A binding is only ever read from a validated record; the framework never
 * infers one from similar signal or entity IDs (a signal absent from the record is unmapped). */
import {digest,validateEngineering,type Binding,type BindingStatus,type Digest,type SelectionBinding} from './contract.ts';

/** Keys that are view state, never design identity. Removed at every depth before the design digest is computed. */
export const VIEW_STATE_KEYS=Object.freeze(['camera','selection','isolate','explode','timeCursor','viewToken'] as const);
export type BindingResolution={readonly signal:string;readonly entityId:string|null;readonly status:BindingStatus;readonly source:string|null};

/** Validates a selection-binding record with validateEngineering and refuses every other kind. Throws EngineeringError. */
export function readSelectionBinding(input:unknown):SelectionBinding{
  const record=validateEngineering(input);
  if(record.kind!=='selection-binding')throw new TypeError('Expected a selection-binding record, got '+record.kind);
  return record;
}
function bindingList(bindings:SelectionBinding|readonly Binding[]):readonly Binding[]{
  if(!Array.isArray(bindings))return readSelectionBinding(bindings).bindings;
  // A bare list gets the same per-binding and uniqueness rules as a record: wrap it in a placeholder envelope.
  readSelectionBinding({format:'datapass.engineering',version:1,kind:'selection-binding',entityId:'binding-check',
    geometryRevision:{alg:'sha256',over:'bytes',value:'0'.repeat(64)},viewToken:'binding-check',bindings});
  return bindings;
}
/** Exact lookup of one signal. A signal the record does not list is `unmapped`, never matched by name. */
export function resolveBinding(signal:string,bindings:SelectionBinding|readonly Binding[]):BindingResolution{
  const found=bindingList(bindings).find(b=>b.signal===signal);
  if(!found)return Object.freeze({signal,entityId:null,status:'unmapped',source:null});
  return Object.freeze({signal,entityId:found.entityId,status:found.status,source:found.source??null});
}
/** Animation policy of the contract: unmapped never; inferred only after an explicit consumer opt-in; sourced yes. */
export function mayAnimate(binding:Pick<Binding,'entityId'|'status'>,options:{inferredOptIn:boolean}):boolean{
  if(binding.entityId===null)return false;
  if(binding.status==='sourced')return true;
  if(binding.status==='inferred')return options.inferredOptIn===true;
  return false;
}
function withoutViewState(value:unknown):unknown{
  if(Array.isArray(value))return value.map(withoutViewState);
  if(value!==null&&typeof value==='object'){
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null)return value; // canonicalJson refuses it with DP-ENG-016
    const out:Record<string,unknown>={};
    for(const [k,v] of Object.entries(value))if(!(VIEW_STATE_KEYS as readonly string[]).includes(k))out[k]=withoutViewState(v);
    return out;
  }
  return value;
}
/** `datapass-c14n/1` digest of a design with every view-state key removed: camera, selection, isolate, explode,
 * timeCursor and viewToken changes never change it. */
export function designDigest(design:unknown):Digest{return digest(withoutViewState(design));}


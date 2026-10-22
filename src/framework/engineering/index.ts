/** `datapass.engineering/1` sidecar contract (spec/engineering/v1). Pure: importing it loads no React, storage or compute. */
export {ENGINEERING_FORMAT,ENGINEERING_VERSION,ENGINEERING_CONTRACT,C14N,ENGINEERING_KINDS,RUN_STATUSES,BINDING_STATUSES,ENGINEERING_LIMITS,APPROVAL_STATE_KEYS,
  ENGINEERING_CODES,ENGINEERING_SUMMARIES,EngineeringError,canonicalJson,canonicalBytes,sha256Hex,digest,bytesDigest,digestAsync,validateEngineering,engineeringDecision,engineeringSchema} from './contract.ts';
export type {EngineeringKind,RunStatus,BindingStatus,Digest,ArtifactRef,RunReceipt,Binding,SelectionBinding,ApprovalRequest,ScalarValue,ParameterChange,ParameterDiff,
  EngineeringRecord,EngineeringRule,EngineeringCode,EngineeringDecision} from './contract.ts';
export {VIEW_STATE_KEYS,readSelectionBinding,resolveBinding,mayAnimate,designDigest,type BindingResolution} from './binding.ts';

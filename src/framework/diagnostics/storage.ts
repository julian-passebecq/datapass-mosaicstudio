import type {DiagnosticEntry} from './types.ts';

/** DP-STO-nnn: workspace, run and result storage. F205 owns 001-009 (cross-tab workspace revisions); F206-F207 append after. */
export const STO_DIAGNOSTICS:readonly DiagnosticEntry[]=[
  {code:'DP-STO-001',gate:'workspace-revision',rule:'workspace-conflict',summary:'Another tab or writer saved the workspace after this tab loaded it; nothing is written until the user keeps theirs, keeps mine or exports both.',languages:['ts']},
  {code:'DP-STO-002',gate:'workspace-revision',rule:'revision-sidecar-mismatch',summary:'The revision sidecar is missing, unreadable or does not describe the stored document (an older studio or an unknown writer saved it).',languages:['ts']},
  {code:'DP-STO-003',gate:'workspace-revision',rule:'theirs-invalid',summary:'The other writer\'s workspace failed validation, so it was not taken; this tab and the conflict are unchanged.',languages:['ts']},
];

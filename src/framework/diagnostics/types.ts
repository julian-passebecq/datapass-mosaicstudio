/** One row of the shared diagnostic table (docs/contracts/diagnostic-codes.json, docs/DIAGNOSTIC_CODES.md). */
export type DiagnosticEntry={
  /** Stable code `DP-<AREA>-nnn`; never renumbered or reused. */
  readonly code:string;
  /** Validator gate (artifact codes) or the check family that reports it. */
  readonly gate:string;
  /** Short kebab-case rule name; the rule, not the message, owns the code. */
  readonly rule:string;
  readonly summary:string;
  /** Validators that report this code: 'ts' (src/framework) and/or 'py' (py/datapass_artifact.py). */
  readonly languages:readonly ('ts'|'py')[];
};

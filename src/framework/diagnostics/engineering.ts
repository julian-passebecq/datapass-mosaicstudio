import type {DiagnosticEntry} from './types.ts';
import {ENGINEERING_CODES,ENGINEERING_SUMMARIES,type EngineeringRule} from '../engineering/contract.ts';

/** DP-ENG-nnn: `datapass.engineering/1` sidecar records and `datapass-c14n/1`. The table lives in the self-contained
 *  src/framework/engineering/contract.ts (vendored by consumers) and is mirrored by ENGINEERING_CODES in
 *  py/datapass_engineering.py; py/test_datapass_engineering.py checks the Python table against the contract. */
export const ENG_DIAGNOSTICS:readonly DiagnosticEntry[]=(Object.keys(ENGINEERING_CODES) as EngineeringRule[]).map(rule=>({
  code:ENGINEERING_CODES[rule][0],gate:ENGINEERING_CODES[rule][1],rule,summary:ENGINEERING_SUMMARIES[rule],languages:['ts','py'] as const,
}));

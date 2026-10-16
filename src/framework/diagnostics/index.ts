/** Stable diagnostic codes shared by the TypeScript and Python validators. Pure data; no side effects on import.
 *  Generated contract: docs/contracts/diagnostic-codes.json (npm run contracts). Reference: docs/DIAGNOSTIC_CODES.md. */
import {ARTIFACT_DIAGNOSTICS} from './artifact.ts';
import {ENV_DIAGNOSTICS} from './env.ts';
import {CLI_DIAGNOSTICS} from './client.ts';
import {STO_DIAGNOSTICS} from './storage.ts';
import {BUN_DIAGNOSTICS} from './bundle.ts';
import type {DiagnosticEntry} from './types.ts';

export type {DiagnosticEntry} from './types.ts';
export {ART,ARTIFACT_DIAGNOSTICS} from './artifact.ts';
export type {ArtifactCode} from './artifact.ts';
export {ENV_DIAGNOSTICS} from './env.ts';
export {CLI_DIAGNOSTICS} from './client.ts';
export {STO_DIAGNOSTICS} from './storage.ts';
export {BUN_DIAGNOSTICS} from './bundle.ts';

/** Code prefixes and the area that owns each. A prefix is reserved even while its table is empty. */
export const DIAGNOSTIC_PREFIXES=Object.freeze({
  'DP-ART':'datapass.artifact v1 validators (TypeScript and Python)',
  'DP-ENV':'doctor: author and consumer environment checks',
  'DP-CLI':'client profile and client checks',
  'DP-STO':'workspace, run and result storage',
  'DP-BUN':'export bundles',
} as const);
const CODE=/^DP-(ART|ENV|CLI|STO|BUN)-\d{3}$/;
const RULE=/^[a-z][a-z0-9-]*$/;

/** Every code, checked once at import: unique, well formed and under the prefix of its table. */
export const DIAGNOSTICS:readonly DiagnosticEntry[]=(()=>{
  const tables:[string,readonly DiagnosticEntry[]][]=[['DP-ART',ARTIFACT_DIAGNOSTICS],['DP-ENV',ENV_DIAGNOSTICS],['DP-CLI',CLI_DIAGNOSTICS],['DP-STO',STO_DIAGNOSTICS],['DP-BUN',BUN_DIAGNOSTICS]];
  const seen=new Set<string>();const all:DiagnosticEntry[]=[];
  for(const [prefix,rows] of tables)for(const row of rows){
    if(!CODE.test(row.code)||!row.code.startsWith(prefix+'-')||seen.has(row.code)||!RULE.test(row.rule))throw new Error('Invalid or duplicate diagnostic code '+row.code);
    seen.add(row.code);all.push(Object.freeze({...row,languages:Object.freeze([...row.languages])}));
  }
  return Object.freeze(all);
})();
const byCode=new Map(DIAGNOSTICS.map(row=>[row.code,row]));
/** The table row for a code, or undefined for an unknown code. */
export function diagnostic(code:string):DiagnosticEntry|undefined{return byCode.get(code);}

/** The published contract (docs/contracts/diagnostic-codes.json); py/test_diagnostic_codes.py checks the Python table against it. */
export const diagnosticCodesContract=Object.freeze({
  format:'datapass.diagnostic-codes',version:1,
  note:'Stable codes: a code names a rule and is never renumbered or reused. Message text is not part of the contract and may differ between languages. Generated from src/framework/diagnostics by npm run contracts.',
  prefixes:DIAGNOSTIC_PREFIXES,
  codes:DIAGNOSTICS,
});

import type {DiagnosticEntry} from './types.ts';

/** DP-BUN-nnn: export bundles (`datapass.bundle` v1, candidate). F208 owns this file. The rule names are mirrored by
 *  BUNDLE_CODES in py/datapass_bundle.py; py/test_datapass_bundle.py checks the two tables against the contract. */
export const BUN_DIAGNOSTICS:readonly DiagnosticEntry[]=[
  {code:'DP-BUN-001',gate:'envelope',rule:'bundle-envelope',summary:'The bundle is not one bounded JSON object with format datapass.bundle, version 1, status candidate and exactly the documented keys.',languages:['ts','py']},
  {code:'DP-BUN-002',gate:'files',rule:'file-entry',summary:'A file entry has an unknown or duplicate path, an unknown media type, extra keys or text that is not well-formed UTF-8.',languages:['ts','py']},
  {code:'DP-BUN-003',gate:'hashes',rule:'file-hash',summary:'A file\'s declared sha256 or byte length does not match the SHA-256 of its exact UTF-8 text.',languages:['ts','py']},
  {code:'DP-BUN-004',gate:'hashes',rule:'sha256sums',summary:'SHA256SUMS is missing or is not exactly one "<sha256>  <path>" line per other file, sorted by path.',languages:['ts','py']},
  {code:'DP-BUN-005',gate:'members',rule:'missing-member',summary:'runs.json, inputs.json, lineage.json or at least one artifacts/<id>.json file is missing.',languages:['ts','py']},
  {code:'DP-BUN-006',gate:'members',rule:'member-invalid',summary:'runs.json, inputs.json or lineage.json is not valid JSON of its documented shape.',languages:['ts','py']},
  {code:'DP-BUN-007',gate:'members',rule:'artifact-invalid',summary:'An artifacts/<id>.json file is not a valid datapass.artifact v1 document named after its id (the artifact code is reported alongside).',languages:['ts','py']},
  {code:'DP-BUN-008',gate:'members',rule:'reference-broken',summary:'A run, input set or lineage entry names an artifact, path, hash or run that the bundle does not contain.',languages:['ts','py']},
  {code:'DP-BUN-009',gate:'secrets',rule:'secret-key',summary:'A JSON member has a token-shaped key (token, secret, password, api key, authorization, cookie, credential, private key).',languages:['ts','py']},
  {code:'DP-BUN-010',gate:'secrets',rule:'secret-value',summary:'A file would contain the in-memory runtime token; the export is refused before any byte is written.',languages:['ts']},
];

import type {DiagnosticEntry} from './types.ts';

/** Stable codes of the `datapass.artifact` v1 validators (TypeScript `validateArtifact` and `py/datapass_artifact.py`).
 *  A code names a rule, not a message: message text may differ between languages and may be reworded, the code may not.
 *  Never renumber or reuse a code; retire it by leaving it in the table. Documented in docs/DIAGNOSTIC_CODES.md. */
export const ART={
  // envelope
  inertJson:'DP-ART-001',structureBudget:'DP-ART-002',byteBudget:'DP-ART-003',
  // structure (each has an exact counterpart in docs/contracts/artifact.schema.json)
  expectedObject:'DP-ART-010',unexpectedField:'DP-ART-011',missingField:'DP-ART-012',format:'DP-ART-013',version:'DP-ART-014',
  invalidId:'DP-ART-015',invalidText:'DP-ART-016',integerRange:'DP-ART-017',enumValue:'DP-ART-018',expectedArray:'DP-ART-019',
  listBudget:'DP-ART-020',duplicateListId:'DP-ART-021',evidencePath:'DP-ART-022',inputHash:'DP-ART-023',inputValue:'DP-ART-024',
  nullableFlag:'DP-ART-025',rowCellBudget:'DP-ART-026',rowCellName:'DP-ART-027',rowCellValue:'DP-ART-028',payloadKind:'DP-ART-029',
  representationKind:'DP-ART-030',
  // semantic (JSON Schema accepts these)
  evidenceRange:'DP-ART-040',evidenceDuplicate:'DP-ART-041',inputDuplicate:'DP-ART-042',dependsOnSelf:'DP-ART-043',columnDuplicate:'DP-ART-044',
  rowKeyUndeclared:'DP-ART-045',rowUndeclaredCell:'DP-ART-046',rowMissingCell:'DP-ART-047',cellType:'DP-ART-048',rowKeyInvalid:'DP-ART-049',
  representationDuplicate:'DP-ART-050',representationInput:'DP-ART-051',textNeedsText:'DP-ART-052',needsTable:'DP-ART-053',chartX:'DP-ART-054',
  chartY:'DP-ART-055',chartXNumber:'DP-ART-056',metricColumn:'DP-ART-057',metricRow:'DP-ART-058',derivedManifest:'DP-ART-059',
  // artifact sets (published together)
  setDuplicateId:'DP-ART-060',setCycle:'DP-ART-061',
} as const;
export type ArtifactCode=typeof ART[keyof typeof ART];

const e=(code:ArtifactCode,gate:DiagnosticEntry['gate'],rule:string,summary:string,languages:DiagnosticEntry['languages']=['ts','py']):DiagnosticEntry=>({code,gate,rule,summary,languages});
export const ARTIFACT_DIAGNOSTICS:readonly DiagnosticEntry[]=[
  e(ART.inertJson,'envelope','inert-json','Not inert finite JSON: a non-finite number, a non-JSON value, a cycle, a prototype key (__proto__, prototype, constructor) or text that does not parse as JSON.'),
  e(ART.structureBudget,'envelope','structure-budget','JSON structure budget exceeded (depth above 24 or more than 500 000 nodes).'),
  e(ART.byteBudget,'envelope','byte-budget','More than 1 MiB of compact UTF-8 JSON.'),
  e(ART.expectedObject,'structure','expected-object','An object is required at this position.'),
  e(ART.unexpectedField,'structure','unexpected-field','A field the schema does not declare (additionalProperties: false).'),
  e(ART.missingField,'structure','missing-field','A required field is absent.'),
  e(ART.format,'structure','format','format is not "datapass.artifact".'),
  e(ART.version,'structure','version','version is not 1.'),
  e(ART.invalidId,'structure','invalid-id','Not an id (^[a-z][a-zA-Z0-9_-]{0,79}$, not constructor/prototype/__proto__).'),
  e(ART.invalidText,'structure','invalid-text','Not a string, too many Unicode code points, or blank where text must be filled.'),
  e(ART.integerRange,'structure','integer-range','Not an integer within the allowed range.'),
  e(ART.enumValue,'structure','enum-value','Not one of the allowed values (provenance kind, producer kind, column type, chart).'),
  e(ART.expectedArray,'structure','expected-array','An array is required at this position.'),
  e(ART.listBudget,'structure','list-budget','A list has fewer or more items than allowed.'),
  e(ART.duplicateListId,'structure','duplicate-list-id','An id list (dependsOn, representation inputs) repeats an id (uniqueItems).'),
  e(ART.evidencePath,'structure','evidence-path','Evidence path is not a safe relative path (forward slashes, no drive, no "..", no empty or "." segment, at most 260 characters).'),
  e(ART.inputHash,'structure','input-hash','inputHash is not 64 lowercase hex characters (sha256).'),
  e(ART.inputValue,'structure','input-value','An input value is not a finite number, a boolean or a string of at most 400 characters.'),
  e(ART.nullableFlag,'structure','nullable-flag','column.nullable is not a boolean.'),
  e(ART.rowCellBudget,'structure','row-cell-budget','A row has more cells than the column budget.'),
  e(ART.rowCellName,'structure','row-cell-name','A row cell name is not a column id.'),
  e(ART.rowCellValue,'structure','row-cell-value','A cell is not null, a boolean, a finite number or a string of at most 4000 characters.'),
  e(ART.payloadKind,'structure','payload-kind','Unknown payload kind (table or text).'),
  e(ART.representationKind,'structure','representation-kind','Unsupported representation kind (table, chart, metric, text or json).'),
  e(ART.evidenceRange,'semantic','evidence-range','Evidence line range ends before it starts.'),
  e(ART.evidenceDuplicate,'semantic','evidence-duplicate','The same evidence path and line range is listed twice.'),
  e(ART.inputDuplicate,'semantic','input-duplicate','Two provenance inputs share an id.'),
  e(ART.dependsOnSelf,'semantic','depends-on-self','An artifact lists itself in dependsOn.'),
  e(ART.columnDuplicate,'semantic','column-duplicate','Two columns share an id.'),
  e(ART.rowKeyUndeclared,'semantic','row-key-undeclared','rowKey is not a declared column.'),
  e(ART.rowUndeclaredCell,'semantic','row-undeclared-cell','A row has a cell for an undeclared column.'),
  e(ART.rowMissingCell,'semantic','row-missing-cell','A row lacks a cell for a declared column.'),
  e(ART.cellType,'semantic','cell-type','A cell does not match its column type (or is null in a non-nullable column).'),
  e(ART.rowKeyInvalid,'semantic','row-key-invalid','A row key is missing, not a string or number, or duplicated.'),
  e(ART.representationDuplicate,'semantic','representation-duplicate','Two representations share an id.'),
  e(ART.representationInput,'semantic','representation-input','A representation names an input that provenance does not declare.'),
  e(ART.textNeedsText,'semantic','text-needs-text','A text representation needs a text payload.'),
  e(ART.needsTable,'semantic','needs-table','A table, chart or metric representation needs a table payload.'),
  e(ART.chartX,'semantic','chart-x','Chart x names an unknown column.'),
  e(ART.chartY,'semantic','chart-y','Chart y is not a number column.'),
  e(ART.chartXNumber,'semantic','chart-x-number','Line or scatter chart x is not a number column.'),
  e(ART.metricColumn,'semantic','metric-column','Metric names an unknown column.'),
  e(ART.metricRow,'semantic','metric-row','Metric names a row key that no row has (compared with JavaScript String()).'),
  e(ART.derivedManifest,'semantic','derived-manifest','Defence in depth: the app manifest derived from the artifact was refused by the existing app contracts.',['ts']),
  e(ART.setDuplicateId,'semantic','set-duplicate-id','Two artifacts published together share an id.'),
  e(ART.setCycle,'semantic','set-cycle','Artifacts published together form a dependsOn cycle.'),
];

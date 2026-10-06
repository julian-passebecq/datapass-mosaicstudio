/** Viz tooling entry (not part of the core bundle): the zod ChartSpec schema for contracts,
 * editors and docs. Runtime code validates with `parseChartSpec` from the core barrel. */
export {chartSpecSchema} from './spec-schema.ts';
export {checkSpecShape,MARKS,ID_PATTERN,SPEC_LIMITS,ENUMS} from './spec-shape.ts';
export type {ChartSpec,ChartChannel} from './spec-shape.ts';

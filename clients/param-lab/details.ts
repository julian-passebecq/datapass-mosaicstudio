/** Selection details: what was clicked, as plain JSON.
 * The user clicks a face or an edge; this record names the picked feature by its
 * stable id (not a triangle index), the parameters that drive it with their legal
 * ranges, and the exact geometry revision (mesh hash) it refers to.
 */
import {featureById} from './features.ts';
import {PARAM_SCHEMA,nacaCode,type Params} from './params.ts';
import type {BuildResult} from './geometry.ts';

export const DISCLAIMER = 'ILLUSTRATIVE parametric shape (generic NACA 4-digit blade + hub). Not FOIL data, not a validated design, no hydrodynamic claim.';

const round = (v: number) => Math.round(v * 1000) / 1000;

export function selectionDetails({featureId, params, result, hit}: {featureId: string; params: Params; result: Pick<BuildResult, 'hash' | 'kernel' | 'features'>; hit?: readonly number[] | null}) {
  const feature = featureById(featureId);
  if (!feature) throw new Error('Unknown feature: ' + featureId);
  return {
    format: 'param-lab.selection-details', version: 1,
    model: {id: 'param-lab.blade-hub', section: nacaCode(params), units: 'mm'},
    feature: {id: feature.id, kind: feature.kind, label: feature.label, owner: feature.owner, present: result.features.includes(feature.id), note: feature.note,
      ...(hit ? {hitPoint: hit.map(round)} : {})},
    drivingParams: feature.drivenBy.map(id => {
      const spec = PARAM_SCHEMA.find(p => p.id === id)!;
      return {id, label: spec.label, value: params[id], min: spec.min, max: spec.max, step: spec.step, unit: spec.unit};
    }),
    allParams: Object.fromEntries(PARAM_SCHEMA.map(p => [p.id, params[p.id]])),
    geometry: {meshHash: result.hash, kernel: result.kernel},
    disclaimer: DISCLAIMER,
  };
}

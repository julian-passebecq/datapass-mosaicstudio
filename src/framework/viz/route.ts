/** Renderer choice by estimated mark count. SVG keeps DOM semantics and keyed transitions;
 * Canvas 2D takes over when the DOM would hold too many nodes; beyond that a lazy chunk.
 */
import type {ChartSpec} from './spec.ts';
import type {Rows} from '../types.ts';
export const RENDER_LIMITS=Object.freeze({svg:5000,canvas:200000});
export type RendererId='svg'|'canvas'|'lazy-webgl';
/** marks = rows × series for line/area (each vertex is cheap but counted), rows otherwise. */
export function estimateMarks(spec:ChartSpec,rows:Rows):number{
  if(spec.mark==='kpi')return 1;
  if(spec.mark==='arc'){const color=spec.encoding.color?.field;return color?new Set(rows.map(r=>r[color])).size:rows.length;}
  return rows.length;
}
export function chooseRenderer(marks:number,preference:ChartSpec['renderer']='auto'):RendererId{
  if(!Number.isFinite(marks)||marks<0)throw new Error('Mark count must be a non-negative number');
  if(marks>RENDER_LIMITS.canvas)return 'lazy-webgl';
  if(preference==='svg')return marks<=RENDER_LIMITS.svg?'svg':'canvas';
  if(preference==='canvas')return 'canvas';
  return marks<=RENDER_LIMITS.svg?'svg':'canvas';
}
export function routeSpec(spec:ChartSpec,rows:Rows):{marks:number;renderer:RendererId}{
  const marks=estimateMarks(spec,rows);
  // Arcs, KPIs and heat cells are always few enough or SVG-only in N1.
  const renderer=spec.mark==='kpi'||spec.mark==='arc'?'svg':chooseRenderer(marks,spec.renderer);
  return {marks,renderer};
}

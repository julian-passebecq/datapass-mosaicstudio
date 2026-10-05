/** Renderer choice by estimated mark count. SVG keeps DOM semantics and keyed transitions;
 * Canvas 2D takes over when the DOM would hold too many nodes; beyond that a lazy chunk.
 */
import type {ChartSpec} from './spec.ts';
import type {Rows} from '../types.ts';
export const RENDER_LIMITS=Object.freeze({svg:5000,canvas:200000});
export type RendererId='svg'|'canvas'|'lazy-webgl'|'webgl';
/** 3D marks always take the lazy three.js chunk; they never enter the core bundle. */
export const is3D=(mark:ChartSpec['mark'])=>mark==='bar3d'||mark==='surface'||mark==='point3d';
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
/** The 2D equivalent of a 3D spec: columns and surfaces become a heatmap (x × y, colour = z),
 * point clouds become a canvas/SVG scatter (x, y, size = z). Used when WebGL is unavailable. */
export function fallback2D(spec:ChartSpec):ChartSpec{
  if(!is3D(spec.mark))return spec;
  const {z,...e}=spec.encoding,renderer=spec.renderer==='webgl'?'auto':spec.renderer;
  return spec.mark==='point3d'?{...spec,mark:'point',renderer,encoding:{...e,size:z}}:{...spec,mark:'rect',renderer,encoding:{...e,color:z}};
}
/** Route a spec. 3D marks go to 'webgl' when available, else to their 2D fallback's renderer. */
export function routeSpec(spec:ChartSpec,rows:Rows,env:{webgl?:boolean}={webgl:true}):{marks:number;renderer:RendererId;fallback?:ChartSpec}{
  if(is3D(spec.mark)){
    if(env.webgl!==false)return {marks:estimateMarks(spec,rows),renderer:'webgl'};
    const fallback=fallback2D(spec);return {...routeSpec(fallback,rows),fallback};
  }
  const marks=estimateMarks(spec,rows);
  // Arcs, KPIs and heat cells are always few enough or SVG-only in N1.
  const renderer=spec.mark==='kpi'||spec.mark==='arc'?'svg':chooseRenderer(marks,spec.renderer);
  return {marks,renderer};
}

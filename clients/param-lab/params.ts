/** Parameter schema for the ILLUSTRATIVE blade + hub model.
 * Pure data: the sliders, the manifest fields, the worker and the selection details
 * snippet are all generated from this one list. Values are generic textbook
 * shapes (NACA 4-digit), not FOIL data, not measurements, not a validated design.
 */
import type {Field} from '../../src/framework/types.ts';

export type ParamSpec = {
  id: string; label: string; group: 'Section' | 'Blade' | 'Hub';
  min: number; max: number; step: number; default: number; unit: string;
  /** One line for the slider tooltip and the selection details JSON. */
  help: string;
  integer?: boolean;
};

export const PARAM_SCHEMA: readonly ParamSpec[] = Object.freeze([
  {id:'p-camber',label:'Max camber (m)',group:'Section',min:0,max:9,step:1,default:2,unit:'% chord',integer:true,help:'First NACA digit: maximum camber as a percentage of chord.'},
  {id:'p-camber-pos',label:'Camber position (p)',group:'Section',min:1,max:9,step:1,default:4,unit:'tenths chord',integer:true,help:'Second NACA digit: chordwise position of maximum camber, in tenths of chord.'},
  {id:'p-thickness',label:'Thickness (tt)',group:'Section',min:6,max:24,step:1,default:12,unit:'% chord',integer:true,help:'Last two NACA digits: maximum thickness as a percentage of chord.'},
  {id:'p-span',label:'Span',group:'Blade',min:60,max:240,step:5,default:150,unit:'mm',help:'Radial blade length from the hub surface to the tip.'},
  {id:'p-chord',label:'Root chord',group:'Blade',min:20,max:80,step:1,default:48,unit:'mm',help:'Chord length at the hub surface.'},
  {id:'p-taper',label:'Taper ratio',group:'Blade',min:0.3,max:1,step:0.05,default:0.55,unit:'tip / root',help:'Tip chord divided by root chord (linear taper).'},
  {id:'p-pitch',label:'Root pitch',group:'Blade',min:-20,max:45,step:1,default:12,unit:'deg',help:'Section angle at the hub surface, about the quarter chord.'},
  {id:'p-twist',label:'Twist (washout)',group:'Blade',min:-30,max:30,step:1,default:-10,unit:'deg',help:'Additional section angle at the tip, linear along the span.'},
  {id:'p-blades',label:'Blade count',group:'Blade',min:1,max:4,step:1,default:3,unit:'',integer:true,help:'Number of identical blades spaced evenly around the hub axis.'},
  {id:'p-hub-radius',label:'Hub radius',group:'Hub',min:12,max:40,step:1,default:22,unit:'mm',help:'Radius of the cylindrical hub body.'},
  {id:'p-hub-length',label:'Hub length',group:'Hub',min:50,max:160,step:5,default:90,unit:'mm',help:'Length of the cylindrical hub body (nose and tail cone are added).'},
]);

export type Params = Readonly<Record<string, number>>;

export function defaultParams(): Params {
  return Object.freeze(Object.fromEntries(PARAM_SCHEMA.map(p => [p.id, p.default])));
}

/** Strict check: a value outside the schema is an error, never silently clamped. */
export function validateParams(values: Readonly<Record<string, unknown>>): Params {
  const out: Record<string, number> = {};
  for (const spec of PARAM_SCHEMA) {
    const v = values[spec.id];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Parameter ${spec.id} must be a finite number`);
    if (v < spec.min || v > spec.max) throw new Error(`Parameter ${spec.id}=${v} is outside [${spec.min}, ${spec.max}]`);
    if (spec.integer && !Number.isInteger(v)) throw new Error(`Parameter ${spec.id} must be an integer`);
    out[spec.id] = v;
  }
  return Object.freeze(out);
}

/** Manifest fields (role input) generated from the schema. */
export function paramFields(): Field[] {
  return PARAM_SCHEMA.map(p => ({id:p.id,label:p.label,type:'number',role:'input',default:p.default,min:p.min,max:p.max,step:p.step,...(p.unit?{unit:p.unit}:{})}));
}

/** NACA designation shown in the UI and the selection details, e.g. "NACA 2412". */
export function nacaCode(params: Params): string {
  const m = params['p-camber'], p = params['p-camber-pos'], t = params['p-thickness'];
  return `NACA ${m}${m === 0 ? 0 : p}${String(t).padStart(2, '0')}`;
}

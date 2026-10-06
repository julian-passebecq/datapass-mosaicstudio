/** ChartSpec: a small, Vega-Lite-like JSON grammar validated against an artifact table. The zod schema
 * (spec-schema.ts) is the tooling contract; the hot path uses its zod-free twin (spec-shape.ts).
 * Encodings name column ids; types come from the table's columns, never from guessing values.
 * The legacy chart block `{kind,x,y}` is translated, so existing manifests keep working.
 */
import type {Column,Rows} from '../types.ts';
import {checkSpecShape,MARKS,type ChartSpec} from './spec-shape.ts';
export {MARKS};
export type {ChartSpec};
export type ArtifactTable={columns:readonly Column[];rows:Rows};

/** Which channels each mark needs, and the column type each channel accepts. */
const NEEDS:Record<ChartSpec['mark'],{required:(keyof ChartSpec['encoding'])[];numeric:(keyof ChartSpec['encoding'])[]}>={
  bar:{required:['x','y'],numeric:['y']},
  line:{required:['x','y'],numeric:['y']},
  area:{required:['x','y'],numeric:['y']},
  point:{required:['x','y'],numeric:['x','y','size']},
  arc:{required:['theta','color'],numeric:['theta']},
  rect:{required:['x','y','color'],numeric:['color']},
  kpi:{required:['y'],numeric:['y']},
  bar3d:{required:['x','y','z'],numeric:['z']},
  surface:{required:['x','y','z'],numeric:['x','y','z']},
  point3d:{required:['x','y','z'],numeric:['x','y','z']},
};
export class ChartSpecError extends Error {readonly issues:string[];constructor(issues:string[]){super('Invalid chart spec: '+issues.join('; '));this.issues=issues;}}

/** Validate structure (zod-free twin of chartSpecSchema) then references and types against the table's columns. */
export function parseChartSpec(input:unknown,table:Pick<ArtifactTable,'columns'>):ChartSpec{
  const parsed=checkSpecShape(input);
  if(!parsed.success)throw new ChartSpecError(parsed.issues);
  const spec=parsed.data,issues:string[]=[],columns=new Map(table.columns.map(c=>[c.id,c]));
  const need=NEEDS[spec.mark];
  for(const key of need.required)if(!spec.encoding[key])issues.push(`${spec.mark} needs encoding.${key}`);
  for(const[key,channelValue]of Object.entries(spec.encoding)){
    const list=Array.isArray(channelValue)?channelValue:channelValue?[channelValue]:[];
    for(const ch of list){
      const column=columns.get(ch.field);
      if(!column){issues.push(`encoding.${key}: unknown column "${ch.field}"`);continue;}
      if(need.numeric.includes(key as keyof ChartSpec['encoding'])&&column.type!=='number')issues.push(`encoding.${key}: column "${ch.field}" must be numeric for ${spec.mark}`);
    }
  }
  if((spec.mark==='line'||spec.mark==='area')&&spec.encoding.x&&columns.get(spec.encoding.x.field)?.type==='boolean')issues.push('line/area x cannot be boolean');
  if(spec.stack&&spec.mark!=='bar'&&spec.mark!=='area')issues.push('stack applies to bar or area only');
  if(spec.stack&&!spec.encoding.color&&!spec.encoding.series)issues.push('stack needs a color or series channel');
  if(spec.selection?.mode==='interval'&&!['point','line','area','bar','point3d','surface'].includes(spec.mark))issues.push('interval selection needs a positional mark');
  if(spec.renderer==='webgl'&&!spec.mark.endsWith('3d')&&spec.mark!=='surface')issues.push('webgl renderer is for 3D marks');
  if(spec.selection?.on&&!columns.has(spec.selection.on))issues.push(`selection.on: unknown column "${spec.selection.on}"`);
  if(issues.length)throw new ChartSpecError(issues);
  return spec;
}
/** Legacy chart block → ChartSpec. `scatter` becomes `point`. */
export function fromLegacyChart(block:{id:string;title?:string;x:string;y:string;kind:'bar'|'line'|'scatter';unit?:string}):ChartSpec{
  return {id:block.id,title:block.title,mark:block.kind==='scatter'?'point':block.kind,encoding:{x:{field:block.x},y:{field:block.y}},format:block.unit?{unit:block.unit}:undefined};
}
/** Build a sensible default spec from a table: first string column as x, first numeric as y. */
export function specFromTable(table:ArtifactTable,partial:Partial<ChartSpec>&{id:string}):ChartSpec{
  const firstString=table.columns.find(c=>c.type==='string'),numbers=table.columns.filter(c=>c.type==='number');
  const mark=partial.mark||(firstString?'bar':'point');
  const x=partial.encoding?.x||(mark==='point'?numbers[0]&&{field:numbers[0].id}:firstString&&{field:firstString.id});
  const y=partial.encoding?.y||(mark==='point'?numbers[1]&&{field:numbers[1].id}:numbers[0]&&{field:numbers[0].id});
  return parseChartSpec({...partial,mark,encoding:{...partial.encoding,...(x?{x}:{}),...(y?{y}:{})}},table);
}
/** Rows whose encoded values are missing. Missing is reported, never drawn as zero. */
export function missingEncoded(spec:ChartSpec,rows:Rows):number{
  const fields=[spec.encoding.x,spec.encoding.y,spec.encoding.z,spec.encoding.theta,spec.encoding.color,spec.encoding.size].filter(Boolean).map(c=>c!.field);
  return rows.reduce((n,r)=>n+(fields.some(f=>r[f]===null||r[f]===undefined)?1:0),0);
}

/** ChartSpec: a small, Vega-Lite-like JSON grammar validated with zod against an artifact table.
 * Encodings name column ids; types come from the table's columns, never from guessing values.
 * The legacy chart block `{kind,x,y}` is translated, so existing manifests keep working.
 */
import {z} from 'zod';
import type {Column,Rows} from '../types.ts';

const id=z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,79}$/,'column id');
export const MARKS=['bar','line','area','point','arc','rect','kpi'] as const;
const channel=z.object({field:id,title:z.string().max(120).optional(),format:z.string().max(24).optional()}).strict();
export const chartSpecSchema=z.object({
  id:id,
  title:z.string().max(200).optional(),
  mark:z.enum(MARKS),
  encoding:z.object({
    x:channel.optional(),y:channel.optional(),color:channel.optional(),size:channel.optional(),
    series:channel.optional(),theta:channel.optional(),tooltip:z.array(channel).max(8).optional(),
  }).strict(),
  stack:z.enum(['stacked','grouped','normalize']).optional(),
  sort:z.enum(['none','ascending','descending']).optional(),
  format:z.object({unit:z.string().max(30).optional(),digits:z.number().int().min(0).max(6).optional(),compact:z.boolean().optional()}).strict().optional(),
  selection:z.object({field:id,mode:z.enum(['point','multi','interval']),on:id.optional()}).strict().optional(),
  renderer:z.enum(['auto','svg','canvas']).optional(),
}).strict();
export type ChartSpec=z.infer<typeof chartSpecSchema>;
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
};
export class ChartSpecError extends Error {readonly issues:string[];constructor(issues:string[]){super('Invalid chart spec: '+issues.join('; '));this.issues=issues;}}

/** Validate structure (zod) then references and types against the table's columns. */
export function parseChartSpec(input:unknown,table:Pick<ArtifactTable,'columns'>):ChartSpec{
  const parsed=chartSpecSchema.safeParse(input);
  if(!parsed.success)throw new ChartSpecError(parsed.error.issues.map(i=>(i.path.join('.')||'spec')+': '+i.message));
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
  if(spec.selection?.mode==='interval'&&!['point','line','area','bar'].includes(spec.mark))issues.push('interval selection needs a positional mark');
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
  const fields=[spec.encoding.x,spec.encoding.y,spec.encoding.theta,spec.encoding.color,spec.encoding.size].filter(Boolean).map(c=>c!.field);
  return rows.reduce((n,r)=>n+(fields.some(f=>r[f]===null||r[f]===undefined)?1:0),0);
}

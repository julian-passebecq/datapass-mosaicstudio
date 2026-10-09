/** Turn one real DuckDB result into a bounded `datapass.artifact` v1 so every result (SQL or Python)
 * shares one contract, one set of renderers and one export. Pure: no database, no DOM. */
import {validateArtifact,type Artifact,type Representation} from '../framework/foundation/artifact.ts';
import type {Column} from '../framework/types.ts';
import type {ChartChoice} from './notebook.ts';

export const SQL_ARTIFACT_LIMITS=Object.freeze({rows:10000,columns:39});
export type SqlResultInput={columns:string[];rows:Record<string,unknown>[];cellId:string;title:string;sql:string;chart?:ChartChoice;rowKey?:string};
export type ColumnMap={source:string;id:string;type:Column['type']};

function columnId(name:string,used:Set<string>):string{
  let base=name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^[^a-zA-Z]+/,'').slice(0,60);
  base=base?base[0].toLowerCase()+base.slice(1):'col';
  let id=base,n=2;while(used.has(id)||id==='row'&&!used.has('__row')){id=base+'_'+n++;}
  used.add(id);return id;
}
function cell(value:unknown):{type:Column['type']|null;value:string|number|boolean|null}{
  if(value===null||value===undefined)return {type:null,value:null};
  if(typeof value==='number')return Number.isFinite(value)?{type:'number',value}:{type:'string',value:String(value)};
  if(typeof value==='bigint')return Number.isSafeInteger(Number(value))?{type:'number',value:Number(value)}:{type:'string',value:value.toString()};
  if(typeof value==='boolean')return {type:'boolean',value};
  if(value instanceof Date)return {type:'string',value:value.toISOString()};
  if(typeof value==='string')return {type:'string',value:value.length>2000?value.slice(0,2000):value};
  try{return {type:'string',value:JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v).slice(0,2000)};}catch{return {type:'string',value:String(value).slice(0,2000)};}
}

/** Infer one stable type per column. A column mixing numbers and text becomes text, never coerced silently. */
export function mapColumns(columns:string[],rows:Record<string,unknown>[]):ColumnMap[]{
  const used=new Set<string>(['row']);
  return columns.map(source=>{
    const types=new Set<Column['type']>();
    for(const row of rows){const t=cell(row[source]).type;if(t)types.add(t);}
    const type:Column['type']=types.size===1?[...types][0]:'string';
    return {source,id:columnId(source,used),type};
  });
}

export function sqlResultArtifact(input:SqlResultInput):Artifact{
  if(input.columns.length>SQL_ARTIFACT_LIMITS.columns)throw new Error(`The result has ${input.columns.length} columns; an artifact holds at most ${SQL_ARTIFACT_LIMITS.columns} plus the row position. Select fewer columns.`);
  if(input.rows.length>SQL_ARTIFACT_LIMITS.rows)throw new Error(`The result has more than ${SQL_ARTIFACT_LIMITS.rows} rows. Aggregate or add LIMIT before saving it as an artifact.`);
  const map=mapColumns(input.columns,input.rows);
  const columns:Column[]=[{id:'row',label:'Result row (position)',type:'number'},...map.map(m=>({id:m.id,label:m.source.slice(0,120)||m.id,type:m.type,nullable:true}))];
  const rows=input.rows.map((row,i)=>{
    const out:Record<string,string|number|boolean|null>={row:i+1};
    for(const m of map){const c=cell(row[m.source]);out[m.id]=c.value===null?null:m.type==='string'?String(c.value):c.value;}
    return out;
  });
  const representations:Representation[]=[{id:'table',title:'Rows',kind:'table'}];
  if(input.chart){
    const x=map.find(m=>m.source===input.chart!.x),y=map.find(m=>m.source===input.chart!.y);
    if(!x||!y)throw new Error('The chart columns are not in this result.');
    if(y.type!=='number')throw new Error(`Chart value "${y.source}" must be numeric.`);
    if(input.chart.kind!=='bar'&&x.type!=='number')throw new Error(`A ${input.chart.kind} chart needs a numeric x column; "${x.source}" is ${x.type}. Use a bar chart.`);
    representations.push({id:'chart',title:`${y.source} by ${x.source}`,kind:'chart',chart:input.chart.kind,x:x.id,y:y.id});
  }
  representations.push({id:'json',title:'JSON',kind:'json'});
  return validateArtifact({format:'datapass.artifact',version:1,id:('sql-'+input.cellId).slice(0,80),title:input.title.slice(0,160)||'SQL result',
    provenance:{kind:'computed',source:('Local DuckDB-WASM query in the browser workbench: '+input.sql.replace(/\s+/g,' ').trim()).slice(0,2000),producer:{kind:'notebook',name:'MosaicStudio workbench SQL cell '+input.cellId}},
    payload:{kind:'table',rowKey:'row',columns,rows},representations});
}

import type {Block,Dataset,Rows} from './types.ts';
/** A narrow bridge into VizForge grammar. No scales, geometry, rendering or timer lives here. */
export function chartInput(block:Extract<Block,{type:'chart'}>,dataset:Dataset,rows:Rows):{input:unknown|null;note:string}{
  if(!rows.length)return {input:null,note:''};
  if(rows.some(r=>r[block.x]===null||r[block.y]===null))return {input:null,note:'This chart has missing encoded values. Inspect the table; missing values are not silently bridged.'};
  if(block.kind==='bar'&&(rows.length>30||rows.some(r=>Number(r[block.y])<0)))return {input:null,note:'The current VizForge ranking adapter supports at most 30 nonnegative bars. Use a table or an explicit visual resource for this dataset.'};
  if(block.kind==='line'&&new Set(rows.map(r=>r[block.x])).size!==rows.length)return {input:null,note:'The simple line adapter requires one row per numeric X value. Aggregate duplicates or use a richer visual resource.'};
  const base={id:block.id,version:'1.0',title:block.title||dataset.title,takeaway:dataset.description||dataset.title,source:dataset.provenance+' / '+dataset.title,note:'Client-supplied data contract; not independent validation.',accessibility:{summary:block.title||dataset.title},formatting:{digits:1,unit:block.unit||''},animation:{durationMs:350}};
  const data=rows.map(r=>({entity:block.kind==='line'?'series':String(r[dataset.rowKey]),label:block.kind==='line'?(block.title||dataset.title):String(r[block.x]),time:block.kind==='line'?r[block.x]:0,x:r[block.x],value:r[block.y]}));
  const encodings={id:'entity',label:'label',time:'time'};
  return {input:block.kind==='bar'?{...base,type:'ranking',data,encodings:{...encodings,value:'value'},topN:rows.length}:block.kind==='line'?{...base,type:'time-series',data,encodings:{...encodings,value:'value'}}:{...base,type:'scatter',data,encodings:{...encodings,x:'x',y:'value'},xLabel:dataset.columns.find(c=>c.id===block.x)!.label,yLabel:dataset.columns.find(c=>c.id===block.y)!.label},note:''};
}

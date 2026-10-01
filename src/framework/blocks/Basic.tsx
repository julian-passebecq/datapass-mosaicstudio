import {useEffect,useMemo,useState,useId} from 'react';
import type {Block,Field,Scalar} from '../types';
import {useDataset,useRuntime,useSiteState} from '../hooks';
import {createBrowserHost} from '../../core/host';
import {toCsv} from '../../core/queries';
export const formatValue=(v:Scalar,digits=2)=>v===null?'Not available':typeof v==='number'?new Intl.NumberFormat('en-GB',{maximumFractionDigits:digits}).format(v):typeof v==='boolean'?(v?'Yes':'No'):v;
export function InputField({field,control='field'}:{field:Field;control?:'field'|'slider'}){
  const runtime=useRuntime(),value=useSiteState().values[field.id],domId=useId();
  const [draft,setDraft]=useState(String(value)),[error,setError]=useState('');
  useEffect(()=>{setDraft(String(value));setError('');},[value]);
  function commit(){try{if(!draft.trim())throw new Error('Enter a number');const next=Number(draft);runtime.set(field.id,next);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}
  return <div className={'site-input '+field.type}><label htmlFor={domId}>{field.label}{field.unit&&<small>{field.unit}</small>}</label>
    {field.type==='number'&&control==='slider'?<><input id={domId} type="range" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={e=>runtime.set(field.id,Number(e.target.value))}/><output htmlFor={domId}>{formatValue(value)} {field.unit}</output></>:field.type==='number'?<input id={domId} type="number" min={field.min} max={field.max} step={field.step} value={draft} aria-invalid={!!error} aria-describedby={error?domId+'-error':undefined} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.currentTarget.blur();}if(e.key==='Escape'){setDraft(String(value));setError('');}}}/>:field.type==='select'?<select id={domId} value={String(value)} onChange={e=>runtime.set(field.id,e.target.value)}>{field.options!.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input id={domId} type="checkbox" checked={value===true} onChange={e=>runtime.set(field.id,e.target.checked)}/>}
    {error&&<span id={domId+'-error'} className="site-field-error" role="alert">{error}</span>}
  </div>;
}
export function MetricBlock({block}:{block:Extract<Block,{type:'metric'}>}){
  const runtime=useRuntime();useSiteState();let value:Scalar=null,error='';try{value=runtime.resolve(block.value);}catch(e){error=e instanceof Error?e.message:String(e);}
  return <div className="site-metric"><span>{block.title||'Metric'}</span><strong data-testid={'metric-'+block.id}>{formatValue(value,block.digits??2)}{value!==null&&block.unit&&<small>{block.unit}</small>}</strong><p>{error||block.note}</p></div>;
}
export function TableBlock({block}:{block:Extract<Block,{type:'table'}>}){
  const runtime=useRuntime(),dataset=runtime.manifest.datasets.find(d=>d.id===block.dataset)!,result=useDataset(block.dataset);
  const [offset,setOffset]=useState(0),[sort,setSort]=useState<{id:string;direction:1|-1}|null>(null);
  const rows=useMemo(()=>{if(!result.rows)return [];const copy=[...result.rows];if(sort)copy.sort((a,b)=>{const x=a[sort.id],y=b[sort.id];if(x===null)return y===null?0:1;if(y===null)return -1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*sort.direction;});return copy;},[result.rows,sort]);
  useEffect(()=>setOffset(0),[result.rows,sort]);
  const pageSize=block.pageSize??10,last=Math.max(0,Math.floor((rows.length-1)/pageSize)*pageSize),start=Math.min(offset,last),page=rows.slice(start,start+pageSize);
  if(result.error)return <div className="site-notice" role="status">{result.error}</div>;
  return <div className="site-data-table"><div className="site-table-caption"><strong>{block.title||dataset.title}</strong><span>{dataset.provenance} / {rows.length} rows</span><button type="button" disabled={!rows.length} onClick={()=>createBrowserHost().saveDownload(dataset.id+'.csv',new Blob([toCsv(dataset.columns.map(c=>c.id),rows)],{type:'text/csv;charset=utf-8'}))}>Export CSV</button></div><div className="site-table-scroll"><table><caption className="site-sr">{dataset.title}</caption><thead><tr>{dataset.columns.map(c=><th key={c.id} scope="col" aria-sort={sort?.id===c.id?(sort.direction===1?'ascending':'descending'):'none'}><button type="button" onClick={()=>setSort(s=>({id:c.id,direction:s?.id===c.id&&s.direction===1?-1:1}))}>{c.label}{c.unit&&<small>{c.unit}</small>}</button></th>)}</tr></thead><tbody>{page.map(row=><tr key={String(row[dataset.rowKey])}>{dataset.columns.map(c=><td key={c.id}>{formatValue(row[c.id])}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="site-empty">No matching rows.</p>}</div><div className="site-pagination"><span>{rows.length?`${start+1}-${Math.min(rows.length,start+pageSize)}`:'0'} of {rows.length}</span><button type="button" aria-label={'Previous rows in '+dataset.title} disabled={start===0} onClick={()=>setOffset(Math.max(0,start-pageSize))}>Previous</button><button type="button" aria-label={'Next rows in '+dataset.title} disabled={start+pageSize>=rows.length} onClick={()=>setOffset(start+pageSize)}>Next</button></div></div>;
}
export function TaskBlock({block}:{block:Extract<Block,{type:'task'}>}){
  const runtime=useRuntime(),state=useSiteState().tasks[block.task],task=runtime.manifest.tasks.find(t=>t.id===block.task)!;
  return <div className="site-task"><div><strong>{block.title||task.label}</strong><span className={'site-task-status '+state.status} data-testid={'task-'+task.id}>{state.status}</span></div><p>{state.message||'Runs only on your request. Input changes invalidate its result.'}</p>{state.status==='running'&&<progress value={state.progress} max={1} aria-label={task.label+' progress'}/>}<div><button type="button" disabled={state.status==='running'} onClick={()=>void runtime.runTask(task.id)}>{task.label}</button>{state.status==='running'&&<button type="button" onClick={()=>runtime.cancelTask(task.id)}>Cancel task</button>}</div></div>;
}
export function CatalogBlock(){const runtime=useRuntime();useSiteState();return <div className="site-catalog">{runtime.manifest.datasets.map(d=><article key={d.id}><div><span>{d.layer}</span><strong>{d.title}</strong><code>{d.id}</code></div><p>{d.description}</p><small>{d.provenance} / {d.source} / {d.columns.length} fields / {d.dependsOn.length?'Depends on '+d.dependsOn.join(', '):'No upstream dataset'}</small></article>)}</div>;}
export default function Basic({block}:{block:Block}){
  const runtime=useRuntime();
  switch(block.type){
    case 'text':return <div className={'site-text '+(block.tone||'body')}>{block.title&&<h2>{block.title}</h2>}{block.text.split('\n').map((p,i)=><p key={i}>{p}</p>)}</div>;
    case 'code':return <div className="site-code"><header><strong>{block.title||'Code'}</strong><span>{block.language} / read-only</span></header><pre><code>{block.text}</code></pre></div>;
    case 'metric':return <MetricBlock block={block}/>;
    case 'input':return <InputField field={runtime.manifest.fields.find(f=>f.id===block.field)!} control={block.control}/>;
    case 'table':return <TableBlock block={block}/>;
    case 'task':return <TaskBlock block={block}/>;
    case 'catalog':return <CatalogBlock/>;
    default:throw new Error('Basic renderer cannot handle '+block.type);
  }
}

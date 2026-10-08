import {useState} from 'react';
import {Button,Tab,TabList} from '../fluent';
import {ChevronLeft,ChevronRight,Code2,RefreshCw} from 'lucide-react';
import {useRoomStore} from '../store';
import {identifier,literal,pageQuery} from '../core/queries';
import {useLocalQuery} from '../adapters/query';
import {Header,Results} from './Common';
export default function Explore(){const selected=useRoomStore(s=>s.datapass.selectedTable),exists=useRoomStore(s=>s.db.tables.some(t=>t.tableName===s.datapass.selectedTable));return selected&&exists?<TableInspector key={selected} table={selected}/>:<BlankData/>;}
/** A blank workspace has no forced dataset: the sample is an explicit, labelled choice. */
export function BlankData({purpose='Open a local CSV, JSON or Parquet file from the Assets panel, or load the synthetic sample to explore the workbench.'}:{purpose?:string}){
 const load=useRoomStore(s=>s.datapass.loadSamples),loading=useRoomStore(s=>s.datapass.loadingSamples),ready=useRoomStore(s=>s.room.initialized),open=useRoomStore(s=>s.datapass.openModule);
 return <section className="panel-content" data-testid="blank-data"><Header eyebrow="Explore / local data" title="No table open" detail={purpose}/><div className="blank-actions"><Button appearance="primary" disabled={!ready||loading} onClick={()=>void load()}>{loading?'Creating sample...':'Load synthetic sample (360 rows)'}</Button><Button onClick={()=>open('notebook')}>Open the notebook</Button></div><p className="footnote">The sample is deterministic synthetic data generated in this browser. It is not client data and is never loaded unless you choose it.</p></section>;
}
function TableInspector({table}:{table:string}){
 const info=useRoomStore(s=>s.datapass.datasets[table]),schema=useRoomStore(s=>s.db.tables.find(t=>t.tableName===table)),ready=useRoomStore(s=>s.room.initialized),open=useRoomStore(s=>s.datapass.openModule),ensure=useRoomStore(s=>s.sqlEditor.ensureQuery);
 const [tab,setTab]=useState('rows'),[offset,setOffset]=useState(0),[version,setVersion]=useState(0);
 const isParquet=info?.registeredFile?.endsWith('.parquet');
 const query=tab==='profile'?`SUMMARIZE ${identifier(table)}`:tab==='schema'?`DESCRIBE ${identifier(table)}`:tab==='footer'&&isParquet?`SELECT * FROM parquet_file_metadata(${literal(info.registeredFile!)})`:pageQuery(table,offset,100);
 const result=useLocalQuery(query,ready&&!!schema,version);
 return <section className="panel-content"><Header eyebrow="Explore / local data" title={info?.name||table} detail="Inspect actual rows, typed schema and a computed profile. Nothing is written back to your source file."><Button size="small" icon={<RefreshCw size={14}/>} onClick={()=>setVersion(v=>v+1)}>Refresh</Button><Button size="small" icon={<Code2 size={14}/>} onClick={()=>{ensure('inspect-'+table,{name:table,query:pageQuery(table),open:true,select:true});open('sql');}}>Open in SQL</Button></Header>
  <div className="dataset-summary"><span><b>{schema?.columns.length??0}</b> fields</span><span className="mono">{table}</span><span>{info?.kind==='synthetic'?'Synthetic demonstration':'User-opened local data'}</span>{info?.bytes&&<span>{(info.bytes/1024).toFixed(1)} KiB source</span>}<span className="spacer"/><span>{result.duration?`${result.duration.toFixed(0)} ms`:''}</span></div>
  <div className="view-toolbar"><TabList size="small" selectedValue={tab} onTabSelect={(_,d)=>setTab(String(d.value))}><Tab value="rows">Rows</Tab><Tab value="schema">Schema</Tab><Tab value="profile">Profile</Tab>{isParquet&&<Tab value="footer">Parquet metadata</Tab>}</TabList>{tab==='rows'&&<div className="pagination"><Button size="small" aria-label="Previous rows" icon={<ChevronLeft size={14}/>} disabled={offset===0||result.loading} onClick={()=>setOffset(o=>Math.max(0,o-100))}/><span>{offset+1} - {offset+result.rows.length}</span><Button size="small" aria-label="Next rows" icon={<ChevronRight size={14}/>} disabled={result.rows.length<100||result.loading} onClick={()=>setOffset(o=>o+100)}/></div>}</div>
  <Results {...result} caption={tab+' for '+table}/><details className="details"><summary>Query and provenance</summary><pre>{query}</pre><p>Engine: SQLRooms / DuckDB-WASM. Duration is the observed query round trip, not a performance guarantee. Profiles are computed on demand. This is not the full Data X-ray desktop analyzer.</p></details>
 </section>;
}

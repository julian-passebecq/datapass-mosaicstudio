import {lazy,Suspense,useRef,useState} from 'react';
import {Button,Input} from '../fluent';
import {Database,FileUp,Search,ChevronRight,Table2} from 'lucide-react';
import {useRoomStore} from '../store';
import {PanelBoundary,Loading} from './Common';
const panels={explore:lazy(()=>import('./Explore')),linked:lazy(()=>import('./Linked')),sql:lazy(()=>import('./Sql')),pipeline:lazy(()=>import('./Pipeline')),stories:lazy(()=>import('./Stories')),explain:lazy(()=>import('./Concepts')),board:lazy(()=>import('./Board'))};
export function WorkspacePanel(){const module=useRoomStore(s=>s.datapass.module),Panel=panels[module as keyof typeof panels]||panels.explore;return <div className="workspace-panel"><PanelBoundary key={module}><Suspense fallback={<Loading/>}><Panel/></Suspense></PanelBoundary></div>;}
export function CatalogPanel(){
  const tables=useRoomStore(s=>s.db.tables),assets=useRoomStore(s=>s.datapass.datasets),selected=useRoomStore(s=>s.datapass.selectedTable),select=useRoomStore(s=>s.datapass.selectTable),importFile=useRoomStore(s=>s.datapass.importFile),importing=useRoomStore(s=>s.datapass.importing),setError=useRoomStore(s=>s.datapass.setError);
  const picker=useRef<HTMLInputElement>(null),[search,setSearch]=useState('');
  return <aside className="catalog"><div className="catalog-top"><div className="project-title"><Database size={17}/><strong>Local workspace</strong></div><Input size="small" contentBefore={<Search size={14}/>} aria-label="Search tables" placeholder="Find a table" value={search} onChange={(_,d)=>setSearch(d.value)}/><Button icon={<FileUp size={15}/>} disabled={importing} onClick={()=>picker.current?.click()}>{importing?'Importing...':'Open local file'}</Button><input hidden ref={picker} type="file" accept=".csv,.json,.parquet" aria-label="Import data file" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(file)try{await importFile(file);}catch(err){setError(String(err));}}}/><small>CSV / JSON / Parquet &middot; max 64 MiB</small></div>
    <div className="catalog-section"><span className="eyebrow">Tables <b>{tables.length}</b></span>{tables.filter(t=>t.tableName.toLowerCase().includes(search.toLowerCase())).map(t=><button type="button" className={'asset-row '+(selected===t.tableName?'selected':'')} key={t.tableName} onClick={()=>select(t.tableName)}><Table2 size={15}/><span><strong>{t.tableName}</strong><small>{t.columns.length} fields &middot; {assets[t.tableName]?.kind==='synthetic'?'demo data':'local session'}</small></span><ChevronRight size={13}/></button>)}</div>
    <div className="catalog-bottom"><span className="pill">Browser session</span><p>No account or remote database is required. Reloading clears imported data and unsaved work.</p><p>Files are opened locally. This application does not upload them.</p></div>
  </aside>;
}

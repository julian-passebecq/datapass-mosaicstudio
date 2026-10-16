import {createRoomStore,createRoomShellSlice,type RoomShellSliceState,type LayoutConfig} from '@sqlrooms/room-shell';
import {createWasmDuckDbConnector} from '@sqlrooms/duckdb';
import {DuckDBDataProtocol} from '@duckdb/duckdb-wasm';
import {createMosaicSlice,type MosaicSliceState} from '@sqlrooms/mosaic/dist/MosaicSlice';
import {createSqlEditorSlice,type SqlEditorSliceState} from '@sqlrooms/sql-editor/dist/SqlEditorSlice';
import {Database,PanelTop} from 'lucide-react';
import {CatalogPanel,WorkspacePanel} from './panels/ShellPanels';
import {extensionSql,sampleSql,SAMPLE_TABLE} from './data/seed';
import {tableId} from './core/queries';
import {modules} from './core/host';
import {demoPipeline,type Pipeline,validatePipeline} from './core/pipeline';
import {validateNotebook,type Notebook} from './workspace/notebook';
import {loadWorkspace,resetWorkspace as clearSavedWorkspace,WORKSPACE_KEY,type RunRef,type WorkspaceDoc,type SourceRef} from './workspace/persist';
import {browserPreferences,createStorageAdapter} from './framework/storage';
import {WorkspaceRevisionGuard,WORKSPACE_REVISION_KEY,type WorkspaceConflict} from './workspace/revision';

export type DatasetInfo={table:string; name:string; kind:'synthetic'|'user-file'; bytes?:number; registeredFile?:string;};
export type BoardCard={id:string; title:string; lane:'Backlog'|'In progress'|'Review'|'Done'};
export type DataPassSlice={datapass:{
  module:string; selectedTable:string; datasets:Record<string,DatasetInfo>; importing:boolean; error:string|null; pipeline:Pipeline; cards:BoardCard[];
  samples:boolean; loadingSamples:boolean; notice:string|null; notebook:Notebook; runs:RunRef[]; runtimeOrigin:string|null; missingSources:SourceRef[];
  /** Run refs loaded from a saved/imported workspace and not observed again in this tab. A queued/running one is
   * displayed as "not observed since reload" (rule 32); the stored v1 document itself is unchanged. */
  restoredRunIds:string[];
  /** Open cross-tab conflict (F205): another writer changed the saved workspace. Nothing is saved while it is open. */
  conflict:(WorkspaceConflict&{error:string|null})|null;
  openModule(id:string):void; selectTable(id:string):void; importFile(file:File):Promise<void>; setError(error:string|null):void; setPipeline(p:Pipeline):void; setCards(cards:BoardCard[]):void;
  loadSamples():Promise<void>; setNotice(notice:string|null):void; setNotebook(notebook:Notebook):void; recordRun(run:RunRef):void; setRuntimeOrigin(origin:string|null):void;
  applyWorkspace(doc:WorkspaceDoc,notice:string|null):void; resetWorkspace():void; workspaceDocument():WorkspaceDoc;
  resolveConflict(choice:'mine'|'theirs'):void;
}};
export type RoomState=RoomShellSliceState&MosaicSliceState&SqlEditorSliceState&DataPassSlice;
export const MODULE_IDS=modules.map(m=>m.id);
let importSequence=0;
const params=new URLSearchParams(location.search);
const requestedModule=params.get('module');
// Workspace load/save go through the StorageAdapter preferences tier (same localStorage port, same bytes).
const storageAdapter=createStorageAdapter({preferences:browserPreferences()});
const storage=storageAdapter.preferences;
// `?workspace=blank` never loads samples for this visit; `?sample=operations` opts into the synthetic sample.
const restored=params.get('embed')==='1'?{doc:null,notice:null}:loadWorkspace(storage,MODULE_IDS);
const saved=restored.doc;
// One revision guard per tab, created after the load (which may move a rejected document aside). Embeds never write.
const guard=params.get('embed')!=='1'&&storage?new WorkspaceRevisionGuard(storage,MODULE_IDS):null;
const samples=params.get('sample')==='operations'?true:params.get('workspace')==='blank'?false:saved?.samples??false;
// URL overrides apply to this visit only; the saved choice changes only when the user loads the sample.
let persistedSamples=saved?.samples??false;
const initialModule=modules.some(m=>m.id===requestedModule)?requestedModule!:saved?.module??(samples?'explore':'notebook');
const SAMPLE_QUERY={id:'overview',name:'Regional performance',query:'SELECT region, technology,\n       sum(energy_mwh) AS energy_mwh,\n       sum(revenue_eur) AS revenue_eur\nFROM operations\nGROUP BY region, technology\nORDER BY revenue_eur DESC;'};
const BLANK_QUERY={id:'untitled',name:'Untitled',query:'-- Open a local file (Assets panel) or load the synthetic sample, then query it.\nSELECT 42 AS answer;'};
const savedQueries=saved?.queries.length?saved.queries:[samples?SAMPLE_QUERY:BLANK_QUERY];
const selectedQueryId=saved?.selectedQueryId&&savedQueries.some(q=>q.id===saved.selectedQueryId)?saved.selectedQueryId:savedQueries[0].id;
const base=new URL(import.meta.env.BASE_URL,location.href);
const connector=createWasmDuckDbConnector({
  bundles:{mvp:{mainModule:new URL('duckdb/duckdb-mvp.wasm',base).href,mainWorker:new URL('duckdb/duckdb-browser-mvp.worker.js',base).href},eh:{mainModule:new URL('duckdb/duckdb-eh.wasm',base).href,mainWorker:new URL('duckdb/duckdb-browser-eh.worker.js',base).href}},
  initializationQuery:extensionSql+(samples?sampleSql:''),maximumThreads:1,
});
const SAMPLE_DATASET:DatasetInfo={table:SAMPLE_TABLE,name:'Renewable operations (synthetic sample)',kind:'synthetic'};
const DEMO_CARDS:BoardCard[]=[{id:'scope',title:'Agree the data contract',lane:'Done'},{id:'inspect',title:'Inspect source quality',lane:'In progress'},{id:'review',title:'Review the pipeline definition',lane:'Review'},{id:'publish',title:'Prepare a client-facing app',lane:'Backlog'}];
// User files cannot be re-read after a reload (no bytes are stored); they are listed so the user can reopen them.
const missingSources=(saved?.sources??[]).filter(s=>s.kind==='user-file');
const startupNotice=restored.notice??(missingSources.length?`Restored your workspace. ${missingSources.length} local file(s) must be reopened: ${missingSources.map(s=>s.name).join(', ')}. File contents are never stored.`:null);
export const {roomStore,useRoomStore}=createRoomStore<RoomState>((set,get,store)=>({
  ...createRoomShellSlice({connector,config:{title:'DataPass MosaicStudio',dataSources:[]},captureException(error){console.error(error);get().datapass.setError(String(error));},
    layout:{config:{id:'root',type:'split',direction:'row',children:[{id:'catalog-area',type:'tabs',children:['catalog'],defaultSize:'19%',minSize:'190px',maxSize:'35%',activeTabIndex:0,collapsible:true,collapsedSize:0},{id:'work-area',type:'tabs',children:['workspace'],defaultSize:'81%',activeTabIndex:0,hideTabStrip:true}]} satisfies LayoutConfig,
      panels:{catalog:{title:'Project assets',icon:Database,component:CatalogPanel},workspace:{title:'Workspace',icon:PanelTop,component:WorkspacePanel}}}
  })(set,get,store),
  ...createMosaicSlice()(set,get,store),
  ...createSqlEditorSlice({queryResultLimit:100,queryResultLimitOptions:[100,500,1000],config:{queries:savedQueries.map(q=>({...q})),selectedQueryId,openTabs:savedQueries.slice(0,8).map(q=>q.id)}})(set,get,store),
  initialize:async()=>{await get().db.refreshTableSchemas();},
  datapass:{module:initialModule,selectedTable:samples?SAMPLE_TABLE:'',datasets:(samples?{[SAMPLE_TABLE]:SAMPLE_DATASET}:{}) as Record<string,DatasetInfo>,importing:false,error:null,pipeline:saved?.pipeline?validatePipeline(saved.pipeline):structuredClone(demoPipeline),
    cards:saved?.cards??DEMO_CARDS.map(c=>({...c})),
    samples,loadingSamples:false,notice:startupNotice,notebook:saved?.notebook??{cells:[]},runs:saved?.runs??[],restoredRunIds:(saved?.runs??[]).map(r=>r.runId),runtimeOrigin:saved?.runtimeOrigin??null,missingSources,conflict:null,
    openModule(module){if(!modules.some(m=>m.id===module))return;set(s=>({datapass:{...s.datapass,module}}));},
    selectTable(selectedTable){set(s=>({datapass:{...s.datapass,selectedTable,module:'explore'}}));},
    setError(error){set(s=>({datapass:{...s.datapass,error}}));},
    setNotice(notice){set(s=>({datapass:{...s.datapass,notice}}));},
    setPipeline(pipeline){const validated=validatePipeline(pipeline);set(s=>({datapass:{...s.datapass,pipeline:validated}}));},
    setCards(cards){if(cards.length>100||cards.some(c=>!['Backlog','In progress','Review','Done'].includes(c.lane)||!c.title.trim()||c.title.length>160))throw new Error('Invalid board');set(s=>({datapass:{...s.datapass,cards}}));},
    setNotebook(notebook){const validated=validateNotebook(notebook);set(s=>({datapass:{...s.datapass,notebook:validated}}));},
    recordRun(run){set(s=>({datapass:{...s.datapass,runs:[run,...s.datapass.runs.filter(r=>r.runId!==run.runId)].slice(0,50),restoredRunIds:s.datapass.restoredRunIds.filter(id=>id!==run.runId)}}));},
    setRuntimeOrigin(runtimeOrigin){set(s=>({datapass:{...s.datapass,runtimeOrigin}}));},
    async loadSamples(){
      if(get().datapass.samples||get().datapass.loadingSamples)return;
      set(s=>({datapass:{...s.datapass,loadingSamples:true,error:null}}));
      try{
        await get().db.connector.query(sampleSql);
        await get().db.refreshTableSchemas();
        persistedSamples=true;
        set(s=>({datapass:{...s.datapass,samples:true,datasets:{...s.datapass.datasets,[SAMPLE_TABLE]:SAMPLE_DATASET},selectedTable:s.datapass.selectedTable||SAMPLE_TABLE}}));
      }catch(error){get().datapass.setError('The synthetic sample could not be created: '+(error instanceof Error?error.message:String(error)));}
      finally{set(s=>({datapass:{...s.datapass,loadingSamples:false}}));}
    },
    /** Replace the authored workspace atomically after joint validation. Never runs a cell or a query. */
    applyWorkspace(doc,notice){
      const sqlEditor=get().sqlEditor,queries=doc.queries.length?doc.queries:[BLANK_QUERY];
      sqlEditor.setConfig({...sqlEditor.config,queries:queries.map(q=>({...q})),selectedQueryId:doc.selectedQueryId&&queries.some(q=>q.id===doc.selectedQueryId)?doc.selectedQueryId:queries[0].id,openTabs:queries.slice(0,8).map(q=>q.id)});
      set(s=>({datapass:{...s.datapass,module:doc.module,notebook:doc.notebook,runs:doc.runs,restoredRunIds:doc.runs.map(r=>r.runId),runtimeOrigin:doc.runtimeOrigin,pipeline:doc.pipeline??structuredClone(demoPipeline),cards:doc.cards??DEMO_CARDS.map(c=>({...c})),missingSources:doc.sources.filter(x=>x.kind==='user-file'),notice}}));
      if(doc.samples&&!get().datapass.samples)void get().datapass.loadSamples();
    },
    resetWorkspace(){
      if(guard){
        const outcome=guard.reset();
        if(outcome.status==='conflict'){set(s=>({datapass:{...s.datapass,conflict:{...outcome.conflict,error:s.datapass.conflict?.error??null},notice:'Another tab changed the saved workspace. Resolve the conflict before resetting.'}}));return;}
      }else clearSavedWorkspace(storage);
      persistedSamples=false;
      const sqlEditor=get().sqlEditor;
      sqlEditor.setConfig({...sqlEditor.config,queries:[{...BLANK_QUERY}],selectedQueryId:BLANK_QUERY.id,openTabs:[BLANK_QUERY.id]});
      set(s=>({datapass:{...s.datapass,module:'notebook',notebook:{cells:[]},runs:[],restoredRunIds:[],runtimeOrigin:null,pipeline:structuredClone(demoPipeline),cards:DEMO_CARDS.map(c=>({...c})),missingSources:[],notice:'The saved workspace was reset. Tables already open in this tab stay until reload.'}}));
    },
    workspaceDocument(){
      const s=get(),d=s.datapass;
      const sources:SourceRef[]=Object.values(d.datasets).map(x=>({table:x.table,name:x.name.slice(0,260),kind:x.kind==='synthetic'?'sample':'user-file',...(x.bytes===undefined?{}:{bytes:x.bytes})}));
      for(const m of d.missingSources)if(!sources.some(x=>x.name===m.name))sources.push(m);
      const queries=s.sqlEditor.config.queries.slice(0,50).map(q=>({id:q.id.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||'query',name:(q.name||'Query').slice(0,120),query:q.query.slice(0,20000)}));
      const selected=queries.find(q=>q.id===s.sqlEditor.config.selectedQueryId)?.id??null;
      let collapsed=false;try{collapsed=s.layout.isCollapsed('catalog-area');}catch{/* layout not ready */}
      return {format:'datapass.workspace',version:1,savedAt:new Date().toISOString(),samples:persistedSamples,module:d.module,catalogCollapsed:collapsed,queries,selectedQueryId:selected,notebook:d.notebook,runs:d.runs,sources:sources.slice(0,50),runtimeOrigin:d.runtimeOrigin,pipeline:d.pipeline,cards:d.cards};
    },
    /** Keep mine overwrites the other writer explicitly; take theirs validates their whole document first (rule 8). */
    resolveConflict(choice){
      if(!guard||!get().datapass.conflict)return;
      if(choice==='mine'){
        const outcome=guard.keepMine(get().datapass.workspaceDocument());
        if(outcome.status==='saved')set(s=>({datapass:{...s.datapass,conflict:null,notice:"Kept this tab's workspace; the other tab's saved version was replaced."}}));
        else set(s=>({datapass:{...s.datapass,conflict:s.datapass.conflict&&{...s.datapass.conflict,error:outcome.status==='error'?outcome.message:'The conflict changed; choose again.'}}}));
        return;
      }
      let taken:WorkspaceDoc|null;
      try{taken=guard.takeTheirs().doc;}
      catch(error){set(s=>({datapass:{...s.datapass,conflict:s.datapass.conflict&&{...s.datapass.conflict,error:(error as Error).message}}}));return;}
      set(s=>({datapass:{...s.datapass,conflict:null}}));
      if(taken){persistedSamples=taken.samples;get().datapass.applyWorkspace(taken,'Loaded the workspace saved by the other tab. Nothing was run.');}
      else{
        const sqlEditor=get().sqlEditor;persistedSamples=false;
        sqlEditor.setConfig({...sqlEditor.config,queries:[{...BLANK_QUERY}],selectedQueryId:BLANK_QUERY.id,openTabs:[BLANK_QUERY.id]});
        set(s=>({datapass:{...s.datapass,module:'notebook',notebook:{cells:[]},runs:[],restoredRunIds:[],runtimeOrigin:null,pipeline:structuredClone(demoPipeline),cards:DEMO_CARDS.map(c=>({...c})),missingSources:[],notice:'The other tab reset the saved workspace; this tab now matches it. Tables already open stay until reload.'}}));
      }
    },
    async importFile(file){
      if(get().datapass.importing)return;
      if(file.size>64*1024*1024||file.size===0)throw new Error('Select a non-empty file of at most 64 MiB.');
      const extension=file.name.split('.').pop()?.toLowerCase();if(!extension||!['csv','json','parquet'].includes(extension))throw new Error('Supported: .csv, .json and .parquet');
      const table=tableId(file.name,++importSequence),registeredFile=`${table}.${extension}`;
      set(s=>({datapass:{...s.datapass,importing:true,error:null}}));
      let retained=false;
      try {
        const safeFile=new File([file],registeredFile,{type:file.type});
        if(extension==='parquet'){
          // SQLRooms drops its temporary File registration after materialization.
          // Own a session-scoped handle so later metadata queries still see the file.
          await connector.getDb().registerFileHandle(registeredFile,safeFile,DuckDBDataProtocol.BROWSER_FILEREADER,true);
          retained=true;
          await get().db.connector.loadFile(registeredFile,table);
        }else await get().db.connector.loadFile(safeFile,table);
        await get().db.refreshTableSchemas();
        set(s=>({datapass:{...s.datapass,selectedTable:table,module:'explore',missingSources:s.datapass.missingSources.filter(m=>m.name!==file.name),datasets:{...s.datapass.datasets,[table]:{table,name:file.name,kind:'user-file',bytes:file.size,registeredFile:retained?registeredFile:undefined}}}}));
      } catch(error){
        if(retained)try{await connector.getDb().dropFile(registeredFile);}catch(cleanupError){console.warn('Parquet handle cleanup failed',cleanupError);}
        get().datapass.setError(error instanceof Error?error.message:String(error));throw error;
      } finally {set(s=>({datapass:{...s.datapass,importing:false}}));}
    }
  }
}));

// Autosave authored state (debounced). Embeds and storage-less browsers never write.
// Every save goes through the revision guard: a document another tab saved since this one loaded opens the conflict
// banner instead of being overwritten (F205), and nothing is written until the user resolves it.
if(guard){
  let timer:ReturnType<typeof setTimeout>|undefined,last='';
  const openConflict=(conflict:WorkspaceConflict)=>{
    const current=roomStore.getState().datapass.conflict;
    if(current&&current.theirsRaw===conflict.theirsRaw&&current.sidecarMatches===conflict.sidecarMatches)return;
    roomStore.setState(s=>({datapass:{...s.datapass,conflict:{...conflict,error:null}}}));
  };
  roomStore.subscribe(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const state=roomStore.getState().datapass;
      if(state.conflict)return;
      const doc=state.workspaceDocument(),key=JSON.stringify({...doc,savedAt:''});
      if(key===last)return;
      const outcome=guard.save(doc);
      if(outcome.status==='conflict'){openConflict(outcome.conflict);return;}
      last=key;
      if(outcome.status==='error'&&roomStore.getState().datapass.notice!==outcome.message)roomStore.getState().datapass.setNotice(outcome.message);
    },400);
  });
  // Another tab's write arrives as a storage event (never in the writing tab); `key===null` is a clear().
  window.addEventListener('storage',(event:StorageEvent)=>{
    if(event.key!==null&&event.key!==WORKSPACE_KEY&&event.key!==WORKSPACE_REVISION_KEY)return;
    const conflict=guard.detect();
    if(conflict)openConflict(conflict);
  });
}

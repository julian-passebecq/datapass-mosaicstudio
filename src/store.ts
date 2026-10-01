import {createRoomStore,createRoomShellSlice,type RoomShellSliceState,type LayoutConfig} from '@sqlrooms/room-shell';
import {createWasmDuckDbConnector} from '@sqlrooms/duckdb';
import {DuckDBDataProtocol} from '@duckdb/duckdb-wasm';
import {createMosaicSlice,type MosaicSliceState} from '@sqlrooms/mosaic/dist/MosaicSlice';
import {createSqlEditorSlice,type SqlEditorSliceState} from '@sqlrooms/sql-editor/dist/SqlEditorSlice';
import {Database,PanelTop} from 'lucide-react';
import {CatalogPanel,WorkspacePanel} from './panels/ShellPanels';
import {seedSql} from './data/seed';
import {tableId} from './core/queries';
import {modules} from './core/host';
import {demoPipeline,type Pipeline,validatePipeline} from './core/pipeline';

export type DatasetInfo={table:string; name:string; kind:'synthetic'|'user-file'; bytes?:number; registeredFile?:string;};
export type BoardCard={id:string; title:string; lane:'Backlog'|'In progress'|'Review'|'Done'};
export type DataPassSlice={datapass:{
  module:string; selectedTable:string; datasets:Record<string,DatasetInfo>; importing:boolean; error:string|null; pipeline:Pipeline; cards:BoardCard[];
  openModule(id:string):void; selectTable(id:string):void; importFile(file:File):Promise<void>; setError(error:string|null):void; setPipeline(p:Pipeline):void; setCards(cards:BoardCard[]):void;
}};
export type RoomState=RoomShellSliceState&MosaicSliceState&SqlEditorSliceState&DataPassSlice;
let importSequence=0;
const requestedModule=new URLSearchParams(location.search).get('module');
const initialModule=modules.some(m=>m.id===requestedModule)?requestedModule!:'explore';
const base=new URL(import.meta.env.BASE_URL,location.href);
const connector=createWasmDuckDbConnector({
  bundles:{mvp:{mainModule:new URL('duckdb/duckdb-mvp.wasm',base).href,mainWorker:new URL('duckdb/duckdb-browser-mvp.worker.js',base).href},eh:{mainModule:new URL('duckdb/duckdb-eh.wasm',base).href,mainWorker:new URL('duckdb/duckdb-browser-eh.worker.js',base).href}},
  initializationQuery:seedSql,maximumThreads:1,
});
export const {roomStore,useRoomStore}=createRoomStore<RoomState>((set,get,store)=>({
  ...createRoomShellSlice({connector,config:{title:'DataPass MosaicStudio',dataSources:[]},captureException(error){console.error(error);get().datapass.setError(String(error));},
    layout:{config:{id:'root',type:'split',direction:'row',children:[{id:'catalog-area',type:'tabs',children:['catalog'],defaultSize:'19%',minSize:'190px',maxSize:'35%',activeTabIndex:0,collapsible:true,collapsedSize:0},{id:'work-area',type:'tabs',children:['workspace'],defaultSize:'81%',activeTabIndex:0,hideTabStrip:true}]} satisfies LayoutConfig,
      panels:{catalog:{title:'Project assets',icon:Database,component:CatalogPanel},workspace:{title:'Workspace',icon:PanelTop,component:WorkspacePanel}}}
  })(set,get,store),
  ...createMosaicSlice()(set,get,store),
  ...createSqlEditorSlice({queryResultLimit:100,queryResultLimitOptions:[100,500,1000],config:{queries:[{id:'overview',name:'Regional performance',query:'SELECT region, technology,\n       sum(energy_mwh) AS energy_mwh,\n       sum(revenue_eur) AS revenue_eur\nFROM operations\nGROUP BY region, technology\nORDER BY revenue_eur DESC;'}],selectedQueryId:'overview',openTabs:['overview']}})(set,get,store),
  initialize:async()=>{await get().db.refreshTableSchemas();},
  datapass:{module:initialModule,selectedTable:'operations',datasets:{operations:{table:'operations',name:'Renewable operations',kind:'synthetic'}},importing:false,error:null,pipeline:structuredClone(demoPipeline),
    cards:[{id:'scope',title:'Agree the data contract',lane:'Done'},{id:'inspect',title:'Inspect source quality',lane:'In progress'},{id:'review',title:'Review the pipeline definition',lane:'Review'},{id:'publish',title:'Prepare a client-facing app',lane:'Backlog'}],
    openModule(module){if(!modules.some(m=>m.id===module))return;set(s=>({datapass:{...s.datapass,module}}));},
    selectTable(selectedTable){set(s=>({datapass:{...s.datapass,selectedTable,module:'explore'}}));},
    setError(error){set(s=>({datapass:{...s.datapass,error}}));},
    setPipeline(pipeline){const validated=validatePipeline(pipeline);set(s=>({datapass:{...s.datapass,pipeline:validated}}));},
    setCards(cards){if(cards.length>100||cards.some(c=>!['Backlog','In progress','Review','Done'].includes(c.lane)||!c.title.trim()||c.title.length>160))throw new Error('Invalid board');set(s=>({datapass:{...s.datapass,cards}}));},
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
        set(s=>({datapass:{...s.datapass,selectedTable:table,module:'explore',datasets:{...s.datapass.datasets,[table]:{table,name:file.name,kind:'user-file',bytes:file.size,registeredFile:retained?registeredFile:undefined}}}}));
      } catch(error){
        if(retained)try{await connector.getDb().dropFile(registeredFile);}catch(cleanupError){console.warn('Parquet handle cleanup failed',cleanupError);}
        get().datapass.setError(error instanceof Error?error.message:String(error));throw error;
      } finally {set(s=>({datapass:{...s.datapass,importing:false}}));}
    }
  }
}));

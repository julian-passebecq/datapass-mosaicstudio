import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '../fluent';
import {ArrowDown,ArrowUp,Ban,Code2,Database,Download,FileUp,FolderOpen,Play,Plug,RotateCcw,Save,Trash2,Unplug} from 'lucide-react';
import {roomStore,useRoomStore,MODULE_IDS} from '../store';
import {Header,Results} from './Common';
import {ArtifactView as FrameworkArtifactView} from '../framework/foundation/ArtifactView';
import '../framework/site.css';
import type {Artifact} from '../framework/foundation/artifact';
import {createBrowserHost} from '../core/host';
import {toCsv} from '../core/queries';
import {addCell,cellSourceKey,executionPlan,moveCell,newCellId,removeCell,runnable,staleReason,updateCell,type Cell,type CellRun,type ChartChoice,type JupyterCell,type Notebook as NotebookDoc,type PythonCell,type SqlCell} from '../workspace/notebook';
import {sqlResultArtifact} from '../workspace/sql-artifact';
import {checkInputs,connectionFromHash,RuntimeClient,RuntimeError,runtimeOrigin,validToken,waitForRun,type RunRecord,type RuntimeModel} from '../workspace/runtime';
import {importWorkspace,type RunRef} from '../workspace/persist';
import {JupyterClient,JupyterError,tableObjects,type ExecuteOutcome,type NbOutput,type TablePayload} from '../workspace/jupyter';
import {NotebookService,NotebookServiceError,RESULT_FORMAT,resultTable,sourceSha256,storedTable,type CellResultDoc,type ExportPayload,type ImportedNotebook,type LossItem,type SaveItem,type StoreManifest} from '../workspace/results';
import {DEFAULT_JUPYTER_ORIGIN,InertBody,JupyterBar,LossReport,OutputsView,StorePanel,TableView,type JupyterState} from './NotebookJupyter';

type Preview={columns:{name:string;type:string}[];rows:Record<string,unknown>[];total:number};
type Previous={artifact?:Artifact;outputs?:NbOutput[];table?:TablePayload;finishedAt:string;label:string};
type Status='running'|'done'|'error'|'cancelled'|'skipped'|'failed'|'interrupted'|'disconnected'|'unknown'|'imported'|'missing';
type Result={status:Status;message?:string;artifact?:Artifact;artifactError?:string;preview?:Preview;record?:RunRecord;run?:CellRun;finishedAt?:string;previous?:Previous;
  outputs?:NbOutput[];table?:TablePayload;executionCount?:number|null;stored?:{sha:string};missing?:{sha:string};jobNote?:string};
type Runtime={status:'disconnected'|'connecting'|'connected'|'unavailable';origin:string;message?:string;models:RuntimeModel[];version?:string};
type Service={nbformat:string;store:{name:string;maxBytes:number;usedBytes:number}|null}|{unavailable:string};
const TOKEN_KEY='datapass.runtime.token';
const DEFAULT_ORIGIN='http://127.0.0.1:8765';
const FAILED:readonly Status[]=['error','failed','interrupted','disconnected','unknown','cancelled','missing'];
function sessionToken(origin:string):string|null{try{const v=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');return v&&v.origin===origin&&validToken(v.token)?v.token:null;}catch{return null;}}
function keepToken(origin:string,token:string|null){try{if(token)sessionStorage.setItem(TOKEN_KEY,JSON.stringify({origin,token}));else sessionStorage.removeItem(TOKEN_KEY);}catch{/* per-tab only */}}
/** The framework's renderers style themselves under `.studio-site`; the workbench reuses them unchanged. */
function ArtifactView({artifact}:{artifact:Artifact}){return <div className="studio-site notebook-artifact"><FrameworkArtifactView artifact={artifact}/></div>;}
const time=(iso?:string|null)=>iso?new Date(iso).toLocaleTimeString():'';
function jsonCell(v:unknown):string|number|boolean|null{
  if(v===null||v===undefined)return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  if(typeof v==='boolean'||typeof v==='string')return typeof v==='string'?v.slice(0,4000):v;
  if(typeof v==='bigint')return Number.isSafeInteger(Number(v))?Number(v):v.toString();
  if(v instanceof Date)return v.toISOString();
  try{return JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x).slice(0,4000);}catch{return String(v).slice(0,4000);}
}

export default function Notebook(){
  const notebook=useRoomStore(s=>s.datapass.notebook),setNotebook=useRoomStore(s=>s.datapass.setNotebook),runs=useRoomStore(s=>s.datapass.runs),recordRun=useRoomStore(s=>s.datapass.recordRun);
  const savedOrigin=useRoomStore(s=>s.datapass.runtimeOrigin),setRuntimeOrigin=useRoomStore(s=>s.datapass.setRuntimeOrigin),ready=useRoomStore(s=>s.room.initialized),setError=useRoomStore(s=>s.datapass.setError),setNotice=useRoomStore(s=>s.datapass.setNotice);
  const [results,setResults]=useState<Record<string,Result>>({});
  const [runtime,setRuntime]=useState<Runtime>({status:'disconnected',origin:savedOrigin??DEFAULT_ORIGIN,models:[]});
  const [consent,setConsent]=useState<{origin:string;token:string}|null>(null);
  const [problem,setProblem]=useState<string|null>(null);
  const [jupyter,setJupyter]=useState<JupyterState>({status:'disconnected',origin:DEFAULT_JUPYTER_ORIGIN});
  const [service,setService]=useState<Service|null>(null);
  const [manifest,setManifest]=useState<StoreManifest|null>(null);
  const [loss,setLoss]=useState<LossItem[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const client=useRef<RuntimeClient|null>(null),sequence=useRef(0),attempts=useRef<Record<string,number>>({}),controllers=useRef<Record<string,AbortController>>({}),activeRun=useRef<Record<string,string>>({}),cancelRequested=useRef<Record<string,boolean>>({}),sequences=useRef<Record<string,number>>({});
  const kernel=useRef<JupyterClient|null>(null),executions=useRef<Record<string,string>>({}),svc=useRef<NotebookService|null>(null);
  const patch=useCallback((id:string,update:(r:Result|undefined)=>Result|undefined)=>setResults(all=>{const next=update(all[id]);const copy={...all};if(next)copy[id]=next;else delete copy[id];return copy;}),[]);
  const store=service&&'store' in service?service.store:null;

  const connect=useCallback(async(origin:string,token:string)=>{
    let candidate:RuntimeClient;
    try{candidate=new RuntimeClient({origin,token});}catch(error){setRuntime(r=>({...r,status:'disconnected',message:(error as Error).message}));return;}
    setRuntime(r=>({...r,status:'connecting',origin:candidate.origin,message:undefined}));
    try{
      const health=await candidate.health(),models=await candidate.models();
      client.current=candidate;keepToken(candidate.origin,token);setRuntimeOrigin(candidate.origin);
      setRuntime({status:'connected',origin:candidate.origin,models,version:health.version});
    }catch(error){
      client.current=null;
      setRuntime(r=>({...r,status:error instanceof RuntimeError&&error.kind==='unavailable'?'unavailable':'disconnected',message:(error as Error).message,models:[]}));
      return;
    }
    // Optional notebook routes on the same trusted service: .ipynb exchange and the result store.
    const notebookService=new NotebookService({origin:candidate.origin,token});
    try{
      const status=await notebookService.status();svc.current=notebookService;setService(status);
      if(status.store)setManifest(await notebookService.manifest());
    }catch(error){svc.current=null;setService({unavailable:(error as Error).message});setManifest(null);}
  },[setRuntimeOrigin]);
  // A link printed by the runtime carries `#runtime=…&token=…`. It is removed from the address bar and needs explicit consent.
  useEffect(()=>{
    const readLink=()=>{
      try{const link=connectionFromHash(location.hash);if(link){history.replaceState(null,'',location.pathname+location.search);setConsent(link);return true;}}
      catch(error){history.replaceState(null,'',location.pathname+location.search);setProblem('The runtime link was refused: '+(error as Error).message);return true;}
      return false;
    };
    if(!readLink()&&savedOrigin){const token=sessionToken(savedOrigin);if(token)void connect(savedOrigin,token);}
    addEventListener('hashchange',readLink);
    return()=>removeEventListener('hashchange',readLink);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  /** Stop following a cell AND cancel its run on the runtime (or interrupt its kernel execution), so nothing keeps running unseen. */
  const stop=useCallback((id:string)=>{
    controllers.current[id]?.abort();
    const runId=activeRun.current[id];delete activeRun.current[id];
    if(runId&&client.current)void client.current.cancel(runId).catch(()=>{/* the runtime may already have finished it */});
    const exec=executions.current[id];
    if(exec&&kernel.current)void kernel.current.interrupt(exec).catch(()=>{/* the kernel may already be idle */});
  },[]);
  const stopAll=useCallback(()=>{for(const id of new Set([...Object.keys(controllers.current),...Object.keys(activeRun.current),...Object.keys(executions.current)]))stop(id);},[stop]);
  useEffect(()=>()=>stopAll(),[stopAll]);
  // The kernel this page started is shut down when the page goes away (best effort) or when you disconnect.
  useEffect(()=>{const bye=()=>{void kernel.current?.shutdown();};addEventListener('pagehide',bye);return()=>{removeEventListener('pagehide',bye);bye();};},[]);

  const pair=useCallback(async(origin:string,token:string)=>{
    let candidate:JupyterClient;
    try{candidate=new JupyterClient({origin,token});}catch(error){setJupyter(j=>({...j,status:'disconnected',message:(error as Error).message}));return;}
    if(kernel.current){await kernel.current.shutdown();kernel.current=null;}
    setJupyter({status:'connecting',origin:candidate.origin});
    try{
      const info=await candidate.connect();
      candidate.onDisconnect=reason=>{if(kernel.current===candidate){kernel.current=null;setJupyter(j=>({...j,status:'lost',kernel:undefined,message:reason+' Pair again to get a new kernel; variables are not restored.'}));}};
      kernel.current=candidate;
      setJupyter({status:'connected',origin:candidate.origin,kernel:info});
    }catch(error){
      setJupyter({status:error instanceof JupyterError&&error.kind==='denied'?'denied':error instanceof JupyterError&&error.kind==='unavailable'?'unavailable':'disconnected',origin:candidate.origin,message:(error as Error).message});
    }
  },[]);
  const unpair=useCallback(async()=>{const k=kernel.current;kernel.current=null;await k?.shutdown();setJupyter(j=>({status:'disconnected',origin:j.origin,message:'Kernel shut down. Its variables are gone; saved results are unaffected.'}));},[]);

  function change(next:()=>NotebookDoc){try{setNotebook(next());setProblem(null);}catch(error){setProblem((error as Error).message);}}
  function add(kind:'sql'|'python'|'jupyter'|'note'){
    const id=newCellId(notebook,kind),title=kind==='sql'?'SQL query':kind==='python'?'Python model run':kind==='jupyter'?'Python cell':'Note';
    const model=runtime.models[0];
    const cell:Cell=kind==='sql'?{id,kind,title,sql:'SELECT 42 AS answer;',dependsOn:[]}:kind==='python'?{id,kind,title,model:model?.id??'wind-reference',inputs:Object.fromEntries((model?.inputs??[]).map(i=>[i.id,i.default])),dependsOn:[]}:kind==='jupyter'?{id,kind,title,code:'',dependsOn:[]}:{id,kind,title,text:'',dependsOn:[]};
    change(()=>addCell(notebook,cell));
  }

  async function runSql(cell:SqlCell,signal:AbortSignal):Promise<Result>{
    const db=roomStore.getState().db;
    const table=await db.connector.query(cell.sql,{signal});
    const total=table.numRows,limited=total>10000?table.slice(0,10000):table;
    // Arrow DECIMAL cells arrive as unscaled big numbers; apply the column scale so values stay numeric.
    const decimals=table.schema.fields.flatMap(f=>{const scale=(f.type as {scale?:unknown}).scale;return /^Decimal/.test(String(f.type))&&typeof scale==='number'?[{name:f.name,scale}]:[];});
    const rows=limited.toArray().map(r=>{const row=r.toJSON() as Record<string,unknown>;for(const d of decimals){const v=row[d.name];if(v!==null&&typeof v==='object'){const n=Number(v)/10**d.scale;row[d.name]=Number.isFinite(n)?n:String(v);}}return row;});
    const preview:Preview={columns:table.schema.fields.map(f=>({name:f.name,type:String(f.type)})),rows,total};
    void db.refreshTableSchemas();
    return {status:'done',preview,...wrapSql(cell,preview),finishedAt:new Date().toISOString()};
  }
  function wrapSql(cell:SqlCell,preview:Preview):{artifact?:Artifact;artifactError?:string}{
    if(preview.total>10000)return {artifactError:`The result has ${preview.total.toLocaleString()} rows. Results above 10,000 rows stay as a preview; aggregate or add LIMIT to save, chart or export them as an artifact.`};
    try{return {artifact:sqlResultArtifact({columns:preview.columns.map(c=>c.name),rows:preview.rows,cellId:cell.id,title:cell.title,sql:cell.sql,chart:cell.chart})};}catch(error){return {artifactError:(error as Error).message};}
  }
  async function runPython(cell:PythonCell,signal:AbortSignal,onUpdate:(r:RunRecord)=>void):Promise<Result>{
    const c=client.current;
    if(!c||runtime.status!=='connected')throw new RuntimeError('No local runtime is connected. Connect one above; nothing was run.','unavailable');
    const model=runtime.models.find(m=>m.id===cell.model);
    if(!model)throw new RuntimeError(`The connected runtime does not offer model "${cell.model}".`,'rejected');
    const inputs=checkInputs(model,cell.inputs);
    const ref=(r:RunRecord):RunRef=>({runId:r.runId,cellId:cell.id,origin:c.origin,model:r.model,modelVersion:r.modelVersion,status:r.status,inputHash:r.inputHash,inputs:r.inputs,submittedAt:r.submittedAt,finishedAt:r.finishedAt,artifactId:r.artifactId,artifactSha256:r.artifactSha256});
    const submitted=await c.submit(model.id,inputs,signal);
    activeRun.current[cell.id]=submitted.runId;recordRun(ref(submitted));onUpdate(submitted);
    // Cancel pressed while the submission was in flight: the run exists on the runtime, so cancel it there.
    if(cancelRequested.current[cell.id]){delete cancelRequested.current[cell.id];try{onUpdate(await c.cancel(submitted.runId));}catch{/* the poll below reports the real terminal state */}}
    const final=await waitForRun(c,submitted,{signal,onUpdate:r=>{onUpdate(r);}});
    recordRun(ref(final));delete activeRun.current[cell.id];
    if(final.status==='cancelled')return {status:'cancelled',record:final,message:`Run ${final.runId} was cancelled on the runtime. No result was produced.`};
    if(final.status==='failed')return {status:'error',record:final,message:`Run ${final.runId} failed on the runtime: ${final.error??'no detail'}`};
    const artifact=await c.artifact(final,signal);
    if(cell.outputTable&&artifact.payload.kind==='table'){
      const db=roomStore.getState().db;
      if(Object.hasOwn(roomStore.getState().datapass.datasets,cell.outputTable))throw new Error(`Output table "${cell.outputTable}" is an opened dataset; choose another name.`);
      signal.throwIfAborted(); // a cancelled or superseded run never replaces a table
      await db.connector.loadObjects(artifact.payload.rows as Record<string,unknown>[],cell.outputTable,{replace:true});
      await db.refreshTableSchemas();
    }
    return {status:'done',record:final,artifact,finishedAt:final.finishedAt??new Date().toISOString()};
  }
  async function loadTable(name:string,table:TablePayload,signal?:AbortSignal):Promise<void>{
    if(Object.hasOwn(roomStore.getState().datapass.datasets,name))throw new Error(`Output table "${name}" is an opened dataset; choose another name.`);
    if(!table.rows.length)throw new Error(`The published table "${name}" has no rows; no SQL table was created.`);
    signal?.throwIfAborted();
    const db=roomStore.getState().db;
    await db.connector.loadObjects(tableObjects(table),name,{replace:true});
    await db.refreshTableSchemas();
  }
  /** Run one Python cell on the paired kernel. Never throws for a failed cell: every observed outcome is a distinct state. */
  async function runJupyter(cell:JupyterCell,signal:AbortSignal,onOutputs:(outputs:NbOutput[])=>void):Promise<Result>{
    const k=kernel.current;
    if(!k||!k.connected)return {status:'disconnected',message:'No Jupyter kernel is paired. Pair one above; nothing was run.'};
    const source=await sourceSha256(cellSourceKey(cell));
    let job:string|null=null;
    if(svc.current&&store)try{job=await svc.current.startJob(cell.id,source,'jupyter');}catch{/* the run itself does not depend on the record */}
    const live:NbOutput[]=[];
    let outcome:ExecuteOutcome;
    try{
      const {id,done}=k.execute(cell.code,o=>{if(!live.includes(o))live.push(o);onOutputs([...live]);});
      executions.current[cell.id]=id;
      outcome=await done;
    }catch(error){outcome={status:error instanceof JupyterError&&error.kind==='disconnected'?'disconnected':'unknown',executionCount:null,outputs:live,truncated:false,detail:(error as Error).message};}
    finally{delete executions.current[cell.id];}
    let result:Result;
    const base={outputs:outcome.outputs,executionCount:outcome.executionCount,finishedAt:new Date().toISOString()};
    if(outcome.status==='ok'){
      result={status:'done',...base};
      if(cell.outputTable){
        try{const table=await k.publishTable(cell.outputTable);await loadTable(cell.outputTable,table,signal);result.table=table;}
        catch(error){result={status:'failed',...base,message:'The cell ran, but its output table was not published: '+(error as Error).message};}
      }
    }else if(outcome.status==='interrupted')result={status:'interrupted',...base,message:'Interrupted on the kernel at your request. No new result; the last valid output stays below, marked stale. Variables the cell set before the interrupt may remain in the kernel.'};
    else if(outcome.status==='error')result={status:'failed',...base,message:`The cell failed on the kernel: ${outcome.error?.ename??'error'}${outcome.error?.evalue?': '+outcome.error.evalue:''}`};
    else if(outcome.status==='disconnected')result={status:'disconnected',...base,message:outcome.detail??'The kernel connection closed during the run; its outcome was not observed.'};
    else result={status:'unknown',...base,message:outcome.detail??'The outcome of this run was not observed.'};
    if(job&&svc.current){const final=result.status==='done'?'succeeded':result.status==='failed'?'failed':result.status==='interrupted'?'interrupted':result.status==='disconnected'?'disconnected':'unknown';void svc.current.finishJob(job,final).catch(()=>{});}
    return result;
  }

  async function run(target:string){
    let plan:string[];
    try{plan=executionPlan(notebook,target);}catch(error){setProblem((error as Error).message);return;}
    const doc=notebook,startAttempts=Object.fromEntries(plan.map(p=>[p,attempts.current[p]??0]));
    for(let i=0;i<plan.length;i++){
      const id=plan[i],cell=doc.cells.find(c=>c.id===id)!;
      stop(id);
      const controller=new AbortController(),attempt=(attempts.current[id]??0)+1;
      controllers.current[id]=controller;attempts.current[id]=attempt;delete cancelRequested.current[id];
      patch(id,prev=>({status:'running',previous:prev&&prev.status==='done'&&prev.finishedAt&&(prev.artifact||prev.outputs)?{artifact:prev.artifact,outputs:prev.outputs,table:prev.table,finishedAt:prev.finishedAt,label:prev.stored?'Last saved result':prev.artifact?'Previous result':'Last valid output'}:prev?.previous}));
      let result:Result;
      try{
        result=cell.kind==='sql'?await runSql(cell,controller.signal):cell.kind==='jupyter'?await runJupyter(cell,controller.signal,outputs=>{if(attempts.current[id]===attempt)patch(id,prev=>({...(prev??{status:'running'}),status:'running',outputs}));}):await runPython(cell as PythonCell,controller.signal,record=>{if(attempts.current[id]===attempt)patch(id,prev=>({...(prev??{status:'running'}),status:'running',record}));});
        if(result.status==='done'){
          sequence.current++;
          const deps=Object.fromEntries(cell.dependsOn.map(d=>[d,sequences.current[d]??-1]));
          if(attempts.current[id]===attempt)sequences.current[id]=sequence.current;
          result.run={cellId:id,sequence:sequence.current,sourceKey:cellSourceKey(cell),dependencySequences:deps};
        }
      }catch(error){
        const aborted=controller.signal.aborted||(error as Error)?.name==='AbortError'||(error instanceof RuntimeError&&error.kind==='aborted');
        if(error instanceof RuntimeError&&error.kind==='unavailable')setRuntime(r=>r.status==='connected'?{...r,status:'unavailable',message:error.message}:r);
        result={status:aborted?'cancelled':'error',message:aborted?'Stopped before a result was produced.':(error as Error).message};
      }
      if(attempts.current[id]!==attempt)return; // superseded by a newer run of the same cell: ignore this late result
      patch(id,prev=>({...result,record:result.record??prev?.record,previous:result.status==='done'?undefined:prev?.previous}));
      if(result.status!=='done'){
        for(const rest of plan.slice(i+1))if((attempts.current[rest]??0)===startAttempts[rest])patch(rest,prev=>({...(prev??{}),status:'skipped',message:`Not run: dependency ${cell.title} (${id}) did not finish.`}));
        return;
      }
    }
  }
  async function cancel(id:string){
    const runId=activeRun.current[id],cell=notebook.cells.find(c=>c.id===id);
    if(cell?.kind==='jupyter'){
      const exec=executions.current[id];
      if(exec&&kernel.current){try{await kernel.current.interrupt(exec);patch(id,prev=>prev&&{...prev,message:'Interrupt requested; waiting for the kernel to stop.'});}catch(error){setProblem('The interrupt was not confirmed: '+(error as Error).message);}}
      return; // the kernel's reply reports the real outcome
    }
    if(cell?.kind==='python'&&!runId){cancelRequested.current[id]=true;patch(id,prev=>prev&&{...prev,message:'Cancellation requested; waiting for the runtime to accept the run.'});return;}
    if(runId&&client.current){
      try{const record=await client.current.cancel(runId);patch(id,prev=>prev?{...prev,record}:prev);if(record.status!=='cancelled'&&record.status!=='queued'&&record.status!=='running')setProblem(`Run ${runId} had already finished (${record.status}) when the cancellation arrived.`);}
      catch(error){setProblem('Cancellation was not confirmed: '+(error as Error).message);}
      return; // polling continues until the runtime reports the terminal state
    }
    controllers.current[id]?.abort();
  }
  async function reopen(cell:PythonCell,ref:RunRef){
    const c=client.current;
    if(!c||c.origin!==ref.origin){setProblem(`Connect the runtime at ${ref.origin} to fetch run ${ref.runId}.`);return;}
    try{
      stop(cell.id);
      const attempt=(attempts.current[cell.id]??0)+1;attempts.current[cell.id]=attempt;
      const record=await c.status(ref.runId);
      if(attempts.current[cell.id]!==attempt)return;
      if(record.status!=='succeeded'){patch(cell.id,prev=>({...(prev??{}),status:'error',record,message:`Run ${ref.runId} is ${record.status}; it has no result.`}));return;}
      const artifact=await c.artifact(record);
      if(attempts.current[cell.id]!==attempt)return; // a newer run or load started meanwhile
      // Same model and inputs as the cell now: current. Otherwise it is shown, but flagged stale.
      const matches=record.model===cell.model&&Object.keys(record.inputs).length===Object.keys(cell.inputs).length&&Object.entries(cell.inputs).every(([k,v])=>record.inputs[k]===v);
      const seq=++sequence.current;if(matches)sequences.current[cell.id]=seq;else delete sequences.current[cell.id];
      const runInfo={cellId:cell.id,sequence:seq,sourceKey:matches?cellSourceKey(cell):'reopened:'+record.runId,dependencySequences:Object.fromEntries(cell.dependsOn.map(d=>[d,sequences.current[d]??-1]))};
      patch(cell.id,()=>({status:'done',record,artifact,run:runInfo,finishedAt:record.finishedAt??undefined,message:`Re-fetched result of earlier run ${ref.runId} (${time(record.finishedAt)}). It is not a new computation.`}));
    }catch(error){
      setProblem(error instanceof RuntimeError&&error.status===404?`The runtime no longer holds run ${ref.runId} (it keeps run results in memory only, and restarts clear them). Run the cell again.`:(error as Error).message);
    }
  }
  function rechart(cell:SqlCell,chart:ChartChoice|undefined){
    // Presentation only: the stored rows are re-wrapped; the query is not executed again.
    change(()=>updateCell(notebook,{...cell,chart}));
    const current=results[cell.id];
    if(current?.preview&&current.preview.total<=10000)try{const artifact=sqlResultArtifact({columns:current.preview.columns.map(c=>c.name),rows:current.preview.rows,cellId:cell.id,title:cell.title,sql:cell.sql,chart});patch(cell.id,prev=>prev&&{...prev,artifact,artifactError:undefined});}catch(error){patch(cell.id,prev=>prev&&{...prev,artifactError:(error as Error).message});}
  }

  // --- .ipynb exchange and the durable result store (py/service notebook routes) -----------------------
  function exportPayload(cells:Cell[],stored:Record<string,string>={}):ExportPayload{
    const outputs:Record<string,NbOutput[]>={},counts:Record<string,number>={},refs:Record<string,string>={};
    for(const c of cells){
      const r=results[c.id];
      if(c.kind==='jupyter'&&r&&(r.status==='done'||r.status==='imported')&&r.outputs){outputs[c.id]=r.outputs;if(typeof r.executionCount==='number')counts[c.id]=r.executionCount;}
      const sha=stored[c.id]??r?.stored?.sha;if(sha&&runnable(c))refs[c.id]=sha;
    }
    return {cells,outputs,executionCounts:counts,results:refs};
  }
  async function resultDoc(cell:Cell,r:Result):Promise<SaveItem|null>{
    if(r.status!=='done'||!r.run||!r.finishedAt)return null;
    const source=await sourceSha256(r.run.sourceKey);
    let doc:CellResultDoc;
    if(cell.kind==='jupyter')doc={format:RESULT_FORMAT,version:1,cellId:cell.id,cellKind:'jupyter',sourceSha256:source,outputs:r.outputs??[],table:r.table?storedTable(r.table):null,executionCount:r.executionCount??null,finishedAt:r.finishedAt,origin:'jupyter'};
    else if(cell.kind==='sql'&&r.preview){
      const names=r.preview.columns.map(c=>c.name);if(!names.length||new Set(names).size!==names.length)return null;
      doc={format:RESULT_FORMAT,version:1,cellId:cell.id,cellKind:'sql',sourceSha256:source,outputs:[],table:{columns:names,rows:r.preview.rows.map(row=>names.map(n=>jsonCell(row[n]))),total:r.preview.total,truncated:r.preview.total>r.preview.rows.length},executionCount:null,finishedAt:r.finishedAt,origin:'duckdb'};
    }else return null;
    return {cellId:cell.id,cellKind:doc.cellKind,sourceSha256:source,result:doc,run:{finishedAt:r.finishedAt,executionCount:r.executionCount??null,runtime:doc.origin,...(r.stored?{fromStore:r.stored.sha}:{})}};
  }
  async function saveToStore(){
    const s=svc.current;if(!s||!store){setProblem('No result store: start the local service with --results-dir <folder outside Git> and connect it.');return;}
    setBusy('Saving results...');
    try{
      const items:SaveItem[]=[],skipped:string[]=[];
      for(const c of notebook.cells){const r=results[c.id];if(!r||!runnable(c))continue;const item=await resultDoc(c,r);if(item)items.push(item);else if(r.status==='done')skipped.push(c.title);}
      const receipt=await s.save(exportPayload(notebook.cells),items);
      for(const r of receipt.results)patch(r.cellId,prev=>prev&&{...prev,stored:{sha:r.resultSha256}});
      setManifest(await s.manifest());
      setNotice(`Saved ${receipt.results.length} result${receipt.results.length===1?'':'s'} and the notebook (${receipt.notebookSha256.slice(0,12)}) to the result store "${store.name}".${skipped.length?' Not saved (kept by run reference only): '+skipped.join(', ')+'.':''}`);
    }catch(error){setProblem((error instanceof NotebookServiceError&&error.status===507?'Result store full: ':'Saving to the result store failed: ')+(error as Error).message);}
    finally{setBusy(null);}
  }
  async function loadStored(cell:Cell,sha:string):Promise<boolean>{
    const s=svc.current;if(!s)return false;
    const attempt=(attempts.current[cell.id]??0)+1;attempts.current[cell.id]=attempt;
    try{
      const doc=await s.result(sha,cell.id);
      const current=await sourceSha256(cellSourceKey(cell)),matches=doc.sourceSha256===current,table=resultTable(doc);
      let preview:Preview|undefined,wrapped:{artifact?:Artifact;artifactError?:string}={};
      let note='';
      if(cell.kind==='jupyter'&&cell.outputTable&&table){try{await loadTable(cell.outputTable,table);}catch(error){note=' Its table was not loaded into SQL: '+(error as Error).message;}}
      if(cell.kind==='sql'&&table){preview={columns:table.columns.map(c=>({name:c.name,type:c.type})),rows:tableObjects(table),total:table.total};wrapped=wrapSql(cell,preview);}
      if(attempts.current[cell.id]!==attempt)return false;
      const seq=++sequence.current;if(matches)sequences.current[cell.id]=seq;else delete sequences.current[cell.id];
      const run:CellRun={cellId:cell.id,sequence:seq,sourceKey:matches?cellSourceKey(cell):'stored:'+sha,dependencySequences:Object.fromEntries(cell.dependsOn.map(d=>[d,sequences.current[d]??-1]))};
      patch(cell.id,()=>({status:'done',outputs:cell.kind==='jupyter'?doc.outputs:undefined,table:cell.kind==='jupyter'?table??undefined:undefined,preview,...wrapped,executionCount:doc.executionCount,finishedAt:doc.finishedAt,stored:{sha},run,
        message:`Saved result ${sha.slice(0,12)} reopened from the result store (computed ${new Date(doc.finishedAt).toLocaleString()}). Not recomputed; kernel variables are not restored.${note}`}));
      return true;
    }catch(error){
      if(attempts.current[cell.id]!==attempt)return false;
      patch(cell.id,prev=>({...(prev??{}),status:'missing',missing:{sha},stored:undefined,message:`Saved result ${sha.slice(0,12)} is not available: ${(error as Error).message} Relink another saved result of this cell, or Run it again explicitly.`}));
      return false;
    }
  }
  /** Apply an imported notebook atomically: the whole document is validated first; nothing runs. */
  async function applyImported(imported:ImportedNotebook,label:string,fromStore:boolean){
    try{setNotebook({cells:imported.cells});}catch(error){throw new Error((error as Error).message);}
    stopAll();sequences.current={};
    const next:Record<string,Result>={};
    for(const c of imported.cells)if(c.kind==='jupyter'&&imported.outputs[c.id]?.length)next[c.id]={status:'imported',outputs:imported.outputs[c.id],executionCount:imported.executionCounts[c.id]??null,message:'Output imported from the notebook file: untrusted data, not produced in this session. Run the cell to compute it here.'};
    setResults(next);setLoss(imported.loss);setProblem(null);
    let reopened=0;
    if(svc.current&&store){
      const m=await svc.current.manifest();setManifest(m);
      for(const c of imported.cells){const sha=imported.results[c.id];if(sha&&await loadStored(c,sha))reopened++;}
      // Runs whose outcome was never observed (service or browser stopped) are reported, not turned into results.
      for(const c of imported.cells){const job=m.jobs.filter(j=>j.cellId===c.id).at(-1);if(job&&job.status!=='succeeded'&&job.status!=='running')patch(c.id,prev=>({...(prev??{status:'unknown'}),jobNote:`Last recorded run (started ${new Date(job.startedAt).toLocaleString()}): ${job.status}.${job.detail?' '+job.detail:''}`}));}
    }
    const refs=Object.keys(imported.results).length;
    setNotice(`${label}: ${imported.cells.length} cell${imported.cells.length===1?'':'s'} (nbformat ${imported.nbformat}). Nothing was run.${refs?` ${reopened} of ${refs} saved result${refs===1?'':'s'} reopened from the result store without recomputation.`:''}${fromStore?'':' Imported outputs are shown as untrusted data.'}`);
  }
  async function importIpynb(file:File){
    const s=svc.current;
    if(!s){setError('Notebook import uses nbformat in the local service. Connect the local runtime first; nothing changed.');return;}
    try{
      if(file.size>4*1024*1024)throw new Error('The notebook is above 4 MB.');
      const imported=await s.importIpynb(file.name,await file.text());
      await applyImported(imported,`Imported ${file.name}`,false);
    }catch(error){setError('Notebook import refused, nothing changed: '+(error as Error).message);}
  }
  async function openFromStore(){
    const s=svc.current;if(!s||!store){setProblem('No result store is connected.');return;}
    setBusy('Opening the saved notebook...');
    try{const saved=await s.notebook();await applyImported(saved.imported,`Opened the saved notebook ${saved.sha256.slice(0,12)} from "${store.name}"`,true);}
    catch(error){setError('Opening from the result store failed, nothing changed: '+(error as Error).message);}
    finally{setBusy(null);}
  }
  async function exportIpynb(){
    const s=svc.current;if(!s){setProblem('Exporting .ipynb uses nbformat in the local service. Connect the local runtime first.');return;}
    try{const {text}=await s.exportIpynb(exportPayload(notebook.cells));createBrowserHost().saveDownload('mosaicstudio-notebook.ipynb',new Blob([text],{type:'application/x-ipynb+json'}));}
    catch(error){setProblem('The .ipynb export failed: '+(error as Error).message);}
  }
  async function deleteStored(sha:string){
    const s=svc.current;if(!s)return;
    try{
      setManifest(await s.deleteResult(sha));
      for(const [id,r] of Object.entries(results))if(r.stored?.sha===sha)patch(id,prev=>prev&&{...prev,stored:undefined,message:`Saved copy ${sha.slice(0,12)} was deleted from the store at your request. The result shown is from this session only.`});
    }catch(error){setProblem('Deleting the saved result failed: '+(error as Error).message);}
  }

  const doc=useRoomStore(s=>s.datapass.workspaceDocument);
  const applyWorkspace=useRoomStore(s=>s.datapass.applyWorkspace),reset=useRoomStore(s=>s.datapass.resetWorkspace);
  const picker=useRef<HTMLInputElement>(null),ipynbPicker=useRef<HTMLInputElement>(null),[confirmReset,setConfirmReset]=useState(false);
  async function importFile(file:File){
    try{
      if(file.size>1024*1024)throw new Error('The file is too large to be a workspace.');
      const {doc:imported,migratedFrom}=importWorkspace(await file.text(),MODULE_IDS);
      stopAll();
      setResults({});applyWorkspace(imported,`Imported ${file.name}${migratedFrom?' (migrated from '+migratedFrom+')':''}. Nothing was run: run cells explicitly.`);
    }catch(error){setError('Workspace import refused, nothing changed: '+(error as Error).message);}
  }
  const staleMap=useMemo(()=>Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.run])),[results]);

  return <section className="panel-content notebook" aria-label="Notebook">
    <Header eyebrow="Author / notebook" title="Notebook" detail="SQL runs in this browser (DuckDB-WASM). Python cells run allowlisted models on a local runtime you connect, or your own code on a Jupyter kernel you pair. Cells run only when you press Run, with their declared dependencies first.">
      <Button size="small" icon={<Download size={14}/>} onClick={()=>createBrowserHost().saveDownload('mosaicstudio-workspace.json',new Blob([JSON.stringify(doc(),null,2)],{type:'application/json'}))}>Export workspace</Button>
      <Button size="small" icon={<FileUp size={14}/>} onClick={()=>picker.current?.click()}>Import workspace</Button>
      <input hidden ref={picker} type="file" accept=".json,application/json" aria-label="Import workspace file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/>
      {confirmReset?<><Button size="small" appearance="primary" onClick={()=>{stopAll();setResults({});reset();setConfirmReset(false);}}>Confirm reset</Button><Button size="small" onClick={()=>setConfirmReset(false)}>Keep workspace</Button></>:<Button size="small" icon={<RotateCcw size={14}/>} onClick={()=>setConfirmReset(true)}>Reset workspace</Button>}
    </Header>
    <p className="footnote">Saved in this browser: SQL text, cells (including Python source), model inputs, layout and run references. Never saved: file contents, result rows, the runtime token or the Jupyter token. The workspace and .ipynb exports contain your code and inputs; review them before sharing.</p>
    <RuntimeBar runtime={runtime} consent={consent} onConsent={accepted=>{const c=consent;setConsent(null);if(accepted&&c)void connect(c.origin,c.token);}} onConnect={(o,t)=>void connect(o,t)} onDisconnect={()=>{client.current=null;svc.current=null;setService(null);setManifest(null);keepToken(runtime.origin,null);setRuntime(r=>({status:'disconnected',origin:r.origin,models:[]}));}}/>
    <JupyterBar state={jupyter} onPair={(o,t)=>void pair(o,t)} onDisconnect={()=>void unpair()}/>
    <div className="notebook-files" role="group" aria-label="Notebook files and saved results" data-testid="notebook-files" data-store={store?'ready':service&&'unavailable' in service?'unavailable':'none'}>
      <Button size="small" icon={<FileUp size={14}/>} disabled={!svc.current} onClick={()=>ipynbPicker.current?.click()}>Import .ipynb</Button>
      <input hidden ref={ipynbPicker} type="file" accept=".ipynb,application/x-ipynb+json,application/json" aria-label="Import notebook file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importIpynb(f);}}/>
      <Button size="small" icon={<Download size={14}/>} disabled={!svc.current} onClick={()=>void exportIpynb()}>Export .ipynb</Button>
      <Button size="small" icon={<Save size={14}/>} disabled={!store||!!busy} onClick={()=>void saveToStore()}>Save results to store</Button>
      <Button size="small" icon={<FolderOpen size={14}/>} disabled={!store||!!busy} onClick={()=>void openFromStore()}>Open from store</Button>
      <small>{busy??(store?`Result store "${store.name}" (${store.usedBytes.toLocaleString()} of ${store.maxBytes.toLocaleString()} bytes) via nbformat ${service&&'nbformat' in service?service.nbformat:''}.`:service&&'unavailable' in service?`Notebook files unavailable: ${service.unavailable}`:service?'No result store: start the local service with --results-dir <folder outside Git> to save results.':'Connect the local runtime to import/export .ipynb and save results.')}</small>
    </div>
    {manifest&&<StorePanel manifest={manifest} cells={notebook.cells} onDelete={sha=>void deleteStored(sha)} onRefresh={()=>{void svc.current?.manifest().then(setManifest).catch(e=>setProblem((e as Error).message));}}/>}
    <LossReport loss={loss} onDismiss={()=>setLoss([])}/>
    {problem&&<div className="notice error" role="alert"><span>{problem}</span> <Button size="small" onClick={()=>setProblem(null)}>Dismiss</Button></div>}
    {!notebook.cells.length&&<div className="empty notebook-empty" data-testid="notebook-empty"><h2>Blank notebook</h2><p>Add a SQL cell to query tables you open, a Python cell to run your code on a paired Jupyter kernel, or a model run on the local runtime. Nothing is preloaded.</p></div>}
    <ol className="cells">{notebook.cells.map((cell,index)=><CellCard key={cell.id} cell={cell} index={index} notebook={notebook} result={results[cell.id]} stale={staleReason(notebook,staleMap,cell.id)} runtime={runtime} runs={runs.filter(r=>r.cellId===cell.id)} ready={ready}
      relinks={manifest&&results[cell.id]?.status==='missing'?manifest.entries.filter(e=>e.cellId===cell.id&&e.present&&e.resultSha256!==results[cell.id]?.missing?.sha):[]}
      onChange={next=>change(()=>updateCell(notebook,next))} onMove={d=>change(()=>moveCell(notebook,cell.id,d))} onRemove={()=>{stop(cell.id);delete sequences.current[cell.id];change(()=>removeCell(notebook,cell.id));patch(cell.id,()=>undefined);}}
      onRun={()=>void run(cell.id)} onCancel={()=>void cancel(cell.id)} onReopen={ref=>void reopen(cell as PythonCell,ref)} onChart={chart=>rechart(cell as SqlCell,chart)} onRelink={sha=>void loadStored(cell,sha)}/>)}</ol>
    <div className="cell-add" role="group" aria-label="Add a cell"><Button icon={<Database size={14}/>} onClick={()=>add('sql')}>Add SQL cell</Button><Button icon={<Code2 size={14}/>} onClick={()=>add('jupyter')}>Add Python (Jupyter) cell</Button><Button icon={<Play size={14}/>} onClick={()=>add('python')}>Add Python cell</Button><Button onClick={()=>add('note')}>Add note</Button></div>
  </section>;
}

function RuntimeBar({runtime,consent,onConsent,onConnect,onDisconnect}:{runtime:Runtime;consent:{origin:string;token:string}|null;onConsent(accepted:boolean):void;onConnect(origin:string,token:string):void;onDisconnect():void}){
  const [origin,setOrigin]=useState(runtime.origin),[token,setToken]=useState('');
  const originProblem=useMemo(()=>{try{runtimeOrigin(origin);return null;}catch(error){return (error as Error).message;}},[origin]);
  if(consent)return <div className="runtime-bar consent" role="dialog" aria-modal="false" aria-labelledby="runtime-consent-title" data-testid="runtime-consent">
    <h2 id="runtime-consent-title">Connect to the local runtime at {consent.origin}?</h2>
    <p>This page will send the declared numeric inputs of Python cells to that loopback service and display the artifacts it returns. It never sends files, SQL or code. The token stays in this tab only.</p>
    <div><Button appearance="primary" onClick={()=>onConsent(true)}>Connect</Button><Button onClick={()=>onConsent(false)}>Not now</Button></div>
  </div>;
  const label=runtime.status==='connected'?`Connected to ${runtime.origin} (${runtime.models.length} model${runtime.models.length===1?'':'s'}${runtime.version?', '+runtime.version:''})`:runtime.status==='connecting'?`Connecting to ${runtime.origin}...`:runtime.status==='unavailable'?`Runtime unavailable at ${runtime.origin}`:'No local runtime connected';
  return <div className={'runtime-bar '+runtime.status} data-testid="runtime-bar" data-status={runtime.status}>
    <span className="runtime-label" role="status"><i/>{label}</span>
    {runtime.message&&<span className="runtime-message" role="alert">{runtime.message}</span>}
    {runtime.status==='connected'?<Button size="small" icon={<Unplug size={14}/>} onClick={onDisconnect}>Disconnect</Button>:
    <form className="runtime-form" onSubmit={e=>{e.preventDefault();if(!originProblem&&validToken(token))onConnect(origin,token);}}>
      <label>Runtime origin<input value={origin} onChange={e=>setOrigin(e.target.value)} aria-invalid={!!originProblem} spellCheck={false}/></label>
      <label>Token<input type="password" value={token} onChange={e=>setToken(e.target.value.trim())} autoComplete="off" placeholder="printed by the runtime"/></label>
      <Button size="small" type="submit" icon={<Plug size={14}/>} disabled={!!originProblem||!validToken(token)||runtime.status==='connecting'}>Connect</Button>
      {originProblem&&<small role="alert">{originProblem}</small>}
      <small>Start it with <code>npm run service:python</code>; it prints a link with the token. Loopback only.</small>
    </form>}
  </div>;
}

function CellCard({cell,index,notebook,result,stale,runtime,runs,ready,relinks,onChange,onMove,onRemove,onRun,onCancel,onReopen,onChart,onRelink}:{cell:Cell;index:number;notebook:NotebookDoc;result?:Result;stale:string|null;runtime:Runtime;runs:RunRef[];ready:boolean;relinks:StoreManifest['entries'];onChange(c:Cell):void;onMove(d:-1|1):void;onRemove():void;onRun():void;onCancel():void;onReopen(r:RunRef):void;onChart(c:ChartChoice|undefined):void;onRelink(sha:string):void}){
  const running=result?.status==='running',others=notebook.cells.filter(c=>c.id!==cell.id&&runnable(c));
  let plan:string[]=[];try{plan=runnable(cell)?executionPlan(notebook,cell.id):[];}catch{plan=[];}
  const title=(id:string)=>notebook.cells.find(c=>c.id===id)?.title??id;
  const kindLabel=cell.kind==='sql'?'SQL':cell.kind==='python'?'Python model':cell.kind==='jupyter'?'Python':cell.kind==='inert'?'Inert':'Note';
  return <li className={'cell cell-'+cell.kind} data-testid="cell" data-cell-id={cell.id} data-kind={cell.kind} data-status={result?.status??'idle'} data-result-sha={result?.stored?.sha??''} aria-label={`Cell ${index+1}: ${cell.title}`}>
    <header>
      <span className="cell-kind">{kindLabel}</span>
      <input className="cell-title" aria-label="Cell title" value={cell.title} maxLength={120} onChange={e=>onChange({...cell,title:e.target.value.trim()?e.target.value:'Untitled'})}/>
      <span className="cell-actions">
      {runnable(cell)&&(running?<Button size="small" icon={<Ban size={14}/>} onClick={onCancel}>{cell.kind==='jupyter'?'Interrupt':'Cancel'}</Button>:<Button size="small" appearance="primary" icon={<Play size={14}/>} disabled={!ready} onClick={onRun} aria-label={plan.length>1?`Run ${cell.title} after ${plan.length-1} dependenc${plan.length===2?'y':'ies'}`:`Run ${cell.title}`}>{plan.length>1?`Run (${plan.length} cells)`:'Run'}</Button>)}
      <Button size="small" aria-label="Move cell up" icon={<ArrowUp size={14}/>} disabled={index===0} onClick={()=>onMove(-1)}/>
      <Button size="small" aria-label="Move cell down" icon={<ArrowDown size={14}/>} disabled={index===notebook.cells.length-1} onClick={()=>onMove(1)}/>
      <Button size="small" aria-label="Delete cell" icon={<Trash2 size={14}/>} onClick={onRemove}/>
      </span>
    </header>
    {cell.kind==='sql'&&<textarea className="cell-code" aria-label={`SQL for ${cell.title}`} spellCheck={false} value={cell.sql} rows={Math.min(14,Math.max(3,cell.sql.split('\n').length+1))} onChange={e=>onChange({...cell,sql:e.target.value})}/>}
    {cell.kind==='note'&&<textarea className="cell-note" aria-label={`Note ${cell.title}`} value={cell.text} rows={3} onChange={e=>onChange({...cell,text:e.target.value})}/>}
    {cell.kind==='python'&&<PythonInputs cell={cell} runtime={runtime} onChange={onChange}/>}
    {cell.kind==='jupyter'&&<div className="cell-jupyter">
      <textarea className="cell-code" aria-label={`Python for ${cell.title}`} spellCheck={false} value={cell.code} placeholder="# your Python; runs only when you press Run" rows={Math.min(18,Math.max(4,cell.code.split('\n').length+1))} onChange={e=>onChange({...cell,code:e.target.value})}/>
      <label>Publish variable as SQL table (optional)<input value={cell.outputTable??''} placeholder="variable name, e.g. synthetic" onChange={e=>{const v=e.target.value.toLowerCase();onChange({...cell,...(v?{outputTable:v}:{outputTable:undefined})} as JupyterCell);}}/></label>
      <small className="footnote">The variable (list of dicts, dict of lists or DataFrame) is published bounded to 10,000 rows and loaded into DuckDB for SQL cells.</small>
    </div>}
    {cell.kind==='inert'&&<InertBody cell={cell}/>}
    {runnable(cell)&&<details className="cell-deps"><summary>Depends on: {cell.dependsOn.length?cell.dependsOn.map(title).join(', '):'nothing'}{plan.length>1&&<> &middot; runs {plan.map(title).join(' → ')}</>}</summary>
      {others.length?others.map(o=><label key={o.id}><input type="checkbox" checked={cell.dependsOn.includes(o.id)} onChange={e=>onChange({...cell,dependsOn:e.target.checked?[...cell.dependsOn,o.id]:cell.dependsOn.filter(d=>d!==o.id)})}/>{o.title} <small className="mono">{o.id}</small></label>):<p>No other runnable cells.</p>}
    </details>}
    <CellResult cell={cell} result={result} stale={stale} onChart={onChart}/>
    {result?.status==='missing'&&<div className="cell-relink" data-testid="cell-relink">
      {relinks.length?relinks.slice(0,5).map(e=><Button key={e.resultSha256} size="small" onClick={()=>onRelink(e.resultSha256)}>Relink to saved {e.resultSha256.slice(0,12)} ({new Date(e.savedAt).toLocaleString()})</Button>):<small>No other saved result of this cell is in the store.</small>}
      <Button size="small" appearance="primary" icon={<Play size={14}/>} disabled={!ready} onClick={onRun}>Run again</Button>
    </div>}
    {result?.jobNote&&<p className="footnote job-note" data-testid="job-note">{result.jobNote}</p>}
    {cell.kind==='python'&&runs.length>0&&<details className="cell-history"><summary>Run history ({runs.length})</summary><ul>{runs.slice(0,10).map(r=><li key={r.runId}><span className="mono">{r.runId}</span> {r.status} &middot; {time(r.submittedAt)} &middot; inputs {r.inputHash.slice(0,10)} {r.status==='succeeded'&&<Button size="small" onClick={()=>onReopen(r)}>Load result</Button>}</li>)}</ul><small>References only. Results live on the runtime, in memory, until it restarts.</small></details>}
  </li>;
}

function PythonInputs({cell,runtime,onChange}:{cell:PythonCell;runtime:Runtime;onChange(c:Cell):void}){
  const model=runtime.models.find(m=>m.id===cell.model);
  return <div className="cell-python">
    <label>Model<select aria-label="Model" value={cell.model} onChange={e=>{const m=runtime.models.find(x=>x.id===e.target.value);onChange({...cell,model:e.target.value,inputs:Object.fromEntries((m?.inputs??[]).map(i=>[i.id,i.default]))});}}>
      {!model&&<option value={cell.model}>{cell.model} (not offered by a connected runtime)</option>}
      {runtime.models.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}
    </select></label>
    {model?model.inputs.map(i=>{const value=cell.inputs[i.id];const invalid=typeof value!=='number'||value<i.min||value>i.max;return <label key={i.id}>{i.label}{i.unit?` (${i.unit})`:''}<input type="number" min={i.min} max={i.max} step={i.step??'any'} value={typeof value==='number'?value:''} aria-invalid={invalid} onChange={e=>{const v=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(v))onChange({...cell,inputs:{...cell.inputs,[i.id]:v}});}}/>{invalid&&<small role="alert">{i.min} to {i.max}</small>}</label>;}):
      <p className="footnote">Inputs: {Object.entries(cell.inputs).map(([k,v])=>`${k}=${v}`).join(', ')||'none'}. Connect the runtime to edit them against the model's declared bounds.</p>}
    <label>Output table (optional)<input value={cell.outputTable??''} placeholder="e.g. wind_runs" onChange={e=>{const v=e.target.value.toLowerCase();onChange({...cell,...(v?{outputTable:v}:{outputTable:undefined})} as PythonCell);}}/></label>
    {model&&<p className="footnote">{model.description}{model.illustrative?' ILLUSTRATIVE values, not FOIL or client data.':''}</p>}
  </div>;
}

function CellResult({cell,result,stale,onChart}:{cell:Cell;result?:Result;stale:string|null;onChart(c:ChartChoice|undefined):void}){
  if(!result)return runnable(cell)?<p className="cell-idle">Not run in this session.</p>:null;
  const record=result.record,failed=FAILED.includes(result.status);
  return <div className="cell-result" aria-live="polite">
    {result.status==='running'&&<p role="status" className="cell-status">{record?`Run ${record.runId}: ${record.status}`:cell.kind==='jupyter'?'Running on the kernel... (Interrupt stops it)':'Running...'}</p>}
    {result.status==='running'&&cell.kind==='jupyter'&&result.outputs&&<OutputsView outputs={result.outputs} label="Live kernel output"/>}
    {result.status!=='running'&&result.message&&<div className={'notice '+(failed?'error':result.status==='imported'?'imported':'')} role={failed?'alert':'status'} data-testid="cell-message">{result.message}</div>}
    {stale&&result.status==='done'&&<div className="notice stale" role="status">Stale: {stale} Run again to refresh.</div>}
    {result.previous&&result.status!=='done'&&<div className="previous-result" data-testid="previous-result"><p className="notice stale" role="status">{result.previous.label} from {time(result.previous.finishedAt)}. Stale: it is not live and does not reflect the latest attempt.</p>
      {result.previous.artifact&&<ArtifactView artifact={result.previous.artifact}/>}
      {result.previous.outputs&&<OutputsView outputs={result.previous.outputs} label="Last valid output (stale)"/>}
      {result.previous.table&&<TableView table={result.previous.table}/>}
    </div>}
    {result.status==='done'&&record&&<p className="footnote">Run <span className="mono">{record.runId}</span> &middot; {record.model} {record.modelVersion} &middot; inputs sha256 {record.inputHash.slice(0,12)} &middot; finished {time(record.finishedAt)}</p>}
    {cell.kind==='jupyter'&&(result.status==='done'||result.status==='imported'||(failed&&result.status!=='missing'))&&result.outputs&&<>
      {typeof result.executionCount==='number'&&<p className="footnote mono">[{result.executionCount}]{result.stored?` · saved ${result.stored.sha.slice(0,12)}`:''}</p>}
      <OutputsView outputs={result.outputs} label={result.status==='imported'?'Imported output (untrusted)':'Kernel output'}/>
    </>}
    {cell.kind==='jupyter'&&result.status==='done'&&result.table&&<TableView table={result.table} name={(cell as JupyterCell).outputTable}/>}
    {result.status==='done'&&result.preview&&<SqlPreview cell={cell as SqlCell} preview={result.preview} onChart={onChart}/>}
    {result.status==='done'&&result.artifactError&&<div className="notice" role="status">{result.artifactError}</div>}
    {result.status==='done'&&result.artifact&&<ArtifactView key={result.artifact.id+(result.run?.sequence??'')+(cell.kind==='sql'?JSON.stringify(cell.chart??null):'')} artifact={result.artifact}/>}
  </div>;
}

function SqlPreview({cell,preview,onChart}:{cell:SqlCell;preview:Preview;onChart(c:ChartChoice|undefined):void}){
  const [kind,setKind]=useState<ChartChoice['kind']>(cell.chart?.kind??'bar'),[x,setX]=useState(cell.chart?.x??preview.columns[0]?.name??''),[y,setY]=useState(cell.chart?.y??preview.columns.find(c=>/int|float|double|decimal|number/i.test(c.type))?.name??'');
  const columns=preview.columns.map(c=>c.name);
  return <div className="sql-preview">
    <p className="cell-types" aria-label="Result columns and types">{preview.columns.map(c=><span key={c.name}><b>{c.name}</b> {c.type}</span>)}</p>
    {(preview.total>10000||!columns.length)&&<Results rows={preview.rows.slice(0,100)} columns={columns} caption={'Preview of '+cell.title}/>}
    {columns.length>0&&<div className="chart-choice" role="group" aria-label="Chart this result">
      <label>Chart<select value={kind} onChange={e=>setKind(e.target.value as ChartChoice['kind'])}><option value="bar">Bar</option><option value="line">Line</option><option value="scatter">Scatter</option></select></label>
      <label>X<select value={x} onChange={e=>setX(e.target.value)}>{columns.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Y<select value={y} onChange={e=>setY(e.target.value)}><option value="">choose</option>{columns.map(c=><option key={c}>{c}</option>)}</select></label>
      <Button size="small" disabled={!x||!y} onClick={()=>onChart({kind,x,y})}>Apply chart</Button>
      {cell.chart&&<Button size="small" onClick={()=>onChart(undefined)}>Remove chart</Button>}
      <Button size="small" onClick={()=>createBrowserHost().saveDownload(cell.id+'.csv',new Blob([toCsv(columns,preview.rows)],{type:'text/csv;charset=utf-8'}))}>Export CSV ({preview.rows.length.toLocaleString()} rows)</Button>
    </div>}
  </div>;
}

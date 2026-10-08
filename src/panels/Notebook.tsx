import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '../fluent';
import {ArrowDown,ArrowUp,Ban,Database,Download,FileUp,Play,Plug,RotateCcw,Trash2,Unplug} from 'lucide-react';
import {roomStore,useRoomStore,MODULE_IDS} from '../store';
import {Header,Results} from './Common';
import {ArtifactView} from '../framework/foundation/ArtifactView';
import type {Artifact} from '../framework/foundation/artifact';
import {createBrowserHost} from '../core/host';
import {toCsv} from '../core/queries';
import {addCell,cellSourceKey,executionPlan,moveCell,newCellId,removeCell,staleReason,updateCell,type Cell,type CellRun,type ChartChoice,type Notebook as NotebookDoc,type PythonCell,type SqlCell} from '../workspace/notebook';
import {sqlResultArtifact} from '../workspace/sql-artifact';
import {checkInputs,connectionFromHash,RuntimeClient,RuntimeError,runtimeOrigin,validToken,waitForRun,type RunRecord,type RuntimeModel} from '../workspace/runtime';
import {importWorkspace,type RunRef} from '../workspace/persist';

type Preview={columns:{name:string;type:string}[];rows:Record<string,unknown>[];total:number};
type Result={status:'running'|'done'|'error'|'cancelled'|'skipped';message?:string;artifact?:Artifact;artifactError?:string;preview?:Preview;record?:RunRecord;run?:CellRun;finishedAt?:string;previous?:{artifact:Artifact;finishedAt:string;label:string}};
type Runtime={status:'disconnected'|'connecting'|'connected'|'unavailable';origin:string;message?:string;models:RuntimeModel[];version?:string};
const TOKEN_KEY='datapass.runtime.token';
const DEFAULT_ORIGIN='http://127.0.0.1:8765';
function sessionToken(origin:string):string|null{try{const v=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');return v&&v.origin===origin&&validToken(v.token)?v.token:null;}catch{return null;}}
function keepToken(origin:string,token:string|null){try{if(token)sessionStorage.setItem(TOKEN_KEY,JSON.stringify({origin,token}));else sessionStorage.removeItem(TOKEN_KEY);}catch{/* per-tab only */}}
const time=(iso?:string|null)=>iso?new Date(iso).toLocaleTimeString():'';

export default function Notebook(){
  const notebook=useRoomStore(s=>s.datapass.notebook),setNotebook=useRoomStore(s=>s.datapass.setNotebook),runs=useRoomStore(s=>s.datapass.runs),recordRun=useRoomStore(s=>s.datapass.recordRun);
  const savedOrigin=useRoomStore(s=>s.datapass.runtimeOrigin),setRuntimeOrigin=useRoomStore(s=>s.datapass.setRuntimeOrigin),ready=useRoomStore(s=>s.room.initialized),setError=useRoomStore(s=>s.datapass.setError);
  const [results,setResults]=useState<Record<string,Result>>({});
  const [runtime,setRuntime]=useState<Runtime>({status:'disconnected',origin:savedOrigin??DEFAULT_ORIGIN,models:[]});
  const [consent,setConsent]=useState<{origin:string;token:string}|null>(null);
  const [problem,setProblem]=useState<string|null>(null);
  const client=useRef<RuntimeClient|null>(null),sequence=useRef(0),attempts=useRef<Record<string,number>>({}),controllers=useRef<Record<string,AbortController>>({}),activeRun=useRef<Record<string,string>>({}),sequences=useRef<Record<string,number>>({});
  const patch=useCallback((id:string,update:(r:Result|undefined)=>Result|undefined)=>setResults(all=>{const next=update(all[id]);const copy={...all};if(next)copy[id]=next;else delete copy[id];return copy;}),[]);

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
    }
  },[setRuntimeOrigin]);
  // A link printed by the runtime carries `#runtime=…&token=…`. It is removed from the address bar and needs explicit consent.
  useEffect(()=>{
    try{const link=connectionFromHash(location.hash);if(link){history.replaceState(null,'',location.pathname+location.search);setConsent(link);return;}}
    catch(error){history.replaceState(null,'',location.pathname+location.search);setProblem('The runtime link was refused: '+(error as Error).message);return;}
    if(savedOrigin){const token=sessionToken(savedOrigin);if(token)void connect(savedOrigin,token);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>()=>{for(const c of Object.values(controllers.current))c.abort();},[]);

  function change(next:()=>NotebookDoc){try{setNotebook(next());setProblem(null);}catch(error){setProblem((error as Error).message);}}
  function add(kind:Cell['kind']){
    const id=newCellId(notebook,kind),title=kind==='sql'?'SQL query':kind==='python'?'Python model run':'Note';
    const model=runtime.models[0];
    const cell:Cell=kind==='sql'?{id,kind,title,sql:'SELECT 42 AS answer;',dependsOn:[]}:kind==='python'?{id,kind,title,model:model?.id??'wind-reference',inputs:Object.fromEntries((model?.inputs??[]).map(i=>[i.id,i.default])),dependsOn:[]}:{id,kind,title,text:'',dependsOn:[]};
    change(()=>addCell(notebook,cell));
  }

  async function runSql(cell:SqlCell,signal:AbortSignal):Promise<Result>{
    const db=roomStore.getState().db;
    const table=await db.connector.query(cell.sql,{signal});
    const total=table.numRows,limited=total>10000?table.slice(0,10000):table;
    const preview:Preview={columns:table.schema.fields.map(f=>({name:f.name,type:String(f.type)})),rows:limited.toArray().map(r=>r.toJSON() as Record<string,unknown>),total};
    void db.refreshTableSchemas();
    let artifact:Artifact|undefined,artifactError:string|undefined;
    if(total>10000)artifactError=`The result has ${total.toLocaleString()} rows. Results above 10,000 rows stay as a preview; aggregate or add LIMIT to save, chart or export them as an artifact.`;
    else try{artifact=sqlResultArtifact({columns:preview.columns.map(c=>c.name),rows:preview.rows,cellId:cell.id,title:cell.title,sql:cell.sql,chart:cell.chart});}catch(error){artifactError=(error as Error).message;}
    return {status:'done',preview,artifact,artifactError,finishedAt:new Date().toISOString()};
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
    const final=await waitForRun(c,submitted,{signal,onUpdate:r=>{onUpdate(r);}});
    recordRun(ref(final));delete activeRun.current[cell.id];
    if(final.status==='cancelled')return {status:'cancelled',record:final,message:`Run ${final.runId} was cancelled on the runtime. No result was produced.`};
    if(final.status==='failed')return {status:'error',record:final,message:`Run ${final.runId} failed on the runtime: ${final.error??'no detail'}`};
    const artifact=await c.artifact(final,signal);
    if(cell.outputTable&&artifact.payload.kind==='table'){
      const db=roomStore.getState().db;
      await db.connector.loadObjects(artifact.payload.rows as Record<string,unknown>[],cell.outputTable,{replace:true});
      await db.refreshTableSchemas();
    }
    return {status:'done',record:final,artifact,finishedAt:final.finishedAt??new Date().toISOString()};
  }

  async function run(target:string){
    let plan:string[];
    try{plan=executionPlan(notebook,target);}catch(error){setProblem((error as Error).message);return;}
    const doc=notebook;
    for(let i=0;i<plan.length;i++){
      const id=plan[i],cell=doc.cells.find(c=>c.id===id)!;
      controllers.current[id]?.abort();
      const controller=new AbortController(),attempt=(attempts.current[id]??0)+1;
      controllers.current[id]=controller;attempts.current[id]=attempt;
      patch(id,prev=>({status:'running',previous:prev?.artifact&&prev.finishedAt?{artifact:prev.artifact,finishedAt:prev.finishedAt,label:'Previous result'}:prev?.previous}));
      let result:Result;
      try{
        result=cell.kind==='sql'?await runSql(cell,controller.signal):await runPython(cell as PythonCell,controller.signal,record=>{if(attempts.current[id]===attempt)patch(id,prev=>({...(prev??{status:'running'}),status:'running',record}));});
        sequence.current++;
        const deps=Object.fromEntries(cell.dependsOn.map(d=>[d,sequences.current[d]??-1]));
        if(attempts.current[id]===attempt)sequences.current[id]=sequence.current;
        result.run={cellId:id,sequence:sequence.current,sourceKey:cellSourceKey(cell),dependencySequences:deps};
      }catch(error){
        const aborted=controller.signal.aborted||(error as Error)?.name==='AbortError'||(error instanceof RuntimeError&&error.kind==='aborted');
        if(error instanceof RuntimeError&&error.kind==='unavailable')setRuntime(r=>r.status==='connected'?{...r,status:'unavailable',message:error.message}:r);
        result={status:aborted?'cancelled':'error',message:aborted?'Stopped before a result was produced.':(error as Error).message};
      }
      if(attempts.current[id]!==attempt)return; // superseded by a newer run of the same cell: ignore this late result
      patch(id,prev=>({...result,record:result.record??prev?.record,previous:result.status==='done'?undefined:prev?.previous}));
      if(result.status!=='done'){
        for(const rest of plan.slice(i+1))patch(rest,prev=>({...(prev??{}),status:'skipped',message:`Not run: dependency ${cell.title} (${id}) did not finish.`}));
        return;
      }
    }
  }
  async function cancel(id:string){
    const runId=activeRun.current[id];
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
      const record=await c.status(ref.runId);
      if(record.status!=='succeeded'){patch(cell.id,prev=>({...(prev??{}),status:'error',record,message:`Run ${ref.runId} is ${record.status}; it has no result.`}));return;}
      const artifact=await c.artifact(record);
      patch(cell.id,()=>({status:'done',record,artifact,finishedAt:record.finishedAt??undefined,message:`Re-fetched result of earlier run ${ref.runId} (${time(record.finishedAt)}). It is not a new computation.`}));
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

  const doc=useRoomStore(s=>s.datapass.workspaceDocument);
  const applyWorkspace=useRoomStore(s=>s.datapass.applyWorkspace),reset=useRoomStore(s=>s.datapass.resetWorkspace);
  const picker=useRef<HTMLInputElement>(null),[confirmReset,setConfirmReset]=useState(false);
  async function importFile(file:File){
    try{
      if(file.size>1024*1024)throw new Error('The file is too large to be a workspace.');
      const {doc:imported,migratedFrom}=importWorkspace(await file.text(),MODULE_IDS);
      for(const c of Object.values(controllers.current))c.abort();
      setResults({});applyWorkspace(imported,`Imported ${file.name}${migratedFrom?' (migrated from '+migratedFrom+')':''}. Nothing was run: run cells explicitly.`);
    }catch(error){setError('Workspace import refused, nothing changed: '+(error as Error).message);}
  }

  return <section className="panel-content notebook" aria-label="Notebook">
    <Header eyebrow="Author / notebook" title="Notebook" detail="SQL runs in this browser (DuckDB-WASM). Python cells run allowlisted models on a local runtime you connect. Cells run only when you press Run, with their declared dependencies first.">
      <Button size="small" icon={<Download size={14}/>} onClick={()=>createBrowserHost().saveDownload('mosaicstudio-workspace.json',new Blob([JSON.stringify(doc(),null,2)],{type:'application/json'}))}>Export workspace</Button>
      <Button size="small" icon={<FileUp size={14}/>} onClick={()=>picker.current?.click()}>Import workspace</Button>
      <input hidden ref={picker} type="file" accept=".json,application/json" aria-label="Import workspace file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/>
      {confirmReset?<><Button size="small" appearance="primary" onClick={()=>{for(const c of Object.values(controllers.current))c.abort();setResults({});reset();setConfirmReset(false);}}>Confirm reset</Button><Button size="small" onClick={()=>setConfirmReset(false)}>Keep workspace</Button></>:<Button size="small" icon={<RotateCcw size={14}/>} onClick={()=>setConfirmReset(true)}>Reset workspace</Button>}
    </Header>
    <p className="footnote">Saved in this browser: SQL text, cells, model inputs, layout and run references. Never saved: file contents, result rows or the runtime token. The workspace export contains your SQL and inputs; review it before sharing.</p>
    <RuntimeBar runtime={runtime} consent={consent} onConsent={accepted=>{const c=consent;setConsent(null);if(accepted&&c)void connect(c.origin,c.token);}} onConnect={(o,t)=>void connect(o,t)} onDisconnect={()=>{client.current=null;keepToken(runtime.origin,null);setRuntime(r=>({status:'disconnected',origin:r.origin,models:[]}));}}/>
    {problem&&<div className="notice error" role="alert"><span>{problem}</span> <Button size="small" onClick={()=>setProblem(null)}>Dismiss</Button></div>}
    {!notebook.cells.length&&<div className="empty notebook-empty" data-testid="notebook-empty"><h2>Blank notebook</h2><p>Add a SQL cell to query tables you open, or a Python cell to run a model on the local runtime. Nothing is preloaded.</p></div>}
    <ol className="cells">{notebook.cells.map((cell,index)=><CellCard key={cell.id} cell={cell} index={index} notebook={notebook} result={results[cell.id]} stale={staleReason(notebook,Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.run])),cell.id)} runtime={runtime} runs={runs.filter(r=>r.cellId===cell.id)} ready={ready}
      onChange={next=>change(()=>updateCell(notebook,next))} onMove={d=>change(()=>moveCell(notebook,cell.id,d))} onRemove={()=>{controllers.current[cell.id]?.abort();delete sequences.current[cell.id];change(()=>removeCell(notebook,cell.id));patch(cell.id,()=>undefined);}}
      onRun={()=>void run(cell.id)} onCancel={()=>void cancel(cell.id)} onReopen={ref=>void reopen(cell as PythonCell,ref)} onChart={chart=>rechart(cell as SqlCell,chart)}/>)}</ol>
    <div className="cell-add" role="group" aria-label="Add a cell"><Button icon={<Database size={14}/>} onClick={()=>add('sql')}>Add SQL cell</Button><Button icon={<Play size={14}/>} onClick={()=>add('python')}>Add Python cell</Button><Button onClick={()=>add('note')}>Add note</Button></div>
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

function CellCard({cell,index,notebook,result,stale,runtime,runs,ready,onChange,onMove,onRemove,onRun,onCancel,onReopen,onChart}:{cell:Cell;index:number;notebook:NotebookDoc;result?:Result;stale:string|null;runtime:Runtime;runs:RunRef[];ready:boolean;onChange(c:Cell):void;onMove(d:-1|1):void;onRemove():void;onRun():void;onCancel():void;onReopen(r:RunRef):void;onChart(c:ChartChoice|undefined):void}){
  const running=result?.status==='running',others=notebook.cells.filter(c=>c.id!==cell.id&&c.kind!=='note');
  let plan:string[]=[];try{plan=cell.kind==='note'?[]:executionPlan(notebook,cell.id);}catch{plan=[];}
  const title=(id:string)=>notebook.cells.find(c=>c.id===id)?.title??id;
  return <li className={'cell cell-'+cell.kind} data-testid="cell" data-cell-id={cell.id} data-status={result?.status??'idle'} aria-label={`Cell ${index+1}: ${cell.title}`}>
    <header>
      <span className="cell-kind">{cell.kind==='sql'?'SQL':cell.kind==='python'?'Python':'Note'}</span>
      <input className="cell-title" aria-label="Cell title" value={cell.title} maxLength={120} onChange={e=>onChange({...cell,title:e.target.value.trim()?e.target.value:'Untitled'})}/>
      <span className="spacer"/>
      {cell.kind!=='note'&&(running?<Button size="small" icon={<Ban size={14}/>} onClick={onCancel}>Cancel</Button>:<Button size="small" appearance="primary" icon={<Play size={14}/>} disabled={!ready} onClick={onRun} aria-label={`Run ${cell.title}`}>{plan.length>1?`Run (${plan.length} cells)`:'Run'}</Button>)}
      <Button size="small" aria-label="Move cell up" icon={<ArrowUp size={14}/>} disabled={index===0} onClick={()=>onMove(-1)}/>
      <Button size="small" aria-label="Move cell down" icon={<ArrowDown size={14}/>} disabled={index===notebook.cells.length-1} onClick={()=>onMove(1)}/>
      <Button size="small" aria-label="Delete cell" icon={<Trash2 size={14}/>} onClick={onRemove}/>
    </header>
    {cell.kind==='sql'&&<textarea className="cell-code" aria-label={`SQL for ${cell.title}`} spellCheck={false} value={cell.sql} rows={Math.min(14,Math.max(3,cell.sql.split('\n').length+1))} onChange={e=>onChange({...cell,sql:e.target.value})}/>}
    {cell.kind==='note'&&<textarea className="cell-note" aria-label={`Note ${cell.title}`} value={cell.text} rows={3} onChange={e=>onChange({...cell,text:e.target.value})}/>}
    {cell.kind==='python'&&<PythonInputs cell={cell} runtime={runtime} onChange={onChange}/>}
    {cell.kind!=='note'&&<details className="cell-deps"><summary>Depends on: {cell.dependsOn.length?cell.dependsOn.map(title).join(', '):'nothing'}{plan.length>1&&<> &middot; runs {plan.map(title).join(' → ')}</>}</summary>
      {others.length?others.map(o=><label key={o.id}><input type="checkbox" checked={cell.dependsOn.includes(o.id)} onChange={e=>onChange({...cell,dependsOn:e.target.checked?[...cell.dependsOn,o.id]:cell.dependsOn.filter(d=>d!==o.id)})}/>{o.title} <small className="mono">{o.id}</small></label>):<p>No other runnable cells.</p>}
    </details>}
    <CellResult cell={cell} result={result} stale={stale} onChart={onChart}/>
    {cell.kind==='python'&&runs.length>0&&<details className="cell-history"><summary>Run history ({runs.length})</summary><ul>{runs.slice(0,10).map(r=><li key={r.runId}><span className="mono">{r.runId}</span> {r.status} &middot; {time(r.submittedAt)} &middot; inputs {r.inputHash.slice(0,10)} {r.status==='succeeded'&&<Button size="small" onClick={()=>onReopen(r)}>Load result</Button>}</li>)}</ul><small>References only. Results live on the runtime, in memory, until it restarts.</small></details>}
  </li>;
}

function PythonInputs({cell,runtime,onChange}:{cell:PythonCell;runtime:Runtime;onChange(c:Cell):void}){
  const model=runtime.models.find(m=>m.id===cell.model);
  return <div className="cell-python">
    <label>Model<select value={cell.model} onChange={e=>{const m=runtime.models.find(x=>x.id===e.target.value);onChange({...cell,model:e.target.value,inputs:Object.fromEntries((m?.inputs??[]).map(i=>[i.id,i.default]))});}}>
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
  if(!result)return cell.kind==='note'?null:<p className="cell-idle">Not run in this session.</p>;
  const record=result.record;
  return <div className="cell-result" aria-live="polite">
    {result.status==='running'&&<p role="status" className="cell-status">{record?`Run ${record.runId}: ${record.status}`:'Running...'}</p>}
    {result.status!=='running'&&result.message&&<div className={'notice '+(result.status==='done'?'':'error')} role={result.status==='done'?'status':'alert'}>{result.message}</div>}
    {stale&&result.status==='done'&&<div className="notice stale" role="status">Stale: {stale} Run again to refresh.</div>}
    {result.previous&&result.status!=='done'&&<div className="previous-result"><p className="notice stale" role="status">{result.previous.label} from {time(result.previous.finishedAt)}. It is not live and does not reflect the latest attempt.</p><ArtifactView artifact={result.previous.artifact}/></div>}
    {result.status==='done'&&record&&<p className="footnote">Run <span className="mono">{record.runId}</span> &middot; {record.model} {record.modelVersion} &middot; inputs sha256 {record.inputHash.slice(0,12)} &middot; finished {time(record.finishedAt)}</p>}
    {result.status==='done'&&result.preview&&<SqlPreview cell={cell as SqlCell} preview={result.preview} onChart={onChart}/>}
    {result.status==='done'&&result.artifactError&&<div className="notice" role="status">{result.artifactError}</div>}
    {result.status==='done'&&result.artifact&&<ArtifactView key={result.artifact.id+(result.run?.sequence??'')+(cell.kind==='sql'?JSON.stringify(cell.chart??null):'')} artifact={result.artifact}/>}
  </div>;
}

function SqlPreview({cell,preview,onChart}:{cell:SqlCell;preview:Preview;onChart(c:ChartChoice|undefined):void}){
  const [kind,setKind]=useState<ChartChoice['kind']>(cell.chart?.kind??'bar'),[x,setX]=useState(cell.chart?.x??preview.columns[0]?.name??''),[y,setY]=useState(cell.chart?.y??preview.columns.find(c=>/int|float|double|decimal/i.test(c.type))?.name??'');
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

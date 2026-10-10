/** Presentation pieces for the optional Jupyter adapter and the durable result store (FR-02/FR-03).
 * Outputs render through `renderOutputs`: text, validated raster images, markup as source text; never HTML or script. */
import {useMemo,useState} from 'react';
import {Button} from '../fluent';
import {Plug,Trash2,Unplug} from 'lucide-react';
import {Results} from './Common';
import {jupyterOrigin,validJupyterToken,type KernelInfo,type NbOutput,type TablePayload} from '../workspace/jupyter';
import {renderOutputs} from '../workspace/outputs';
import type {StoreManifest,LossItem} from '../workspace/results';
import type {Cell,InertCell} from '../workspace/notebook';

export type JupyterState={status:'disconnected'|'connecting'|'connected'|'unavailable'|'denied'|'lost';origin:string;message?:string;kernel?:KernelInfo};
export const DEFAULT_JUPYTER_ORIGIN='http://127.0.0.1:28888';

export function JupyterBar({state,onPair,onDisconnect}:{state:JupyterState;onPair(origin:string,token:string):void;onDisconnect():void}){
  const [origin,setOrigin]=useState(state.origin),[token,setToken]=useState('');
  const originProblem=useMemo(()=>{try{jupyterOrigin(origin);return null;}catch(error){return (error as Error).message;}},[origin]);
  const label=state.status==='connected'&&state.kernel?`Kernel ${state.kernel.kernelName} on ${state.origin}${state.kernel.serverVersion?' (Jupyter Server '+state.kernel.serverVersion+')':''}`:state.status==='connecting'?`Pairing with ${state.origin}...`:state.status==='lost'?`Kernel connection lost (${state.origin})`:state.status==='denied'?`Jupyter Server refused the pairing (${state.origin})`:state.status==='unavailable'?`Jupyter Server unavailable at ${state.origin}`:'No Jupyter kernel paired';
  return <div className={'runtime-bar jupyter-bar '+state.status} data-testid="jupyter-bar" data-status={state.status} aria-label="Jupyter kernel">
    <span className="runtime-label" role="status"><i/>{label}</span>
    {state.message&&<span className="runtime-message" role="alert">{state.message}</span>}
    {state.status==='connected'?<>
      <small>Trusted local Python: cells run with your user privileges on your own server. Loopback is not a sandbox.</small>
      <Button size="small" icon={<Unplug size={14}/>} onClick={onDisconnect}>Disconnect kernel</Button>
    </>:<form className="runtime-form" onSubmit={e=>{e.preventDefault();if(!originProblem&&validJupyterToken(token)){onPair(origin,token);setToken('');}}}>
      <label>Jupyter Server URL<input value={origin} onChange={e=>setOrigin(e.target.value)} aria-invalid={!!originProblem} spellCheck={false}/></label>
      <label>Jupyter token<input type="password" value={token} onChange={e=>setToken(e.target.value.trim())} autoComplete="off" placeholder="printed by jupyter_local.py"/></label>
      <Button size="small" type="submit" icon={<Plug size={14}/>} disabled={!!originProblem||!validJupyterToken(token)||state.status==='connecting'}>Pair kernel</Button>
      {originProblem&&<small role="alert">{originProblem}</small>}
      <small>Optional. Start your own server with <code>python py/service/jupyter_local.py</code> (needs <code>requirements-jupyter.txt</code>). The token stays in this tab's memory and is never saved.</small>
    </form>}
  </div>;
}

export function OutputsView({outputs,label}:{outputs:readonly NbOutput[];label:string}){
  const items=useMemo(()=>renderOutputs(outputs),[outputs]);
  if(!items.length)return null;
  return <div className="cell-outputs" aria-label={label} data-testid="cell-outputs">{items.map((item,i)=>{
    if(item.kind==='text')return <pre key={i} className={'output-text output-'+item.stream}>{item.text}</pre>;
    if(item.kind==='image')return <img key={i} className="output-image" src={item.src} alt={`Kernel output image (${item.mime})`}/>;
    if(item.kind==='markup-as-text')return <figure key={i} className="output-markup"><figcaption>{item.mime} shown as source text (untrusted markup is never rendered)</figcaption><pre>{item.text}</pre></figure>;
    if(item.kind==='error')return <pre key={i} className="output-error" role="alert">{item.ename}: {item.evalue}{item.traceback?'\n'+item.traceback:''}</pre>;
    if(item.kind==='refused')return <p key={i} className="output-refused" data-testid="output-refused">Script output <code>{item.mime}</code> refused: it is never executed.</p>;
    return <p key={i} className="output-unsupported">Not displayed (kept in exports): {item.mimes.join(', ')}</p>;
  })}</div>;
}

export function TableView({table,name}:{table:TablePayload;name?:string}){
  const columns=table.columns.map(c=>c.name);
  const rows=table.rows.slice(0,100).map(r=>Object.fromEntries(columns.map((c,i)=>[c,r[i]])));
  return <div className="cell-table" data-testid="cell-table">
    <p className="cell-types" aria-label="Published table columns and types">{name&&<span><b>SQL table</b> <span className="mono">{name}</span></span>}{table.columns.map(c=><span key={c.name}><b>{c.name}</b> {c.type}</span>)}</p>
    {table.truncated&&<p className="notice" role="status">First {table.rows.length.toLocaleString()} of {table.total.toLocaleString()} rows were published (bounded).</p>}
    <Results rows={rows} columns={columns} caption={'Published table'+(name?' '+name:'')}/>
  </div>;
}

export function InertBody({cell}:{cell:InertCell}){
  return <div className="cell-inert" data-testid="inert-cell"><p className="footnote">Kept inert: {cell.reason}. It is never run and is exported back unchanged.</p><pre className="cell-code inert-source">{cell.source||'(empty)'}</pre></div>;
}

export function LossReport({loss,onDismiss}:{loss:LossItem[];onDismiss():void}){
  if(!loss.length)return null;
  return <details className="loss-report notice" data-testid="loss-report" open><summary>Import report: {loss.length} item{loss.length===1?'':'s'} not carried over as runnable content</summary>
    <ul>{loss.map((l,i)=><li key={i}>{l.cellId?<span className="mono">{l.cellId}</span>:'notebook'} &middot; {l.item}: {l.detail}</li>)}</ul>
    <Button size="small" onClick={onDismiss}>Dismiss report</Button></details>;
}

export function StorePanel({manifest,cells,onDelete,onRefresh}:{manifest:StoreManifest;cells:Cell[];onDelete(sha:string):void;onRefresh():void}){
  const [confirm,setConfirm]=useState<string|null>(null);
  const title=(id:string)=>cells.find(c=>c.id===id)?.title??id;
  const pct=manifest.store.maxBytes?Math.round(manifest.store.usedBytes/manifest.store.maxBytes*100):0;
  return <details className="store-panel" data-testid="store-panel"><summary>Result store <span className="mono">{manifest.store.name}</span>: {manifest.entries.length} saved result{manifest.entries.length===1?'':'s'}, {manifest.store.usedBytes.toLocaleString()} of {manifest.store.maxBytes.toLocaleString()} bytes ({pct}%)</summary>
    <p className="footnote">Saved results are immutable files named by their SHA-256. Nothing is deleted automatically; delete explicitly below. Kernel memory (variables) is never saved or restored.</p>
    <ul>{manifest.entries.map(e=><li key={e.cellId+e.resultSha256} data-testid="store-entry" data-sha={e.resultSha256}>
      <span>{title(e.cellId)}</span> <span className="mono">{e.resultSha256.slice(0,12)}</span> &middot; {e.bytes.toLocaleString()} B &middot; {new Date(e.savedAt).toLocaleString()} {!e.present&&<b>(file missing)</b>}
      {confirm===e.resultSha256?<><Button size="small" appearance="primary" onClick={()=>{setConfirm(null);onDelete(e.resultSha256);}}>Confirm delete</Button><Button size="small" onClick={()=>setConfirm(null)}>Keep</Button></>:<Button size="small" icon={<Trash2 size={14}/>} aria-label={`Delete saved result ${e.resultSha256.slice(0,12)}`} onClick={()=>setConfirm(e.resultSha256)}>Delete</Button>}
    </li>)}</ul>
    {manifest.jobs.filter(j=>j.status!=='succeeded').slice(-10).map(j=><p key={j.jobId} className="footnote" data-testid="store-job" data-status={j.status}>Run of {title(j.cellId)} started {new Date(j.startedAt).toLocaleString()}: <b>{j.status}</b>{j.detail?' — '+j.detail:''}</p>)}
    <Button size="small" onClick={onRefresh}>Refresh</Button>
  </details>;
}

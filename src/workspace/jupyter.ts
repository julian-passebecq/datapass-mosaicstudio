/** Narrow, opt-in adapter from the browser workbench to a Jupyter Server the user installed and started
 * (FR-02). It speaks the documented jupyter_server REST API and the kernel channels websocket (JSON
 * message format, Jupyter messaging protocol 5.x). It is NOT a Python executor: the user's server and
 * kernel own scheduling, execution and interruption; this module reports what it observes.
 *
 * Trust is explicit: the user pastes one exact loopback origin and the server token. The token stays in
 * this object (memory only): it is sent in the Authorization header for REST calls and, because browsers
 * cannot set headers on a WebSocket, in the websocket URL query that Jupyter Server documents and scrubs
 * from its logs. It is never written to the workspace, the result store, exports or storage. */

export const JUPYTER_LIMITS=Object.freeze({outputBytes:2*1024*1024,imageBytes:1536*1024,tableRows:10000,tableColumns:64,tableBytes:8*1024*1024,messageBytes:16*1024*1024,cell:4000});
export const TABLE_MIME='application/vnd.datapass.table+json';
const LOOPBACK=new Set(['127.0.0.1','localhost']);
const TABLE_NAME=/^[a-z][a-z0-9_]{0,62}$/;

export type NbOutput=Record<string,unknown>&{output_type:string};
export type ExecuteStatus='ok'|'error'|'interrupted'|'disconnected'|'unknown';
export type ExecuteOutcome={status:ExecuteStatus;executionCount:number|null;outputs:NbOutput[];error?:{ename:string;evalue:string};truncated:boolean;detail?:string};
export type TableColumn={name:string;type:'number'|'boolean'|'string'|'null'};
export type TablePayload={columns:TableColumn[];rows:(string|number|boolean|null)[][];total:number;truncated:boolean};
export type JupyterErrorKind='unavailable'|'denied'|'malformed'|'rejected'|'disconnected';
export class JupyterError extends Error{
  readonly kind:JupyterErrorKind;readonly status?:number;
  constructor(message:string,kind:JupyterErrorKind,status?:number){super(message);this.name='JupyterError';this.kind=kind;this.status=status;}
}

/** Only an exact http loopback origin with an explicit port: no path, query, credentials or remote host. */
export function jupyterOrigin(value:string):string{
  let url:URL;
  try{url=new URL(value.trim());}catch{throw new JupyterError('The Jupyter Server address is not a URL.','rejected');}
  if(url.protocol!=='http:')throw new JupyterError('Pair only with a Jupyter Server on http loopback (127.0.0.1 or localhost).','rejected');
  if(!LOOPBACK.has(url.hostname))throw new JupyterError(`The Jupyter Server must be loopback (127.0.0.1 or localhost), not ${url.hostname}. Nothing was sent.`,'rejected');
  if(url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw new JupyterError('Give only the server origin, for example http://127.0.0.1:28888 (no path, no ?token=).','rejected');
  if(!url.port)throw new JupyterError('The Jupyter Server origin needs an explicit port.','rejected');
  return url.origin;
}
export function validJupyterToken(token:string):boolean{return typeof token==='string'&&/^[A-Za-z0-9_-]{16,256}$/.test(token);}

const ANSI=/\u001b\[[0-9;?]*[A-Za-z]/g;
export function stripAnsi(text:string):string{return text.replace(ANSI,'');}
function isObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function byteLength(v:unknown):number{try{return new TextEncoder().encode(JSON.stringify(v)).byteLength;}catch{return Infinity;}}

/** Collect iopub output messages into nbformat v4 outputs, bounded. Consecutive stream text is merged. */
export class OutputCollector{
  outputs:NbOutput[]=[];truncated=false;#bytes=0;readonly #limit:number;
  constructor(limit=JUPYTER_LIMITS.outputBytes){this.#limit=limit;}
  add(msgType:string,content:Record<string,unknown>):NbOutput|null{
    if(this.truncated)return null;
    let output:NbOutput|null=null;
    if(msgType==='stream'&&(content.name==='stdout'||content.name==='stderr')&&typeof content.text==='string'){
      const last=this.outputs.at(-1);
      if(last&&last.output_type==='stream'&&last.name===content.name){
        const add=content.text;if(!this.#budget(add.length))return null;last.text=String(last.text)+add;return last;
      }
      output={output_type:'stream',name:content.name,text:content.text};
    }else if((msgType==='display_data'||msgType==='execute_result')&&isObject(content.data)){
      output=msgType==='execute_result'?{output_type:'execute_result',data:content.data,metadata:isObject(content.metadata)?content.metadata:{},execution_count:typeof content.execution_count==='number'?content.execution_count:null}:{output_type:'display_data',data:content.data,metadata:isObject(content.metadata)?content.metadata:{}};
    }else if(msgType==='error'){
      output={output_type:'error',ename:String(content.ename??'Error').slice(0,200),evalue:String(content.evalue??'').slice(0,2000),traceback:Array.isArray(content.traceback)?content.traceback.slice(0,200).map(t=>String(t).slice(0,4000)):[]};
    }else if(msgType==='clear_output'){
      this.outputs=[];this.#bytes=0;return null;
    }
    if(!output)return null;
    if(!this.#budget(byteLength(output)))return null;
    this.outputs.push(output);return output;
  }
  #budget(n:number):boolean{
    if(this.#bytes+n<=this.#limit){this.#bytes+=n;return true;}
    this.truncated=true;
    this.outputs.push({output_type:'stream',name:'stderr',text:`[DataPass] Output truncated at ${Math.round(this.#limit/1024/1024)} MB; the rest was not kept.\n`});
    return false;
  }
}

/** Validate the bounded table a kernel published for `outputTable`; returns typed columns and rows. */
export function validateTable(input:unknown):TablePayload{
  if(!isObject(input)||!Array.isArray(input.columns)||!Array.isArray(input.rows))throw new JupyterError('The kernel published a malformed table.','malformed');
  const names=input.columns;
  if(!names.length||names.length>JUPYTER_LIMITS.tableColumns)throw new JupyterError(`A published table needs 1 to ${JUPYTER_LIMITS.tableColumns} columns.`,'malformed');
  if(names.some(n=>typeof n!=='string'||!n.trim()||n.length>200)||new Set(names).size!==names.length)throw new JupyterError('Published table columns must be unique, non-empty names.','malformed');
  if(input.rows.length>JUPYTER_LIMITS.tableRows)throw new JupyterError(`A published table holds at most ${JUPYTER_LIMITS.tableRows.toLocaleString()} rows.`,'malformed');
  const kinds=names.map(()=>new Set<string>());
  const rows=input.rows.map(r=>{
    if(!Array.isArray(r)||r.length!==names.length)throw new JupyterError('A published table row does not match its columns.','malformed');
    return r.map((v,i)=>{
      if(v===null){kinds[i].add('null');return null;}
      if(typeof v==='number'){if(!Number.isFinite(v))throw new JupyterError('Published table numbers must be finite.','malformed');kinds[i].add('number');return v;}
      if(typeof v==='boolean'){kinds[i].add('boolean');return v;}
      if(typeof v==='string'){if(v.length>JUPYTER_LIMITS.cell)throw new JupyterError('A published table cell is too long.','malformed');kinds[i].add('string');return v;}
      throw new JupyterError('Published table cells must be null, numbers, booleans or text.','malformed');
    });
  });
  const total=typeof input.total==='number'&&Number.isSafeInteger(input.total)&&input.total>=rows.length?input.total:rows.length;
  // One type per column; a column mixing numbers and text becomes text, never silently coerced.
  const columns=names.map((name,i)=>{const k=[...kinds[i]].filter(x=>x!=='null');return {name:name as string,type:(k.length===0?'null':k.length===1?k[0]:'string') as TableColumn['type']};});
  for(const [i,c] of columns.entries())if(c.type==='string')for(const row of rows)if(row[i]!==null&&typeof row[i]!=='string')row[i]=String(row[i]);
  return {columns,rows,total,truncated:input.truncated===true||total>rows.length};
}
export function tableObjects(table:TablePayload):Record<string,unknown>[]{
  return table.rows.map(r=>Object.fromEntries(table.columns.map((c,i)=>[c.name,r[i]])));
}

/** Fixed helper (DataPass source, not user or AI text) that publishes one named variable as a bounded table. */
export function publishTableCode(name:string):string{
  if(!TABLE_NAME.test(name))throw new JupyterError('Output table: lowercase SQL name required.','rejected');
  return `def __datapass_publish_table(name, max_rows, max_cols):
    import math, numbers
    from IPython import get_ipython
    from IPython.display import display
    ns = get_ipython().user_ns
    if name not in ns:
        raise NameError(f"DataPass: no variable named {name!r} to publish as a table")
    obj = ns[name]
    def cell(v):
        if v is None or isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v[:${JUPYTER_LIMITS.cell}]
        if isinstance(v, numbers.Integral):
            return int(v) if abs(int(v)) <= 2**53 else str(v)
        if isinstance(v, numbers.Real):
            f = float(v)
            return f if math.isfinite(f) else None
        return str(v)[:${JUPYTER_LIMITS.cell}]
    if hasattr(obj, "columns") and hasattr(obj, "to_dict") and hasattr(obj, "head"):
        labels = list(obj.columns); total = len(obj)
        rows = [[cell(r.get(c)) for c in labels] for r in obj.head(max_rows).to_dict("records")]
        cols = [str(c) for c in labels]
    elif isinstance(obj, dict) and obj and all(isinstance(v, (list, tuple)) for v in obj.values()):
        cols = [str(c) for c in obj]; total = max(len(v) for v in obj.values())
        rows = [[cell(v[i]) if i < len(v) else None for v in obj.values()] for i in range(min(total, max_rows))]
    elif isinstance(obj, (list, tuple)) and all(isinstance(r, dict) for r in obj):
        cols = []
        for r in obj[:max_rows]:
            for k in r:
                if str(k) not in cols:
                    cols.append(str(k))
        total = len(obj)
        rows = [[cell({str(k): v for k, v in r.items()}.get(c)) for c in cols] for r in obj[:max_rows]]
    else:
        raise TypeError(f"DataPass: {name!r} is a {type(obj).__name__}; publish a list of dicts, a dict of lists or a DataFrame")
    if not cols or len(cols) > max_cols or len(set(cols)) != len(cols):
        raise ValueError(f"DataPass: {name!r} needs 1 to {max_cols} uniquely named columns")
    display({"${TABLE_MIME}": {"columns": cols, "rows": rows, "total": total, "truncated": total > max_rows}}, raw=True)
try:
    __datapass_publish_table(${JSON.stringify(name)}, ${JUPYTER_LIMITS.tableRows}, ${JUPYTER_LIMITS.tableColumns})
finally:
    del __datapass_publish_table
`;
}

type FetchLike=(url:string,init:{method:string;headers:Record<string,string>;body?:string;credentials:'omit';cache:'no-store';mode:'cors';signal?:AbortSignal})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;
type SocketLike={readonly readyState:number;send(data:string):void;close(code?:number,reason?:string):void;onopen:((e:unknown)=>void)|null;onclose:((e:{code:number;reason:string})=>void)|null;onerror:((e:unknown)=>void)|null;onmessage:((e:{data:unknown})=>void)|null};
type SocketFactory=(url:string)=>SocketLike;
type Pending={collector:OutputCollector;reply:Record<string,unknown>|null;idle:boolean;interrupted:boolean;resolve(o:ExecuteOutcome):void;onOutput?:(o:NbOutput)=>void;capture?:(data:Record<string,unknown>)=>void};
export type KernelInfo={kernelId:string;kernelName:string;serverVersion:string;language:string};

export class JupyterClient{
  readonly origin:string;readonly #token:string;readonly #fetch:FetchLike;readonly #socket:SocketFactory;readonly #timeoutMs:number;
  #ws:SocketLike|null=null;#kernel:KernelInfo|null=null;#session=crypto.randomUUID();#pending=new Map<string,Pending>();#closed=false;
  onDisconnect:((reason:string)=>void)|null=null;
  constructor(connection:{origin:string;token:string},options:{fetch?:FetchLike;socket?:SocketFactory;timeoutMs?:number}={}){
    this.origin=jupyterOrigin(connection.origin);
    if(!validJupyterToken(connection.token))throw new JupyterError('The Jupyter token is malformed (16-256 letters, digits, - or _).','rejected');
    this.#token=connection.token;
    this.#fetch=options.fetch??(globalThis.fetch.bind(globalThis) as unknown as FetchLike);
    this.#socket=options.socket??((url:string)=>new WebSocket(url) as unknown as SocketLike);
    this.#timeoutMs=options.timeoutMs??15000;
  }
  get kernel():KernelInfo|null{return this.#kernel;}
  get connected():boolean{return !!this.#ws&&this.#ws.readyState===1&&!this.#closed;}

  async #request(path:string,method='GET',body?:unknown):Promise<unknown>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.#timeoutMs);
    let response;
    try{
      response=await this.#fetch(this.origin+path,{method,headers:{Authorization:'token '+this.#token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',mode:'cors',signal:controller.signal});
    }catch{
      throw new JupyterError(`The Jupyter Server at ${this.origin} is unreachable, or it refused this page's origin. Start it with "python py/service/jupyter_local.py --workbench-origin ${typeof location==='undefined'?'<this page origin>':location.origin}".`,'unavailable');
    }finally{clearTimeout(timer);}
    const text=await response.text();
    if(text.length>JUPYTER_LIMITS.messageBytes)throw new JupyterError('The Jupyter Server response is too large.','malformed');
    if(response.status===401||response.status===403)throw new JupyterError('The Jupyter Server refused the token. Paste the token printed when it started.','denied',response.status);
    if(!response.ok)throw new JupyterError(`The Jupyter Server answered HTTP ${response.status} for ${method} ${path.split('?')[0]}.`,response.status>=500?'unavailable':'rejected',response.status);
    if(!text)return null;
    try{return JSON.parse(text);}catch{throw new JupyterError('The Jupyter Server answered with invalid JSON.','malformed');}
  }

  /** Check the server, pick its Python kernelspec and start one kernel owned by this page. */
  async connect():Promise<KernelInfo>{
    const status=await this.#request('/api/status');
    if(!isObject(status))throw new JupyterError(`The service at ${this.origin} does not look like a Jupyter Server.`,'malformed');
    const version=await this.#request('/api').catch(()=>null);
    const specs=await this.#request('/api/kernelspecs');
    if(!isObject(specs)||!isObject(specs.kernelspecs))throw new JupyterError('The Jupyter Server returned malformed kernelspecs.','malformed');
    const entries=Object.entries(specs.kernelspecs).filter(([,v])=>isObject(v)&&isObject(v.spec)&&String((v.spec as Record<string,unknown>).language).toLowerCase()==='python');
    const name=entries.some(([k])=>k===specs.default)?String(specs.default):entries[0]?.[0];
    if(!name)throw new JupyterError('The Jupyter Server offers no Python kernel. Install ipykernel in its environment.','rejected');
    const kernel=await this.#request('/api/kernels','POST',{name});
    if(!isObject(kernel)||typeof kernel.id!=='string'||!/^[0-9a-f-]{8,64}$/.test(kernel.id))throw new JupyterError('The Jupyter Server returned a malformed kernel.','malformed');
    this.#kernel={kernelId:kernel.id,kernelName:name,serverVersion:isObject(version)&&typeof version.version==='string'?version.version.slice(0,40):'',language:'python'};
    try{await this.#open();}catch(error){await this.#request(`/api/kernels/${kernel.id}`,'DELETE').catch(()=>{});this.#kernel=null;throw error;}
    return this.#kernel;
  }
  #open():Promise<void>{
    const k=this.#kernel!;const url=`ws://${new URL(this.origin).host}/api/kernels/${k.kernelId}/channels?session_id=${this.#session}&token=${encodeURIComponent(this.#token)}`;
    return new Promise((resolve,reject)=>{
      let opened=false;const ws=this.#socket(url);this.#ws=ws;
      ws.onopen=()=>{opened=true;resolve();};
      ws.onerror=()=>{if(!opened)reject(new JupyterError('The kernel websocket was refused (token or page origin).','denied'));};
      ws.onclose=e=>{
        if(!opened){reject(new JupyterError('The kernel websocket closed before it opened (token or page origin).','denied'));return;}
        this.#drop(`The kernel connection closed${e.reason?': '+e.reason.slice(0,120):''}.`);
      };
      ws.onmessage=e=>this.#receive(e.data);
    });
  }
  #drop(reason:string){
    if(this.#closed)return;this.#closed=true;this.#ws=null;
    for(const [id,p] of this.#pending){this.#pending.delete(id);p.resolve({status:'disconnected',executionCount:null,outputs:p.collector.outputs,truncated:p.collector.truncated,detail:reason+' The outcome of this run was not observed.'});}
    this.onDisconnect?.(reason);
  }
  #receive(data:unknown){
    if(typeof data!=='string'||data.length>JUPYTER_LIMITS.messageBytes)return;
    let msg:unknown;try{msg=JSON.parse(data);}catch{return;}
    if(!isObject(msg)||!isObject(msg.header)||!isObject(msg.parent_header)||!isObject(msg.content))return;
    const parent=msg.parent_header.msg_id,type=String(msg.header.msg_type??msg.msg_type??''),content=msg.content;
    if(type==='status'&&(content.execution_state==='dead'||content.execution_state==='restarting')){
      for(const [id,p] of this.#pending){this.#pending.delete(id);p.resolve({status:'unknown',executionCount:null,outputs:p.collector.outputs,truncated:p.collector.truncated,detail:`The kernel ${content.execution_state==='dead'?'died':'restarted'} during the run; its outcome was not observed and its variables are gone.`});}
      return;
    }
    if(typeof parent!=='string')return;
    const p=this.#pending.get(parent);if(!p)return;
    if(msg.channel==='shell'&&type==='execute_reply')p.reply=content;
    else if(type==='status'&&content.execution_state==='idle')p.idle=true;
    else if(p.capture&&type==='display_data'&&isObject(content.data)&&TABLE_MIME in content.data)p.capture(content.data);
    else{const out=p.collector.add(type,content);if(out)p.onOutput?.(out);}
    if(p.reply&&p.idle){
      this.#pending.delete(parent);
      const r=p.reply,count=typeof r.execution_count==='number'?r.execution_count:null;
      const ename=String(r.ename??'');
      const status:ExecuteStatus=r.status==='ok'?'ok':ename==='KeyboardInterrupt'||(p.interrupted&&r.status==='aborted')?'interrupted':'error';
      p.resolve({status,executionCount:count,outputs:p.collector.outputs,truncated:p.collector.truncated,...(r.status==='ok'?{}:{error:{ename:ename||String(r.status),evalue:String(r.evalue??'').slice(0,2000)}})});
    }
  }
  #send(code:string,options:{storeHistory:boolean;onOutput?:(o:NbOutput)=>void;capture?:(d:Record<string,unknown>)=>void}):{id:string;done:Promise<ExecuteOutcome>}{
    if(!this.connected)throw new JupyterError('No kernel is connected. Pair with a Jupyter Server first; nothing was run.','disconnected');
    const id=crypto.randomUUID();
    const done=new Promise<ExecuteOutcome>(resolve=>this.#pending.set(id,{collector:new OutputCollector(),reply:null,idle:false,interrupted:false,resolve,onOutput:options.onOutput,capture:options.capture}));
    this.#ws!.send(JSON.stringify({header:{msg_id:id,username:'datapass-workbench',session:this.#session,msg_type:'execute_request',version:'5.3',date:new Date().toISOString()},parent_header:{},metadata:{},content:{code,silent:false,store_history:options.storeHistory,user_expressions:{},allow_stdin:false,stop_on_error:true},channel:'shell',buffers:[]}));
    return {id,done};
  }
  /** Run one cell's source. Resolves with the observed outcome; it never throws for a failed cell. */
  execute(code:string,onOutput?:(o:NbOutput)=>void):{id:string;done:Promise<ExecuteOutcome>}{
    if(typeof code!=='string'||code.length>20000)throw new JupyterError('Python source above 20,000 characters.','rejected');
    return this.#send(code,{storeHistory:true,onOutput});
  }
  /** Publish one variable as a bounded table through the fixed helper above. */
  async publishTable(name:string):Promise<TablePayload>{
    let captured:Record<string,unknown>|null=null;
    const {done}=this.#send(publishTableCode(name),{storeHistory:false,capture:d=>{captured=d;}});
    const outcome=await done;
    if(outcome.status!=='ok'){
      const err=outcome.outputs.find(o=>o.output_type==='error');
      throw new JupyterError(`Publishing "${name}" as a table ${outcome.status==='error'?'failed':outcome.status}: ${err?String(err.ename)+': '+String(err.evalue):outcome.detail??''}`.trim(),outcome.status==='disconnected'?'disconnected':'rejected');
    }
    if(!captured)throw new JupyterError(`The kernel did not publish "${name}".`,'malformed');
    return validateTable((captured as Record<string,unknown>)[TABLE_MIME]);
  }
  markInterrupted(id:string){const p=this.#pending.get(id);if(p)p.interrupted=true;}
  /** Ask the server to interrupt the kernel (POST /api/kernels/{id}/interrupt). The run's reply reports the outcome. */
  async interrupt(id?:string):Promise<void>{
    if(!this.#kernel)throw new JupyterError('No kernel to interrupt.','disconnected');
    if(id)this.markInterrupted(id);
    await this.#request(`/api/kernels/${this.#kernel.kernelId}/interrupt`,'POST',{});
  }
  /** Close the websocket and shut down the kernel this page started (process ownership). */
  async shutdown():Promise<void>{
    const k=this.#kernel;this.#kernel=null;
    const ws=this.#ws;this.#drop('Disconnected by you.');
    try{ws?.close(1000,'workbench disconnect');}catch{/* already closed */}
    if(k)await this.#request(`/api/kernels/${k.kernelId}`,'DELETE').catch(()=>{});
  }
}

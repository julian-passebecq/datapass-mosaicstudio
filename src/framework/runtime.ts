import type {AppDefinition, Manifest, Values, Rows, Scalar, ValueRef, Snapshot, TaskState, SavedState, DeriveContext} from './types.ts';
import {validateDefinition, validateRows, validateValue, object, parseSavedState} from './validate.ts';
function freeze<T>(value: T): T {if (value && typeof value==='object' && !Object.isFrozen(value)) {Object.freeze(value); Object.values(value).forEach(freeze);} return value;}
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
type Cache={key:string; rows:Rows; version:number};
/** Small website state/data adapter, NOT a SQL engine or replacement Mosaic coordinator. */
export class SiteRuntime {
  readonly manifest: Manifest;
  readonly definition: AppDefinition;
  private snapshot: Snapshot;
  private listeners=new Set<()=>void>();
  private cache=new Map<string,Cache>();
  private sequence=0;
  private runs=new Map<string,{ticket:number; key:string; abort:AbortController}>();
  private readyKeys=new Map<string,string>();
  private tickets=0;
  private derivations=new Map<string,number>();
  constructor(definition: AppDefinition) {
    this.manifest=freeze(validateDefinition(definition));
    // Source functions are not cloned or serialized. Inline data and resources are copied.
    this.definition={manifest:this.manifest,bindings:{inline:freeze(structuredClone(definition.bindings.inline||{})),derive:{...definition.bindings.derive},tasks:{...definition.bindings.tasks}},resources:freeze(structuredClone(definition.resources||{}))};
    this.snapshot=freeze({values:Object.fromEntries(this.manifest.fields.map(f=>[f.id,f.default])),revision:0,tasks:Object.fromEntries(this.manifest.tasks.map(t=>[t.id,{status:'idle',progress:0,message:''} satisfies TaskState]))});
  }
  getSnapshot=():Snapshot=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private emit(){for(const fn of this.listeners)fn();}
  private taskState(id:string,next:TaskState){this.snapshot=freeze({...this.snapshot,tasks:{...this.snapshot.tasks,[id]:next}});this.emit();}
  patch(values:Record<string,unknown>){
    if(!object(values))throw new Error('State patch must be a plain object');
    for(const [id,value] of Object.entries(values)){const f=this.manifest.fields.find(f=>f.id===id);if(!f)throw new Error('Unknown field: '+id);validateValue(f,value);}
    if(Object.entries(values).every(([id,v])=>Object.is(this.snapshot.values[id],v)))return;
    this.snapshot=freeze({...this.snapshot,values:{...this.snapshot.values,...values} as Values,revision:this.snapshot.revision+1});
    // Only tasks whose declared inputs changed are invalidated. Camera/selection
    // fields outside those inputs never invalidate a model result.
    const tasks={...this.snapshot.tasks};
    for(const task of this.manifest.tasks){const current=tasks[task.id];if(!['running','ready'].includes(current.status))continue;
      let key='';try{key=this.prepare(task.output).key;}catch{key='invalid-input';}
      const previous=this.runs.get(task.id)?.key||this.readyKeys.get(task.id);
      if(key!==previous){this.runs.get(task.id)?.abort.abort();this.runs.delete(task.id);this.readyKeys.delete(task.id);this.cache.delete(task.output);tasks[task.id]={status:'stale',progress:0,message:'Inputs changed. Run the task again.'};}
    }
    this.snapshot=freeze({...this.snapshot,tasks});this.emit();
  }
  set(id:string,value:Scalar){this.patch({[id]:value});}
  applyCue(patch:Record<string,Scalar>){for(const id of Object.keys(patch)){if(this.manifest.fields.find(f=>f.id===id)?.role!=='view')throw new Error('A story cannot change model inputs');}this.patch(patch);}
  private prepare(id:string):{key:string;context:DeriveContext}{
    const d=this.manifest.datasets.find(d=>d.id===id);if(!d)throw new Error('Unknown dataset: '+id);
    const datasets:Record<string,Rows>={},versions:Record<string,number>={};
    for(const dep of d.dependsOn){datasets[dep]=this.dataset(dep);versions[dep]=this.cache.get(dep)!.version;}
    const values=Object.fromEntries(d.inputs.map(f=>[f,this.snapshot.values[f]]));
    return {key:JSON.stringify([values,versions]),context:freeze({values,datasets})};
  }
  dataset(id:string):Rows{
    const d=this.manifest.datasets.find(d=>d.id===id);if(!d)throw new Error('Unknown dataset: '+id);
    const {key,context}=this.prepare(id),cached=this.cache.get(id);
    if(cached?.key===key)return cached.rows;
    if(d.source==='task')throw new Error('Run the task to produce current data: '+d.title);
    const value=d.source==='inline'?this.definition.bindings.inline![id]:this.definition.bindings.derive![id](context);
    const rows=freeze(validateRows(d,value));this.cache.set(id,{key,rows,version:++this.sequence});
    if(d.source==='derived')this.derivations.set(id,(this.derivations.get(id)||0)+1);
    return rows;
  }
  resolve(ref:ValueRef):Scalar{
    if('literal' in ref)return ref.literal;if('field' in ref)return this.snapshot.values[ref.field];
    const dataset=this.manifest.datasets.find(d=>d.id===ref.dataset)!;
    const row=this.dataset(ref.dataset).find(r=>String(r[dataset.rowKey])===ref.row);
    return row?.[ref.column]??null;
  }
  diagnostics(){return this.manifest.datasets.map(d=>({id:d.id,cached:this.cache.has(d.id),derivations:this.derivations.get(d.id)||0}));}
  async runTask(id:string):Promise<TaskState>{
    const task=this.manifest.tasks.find(t=>t.id===id);if(!task)throw new Error('Unknown task');
    this.cancelTask(id);
    let prepared:ReturnType<SiteRuntime['prepare']>;
    try{prepared=this.prepare(task.output);}catch(e){const state:TaskState={status:'error',message:errorText(e),progress:0};this.taskState(id,state);return state;}
    const ticket=++this.tickets,abort=new AbortController();this.runs.set(id,{ticket,key:prepared.key,abort});
    this.cache.delete(task.output);this.readyKeys.delete(id);this.taskState(id,{status:'running',progress:0,message:''});
    let timer:ReturnType<typeof setTimeout>|undefined,abortListener:()=>void=()=>{};
    const ended=new Promise<never>((_,reject)=>{
      abortListener=()=>reject(new Error('Task cancelled'));abort.signal.addEventListener('abort',abortListener,{once:true});
      timer=setTimeout(()=>{reject(new Error('Task timed out'));abort.abort();},task.timeoutMs);
    });
    try{
      const handler=this.definition.bindings.tasks![id];
      const result=await Promise.race([Promise.resolve().then(()=>handler({...prepared.context,signal:abort.signal,report:progress=>{
        if(this.runs.get(id)?.ticket!==ticket||abort.signal.aborted)return;
        if(!Number.isFinite(progress)||progress<0||progress>1)throw new Error('Task progress must be between 0 and 1');
        this.taskState(id,{status:'running',progress,message:''});
      }})),ended]);
      if(this.runs.get(id)?.ticket!==ticket)return this.snapshot.tasks[id];
      if(this.prepare(task.output).key!==prepared.key){this.taskState(id,{status:'stale',progress:0,message:'Inputs changed. Run again.'});return this.snapshot.tasks[id];}
      const dataset=this.manifest.datasets.find(d=>d.id===task.output)!;
      const rows=freeze(validateRows(dataset,result));this.cache.set(task.output,{key:prepared.key,rows,version:++this.sequence});this.readyKeys.set(id,prepared.key);
      this.taskState(id,{status:'ready',progress:1,message:'Result matches current inputs.'});
    }catch(e){if(this.runs.get(id)?.ticket===ticket)this.taskState(id,{status:'error',progress:0,message:errorText(e)});}
    finally{if(timer!==undefined)clearTimeout(timer);abort.signal.removeEventListener('abort',abortListener);if(this.runs.get(id)?.ticket===ticket)this.runs.delete(id);}
    return this.snapshot.tasks[id];
  }
  cancelTask(id:string){const run=this.runs.get(id);if(!run)return;this.runs.delete(id);run.abort.abort();this.taskState(id,{status:'cancelled',progress:0,message:'Task cancelled. No result was applied.'});}
  cancelAll(){for(const id of [...this.runs.keys()])this.cancelTask(id);}
  save(page:string):SavedState{if(!this.manifest.pages.some(p=>p.id===page))throw new Error('Unknown page');return {format:'datapass.web-state',version:1,appId:this.manifest.id,appVersion:this.manifest.version,page,values:{...this.snapshot.values}};}
  review(source:string):SavedState{return parseSavedState(source,this.manifest);}
  restore(value:SavedState){const checked=this.review(JSON.stringify(value));this.cancelAll();this.patch(checked.values);return checked.page;}
  reset(){this.cancelAll();this.patch(Object.fromEntries(this.manifest.fields.map(f=>[f.id,f.default])));}
}

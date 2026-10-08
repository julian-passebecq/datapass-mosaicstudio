/** Notebook model for the browser workbench. Pure data: no execution, no DOM, no network.
 * A cell is inert text or declared inputs. Running a cell is an explicit user action handled elsewhere;
 * importing or restoring a notebook never runs anything. */
import {identifier,strict,text} from '../framework/guards.ts';

export type InputValue=string|number|boolean;
export type ChartChoice={kind:'bar'|'line'|'scatter';x:string;y:string};
export type SqlCell={id:string;kind:'sql';title:string;sql:string;dependsOn:string[];chart?:ChartChoice};
/** A Python cell names an allowlisted model on the trusted local runtime and its declared inputs. It never carries code. */
export type PythonCell={id:string;kind:'python';title:string;model:string;inputs:Record<string,InputValue>;dependsOn:string[];outputTable?:string};
export type NoteCell={id:string;kind:'note';title:string;text:string;dependsOn:string[]};
export type Cell=SqlCell|PythonCell|NoteCell;
export type Notebook={cells:Cell[]};
export const NOTEBOOK_LIMITS=Object.freeze({cells:50,sql:20000,note:8000,title:120,inputs:24,dependsOn:12});

const TABLE=/^[a-z][a-z0-9_]{0,62}$/;
export function validateCell(input:unknown):Cell{
  if(!input||typeof input!=='object')throw new Error('cell: not an object');
  const kind=(input as {kind?:unknown}).kind;
  if(kind==='sql')strict(input,['id','kind','title','sql','dependsOn','chart'],'sql cell');
  else if(kind==='python')strict(input,['id','kind','title','model','inputs','dependsOn','outputTable'],'python cell');
  else if(kind==='note')strict(input,['id','kind','title','text','dependsOn'],'note cell');
  else throw new Error('cell: unknown kind');
  identifier(input.id,'cell id');text(input.title,'cell title',NOTEBOOK_LIMITS.title);
  const deps=input.dependsOn;
  if(!Array.isArray(deps)||deps.length>NOTEBOOK_LIMITS.dependsOn)throw new Error('cell '+input.id+': dependency budget');
  for(const d of deps)identifier(d,'cell dependency');
  if(new Set(deps).size!==deps.length||deps.includes(input.id))throw new Error('cell '+input.id+': duplicate or self dependency');
  if(input.kind==='sql'){
    text(input.sql,'cell sql',NOTEBOOK_LIMITS.sql,false);
    if(input.chart!==undefined){
      strict(input.chart,['kind','x','y'],'cell chart');
      if(!['bar','line','scatter'].includes(input.chart.kind as string))throw new Error('cell chart: unknown kind');
      text(input.chart.x,'chart x',200);text(input.chart.y,'chart y',200);
    }
  }else if(input.kind==='python'){
    identifier(input.model,'runtime model');
    const values=input.inputs;
    if(!values||typeof values!=='object'||Array.isArray(values)||Object.getPrototypeOf(values)!==Object.prototype)throw new Error('python cell inputs: not an object');
    const entries=Object.entries(values);
    if(entries.length>NOTEBOOK_LIMITS.inputs)throw new Error('python cell inputs: budget');
    for(const [key,value] of entries){
      identifier(key,'input id');
      if(!(typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&value.length<=400)))throw new Error('python cell input '+key+': finite number, boolean or short text required');
    }
    if(input.outputTable!==undefined&&(typeof input.outputTable!=='string'||!TABLE.test(input.outputTable)))throw new Error('python cell output table: lowercase SQL name required');
  }else text(input.text,'note text',NOTEBOOK_LIMITS.note,false);
  return structuredClone(input) as Cell;
}

/** Validate the whole notebook jointly: unique ids, known dependencies and no cycles. */
export function validateNotebook(input:unknown):Notebook{
  strict(input,['cells'],'notebook');
  if(!Array.isArray(input.cells)||input.cells.length>NOTEBOOK_LIMITS.cells)throw new Error('notebook: cell budget');
  const cells=input.cells.map(validateCell),ids=new Set<string>(),tables=new Set<string>();
  for(const c of cells){if(ids.has(c.id))throw new Error('notebook: duplicate cell '+c.id);ids.add(c.id);}
  for(const c of cells){
    for(const d of c.dependsOn)if(!ids.has(d))throw new Error('cell '+c.id+' depends on unknown cell '+d);
    if(c.kind==='python'&&c.outputTable){if(tables.has(c.outputTable))throw new Error('notebook: duplicate output table '+c.outputTable);tables.add(c.outputTable);}
  }
  const cycle=findCycle(cells);
  if(cycle)throw new Error('notebook: dependency cycle '+cycle.join(' -> '));
  return {cells};
}

function findCycle(cells:Cell[]):string[]|null{
  const byId=new Map(cells.map(c=>[c.id,c])),state=new Map<string,1|2>(),stack:string[]=[];
  const visit=(id:string):string[]|null=>{
    if(state.get(id)===2)return null;
    if(state.get(id)===1)return [...stack.slice(stack.indexOf(id)),id];
    state.set(id,1);stack.push(id);
    for(const d of byId.get(id)?.dependsOn??[]){const found=visit(d);if(found)return found;}
    stack.pop();state.set(id,2);return null;
  };
  for(const c of cells){const found=visit(c.id);if(found)return found;}
  return null;
}

/** The cells to run, in order, so that `target` runs after everything it declares (transitively).
 * Ties keep notebook order, so the plan is deterministic. Notes are never executed. */
export function executionPlan(notebook:Notebook,target:string):string[]{
  const byId=new Map(notebook.cells.map(c=>[c.id,c]));
  if(!byId.has(target))throw new Error('Unknown cell '+target);
  const needed=new Set<string>(),walk=(id:string)=>{if(needed.has(id))return;needed.add(id);for(const d of byId.get(id)!.dependsOn)walk(d);};
  walk(target);
  const order:string[]=[],done=new Set<string>(),position=new Map(notebook.cells.map((c,i)=>[c.id,i]));
  while(done.size<needed.size){
    const ready=[...needed].filter(id=>!done.has(id)&&byId.get(id)!.dependsOn.every(d=>done.has(d))).sort((a,b)=>position.get(a)!-position.get(b)!);
    if(!ready.length)throw new Error('notebook: dependency cycle');
    done.add(ready[0]);order.push(ready[0]);
  }
  return order.filter(id=>byId.get(id)!.kind!=='note');
}

/** A result is stale when the cell changed after it ran, or a dependency produced a newer result since. */
export type CellRun={cellId:string;sequence:number;sourceKey:string;dependencySequences:Record<string,number>};
export function cellSourceKey(cell:Cell):string{
  return JSON.stringify(cell.kind==='sql'?[cell.kind,cell.sql]:cell.kind==='python'?[cell.kind,cell.model,Object.entries(cell.inputs).sort(([a],[b])=>a<b?-1:1),cell.outputTable??null]:[cell.kind,cell.text]);
}
export function staleReason(notebook:Notebook,runs:Record<string,CellRun|undefined>,cellId:string):string|null{
  const cell=notebook.cells.find(c=>c.id===cellId),run=runs[cellId];
  if(!cell||!run)return null;
  if(run.sourceKey!==cellSourceKey(cell))return 'The cell changed after this result was produced.';
  for(const d of cell.dependsOn){
    const dep=runs[d];
    if(!dep)return 'Dependency '+d+' has no current result.';
    if(dep.sequence!==run.dependencySequences[d])return 'Dependency '+d+' produced a newer result.';
  }
  return null;
}

let counter=0;
export function newCellId(notebook:Notebook,kind:Cell['kind']):string{
  const ids=new Set(notebook.cells.map(c=>c.id));
  let id:string;do id=kind+'-'+(++counter).toString(36)+Math.random().toString(36).slice(2,6);while(ids.has(id));
  return id;
}
export function addCell(notebook:Notebook,cell:Cell,after?:string):Notebook{
  const cells=[...notebook.cells],index=after===undefined?cells.length:cells.findIndex(c=>c.id===after)+1;
  cells.splice(index<=0?cells.length:index,0,cell);
  return validateNotebook({cells});
}
export function removeCell(notebook:Notebook,id:string):Notebook{
  return validateNotebook({cells:notebook.cells.filter(c=>c.id!==id).map(c=>({...c,dependsOn:c.dependsOn.filter(d=>d!==id)}))});
}
export function moveCell(notebook:Notebook,id:string,delta:-1|1):Notebook{
  const cells=[...notebook.cells],i=cells.findIndex(c=>c.id===id),j=i+delta;
  if(i<0||j<0||j>=cells.length)return notebook;
  [cells[i],cells[j]]=[cells[j],cells[i]];
  return validateNotebook({cells});
}
/** Replace one cell; the joint validation rejects cycles or unknown dependencies before anything changes. */
export function updateCell(notebook:Notebook,cell:Cell):Notebook{
  if(!notebook.cells.some(c=>c.id===cell.id))throw new Error('Unknown cell '+cell.id);
  return validateNotebook({cells:notebook.cells.map(c=>c.id===cell.id?cell:c)});
}

export const EMPTY_NOTEBOOK:Notebook=Object.freeze({cells:[]}) as unknown as Notebook;

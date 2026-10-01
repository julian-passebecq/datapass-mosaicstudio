import type {Manifest, Field, Scalar, Dataset, Rows, Block, AppDefinition, ValueRef, SavedState} from './types.ts';
export const LIMITS = Object.freeze({fields: 100, datasets: 50, pages: 20, blocks: 200, rows: 10000, columns: 40, stateBytes: 65536});
import {object, strict, text, identifier} from './guards.ts';
export {object, strict, text, identifier} from './guards.ts';
import {validateExplorer, validateExplorerBinding} from './explorer/model.ts';
import {validateExplanation} from './explanation.ts';
function list(v: unknown, label: string, max: number, min = 0): asserts v is unknown[] {if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(label + ': array size limit');}
function oneOf(v: unknown, choices: readonly string[], label: string): void {if (typeof v !== 'string' || !choices.includes(v)) throw new Error(label + ': invalid choice');}
function number(v: unknown, min: number, max: number, label: string, integer = false): asserts v is number {if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v))) throw new Error(label + ': invalid number');}
export function scalar(v: unknown): v is Scalar {return v === null || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 4000) || (typeof v === 'number' && Number.isFinite(v));}
function unique(items: unknown[], label: string): Set<string> {const seen = new Set<string>(); for (const x of items) {identifier(x, label); if (seen.has(x)) throw new Error(label + ': duplicate id ' + x); seen.add(x);} return seen;}
export function validateValue(field: Field, v: unknown): asserts v is Scalar {
  if (field.type === 'number') {number(v, field.min!, field.max!, field.id); const units=(v-field.min!)/field.step!; if(Math.abs(units-Math.round(units))>Math.max(1e-8,Math.abs(units)*Number.EPSILON*4))throw new Error(field.id+': value must follow the declared step');}
  else if (field.type === 'toggle') {if (typeof v !== 'boolean') throw new Error(field.id + ': boolean required');}
  else if (typeof v !== 'string' || !field.options!.some(o => o.value === v)) throw new Error(field.id + ': unknown option');
}
function validateField(input: unknown): asserts input is Field {
  strict(input, ['id','label','type','role','default','min','max','step','unit','options'], 'field'); identifier(input.id, 'field.id'); text(input.label, 'field.label', 160);
  oneOf(input.type, ['number','select','toggle'], 'field.type'); oneOf(input.role, ['input','view'], 'field.role'); if (input.unit !== undefined) text(input.unit, 'field.unit', 40, false);
  if (input.type === 'number') {number(input.min, -1e12, 1e12, 'field.min'); number(input.max, input.min, 1e12, 'field.max'); number(input.step, 1e-12, 1e12, 'field.step'); if (input.options !== undefined) throw new Error('Number field cannot have options');}
  else {if (input.min !== undefined || input.max !== undefined || input.step !== undefined) throw new Error('Non-number field cannot have numeric bounds');
    if (input.type === 'select') {list(input.options, 'field.options', 100, 1); const seen = new Set<string>(); for (const opt of input.options) {strict(opt, ['value','label'], 'option'); text(opt.value, 'option.value', 160); text(opt.label, 'option.label', 160); if (seen.has(opt.value)) throw new Error('Duplicate option'); seen.add(opt.value);}}
    else if (input.options !== undefined) throw new Error('Toggle cannot have options');
  }
  validateValue(input as Field, input.default);
}
function validateDataset(d: unknown, fieldIds: Set<string>): asserts d is Dataset {
  strict(d, ['id','title','layer','description','source','provenance','rowKey','columns','inputs','dependsOn'], 'dataset'); identifier(d.id, 'dataset.id'); text(d.title, 'dataset.title', 200); text(d.layer, 'dataset.layer', 80); text(d.description, 'dataset.description', 2000, false);
  oneOf(d.source, ['inline','derived','task'], 'dataset.source'); oneOf(d.provenance, ['synthetic','user-provided','derived'], 'dataset.provenance'); identifier(d.rowKey, 'dataset.rowKey');
  list(d.columns, 'dataset.columns', LIMITS.columns, 1); const columns = new Set<string>();
  for (const c of d.columns) {strict(c, ['id','label','type','unit','nullable'], 'column'); identifier(c.id, 'column.id'); text(c.label, 'column.label', 120); oneOf(c.type, ['string','number','boolean'], 'column.type'); if (columns.has(c.id)) throw new Error('Duplicate column'); columns.add(c.id); if (c.unit !== undefined) text(c.unit, 'column.unit', 40, false); if (c.nullable !== undefined && typeof c.nullable !== 'boolean') throw new Error('Invalid nullability');}
  if (!columns.has(d.rowKey)) throw new Error('rowKey must be a declared column');
  list(d.inputs, 'dataset.inputs', LIMITS.fields); list(d.dependsOn, 'dataset.dependsOn', LIMITS.datasets); unique(d.inputs, 'input'); unique(d.dependsOn, 'dependency');
  for (const f of d.inputs) if (!fieldIds.has(f as string)) throw new Error('Unknown input field: ' + f);
  if (d.source === 'inline' && (d.inputs.length || d.dependsOn.length)) throw new Error('Inline data cannot declare compute dependencies');
}
const blockFields = {
  text:['text','tone'], metric:['value','unit','digits','note'], input:['field','control'], table:['dataset','pageSize'], chart:['dataset','x','y','kind','unit'], task:['task'], catalog:[], code:['text','language'],
  scene3d:['resource','explode','phase','camera','selection'], 'story-controls':['resource'], 'story-figure':['resource'], architecture:['resource'], custom:['resource'], explanation:['resource'], explorer:['resource','focus','facet','view','level','group','document','scroll'],
} as const;
export const BLOCK_TYPES = Object.freeze(Object.keys(blockFields));
function valueRef(v: unknown, manifest: Manifest): void {
  if (!object(v)) throw new Error('Invalid value reference');
  if ('literal' in v) {strict(v, ['literal'], 'value'); if (!scalar(v.literal)) throw new Error('Non-scalar literal');}
  else if ('field' in v) {strict(v, ['field'], 'value'); if (!manifest.fields.some(f => f.id === v.field)) throw new Error('Unknown value field');}
  else {strict(v, ['dataset','row','column'], 'value'); text(v.row, 'value.row', 160); const d = manifest.datasets.find(d => d.id === v.dataset); if (!d?.columns.some(c => c.id === v.column)) throw new Error('Unknown value dataset/column');}
}
function validateBlock(v: unknown, m: Manifest, columns: number): asserts v is Block {
  if (!object(v) || !Object.hasOwn(blockFields, String(v.type))) throw new Error('Unknown block type');
  strict(v, ['id','type','span','title',...blockFields[v.type as keyof typeof blockFields]], 'block'); identifier(v.id, 'block.id'); if (v.title !== undefined) text(v.title, 'block.title', 200); if (v.span !== undefined) number(v.span, 1, columns, 'block.span', true);
  if (v.type === 'text' || v.type === 'code') {text(v.text, 'block.text', 20000, false); if (v.type === 'code') text(v.language, 'code.language', 40); else if (v.tone !== undefined) oneOf(v.tone, ['lead','body','note'], 'text.tone');}
  if (v.type === 'metric') {valueRef(v.value, m); if (v.unit !== undefined) text(v.unit, 'metric.unit', 40, false); if (v.note !== undefined) text(v.note, 'metric.note', 2000, false); if (v.digits !== undefined) number(v.digits, 0, 6, 'metric.digits', true);}
  if (v.type === 'input' && !m.fields.some(f => f.id === v.field)) throw new Error('Unknown block input');
  if (v.type === 'input' && v.control !== undefined) {oneOf(v.control, ['field','slider'], 'input.control'); if(v.control==='slider' && m.fields.find(f=>f.id===v.field)?.type!=='number') throw new Error('Slider needs a numeric field');}
  if (v.type === 'table' || v.type === 'chart') {
    const d = m.datasets.find(d => d.id === v.dataset); if (!d) throw new Error('Unknown block dataset');
    if (v.type === 'table' && v.pageSize !== undefined) number(v.pageSize, 1, 100, 'table.pageSize', true);
    if (v.type === 'chart') {oneOf(v.kind, ['bar','line','scatter'], 'chart.kind'); const x=d.columns.find(c => c.id === v.x), y=d.columns.find(c => c.id === v.y); if (!x || y?.type !== 'number' || (v.kind !== 'bar' && x.type !== 'number')) throw new Error('Invalid chart encoding types'); if (v.unit !== undefined) text(v.unit, 'chart.unit', 30, false);}
  }
  if (v.type === 'task' && !m.tasks.some(t => t.id === v.task)) throw new Error('Unknown task block');
  if (['scene3d','story-controls','story-figure','architecture','custom','explorer','explanation'].includes(v.type as string)) identifier(v.resource, 'block.resource');
  if (v.type === 'explorer') {
    for (const key of ['focus','facet','view','level','group','document']) {const f=m.fields.find(f=>f.id===v[key]); if(!f||f.role!=='view'||f.type!=='select')throw new Error('Explorer controls must reference select view fields');}
    if(v.scroll!==undefined&&typeof v.scroll!=='boolean')throw new Error('Invalid explorer scroll option');
  }
  if (v.type === 'scene3d') for (const key of ['explode','phase','camera','selection']) {const f=m.fields.find(f => f.id === v[key]); if (!f || f.role !== 'view' || (['explode','phase'].includes(key) ? f.type !== 'number' || f.min! < 0 || f.max! > 1 : f.type !== 'select')) throw new Error('Scene controls must reference bounded view fields');}
}
export function validateManifest(value: unknown): Manifest {
  strict(value, ['format','schemaVersion','id','version','title','description','label','theme','fields','datasets','tasks','pages'], 'app');
  if (value.format !== 'datapass.web-app' || value.schemaVersion !== 1) throw new Error('Unsupported app format'); identifier(value.id, 'app.id'); text(value.version, 'app.version', 40); text(value.title, 'app.title', 160); text(value.description, 'app.description', 2000, false); text(value.label, 'app.label', 120);
  strict(value.theme, ['accent','density','mode'], 'theme'); if(value.theme.mode!==undefined) oneOf(value.theme.mode,['light','dark'],'theme.mode'); if (typeof value.theme.accent !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value.theme.accent)) throw new Error('Theme accent must be a hex color'); oneOf(value.theme.density, ['compact','comfortable'], 'theme.density');
  list(value.fields, 'fields', LIMITS.fields); value.fields.forEach(validateField); const fieldIds = unique(value.fields.map(f => (f as Field).id), 'field');
  list(value.datasets, 'datasets', LIMITS.datasets); value.datasets.forEach(d => validateDataset(d, fieldIds)); const datasetIds = unique(value.datasets.map(d => (d as Dataset).id), 'dataset');
  const datasets = value.datasets as Dataset[], state = new Map<string, number>();
  const visit=(id: string) => {if (state.get(id)===1) throw new Error('Dataset dependency cycle at '+id); if (state.get(id)===2) return; state.set(id,1); const d=datasets.find(d=>d.id===id)!; for (const dep of d.dependsOn) {if (!datasetIds.has(dep)) throw new Error('Unknown dataset dependency: '+dep); visit(dep);} state.set(id,2);}; datasets.forEach(d=>visit(d.id));
  list(value.tasks, 'tasks', LIMITS.datasets); const outputs = new Set<string>();
  for (const t of value.tasks) {strict(t, ['id','label','output','timeoutMs'], 'task'); identifier(t.id, 'task.id'); text(t.label, 'task.label', 160); number(t.timeoutMs, 100, 60000, 'task.timeoutMs', true); const d=datasets.find(d=>d.id===t.output); if (d?.source!=='task' || outputs.has(d.id)) throw new Error('Task output must be one distinct task dataset'); outputs.add(d.id);}
  unique(value.tasks.map(t=>(t as {id:string}).id), 'task'); for (const d of datasets) if (d.source==='task' && !outputs.has(d.id)) throw new Error('Task dataset has no handler declaration');
  list(value.pages, 'pages', LIMITS.pages, 1); const allBlocks: string[] = [];
  for (const p of value.pages) {strict(p, ['id','title','description','sections'], 'page'); identifier(p.id, 'page.id'); text(p.title, 'page.title', 160); text(p.description, 'page.description', 2000, false); list(p.sections, 'sections', 30, 1); const sectionIds: string[]=[];
    for (const s of p.sections) {strict(s, ['id','title','columns','blocks'], 'section'); identifier(s.id, 'section.id'); sectionIds.push(s.id); if(s.title!==undefined) text(s.title, 'section.title', 160); number(s.columns,1,4,'section.columns',true); list(s.blocks,'section.blocks',40,1); for(const b of s.blocks) {validateBlock(b,value as Manifest,s.columns); allBlocks.push(b.id);}}
    unique(sectionIds, 'section');
  }
  unique(value.pages.map(p=>(p as {id:string}).id),'page'); unique(allBlocks,'block'); if(allBlocks.length>LIMITS.blocks) throw new Error('App block limit');
  return structuredClone(value) as Manifest;
}
export function validateRows(dataset: Dataset, value: unknown): Rows {
  list(value, dataset.id+' rows', LIMITS.rows); const keys = dataset.columns.map(c=>c.id), ids=new Set<Scalar>();
  for (const row of value) {strict(row,keys,'row'); for(const c of dataset.columns) {const v=row[c.id]; if(v===null && c.nullable) continue; if(typeof v!==c.type || !scalar(v)) throw new Error(dataset.id+'.'+c.id+': invalid cell');} const id=row[dataset.rowKey]; if((typeof id!=='string'&&typeof id!=='number') || ids.has(id as Scalar)) throw new Error(dataset.id+': missing/duplicate row key'); ids.add(id as Scalar);}
  return structuredClone(value) as Rows;
}
export function validateDefinition(d: AppDefinition): Manifest {
  const manifest=validateManifest(d.manifest);
  for(const table of manifest.datasets) {
    if(table.source==='inline') validateRows(table,d.bindings.inline?.[table.id]);
    if(table.source==='derived' && typeof d.bindings.derive?.[table.id]!=='function') throw new Error('Missing trusted derive binding: '+table.id);
  }
  for(const t of manifest.tasks) if(typeof d.bindings.tasks?.[t.id]!=='function') throw new Error('Missing trusted task binding: '+t.id);
  for(const b of manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks))) {
    if(b.type==='custom'){if(typeof d.components?.[b.resource]!=='function')throw new Error('Missing trusted custom component: '+b.resource);continue;}
    const resource=b.type==='scene3d'?d.resources?.scenes:b.type==='architecture'?d.resources?.architectures:b.type==='explorer'?d.resources?.explorers:b.type==='explanation'?d.resources?.explanations:b.type==='story-controls'||b.type==='story-figure'?d.resources?.stories:null;
    if('resource' in b && (!resource || !Object.hasOwn(resource,b.resource))) throw new Error('Missing resource: '+b.resource);
    if(b.type==='explanation')validateExplanation(d.resources!.explanations![b.resource],manifest);
    if(b.type==='explorer')validateExplorerBinding(validateExplorer(d.resources!.explorers![b.resource]),b,manifest,d);
  }
  for(const story of Object.values(d.resources?.stories||{})) {const step=manifest.fields.find(f=>f.id===story.indexField); if(!step||step.type!=='number'||step.role!=='view'||step.min!==0||step.step!==1) throw new Error('Story index must be an integer view field'); if(!object(story.cues)) throw new Error('Invalid story cues'); for(const patch of Object.values(story.cues)) {if(!object(patch)) throw new Error('Invalid cue patch'); for(const [id,v] of Object.entries(patch)) {const f=manifest.fields.find(f=>f.id===id); if(!f || f.role!=='view') throw new Error('Story cues can only change declared view fields'); validateValue(f,v);}}}
  return manifest;
}
export function parseSavedState(source: string, m: Manifest): SavedState {
  if(new TextEncoder().encode(source).length>LIMITS.stateBytes) throw new Error('Saved state exceeds 64 KiB');
  const v:unknown=JSON.parse(source); strict(v,['format','version','appId','appVersion','page','values'],'saved state');
  if(v.format!=='datapass.web-state'||v.version!==1||v.appId!==m.id||v.appVersion!==m.version||!m.pages.some(p=>p.id===v.page)) throw new Error('Saved state belongs to a different app/version/page');
  strict(v.values,m.fields.map(f=>f.id),'saved values'); for(const f of m.fields) validateValue(f,v.values[f.id]);
  return structuredClone(v) as SavedState;
}

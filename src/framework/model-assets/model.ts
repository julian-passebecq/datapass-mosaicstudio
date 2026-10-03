import {strict, identifier, text} from '../guards.ts';
import {boundedJson, freezeValue, integerRange} from '../foundation/safety.ts';
import {validateSources, validateEvidence, type SourceArtifact, type EvidenceRef} from '../evidence/model.ts';
import {validateScene, type Vec3} from '../scene.ts';
import type {Field, Block, Manifest, Values} from '../types.ts';

export const MODEL_LIMITS = Object.freeze({bytes: 16 * 1024 * 1024, jsonBytes: 1024 * 1024, nodes: 128, meshes: 128, primitives: 256, vertices: 250000, triangles: 250000, materials: 64, parts: 64});
export const MODEL_MODES = ['assembled', 'exploded', 'wireframe', 'isolate', 'section'] as const;
export type ModelMode = typeof MODEL_MODES[number];
export type ModelAsset = {path: string; byteLength: number; sha256: string};
export type PartBinding = {id: string; node: number; label: string; description: string; explode: Vec3; evidence: EvidenceRef[]};
export type ModelAnnotation = {part: string; label: string; position: Vec3};
export type ModelSpec = {
  format: 'datapass.model3d'; version: 1; title: string; note: string;
  provenance: 'synthetic' | 'provided'; credit: string;
  asset: ModelAsset; parts: PartBinding[]; annotations: ModelAnnotation[];
  cameras: {id: string; label: string; position: Vec3; target: Vec3}[];
  sources: SourceArtifact[];
};
export type ModelBlock = Extract<Block, {type: 'model3d'}>;
export const MODEL_FIELDS = ['selection','camera','mode','explode','section','view','annotations','source'] as const;
export type ModelState = {selection: string; camera: string; mode: ModelMode; explode: number; section: number; view: 'outline' | 'model' | 'source'; annotations: boolean; source: string};
export function validateModelAsset(input: unknown): ModelAsset {
  strict(input, ['path','byteLength','sha256'], 'model asset');
  // Strict portable relative files: no URL, query, percent-encoding, traversal or credentials.
  if (typeof input.path !== 'string' || input.path.length > 240 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.glb$/.test(input.path) || input.path.split('/').some(p => p === '..' || p === '.')) throw new Error('Model asset must be a safe relative .glb path');
  integerRange(input.byteLength, 28, MODEL_LIMITS.bytes, 'model byte length');
  if (typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('Model asset needs a SHA-256 content identity');
  return structuredClone(input) as ModelAsset;
}
export function modelVector(value: unknown, label: string, bound = 1000): asserts value is Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > bound)) throw new Error('Invalid model ' + label);
}
export function validateModel(input: unknown): ModelSpec {
  boundedJson(input, 384000);
  strict(input, ['format','version','title','note','provenance','credit','asset','parts','annotations','cameras','sources'], 'model');
  if (input.format !== 'datapass.model3d' || input.version !== 1) throw new Error('Unsupported model document');
  text(input.title,'model.title',160); text(input.note,'model.note',2000); text(input.credit,'model.credit',1000);
  if (input.provenance !== 'synthetic' && input.provenance !== 'provided') throw new Error('Unknown model provenance');
  validateModelAsset(input.asset); const sources = validateSources(input.sources);
  if (!Array.isArray(input.parts) || !input.parts.length || input.parts.length > MODEL_LIMITS.parts) throw new Error('Model part budget');
  const ids = new Set<string>(), nodes = new Set<number>();
  for (const part of input.parts) {
    strict(part,['id','node','label','description','explode','evidence'],'model part'); identifier(part.id,'part.id');
    if (part.id === 'none' || ids.has(part.id)) throw new Error('Duplicate or reserved model part'); ids.add(part.id);
    integerRange(part.node,0,MODEL_LIMITS.nodes - 1,'part node'); if (nodes.has(part.node)) throw new Error('One GLB node cannot represent two semantic parts'); nodes.add(part.node);
    text(part.label,'part.label',120);text(part.description,'part.description',2000); modelVector(part.explode,'explode',100);
    validateEvidence(part.evidence,sources);
  }
  if (!Array.isArray(input.annotations) || input.annotations.length > MODEL_LIMITS.parts) throw new Error('Model annotation budget');
  const annotated = new Set<string>();
  for (const anchor of input.annotations) {
    strict(anchor,['part','label','position'],'model annotation');
    if (typeof anchor.part !== 'string' || !ids.has(anchor.part) || annotated.has(anchor.part)) throw new Error('Annotation needs one distinct existing part');
    annotated.add(anchor.part); text(anchor.label,'annotation.label',80);modelVector(anchor.position,'annotation');
  }
  // Share existing camera validation rather than introducing a competing camera contract.
  validateScene({format:'datapass.scene3d',version:1,title:input.title,note:input.note,cameras:input.cameras,
    ...{entities:[{id:'validation',label:'Validation',description:'Camera contract'}],parts:[{id:'validation',entity:'validation',parent:null,shape:'group',size:[1,1,1],position:[0,0,0],rotation:[0,0,0],explode:[0,0,0],color:'#ffffff'}]}});
  return freezeValue({...structuredClone(input),sources} as ModelSpec;
}
export function modelFields(spec: ModelSpec, prefix='model'): Field[] {
  identifier(prefix,'model prefix');
  const choice=(key:string,label:string,options:{value:string;label:string}[],initial=options[0].value):Field=>({id:prefix+'-'+key,label,type:'select',role:'view',default:initial,options});
  return [
    choice('selection','Selected part',[{value:'none',label:'Complete assembly'},...spec.parts.map(p=>({value:p.id,label:p.label}))]),
    choice('camera','Camera',spec.cameras.map(c=>({value:c.id,label:c.label}))),
    choice('mode','Scene mode',MODEL_MODES.map(value=>({value,label:value}))),
    {id:prefix+'-explode',label:'Exploded amount',type:'number',role:'view',min:0,max:1,step:.01,default:1},
    {id:prefix+'-section',label:'Cutaway plane',type:'number',role:'view',min:0,max:1,step:.01,default:.5},
    choice('view','Model view',[{value:'outline',label:'Parts'},{value:'model',label:'3D model'},{value:'source',label:'Sources'}]),
    {id:prefix+'-annotations',label:'Part labels',type:'toggle',role:'view',default:true},
    choice('source','Source',[{value:'none',label:'Choose source'},...spec.sources.map(s=>({value:s.id,label:s.path}))]),
  ];
}
export function modelBlock(id:string,resource:string,prefix='model'):ModelBlock {
  return {id,type:'model3d',resource,...Object.fromEntries(MODEL_FIELDS.map(f=>[f,prefix+'-'+f]))} as ModelBlock;
}
export function readModelState(block:ModelBlock,values:Values):ModelState {
  return Object.fromEntries(MODEL_FIELDS.map(k=>[k,values[block[k]]])) as ModelState;
}
export function validateModelBinding(spec:ModelSpec,block:ModelBlock,manifest:Manifest):void {
  if(new Set(MODEL_FIELDS.map(k=>block[k])).size!==MODEL_FIELDS.length)throw new Error('Model controls must be distinct');
  const expected=modelFields(spec);
  MODEL_FIELDS.forEach((key,index)=>{
    const actual=manifest.fields.find(f=>f.id===block[key]),want=expected[index];
    if(!actual||actual.role!=='view'||actual.type!==want.type)throw new Error('Model controls require declared view fields');
    if(want.type==='number'&&(actual.min!==want.min||actual.max!==want.max||actual.step!==want.step))throw new Error('Model numeric control bounds mismatch');
    if(want.type==='select'&&(actual.options!.length!==want.options!.length||actual.options!.some(o=>!want.options!.some(v=>v.value===o.value))))throw new Error('Model choices mismatch');
  });
}

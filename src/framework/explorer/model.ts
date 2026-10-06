import {strict, text, identifier} from '../guards.ts';
import {validateScene, scenePartLimit, type SceneSpec} from '../scene.ts';
import type {AppDefinition, Block, Field, Manifest, Values} from '../types.ts';

export type ExplorerMode = 'spatial' | 'map' | 'library';
export type ExplorerLevel = 'overview' | 'focus' | 'evidence';
export type ExplorerItem = {
  id: string; label: string; kind: string; parent: string | null; group: string;
  summary: string; description: string; tags: string[]; position: [number, number];
  facts: {label: string; value: string}[];
  scene?: {entity: string; camera: string; facetCameras?: Record<string, string>};
  open?: {page: string; label: string};
};
export type ExplorerDocument = {
  id: string; item: string; facet: string; title: string; summary: string;
  sections: {title: string; text: string; code?: string; language?: string}[];
  provenance: 'synthetic' | 'authored' | 'user-provided'; source: string;
};
export type ExplorerSpec = {
  format: 'datapass.explorer'; version: 1; title: string; description: string;
  provenance: 'synthetic' | 'authored' | 'user-provided';
  groups: {id: string; label: string}[]; facets: {id: string; label: string}[];
  items: ExplorerItem[]; documents: ExplorerDocument[]; journey: string[];
  scene?: string; overviewCamera?: string;
};
export type ExplorerState = {
  focus: string; facet: string; view: ExplorerMode; level: ExplorerLevel; group: string; document: string;
};
export type ExplorerBlock = Extract<Block, {type: 'explorer'}>;
export const EXPLORER_KEYS = ['focus','facet','view','level','group','document'] as const;
export const EXPLORER_LIMITS = Object.freeze({bytes: 512 * 1024, items: 64, documents: 80, depth: 8, stops: 20});
const reserved = new Set(['overview','all','none']);
function id(v: unknown, label: string): asserts v is string {
  identifier(v, label); if (reserved.has(v)) throw new Error(label + ': reserved id');
}
function array(v: unknown, max: number, label: string, min = 0): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(label + ': size limit');
}
function choices(v: unknown, label: string): Set<string> {
  array(v, 12, label, 1); const seen = new Set<string>();
  for (const entry of v) {
    strict(entry, ['id','label'], label); id(entry.id, label); text(entry.label, label, 80);
    if (seen.has(entry.id)) throw new Error(label + ': duplicate id'); seen.add(entry.id);
  }
  return seen;
}
/** Canonical content/identity stays independent of any DOM, canvas or React Flow serialization. */
export function validateExplorer(input: unknown): ExplorerSpec {
  strict(input, ['format','version','title','description','provenance','groups','facets','items','documents','journey','scene','overviewCamera'], 'explorer');
  if (input.format !== 'datapass.explorer' || input.version !== 1) throw new Error('Unsupported explorer');
  text(input.title, 'explorer.title', 160); text(input.description, 'explorer.description', 2000, false);
  if (typeof input.provenance!=='string'||!['synthetic','authored','user-provided'].includes(input.provenance)) throw new Error('Invalid explorer provenance');
  const groups = choices(input.groups, 'groups'), facets = choices(input.facets, 'facets');
  array(input.items, EXPLORER_LIMITS.items, 'items', 1); array(input.documents, EXPLORER_LIMITS.documents, 'documents');
  const items = new Map<string, ExplorerItem>(), documents = new Set<string>();
  for (const item of input.items) {
    strict(item, ['id','label','kind','parent','group','summary','description','tags','position','facts','scene','open'], 'item');
    id(item.id, 'item.id'); if (items.has(item.id)) throw new Error('Duplicate explorer item');
    text(item.label, 'item.label', 120); text(item.kind, 'item.kind', 40); text(item.summary, 'item.summary', 300);
    text(item.description, 'item.description', 3000); identifier(item.group,'item group'); if (!groups.has(item.group)) throw new Error('Unknown item group');
    if (item.parent !== null) id(item.parent, 'item.parent');
    array(item.tags, 12, 'item.tags'); item.tags.forEach(t => text(t, 'tag', 60));
    if (new Set(item.tags).size !== item.tags.length) throw new Error('Duplicate item tag');
    if (!Array.isArray(item.position) || item.position.length !== 2 || item.position.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 5000)) throw new Error('Invalid explorer position');
    array(item.facts, 12, 'facts'); const factLabels=new Set<string>();
    for (const fact of item.facts) {strict(fact, ['label','value'], 'fact'); text(fact.label, 'fact.label', 100); text(fact.value, 'fact.value', 400);if(factLabels.has(fact.label))throw new Error('Duplicate fact label');factLabels.add(fact.label);}
    if (item.scene !== undefined) {
      strict(item.scene, ['entity','camera','facetCameras'], 'item.scene'); identifier(item.scene.entity, 'scene entity'); identifier(item.scene.camera, 'scene camera');
      if (item.scene.facetCameras !== undefined) {
        strict(item.scene.facetCameras, [...facets], 'facet cameras');
        for (const camera of Object.values(item.scene.facetCameras)) identifier(camera, 'facet camera');
      }
    }
    if (item.open !== undefined) {strict(item.open, ['page','label'], 'item.open'); identifier(item.open.page, 'open.page'); text(item.open.label, 'open.label', 100);}
    items.set(item.id, item as ExplorerItem);
  }
  for (const item of items.values()) {
    let parent = item.parent; const visited = new Set([item.id]);
    while (parent !== null) {
      if (visited.has(parent) || !items.has(parent) || visited.size >= EXPLORER_LIMITS.depth) throw new Error('Invalid explorer hierarchy');
      if (items.get(parent)!.group !== item.group) throw new Error('An explorer branch must keep its group');
      visited.add(parent); parent = items.get(parent)!.parent;
    }
  }
  for (const doc of input.documents) {
    strict(doc, ['id','item','facet','title','summary','sections','provenance','source'], 'document');
    id(doc.id, 'document.id'); if (documents.has(doc.id)) throw new Error('Duplicate explorer document'); documents.add(doc.id);
    identifier(doc.item,'document item');identifier(doc.facet,'document facet');if (!items.has(doc.item) || !facets.has(doc.facet)) throw new Error('Unknown document item/facet');
    text(doc.title, 'document.title', 160); text(doc.summary, 'document.summary', 500); text(doc.source, 'document.source', 300);
    if (typeof doc.provenance!=='string'||!['synthetic','authored','user-provided'].includes(doc.provenance)) throw new Error('Invalid document provenance');
    array(doc.sections, 16, 'document.sections', 1);
    for (const section of doc.sections) {
      strict(section, ['title','text','code','language'], 'document section'); text(section.title, 'section title', 160);
      text(section.text, 'section text', 6000, false);
      if (section.code !== undefined) text(section.code, 'section code', 12000, false);
      if (section.language !== undefined) text(section.language, 'section language', 40);
    }
  }
  array(input.journey, EXPLORER_LIMITS.stops, 'journey');
  if (input.journey.some(x => typeof x!=='string'||!items.has(x)) || new Set(input.journey).size !== input.journey.length) throw new Error('Invalid journey stops');
  if (input.scene !== undefined) {identifier(input.scene, 'explorer.scene'); identifier(input.overviewCamera, 'overview camera');}
  else if (input.overviewCamera !== undefined || [...items.values()].some(i => i.scene)) throw new Error('Scene mapping without a scene resource');
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > EXPLORER_LIMITS.bytes) throw new Error('Explorer exceeds 512 KiB');
  return structuredClone(input) as ExplorerSpec;
}
export function validateExplorerState(spec: ExplorerSpec, s: ExplorerState): void {
  strict(s, EXPLORER_KEYS, 'explorer state');
  const item = spec.items.find(i => i.id === s.focus);
  if (s.focus !== 'overview' && !item) throw new Error('Unknown explorer focus');
  if (!spec.facets.some(f => f.id === s.facet) || !['map','library',...(spec.scene ? ['spatial'] : [])].includes(s.view)) throw new Error('Unknown explorer facet/view');
  if (!['overview','focus','evidence'].includes(s.level) || (s.focus === 'overview') !== (s.level === 'overview')) throw new Error('Explorer focus and level disagree');
  if (s.group !== 'all' && !spec.groups.some(g => g.id === s.group) || item && s.group !== 'all' && item.group !== s.group) throw new Error('Explorer group hides focus');
  if (s.document !== 'none') {
    const d = spec.documents.find(d => d.id === s.document);
    if (!d || d.item !== s.focus || d.facet !== s.facet || s.level !== 'evidence') throw new Error('Explorer document and context disagree');
  }
}
export function readExplorerState(block: ExplorerBlock, values: Values): ExplorerState {
  return Object.fromEntries(EXPLORER_KEYS.map(k => [k, values[block[k]]])) as ExplorerState;
}
export function explorerStatePatch(block: ExplorerBlock, state: ExplorerState): Record<string, string> {
  return Object.fromEntries(EXPLORER_KEYS.map(k => [block[k], state[k]]));
}
export function explorerFields(spec: ExplorerSpec, prefix = 'explore', view: ExplorerMode = spec.scene ? 'spatial' : 'map'): Field[] {
  identifier(prefix, 'explorer prefix');
  const options: Record<keyof ExplorerState, {value: string; label: string}[]> = {
    focus: [{value:'overview',label:'Overview'}, ...spec.items.map(i => ({value:i.id,label:i.label}))],
    facet: spec.facets.map(f => ({value:f.id,label:f.label})),
    view: [...(spec.scene ? [{value:'spatial',label:'3D map'}] : []),{value:'map',label:'2D map'},{value:'library',label:'Documents'}],
    level: [{value:'overview',label:'Overview'},{value:'focus',label:'Focus'},{value:'evidence',label:'Evidence'}],
    group: [{value:'all',label:'All domains'},...spec.groups.map(g => ({value:g.id,label:g.label}))],
    document: [{value:'none',label:'No document'},...spec.documents.map(d => ({value:d.id,label:d.title}))],
  };
  const defaults: ExplorerState = {focus:'overview',facet:spec.facets[0].id,view,level:'overview',group:'all',document:'none'};
  validateExplorerState(spec, defaults);
  return EXPLORER_KEYS.map(k => ({id:prefix+'-'+k,label:'Explorer '+k,type:'select',role:'view',default:defaults[k],options:options[k]}));
}
export function explorerBlock(id: string, resource: string, prefix = 'explore', scroll = false): ExplorerBlock {
  return {id,type:'explorer',resource,scroll,...Object.fromEntries(EXPLORER_KEYS.map(k => [k,prefix+'-'+k]))} as ExplorerBlock;
}
export function validateExplorerBinding(spec: ExplorerSpec, block: ExplorerBlock, manifest: Manifest, definition: AppDefinition): SceneSpec | null {
  const expected = explorerFields(spec);
  if (new Set(EXPLORER_KEYS.map(k => block[k])).size !== EXPLORER_KEYS.length) throw new Error('Explorer fields must be distinct');
  for (const [index,k] of EXPLORER_KEYS.entries()) {
    const field = manifest.fields.find(f => f.id === block[k]);
    const choices = expected[index].options!.map(o => o.value);
    if (!field || field.role !== 'view' || field.type !== 'select' || field.options!.length !== choices.length || field.options!.some(o => !choices.includes(o.value))) throw new Error('Explorer field options mismatch: '+k);
  }
  for (const item of spec.items) if (item.open && !manifest.pages.some(p => p.id === item.open!.page)) throw new Error('Unknown explorer destination page');
  let scene: SceneSpec | null = null;
  if (spec.scene) {
    scene = validateScene(definition.resources?.scenes?.[spec.scene], {maxParts: scenePartLimit(definition)});
    const cameras = new Set(scene.cameras.map(c => c.id)),entities=new Set<string>();
    if (!cameras.has(spec.overviewCamera!)) throw new Error('Unknown overview camera');
    for (const item of spec.items) {
      if (!item.scene || !scene.entities.some(e => e.id === item.scene!.entity) || !cameras.has(item.scene.camera) || Object.values(item.scene.facetCameras || {}).some(c => !cameras.has(c))) throw new Error('Explorer item scene mapping mismatch');
      if(entities.has(item.scene.entity))throw new Error('Explorer items need distinct scene entities');entities.add(item.scene.entity);
    }
  }
  const defaults = Object.fromEntries(manifest.fields.map(f => [f.id,f.default]));
  validateExplorerState(spec, readExplorerState(block, defaults));
  return scene;
}
export function validateExplorerValues(definition: AppDefinition, values: Values): void {
  for (const b of definition.manifest.pages.flatMap(p => p.sections.flatMap(s => s.blocks))) if (b.type === 'explorer') {
    // Resources have already passed structural validation when the app was defined.
    validateExplorerState(definition.resources!.explorers![b.resource] as ExplorerSpec, readExplorerState(b, values));
  }
}

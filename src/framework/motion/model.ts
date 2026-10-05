import {identifier, strict, text} from '../guards.ts';
import {validateSources, validateEvidence, type SourceArtifact, type EvidenceRef} from '../evidence/model.ts';
import type {AppDefinition, Block, Field, Manifest, Values} from '../types.ts';

export type Point3 = [number, number, number];
export type MotionProjection = 'diagram' | 'isometric';
export type MotionStatus = 'idle' | 'active' | 'complete' | 'warning' | 'muted';
export const MOTION_STATUSES: readonly MotionStatus[] = ['idle', 'active', 'complete', 'warning', 'muted'];
export type MotionEntity = {
  id: string; label: string; description: string; color: string; evidence: EvidenceRef[];
} & ({kind: 'station'; position: Point3; size: Point3} | {kind: 'token'; at: string; size: number});
export type MotionLink = {id: string; from: string; to: string; label: string; via: Point3[]};
/** Presentation timing in the containing step, never a second clock or a measurement. */
export type MotionEasing = 'linear' | 'cubic-in-out';
export type MotionTiming = {startMs: number; endMs: number; easing: MotionEasing};
export type MotionAnnotation = {id: string; entity: string; text: string; offset: [number, number]; evidence: EvidenceRef[]};
export type MotionCommand = (
  | {type: 'move'; entity: string; position: Point3}
  | {type: 'transfer'; entity: string; link: string}
  | {type: 'state'; entity: string; value: MotionStatus}
  | {type: 'visibility'; entity: string; visible: boolean}
  /** V2 only: the displayed label of an entity changes, its identity does not (e.g. a value replaced in place). */
  | {type: 'label'; entity: string; text: string}) & {timing?: MotionTiming};
export type MotionStep = {
  id: string; title: string; caption: string; focus: string; holdMs: number; transitionMs: number;
  commands: MotionCommand[]; activeLinks: string[]; evidence: EvidenceRef[]; annotations?: MotionAnnotation[];
};
export type MotionProvenance = 'synthetic' | 'authored' | 'recorded';
export const MOTION_PROVENANCE: readonly MotionProvenance[] = ['synthetic', 'authored', 'recorded'];
export type MotionSpec = {
  format: 'datapass.motion'; version: 1 | 2; title: string; description: string;
  /** `recorded` (v2 only): step order and values come from a recorded trace; geometry and timing stay presentation. */
  provenance: MotionProvenance; note: string;
  entities: MotionEntity[]; links: MotionLink[]; steps: MotionStep[]; sources: SourceArtifact[];
};
export const MOTION_LIMITS = Object.freeze({entities: 40, links: 64, steps: 64, commands: 80, annotations: 6, bytes: 512000});
export const MOTION_KEYS = ['step', 'selection', 'projection', 'panel', 'source'] as const;
export type MotionState = {step: number; selection: string; projection: MotionProjection; panel: 'scene' | 'source' | 'transcript'; source: string};
export type MotionBlock = Extract<Block, {type: 'motion'}>;

function array(v: unknown, label: string, max: number, min = 0): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error('Motion ' + label + ' budget');
}
function id(v: unknown, label: string): asserts v is string {
  identifier(v, label); if (v === 'none') throw new Error('Reserved motion id');
}
function point(v: unknown, label: string, min = -30, max = 30): asserts v is Point3 {
  if (!Array.isArray(v) || v.length !== 3 || v.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)) throw new Error('Invalid motion ' + label);
}
function integer(v: unknown, label: string, min: number, max: number): asserts v is number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw new Error('Invalid motion ' + label);
}
function uniqueId(value: unknown, set: Set<string>, label: string): asserts value is string {
  id(value, label); if (set.has(value)) throw new Error('Duplicate motion ' + label); set.add(value);
}

/** Only source-owned declarations enter. No HTML, event handlers, expressions or arbitrary URLs. */
export function validateMotion(input: unknown): MotionSpec {
  strict(input, ['format', 'version', 'title', 'description', 'provenance', 'note', 'entities', 'links', 'steps', 'sources'], 'motion');
  if (input.format !== 'datapass.motion' || input.version !== 1 && input.version !== 2) throw new Error('Unsupported motion document');
  text(input.title, 'motion.title', 160); text(input.description, 'motion.description', 2000);
  text(input.note, 'motion.note', 2000);
  if (input.provenance !== 'synthetic' && input.provenance !== 'authored' && !(input.provenance === 'recorded' && input.version === 2)) throw new Error('Motion is authored or recorded, not a live trace');
  const sources = validateSources(input.sources);
  array(input.entities, 'entities', MOTION_LIMITS.entities, 1);
  const entities = new Set<string>(), stations = new Set<string>(), tokens = new Set<string>();
  for (const e of input.entities) {
    if (!e || typeof e !== 'object') throw new Error('Invalid motion entity');
    const kind = (e as Record<string, unknown>).kind;
    strict(e, ['id', 'label', 'description', 'color', 'evidence', 'kind', ...(kind === 'station' ? ['position', 'size'] : ['at', 'size'])], 'motion entity');
    uniqueId(e.id, entities, 'entity id'); text(e.label, 'entity label', 80); text(e.description, 'entity description', 2000);
    if (typeof e.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(e.color)) throw new Error('Motion color must be a hex value');
    validateEvidence(e.evidence, sources);
    if (kind === 'station') {
      point(e.position, 'station position'); point(e.size, 'station size', .1, 8); stations.add(e.id);
    } else if (kind === 'token') {
      id(e.at, 'token anchor');
      if (typeof e.size !== 'number' || !Number.isFinite(e.size) || e.size < .1 || e.size > 1) throw new Error('Invalid token size');
      tokens.add(e.id);
    } else throw new Error('Unknown motion entity kind');
  }
  if (!stations.size) throw new Error('A motion scene requires a station');
  for (const e of input.entities as MotionEntity[]) if (e.kind === 'token' && !stations.has(e.at)) throw new Error('Unknown token anchor');
  array(input.links, 'links', MOTION_LIMITS.links); const links = new Set<string>();
  for (const link of input.links) {
    strict(link, ['id', 'from', 'to', 'label', 'via'], 'motion link'); uniqueId(link.id, links, 'link id');
    if (typeof link.from !== 'string' || typeof link.to !== 'string' || !stations.has(link.from) || !stations.has(link.to) || link.from === link.to) throw new Error('Motion links connect two distinct stations');
    text(link.label, 'link label', 100, false); array(link.via, 'route points', 8); link.via.forEach(p => point(p, 'route point'));
  }
  array(input.steps, 'steps', MOTION_LIMITS.steps, 1); const steps = new Set<string>();
  for (const step of input.steps) {
    strict(step, ['id', 'title', 'caption', 'focus', 'holdMs', 'transitionMs', 'commands', 'activeLinks', 'evidence', ...(input.version === 2 ? ['annotations'] : [])], 'motion step');
    uniqueId(step.id, steps, 'step id'); text(step.title, 'step title', 160); text(step.caption, 'step caption', 3000);
    if (typeof step.focus !== 'string' || step.focus !== 'none' && !entities.has(step.focus)) throw new Error('Unknown step focus');
    integer(step.holdMs, 'hold', 800, 15000); integer(step.transitionMs, 'transition', 0, 1800);
    if (step.holdMs < step.transitionMs + 200) throw new Error('A step must leave time after its visual transition');
    array(step.activeLinks, 'active links', MOTION_LIMITS.links);
    if (step.activeLinks.some(l => typeof l !== 'string' || !links.has(l)) || new Set(step.activeLinks).size !== step.activeLinks.length) throw new Error('Invalid active motion links');
    validateEvidence(step.evidence, sources);
    if (step.annotations !== undefined) {
      array(step.annotations, 'annotations', MOTION_LIMITS.annotations);
      const annotationIds = new Set<string>();
      for (const annotation of step.annotations) {
        strict(annotation, ['id', 'entity', 'text', 'offset', 'evidence'], 'motion annotation');
        uniqueId(annotation.id, annotationIds, 'annotation id');
        if (typeof annotation.entity !== 'string' || !entities.has(annotation.entity)) throw new Error('Unknown annotation entity');
        text(annotation.text, 'annotation text', 160);
        if (!Array.isArray(annotation.offset) || annotation.offset.length !== 2 || annotation.offset.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 280)) throw new Error('Invalid annotation offset');
        validateEvidence(annotation.evidence, sources);
      }
    }
    array(step.commands, 'commands', MOTION_LIMITS.commands); const writes = new Set<string>();
    for (const c of step.commands) {
      if (!c || typeof c !== 'object') throw new Error('Invalid motion command');
      const type = (c as Record<string, unknown>).type;
      const keys = type === 'move' ? ['position'] : type === 'transfer' ? ['link'] : type === 'state' ? ['value'] : type === 'visibility' ? ['visible'] : type === 'label' && input.version === 2 ? ['text'] : [];
      strict(c, ['type', 'entity', ...keys, ...(input.version === 2 ? ['timing'] : [])], 'motion command');
      if (c.timing !== undefined) {
        strict(c.timing, ['startMs', 'endMs', 'easing'], 'motion timing');
        integer(c.timing.startMs, 'timing start', 0, step.transitionMs);
        integer(c.timing.endMs, 'timing end', 0, step.transitionMs);
        if (c.timing.endMs < c.timing.startMs) throw new Error('Motion timing end precedes start');
        if (c.timing.easing !== 'linear' && c.timing.easing !== 'cubic-in-out') throw new Error('Unknown motion easing');
      }
      if (typeof c.entity !== 'string' || !entities.has(c.entity)) throw new Error('Unknown command entity');
      const write = c.entity + ':' + (type === 'move' || type === 'transfer' ? 'position' : String(type));
      if (writes.has(write)) throw new Error('Multiple writes to a motion property in one step'); writes.add(write);
      switch (type) {
        case 'move': point(c.position, 'move target'); break;
        case 'transfer': if (!tokens.has(c.entity) || typeof c.link !== 'string' || !links.has(c.link)) throw new Error('Transfer needs a token and an existing link'); break;
        case 'state': if (typeof c.value !== 'string' || !MOTION_STATUSES.includes(c.value as MotionStatus)) throw new Error('Unknown authored motion status'); break;
        case 'visibility': if (typeof c.visible !== 'boolean') throw new Error('Visibility must be boolean'); break;
        case 'label': if (input.version !== 2) throw new Error('Unsupported motion command'); text(c.text, 'label text', 80); break;
        default: throw new Error('Unsupported motion command');
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MOTION_LIMITS.bytes) throw new Error('Motion document exceeds byte budget');
  return {...structuredClone(input), sources} as MotionSpec;
}

export function motionFields(spec: MotionSpec, prefix = 'motion'): Field[] {
  identifier(prefix, 'motion field prefix');
  return [
    {id: prefix + '-step', label: 'Motion step', type: 'number', role: 'view', min: 0, max: spec.steps.length - 1, step: 1, default: 0},
    {id: prefix + '-selection', label: 'Selected object', type: 'select', role: 'view', default: spec.steps[0].focus, options: [{value: 'none', label: 'Overview'}, ...spec.entities.map(e => ({value: e.id, label: e.label}))]},
    {id: prefix + '-projection', label: 'Projection', type: 'select', role: 'view', default: 'diagram', options: [{value: 'diagram', label: '2D diagram'}, {value: 'isometric', label: 'Isometric'}]},
    {id: prefix + '-panel', label: 'Workspace tab', type: 'select', role: 'view', default: 'scene', options: [{value: 'scene', label: 'Scene'}, {value: 'source', label: 'Sources'}, {value: 'transcript', label: 'Steps'}]},
    {id: prefix + '-source', label: 'Source excerpt', type: 'select', role: 'view', default: 'none', options: [{value: 'none', label: 'Choose a source'}, ...spec.sources.map(s => ({value: s.id, label: s.path}))]},
  ];
}
export function motionBlock(id: string, resource: string, prefix = 'motion'): MotionBlock {
  return {id, type: 'motion', resource, ...Object.fromEntries(MOTION_KEYS.map(k => [k, prefix + '-' + k]))} as MotionBlock;
}
export function readMotionState(block: MotionBlock, values: Values): MotionState {
  return Object.fromEntries(MOTION_KEYS.map(k => [k, values[block[k]]])) as MotionState;
}
export function validateMotionBinding(spec: MotionSpec, block: MotionBlock, manifest: Manifest): void {
  const expected = motionFields(spec);
  if (new Set(MOTION_KEYS.map(k => block[k])).size !== MOTION_KEYS.length) throw new Error('Motion fields must be distinct');
  MOTION_KEYS.forEach((key, index) => {
    const actual = manifest.fields.find(f => f.id === block[key]), target = expected[index];
    if (!actual || actual.role !== 'view' || actual.type !== target.type) throw new Error('Motion needs declared view fields');
    if (key === 'step') {
      if (actual.min !== 0 || actual.max !== spec.steps.length - 1 || actual.step !== 1) throw new Error('Motion step bounds mismatch');
    } else if (actual.options!.length !== target.options!.length || actual.options!.some(o => !target.options!.some(t => t.value === o.value))) throw new Error('Motion choices mismatch: ' + key);
  });
}

/** A resource may appear twice, but not acquire competing indices or writers. */
export function validateMotionControllers(definition: AppDefinition): void {
  const clocks = new Map<string, string>(), controls = new Map<string, string>();
  const own = (field: string, owner: string) => {
    if (clocks.has(field) && clocks.get(field) !== owner) throw new Error('Conflicting motion clock: ' + field);
    clocks.set(field, owner);
  };
  for (const [id, story] of Object.entries(definition.resources?.stories || {})) own(story.indexField, 'story:' + id);
  for (const b of definition.manifest.pages.flatMap(p => p.sections.flatMap(s => s.blocks))) {
    if (b.type === 'replay') own(b.frame, 'replay:' + b.resource);
    if (b.type === 'explanation') {
      const resource = definition.resources?.explanations?.[b.resource] as {frameField?: string} | undefined;
      if (resource?.frameField) own(resource.frameField, 'explanation:' + b.resource);
    }
    if (b.type !== 'motion') continue;
    own(b.step, 'motion:' + b.resource);
    const tuple = MOTION_KEYS.map(k => b[k]).join('|');
    if (controls.has(b.resource) && controls.get(b.resource) !== tuple) throw new Error('Motion resource needs one coherent control set');
    controls.set(b.resource, tuple);
  }
  // Story cues must not silently compete with an independently controlled motion step.
  for (const story of Object.values(definition.resources?.stories || {})) for (const cue of Object.values(story.cues)) {
    for (const field of Object.keys(cue)) if (clocks.get(field)?.startsWith('motion:')) throw new Error('A narrative cannot drive an independently controlled motion step');
  }
}

/** Source identity, not display label, determines duplicate references. */
export function motionStepEvidence(step: MotionStep): EvidenceRef[] {
  return [...new Map([...step.evidence, ...(step.annotations || []).flatMap(a => a.evidence)].map(ref => [ref.artifact + ':' + ref.start + ':' + ref.end, ref])).values()];
}

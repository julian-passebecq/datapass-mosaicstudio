import {demoArchitecture} from '../../src/architecture/demo.ts';
import type {MotionSpec, MotionEntity, MotionStep} from '../../src/framework/motion/model.ts';
import type {SourceArtifact, EvidenceRef} from '../../src/framework/evidence/model.ts';

/**
 * Guided walkthrough of the synthetic "Renewable operations" architecture document.
 * Every station is a node of `demoArchitecture` with the SAME id, so one view field can hold the selection
 * for both the motion walkthrough and the architecture review canvas. Labels, descriptions, edges and the
 * SQL excerpts are read from that document; nothing here is a measured run, a live system or a real client.
 */
const doc = demoArchitecture;
const node = (id: string) => {const n = doc.nodes.find(n => n.id === id); if (!n) throw new Error('Unknown architecture node ' + id); return n;};
const lines = (text: string) => text.replace(/\n$/, '').split('\n').length;

/** Inert source excerpts: the literal `code` of the two model nodes and the document's own review notes. */
const sql = (id: string): SourceArtifact => ({id: id.replace(/_/g, '-') + '-sql', path: node(id).sourcePath, language: 'sql', title: node(id).label + ' model (excerpt)', text: node(id).code + '\n', provenance: 'synthetic'});
export const walkthroughSources: SourceArtifact[] = [
  sql('clean_events'),
  sql('site_performance'),
  {id: 'review-notes', path: 'architecture/review-notes.txt', language: 'text', title: 'Review notes of the architecture document', text: doc.notes.join('\n') + '\n', provenance: 'synthetic'},
];
const ref = (artifact: string, start: number, end: number, label: string): EvidenceRef => ({artifact, start, end, label});
const cleanSql = walkthroughSources[0], perfSql = walkthroughSources[1];

/** Layer columns left to right, two rows: the same reading order as the review canvas. */
const place: Record<string, [number, number]> = {
  telemetry: [0, 0], costs: [0, 3], ingest: [4, 0], quality: [4, 3],
  clean_events: [8, 0], site_performance: [8, 3], performance_report: [12, 0], client_app: [12, 3],
};
const colors: Record<string, string> = {source: '#7fa7c4', service: '#8fb6a8', transform: '#9fbf8f', store: '#b9b0d3', report: '#d4bd8f'};
const evidence: Record<string, EvidenceRef[]> = {
  clean_events: [ref(cleanSql.id, 1, lines(cleanSql.text), 'Clean events model excerpt')],
  site_performance: [ref(perfSql.id, 1, lines(perfSql.text), 'Site performance model excerpt')],
  quality: [ref('review-notes', 3, 3, 'Connectivity is declared, not measured')],
};
const stations: MotionEntity[] = doc.nodes.map(n => ({
  id: n.id, kind: 'station', label: n.label, description: `${n.description} Owner: ${n.owner}. Layer: ${n.layer}.`,
  position: [place[n.id][0], place[n.id][1], 0], size: [2.4, 1.2, .4], color: colors[n.kind] || '#9fbccc', evidence: evidence[n.id] || [],
}));
export const WALKTHROUGH_TOKEN = 'daily-batch';
const entities: MotionEntity[] = [...stations, {id: WALKTHROUGH_TOKEN, kind: 'token', label: 'Daily batch', description: 'One illustrative daily batch followed through the declared dependencies. Not a scheduled or observed run.', at: 'telemetry', size: .42, color: '#2f6f86', evidence: []}];
const links = doc.edges.map(e => ({id: e.id, from: e.from, to: e.to, label: e.label, via: [] as [number, number, number][], ...(e.kind !== 'data' ? {style: 'dashed' as const} : {})}));
const edge = (from: string, to: string) => {const e = doc.edges.find(e => e.from === from && e.to === to); if (!e) throw new Error(`No declared edge ${from} -> ${to}`); return e.id;};

const step = (s: Omit<MotionStep, 'holdMs' | 'transitionMs' | 'annotations'> & {transitionMs?: number; annotations?: MotionStep['annotations']}): MotionStep =>
  ({holdMs: 2600, transitionMs: 900, annotations: [], ...s});
const steps: MotionStep[] = [
  step({id: 'overview', title: 'The system at a glance', caption: doc.description + ' Select any component here or in the review canvas below: both views follow the same selection.', focus: 'none', transitionMs: 0, commands: [], activeLinks: [], evidence: [ref('review-notes', 1, 1, 'Synthetic example')]}),
  step({id: 'sources', title: 'Two sources own their contracts', caption: node('telemetry').description + ' ' + node('costs').description, focus: 'telemetry', commands: [{type: 'state', entity: 'telemetry', value: 'active'}, {type: 'state', entity: 'costs', value: 'active'}], activeLinks: [], evidence: []}),
  step({id: 'ingest', title: 'Daily ingestion lands both sources', caption: node('ingest').description, focus: 'ingest', commands: [{type: 'transfer', entity: WALKTHROUGH_TOKEN, link: edge('telemetry', 'ingest')}, {type: 'state', entity: 'ingest', value: 'active'}, {type: 'state', entity: 'telemetry', value: 'complete'}, {type: 'state', entity: 'costs', value: 'complete'}], activeLinks: [edge('telemetry', 'ingest'), edge('costs', 'ingest')], evidence: []}),
  step({id: 'quality', title: 'Contract checks run after ingestion', caption: node('quality').description, focus: 'quality', commands: [{type: 'transfer', entity: WALKTHROUGH_TOKEN, link: edge('ingest', 'quality')}, {type: 'state', entity: 'ingest', value: 'complete'}, {type: 'state', entity: 'quality', value: 'active'}], activeLinks: [edge('ingest', 'quality')], evidence: [ref('review-notes', 3, 3, 'A declared dependency, not a test result')],
    annotations: [{id: 'no-result', entity: 'quality', text: 'No quality-test result is asserted.', offset: [0, 96], evidence: []}]}),
  step({id: 'clean', title: 'Clean events keep one row per event', caption: node('clean_events').description, focus: 'clean_events', commands: [{type: 'transfer', entity: WALKTHROUGH_TOKEN, link: edge('quality', 'clean_events')}, {type: 'state', entity: 'quality', value: 'complete'}, {type: 'state', entity: 'clean_events', value: 'active'}], activeLinks: [edge('quality', 'clean_events')], evidence: [ref(cleanSql.id, 1, lines(cleanSql.text), 'Read the clean events excerpt')]}),
  step({id: 'aggregate', title: 'Site performance aggregates per site', caption: node('site_performance').description, focus: 'site_performance', commands: [{type: 'transfer', entity: WALKTHROUGH_TOKEN, link: edge('clean_events', 'site_performance')}, {type: 'state', entity: 'clean_events', value: 'complete'}, {type: 'state', entity: 'site_performance', value: 'active'}], activeLinks: [edge('clean_events', 'site_performance')], evidence: [ref(perfSql.id, 1, lines(perfSql.text), 'Read the aggregation excerpt')],
    annotations: [{id: 'excerpt', entity: 'site_performance', text: 'Illustrative excerpt: the finance join is not implemented.', offset: [0, 96], evidence: [ref(perfSql.id, lines(perfSql.text), lines(perfSql.text), 'Excerpt boundary')]}]}),
  step({id: 'serve', title: 'Two consumers read the same contract', caption: node('performance_report').description + ' ' + node('client_app').description, focus: 'performance_report', commands: [{type: 'transfer', entity: WALKTHROUGH_TOKEN, link: edge('site_performance', 'performance_report')}, {type: 'state', entity: 'performance_report', value: 'active'}, {type: 'state', entity: 'client_app', value: 'active'}], activeLinks: [edge('site_performance', 'performance_report'), edge('site_performance', 'client_app')], evidence: []}),
  step({id: 'review', title: 'Review the schema difference before approval', caption: 'The declared design says cost_eur; the catalog snapshot says operating_cost_eur. The review reports two differences and does not infer a rename. Open the Schema drift tab of the review canvas for the column comparison.', focus: 'site_performance', commands: [{type: 'visibility', entity: WALKTHROUGH_TOKEN, visible: false}, {type: 'state', entity: 'site_performance', value: 'warning'}, {type: 'state', entity: 'performance_report', value: 'complete'}, {type: 'state', entity: 'client_app', value: 'complete'}], activeLinks: [], evidence: [ref('review-notes', 2, 2, 'Two differences, no inferred rename')]}),
];

export const walkthrough: MotionSpec = {
  format: 'datapass.motion', version: 2, title: 'Guided architecture walkthrough',
  description: 'Follow one illustrative daily batch through the declared dependencies of the synthetic Renewable operations architecture.',
  provenance: 'synthetic', note: 'Authored walkthrough over a synthetic architecture document. States and timings are narrative, not observed health, schedules or execution. Source excerpts are inert text.',
  entities, links, steps, sources: walkthroughSources,
};

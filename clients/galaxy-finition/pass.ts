/** Galaxy Finition pass snapshot: screened public fields only (see README). Pure helpers, no clock, no I/O. */
import {validateArchitecture, type Architecture} from '../../src/architecture/model.ts';
import raw from './data/pass.json' with {type: 'json'};

export type PassApp = {key: string; name: string; repository: string; wave: number; version: string; status: string; destination: string};
export type PausedApp = {key: string; name: string; status: 'PAUSED_BY_OWNER'};
export type PassEdge = {from: string; to: string};
export type PassSnapshot = {format: 'galaxy-finition.pass-snapshot'; version: 1; pass: string; snapshotTime: string; provenance: string; apps: PassApp[]; paused: PausedApp[]; edges: PassEdge[]};

const KEY = /^[0-9]{2}-[a-z0-9-]+$/;
const FORBIDDEN = [/[A-Za-z]:[\\/]/, /https?:\/\//i, /\blocal_[0-9a-f]/i, /\b[0-9a-f]{12,}\b/i, /@/];

/** Fail closed: unknown fields, bad keys, dangling edges or private-looking strings reject the snapshot. */
export function parsePassSnapshot(input: unknown): PassSnapshot {
  const doc = input as PassSnapshot;
  if (!doc || doc.format !== 'galaxy-finition.pass-snapshot' || doc.version !== 1) throw new Error('Unsupported pass snapshot');
  const text = JSON.stringify(doc);
  for (const pattern of FORBIDDEN) if (pattern.test(text)) throw new Error('Pass snapshot contains a non-public value: ' + pattern);
  const keys = new Set<string>();
  const exact = (o: object, fields: string[]) => { if (Object.keys(o).some(k => !fields.includes(k)) || fields.some(k => !(k in o))) throw new Error('Unexpected snapshot fields'); };
  for (const a of doc.apps) {
    exact(a, ['key', 'name', 'repository', 'wave', 'version', 'status', 'destination']);
    if (!KEY.test(a.key) || keys.has(a.key) || ![1, 2, 3].includes(a.wave)) throw new Error('Invalid app ' + a.key);
    keys.add(a.key);
  }
  for (const p of doc.paused) {
    exact(p, ['key', 'name', 'status']);
    if (!KEY.test(p.key) || keys.has(p.key) || p.status !== 'PAUSED_BY_OWNER') throw new Error('Invalid paused app ' + p.key);
    keys.add(p.key);
  }
  for (const e of doc.edges) { exact(e, ['from', 'to']); if (!keys.has(e.from) || !keys.has(e.to)) throw new Error('Dangling edge ' + e.from + ' -> ' + e.to); }
  return doc;
}

export const snapshot = parsePassSnapshot(raw);

/** Architecture ids must start with a letter; the visible label keeps the app key. */
export const nodeId = (key: string) => 'app-' + key;
const LAYERS = ['Wave 1', 'Wave 2', 'Wave 3', 'Paused by owner'];

export function passArchitecture(doc: PassSnapshot): Architecture {
  return validateArchitecture({
    format: 'datapass.architecture', version: 1, title: 'Galaxy Finition apps',
    description: 'Apps of the Galaxy Finition pass (13 Oct 2026) and the dependency_keys declared in its dispatch packet. Owner-supplied status snapshot, not a live system view.',
    origin: 'user-file', layers: LAYERS,
    snapshot: {label: 'Owner-supplied pass snapshot', generatedAt: doc.snapshotTime},
    nodes: [
      ...doc.apps.map(a => ({id: nodeId(a.key), label: `${a.key} · ${a.name}`, kind: 'service', layer: LAYERS[a.wave - 1], description: `Repository ${a.repository}. Version ${a.version}. Destination: ${a.destination}.`, owner: a.status, sourcePath: '', code: '', logical: null, physical: null})),
      ...doc.paused.map(p => ({id: nodeId(p.key), label: `${p.key} · ${p.name}`, kind: 'source', layer: LAYERS[3], description: 'Paused by owner during this pass.', owner: 'PAUSED_BY_OWNER', sourcePath: '', code: '', logical: null, physical: null}))
    ],
    edges: doc.edges.map((e, i) => ({id: `dep-${i + 1}`, from: nodeId(e.from), to: nodeId(e.to), kind: 'control', label: ''})),
    notes: ['Edges are the dependency_keys declared in the dispatch packet (app -> listed app), not measured runtime calls or data lineage.', 'Mutual declarations (for example MosaicStudio and DataPass React) appear as cycles; they are reported, not resolved.', 'Statuses, versions and destination categories are an owner-supplied snapshot of the pass log at ' + doc.snapshotTime + '. Not live data.']
  });
}

export const architecture = passArchitecture(snapshot);

export function passSummary(doc: PassSnapshot) {
  const published = doc.apps.filter(a => /^(PUBLISHED|RATIFIED)/.test(a.status)).length;
  return [
    {id: 'retained', value: doc.apps.length},
    {id: 'paused', value: doc.paused.length},
    {id: 'published', value: published},
    {id: 'edges', value: doc.edges.length}
  ];
}

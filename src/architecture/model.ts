/** Inert, bounded architecture artifacts. A declaration is not an execution receipt. */
export type Column = {name: string; type: string; nullable: boolean | null};
export type ArchitectureNode = {
  id: string; label: string; kind: 'source' | 'transform' | 'store' | 'report' | 'service';
  layer: string; description: string; owner: string; sourcePath: string; code: string;
  logical: Column[] | null; physical: Column[] | null;
};
export type ArchitectureEdge = {id: string; from: string; to: string; kind: 'data' | 'control' | 'contains'; label: string};
export type Architecture = {
  format: 'datapass.architecture'; version: 1; title: string; description: string;
  origin: 'synthetic' | 'user-file'; layers: string[]; nodes: ArchitectureNode[]; edges: ArchitectureEdge[];
  snapshot: {label: string; generatedAt: string} | null; notes: string[];
};
export const ARCHITECTURE_LIMITS = Object.freeze({bytes: 2 * 1024 * 1024, nodes: 180, edges: 400, columns: 100});
export function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
function strict(v: unknown, keys: string[], label: string): asserts v is Record<string, unknown> {
  if (!record(v) || Object.keys(v).some(k => !keys.includes(k))) throw new Error('Invalid or unexpected ' + label + ' fields');
}
function text(v: unknown, max: number, label: string, required = false): asserts v is string {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error('Invalid ' + label);
}
function id(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.:-]{0,159}$/.test(v)) throw new Error('Invalid architecture id');
}
export function safeArtifactPath(v: string): boolean {
  return v === '' || (v.length <= 500 && !/[\\\0:]/.test(v) && !v.startsWith('/') && v.split('/').every(p => p !== '..' && p !== '.' && p !== ''));
}
function columns(value: unknown): void {
  if (value === null) return;
  if (!Array.isArray(value) || value.length > ARCHITECTURE_LIMITS.columns) throw new Error('Too many or invalid columns');
  const names = new Set<string>();
  for (const c of value) {
    strict(c, ['name', 'type', 'nullable'], 'column'); text(c.name, 200, 'column name', true); text(c.type, 200, 'column type', true);
    if (names.has(c.name) || (c.nullable !== null && typeof c.nullable !== 'boolean')) throw new Error('Duplicate column or invalid nullability');
    names.add(c.name);
  }
}
export function validateArchitecture(input: unknown): Architecture {
  strict(input, ['format', 'version', 'title', 'description', 'origin', 'layers', 'nodes', 'edges', 'snapshot', 'notes'], 'architecture');
  if (input.format !== 'datapass.architecture' || input.version !== 1 || !['synthetic', 'user-file'].includes(String(input.origin))) throw new Error('Unsupported architecture document');
  text(input.title, 200, 'title', true); text(input.description, 4000, 'description');
  if (!Array.isArray(input.layers) || !input.layers.length || input.layers.length > 24) throw new Error('Invalid layer list');
  input.layers.forEach(x => text(x, 100, 'layer', true));
  if (new Set(input.layers).size !== input.layers.length) throw new Error('Duplicate layer');
  if (!Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > ARCHITECTURE_LIMITS.nodes || !Array.isArray(input.edges) || input.edges.length > ARCHITECTURE_LIMITS.edges) throw new Error('Architecture limit: 180 nodes / 400 edges');
  const ids = new Set<string>();
  for (const n of input.nodes) {
    strict(n, ['id', 'label', 'kind', 'layer', 'description', 'owner', 'sourcePath', 'code', 'logical', 'physical'], 'node'); id(n.id);
    if (ids.has(n.id) || !['source', 'transform', 'store', 'report', 'service'].includes(String(n.kind)) || !input.layers.includes(n.layer)) throw new Error('Duplicate node, invalid kind or unknown layer');
    ids.add(n.id); text(n.label, 160, 'node label', true); text(n.description, 2000, 'node description'); text(n.owner, 120, 'owner');
    text(n.sourcePath, 500, 'source path'); if (!safeArtifactPath(n.sourcePath)) throw new Error('Source paths must be relative artifact paths');
    text(n.code, 20000, 'source excerpt'); columns(n.logical); columns(n.physical);
  }
  const edgeIds = new Set<string>();
  for (const e of input.edges) {
    strict(e, ['id', 'from', 'to', 'kind', 'label'], 'edge'); id(e.id); id(e.from); id(e.to); text(e.label, 160, 'edge label');
    if (edgeIds.has(e.id) || !ids.has(e.from) || !ids.has(e.to) || !['data', 'control', 'contains'].includes(String(e.kind))) throw new Error('Invalid edge or missing endpoint');
    edgeIds.add(e.id);
  }
  if (input.snapshot !== null) { strict(input.snapshot, ['label', 'generatedAt'], 'snapshot'); text(input.snapshot.label, 160, 'snapshot label', true); text(input.snapshot.generatedAt, 80, 'snapshot date'); }
  if (input.nodes.some(n => n.physical !== null) && input.snapshot === null) throw new Error('Physical columns require a labelled snapshot');
  if (!Array.isArray(input.notes) || input.notes.length > 24) throw new Error('Invalid notes'); input.notes.forEach(n => text(n, 2000, 'note'));
  // Structured clone prevents callers from mutating a validated input behind the UI.
  return structuredClone(input) as Architecture;
}
export function readArtifactJson(source: string): unknown {
  if (new TextEncoder().encode(source).byteLength > ARCHITECTURE_LIMITS.bytes) throw new Error('Architecture files are limited to 2 MiB');
  return JSON.parse(source);
}
export function parseArchitecture(source: string): Architecture {
  const doc = validateArchitecture(readArtifactJson(source));
  return {...doc, origin: 'user-file'};
}
export type SchemaChange = {column: string; kind: 'design-only' | 'snapshot-only' | 'type' | 'nullability'; design: string; snapshot: string};
export function compareColumns(node: ArchitectureNode): {state: 'compared' | 'no-design' | 'no-snapshot'; changes: SchemaChange[]; unknown: number} {
  if (node.logical === null) return {state: 'no-design', changes: [], unknown: 0};
  if (node.physical === null) return {state: 'no-snapshot', changes: [], unknown: 0};
  const changes: SchemaChange[] = [], physical = new Map(node.physical.map(c => [c.name, c])); let unknown = 0;
  const knownType = (s: string) => !['unknown', ''].includes(s.trim().toLowerCase());
  const normalized = (s: string) => s.toUpperCase().replace(/\s+/g, '');
  for (const c of node.logical) {
    const p = physical.get(c.name);
    if (!p) { changes.push({column: c.name, kind: 'design-only', design: c.type, snapshot: 'Absent'}); continue; }
    if (!knownType(c.type) || !knownType(p.type)) unknown++;
    else if (normalized(c.type) !== normalized(p.type)) changes.push({column: c.name, kind: 'type', design: c.type, snapshot: p.type});
    if (c.nullable === null || p.nullable === null) unknown++;
    else if (c.nullable !== p.nullable) changes.push({column: c.name, kind: 'nullability', design: c.nullable ? 'Nullable' : 'Not null', snapshot: p.nullable ? 'Nullable' : 'Not null'});
  }
  const logicalNames = new Set(node.logical.map(c => c.name));
  for (const p of node.physical) if (!logicalNames.has(p.name)) changes.push({column: p.name, kind: 'snapshot-only', design: 'Absent', snapshot: p.type});
  return {state: 'compared', changes, unknown};
}
export function neighborhood(doc: Architecture, selected: string, direction: 'upstream' | 'downstream'): Set<string> {
  const seen = new Set<string>(), queue = [selected];
  for (let i = 0; i < queue.length; i++) for (const e of doc.edges) {
    if (e.kind === 'contains') continue;
    const next = direction === 'downstream' ? (e.from === queue[i] ? e.to : null) : (e.to === queue[i] ? e.from : null);
    if (next && next !== selected && !seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}
/** Exact strongly-connected components, not the unprocessed tail of a topological sort. */
export function graphFacts(doc: Architecture) {
  const outgoing = new Map(doc.nodes.map(n => [n.id, [] as string[]]));
  for (const e of doc.edges) if (e.kind !== 'contains') outgoing.get(e.from)!.push(e.to);
  let cursor = 0; const indices = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], onStack = new Set<string>(), cycles: string[][] = [];
  function visit(v: string) {
    indices.set(v, cursor); low.set(v, cursor++); stack.push(v); onStack.add(v);
    for (const w of outgoing.get(v)!) { if (!indices.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, indices.get(w)!)); }
    if (low.get(v) === indices.get(v)) { const group: string[] = []; let w: string; do { w = stack.pop()!; onStack.delete(w); group.push(w); } while (w !== v); if (group.length > 1 || outgoing.get(v)!.includes(v)) cycles.push(group); }
  }
  doc.nodes.forEach(n => { if (!indices.has(n.id)) visit(n.id); });
  const layer = new Map(doc.nodes.map(n => [n.id, doc.layers.indexOf(n.layer)]));
  return {cycles, reverseEdges: doc.edges.filter(e => e.kind !== 'contains' && layer.get(e.from)! > layer.get(e.to)!), isolated: doc.nodes.filter(n => !doc.edges.some(e => e.from === n.id || e.to === n.id)), changes: doc.nodes.flatMap(n => compareColumns(n).changes.map(c => ({...c, nodeId: n.id}))), compared: doc.nodes.filter(n => compareColumns(n).state === 'compared').length};
}
export function layoutArchitecture(doc: Architecture): Map<string, {x: number; y: number}> {
  const positions = new Map<string, {x: number; y: number}>();
  doc.layers.forEach((layer, i) => doc.nodes.filter(n => n.layer === layer).forEach((n, j) => positions.set(n.id, {x: i * 272, y: j * 214})));
  return positions;
}
export function exportArchitecture(doc: Architecture, includeSource = false): Architecture {
  const value = validateArchitecture(doc);
  if (!includeSource) for (const n of value.nodes) { n.code = ''; n.sourcePath = ''; }
  return value;
}

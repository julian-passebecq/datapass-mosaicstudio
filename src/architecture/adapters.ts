import {record, validateArchitecture, safeArtifactPath, type Architecture, type ArchitectureNode, type Column} from './model.ts';
import type {Pipeline} from '../core/pipeline.ts';
const str = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback;
const entries = (v: unknown): [string, Record<string, unknown>][] => record(v) ? Object.entries(v).filter((e): e is [string, Record<string, unknown>] => record(e[1])) : [];
function dbtColumns(v: unknown, physical = false): Column[] | null {
  if (!record(v) || !Object.keys(v).length) return null;
  return Object.entries(v).map(([name, value]) => {
    if (!record(value)) throw new Error('Invalid dbt column');
    return {name: str(value.name, name), type: str(physical ? value.type : value.data_type, 'unknown') || 'unknown', nullable: null};
  });
}
/** Read declared dbt resources. Never run compiled SQL, fetch a source file or infer column lineage. */
export function fromDbtManifest(manifest: unknown, catalog?: unknown): Architecture {
  if (!record(manifest) || !record(manifest.nodes) || !record(manifest.metadata)) throw new Error('Expected a dbt manifest with nodes and metadata');
  if (!/\/manifest\/v\d+\.json$/.test(str(manifest.metadata.dbt_schema_version))) throw new Error('Not a recognised dbt manifest schema');
  const resources = [...entries(manifest.sources), ...entries(manifest.nodes), ...entries(manifest.exposures)];
  const allowed = new Set(['source', 'model', 'seed', 'snapshot', 'exposure']);
  const selected = resources.filter(([, n]) => allowed.has(str(n.resource_type)));
  const ids = new Set(selected.map(([key]) => key)); let skipped = 0, clipped = 0;
  const nodes: ArchitectureNode[] = selected.map(([key, n]) => {
    if (n.unique_id !== undefined && n.unique_id !== key) throw new Error('dbt unique_id does not match dictionary key');
    const type = str(n.resource_type), path = str(n.original_file_path);
    const code = str(n.raw_code, str(n.raw_sql));
    if (code.length > 20000) clipped++;
    return {id: key, label: str(n.name, key), kind: type === 'source' ? 'source' : type === 'exposure' ? 'report' : 'transform', layer: type === 'source' || type === 'seed' ? 'Sources' : type === 'exposure' ? 'Serving' : 'Models', description: str(n.description).slice(0, 2000), owner: record(n.owner) ? str(n.owner.name).slice(0, 120) : '', sourcePath: safeArtifactPath(path) ? path : '', code: code.slice(0, 20000), logical: dbtColumns(n.columns), physical: null};
  });
  const edges: Architecture['edges'] = [];
  for (const [key, n] of selected) {
    const deps = record(n.depends_on) ? n.depends_on.nodes : [];
    if (deps !== undefined && !Array.isArray(deps)) throw new Error('dbt depends_on.nodes must be an array');
    for (const dep of deps || []) {
      if (typeof dep !== 'string') throw new Error('Invalid dbt dependency id');
      if (!ids.has(dep)) { skipped++; continue; }
      edges.push({id: 'dbt-edge-' + edges.length, from: dep, to: key, kind: 'data', label: 'depends_on'});
    }
  }
  let doc: Architecture = {format: 'datapass.architecture', version: 1, title: str(manifest.metadata.project_name, 'dbt architecture'), description: 'Static resource dependencies from a user-selected dbt manifest. Source code is displayed, never executed.', origin: 'user-file', layers: ['Sources', 'Models', 'Serving'].filter(l => nodes.some(n => n.layer === l)), nodes, edges, snapshot: null,
    notes: ['Source / model / seed / snapshot / exposure resources only. Macros, tests, semantic metrics and column-level lineage are not imported.', 'Layer placement groups resource types; it is not an inferred Bronze/Silver/Gold architecture.', 'dbt nullability is not inferred from tests; unknown remains unknown.', `${resources.length - selected.length} resources outside this scope; ${skipped} dependencies outside the displayed resource set.`, ...(clipped ? [`${clipped} source excerpts truncated to 20,000 characters; never executed.`] : [])]};
  if (catalog !== undefined) doc = attachDbtCatalog(doc, catalog, manifest.metadata);
  return validateArchitecture(doc);
}
export function attachDbtCatalog(doc: Architecture, input: unknown, manifestMetadata?: Record<string, unknown>): Architecture {
  if (!record(input) || !record(input.metadata) || !record(input.nodes) || !/\/catalog\/v\d+\.json$/.test(str(input.metadata.dbt_schema_version))) throw new Error('Expected a dbt catalog.json snapshot');
  if (manifestMetadata?.project_id && input.metadata.project_id && manifestMetadata.project_id !== input.metadata.project_id) throw new Error('Catalog and manifest project identities differ');
  const records = new Map([...entries(input.sources), ...entries(input.nodes)]); let matched = 0;
  const nodes = doc.nodes.map(n => { const c = records.get(n.id); if (!c) return {...n, physical: null};
    if (c.unique_id !== undefined && c.unique_id !== n.id) throw new Error('Catalog unique_id mismatch');
    matched++; return {...n, physical: dbtColumns(c.columns, true)};
  });
  if (!matched) throw new Error('No exact unique_id matches between this architecture and the catalog');
  const errors = Array.isArray(input.errors) ? input.errors.length : 0;
  return validateArchitecture({...doc, nodes, snapshot: {label: 'Imported dbt catalog (not live)', generatedAt: str(input.metadata.generated_at).slice(0, 80)}, notes: [...doc.notes.filter(n => !n.startsWith('Catalog:')), `Catalog: ${matched}/${nodes.length} exact resource matches; ${errors} reported metadata errors. A match does not prove environment or freshness; review the files together.`]});
}
/** The existing pipeline parser remains authoritative for ADF/Fabric's display-only subset. */
export function fromPipeline(p: Pipeline): Architecture {
  const depth = new Map(p.activities.map(n => [n.id, 0]));
  // Bounded relaxation is for layout only. Cyclic definitions use one layer, not fake execution phases.
  let changed = false;
  for (let pass = 0; pass < p.activities.length; pass++) {
    changed = false;
    for (const e of p.dependencies) if (e.condition !== 'contains' && depth.get(e.to)! <= depth.get(e.from)!) { depth.set(e.to, depth.get(e.from)! + 1); changed = true; }
    if (!changed) break;
  }
  if (changed || Math.max(...depth.values()) >= 24) depth.forEach((_, id) => depth.set(id, 0));
  const layer = (id: string) => 'Level ' + (depth.get(id)! + 1);
  return validateArchitecture({format: 'datapass.architecture', version: 1, title: p.title, description: 'Pipeline-definition review. Dependencies are static; no activity was executed.', origin: p.sourceKind, layers: [...new Set([...depth.values()].sort((a, b) => a - b).map(n => 'Level ' + (n + 1)))],
    nodes: p.activities.map(n => ({id: n.id, label: n.name, kind: 'service', layer: layer(n.id), description: `${n.kind}: ${n.detail}`.slice(0, 2000), owner: '', sourcePath: '', code: n.code.slice(0, 20000), logical: null, physical: null})),
    edges: p.dependencies.map(e => ({id: e.id, from: e.from, to: e.to, kind: e.condition === 'contains' ? 'contains' : 'control', label: e.condition})), snapshot: null,
    notes: ['Reuses the existing DataPass pipeline parser. Nested container links are not execution dependencies.', 'No live ADF/Fabric/Hop connection. Pipeline syntax, container semantics and deployment validity remain source-owned.', ...(p.activities.some(n => n.code.length > 20000) ? ['Long activity source excerpts were truncated to 20,000 characters.'] : [])]});
}

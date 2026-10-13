import {defineApp, type Column} from '../../src/framework/index.ts';
import {snapshot, architecture, passSummary} from './pass.ts';

const appColumns: Column[] = [
  {id: 'key', label: 'App key', type: 'string'}, {id: 'name', label: 'App', type: 'string'}, {id: 'repository', label: 'Repository', type: 'string'},
  {id: 'wave', label: 'Wave', type: 'number'}, {id: 'version', label: 'Version', type: 'string'}, {id: 'status', label: 'Status', type: 'string'}, {id: 'destination', label: 'Destination', type: 'string'}
];
const SOURCE_NOTE = `Owner-supplied status snapshot of the pass log at ${snapshot.snapshotTime}, screened to public fields (key, name, repository, version, status, destination category). Not live data and not release evidence.`;

export default defineApp({manifest: {format: 'datapass.web-app', schemaVersion: 1, id: 'galaxy-finition', version: '0.1.0', title: 'Galaxy Finition pass',
  label: 'Owner-supplied snapshot · 13 Oct 2026', description: 'Status board and dependency graph of the Galaxy Finition pass: 13 retained apps and 5 apps paused by the owner.',
  theme: {accent: '#4b5fa8', density: 'compact', mode: 'light'}, fields: [],
  datasets: [
    {id: 'apps', title: 'Retained apps', layer: 'Snapshot', description: SOURCE_NOTE, source: 'inline', provenance: 'user-provided', rowKey: 'key', columns: appColumns, inputs: [], dependsOn: []},
    {id: 'paused', title: 'Paused by owner', layer: 'Snapshot', description: 'Apps removed from the active dispatch by the owner. No dev, CI or release work in this pass.', source: 'inline', provenance: 'user-provided', rowKey: 'key', columns: [{id: 'key', label: 'App key', type: 'string'}, {id: 'name', label: 'App', type: 'string'}, {id: 'status', label: 'Status', type: 'string'}], inputs: [], dependsOn: []},
    {id: 'dependencies', title: 'Declared dependencies', layer: 'Snapshot', description: 'dependency_keys from the dispatch packet, restricted to the 18 apps of the pass.', source: 'inline', provenance: 'user-provided', rowKey: 'id', columns: [{id: 'id', label: 'Edge', type: 'string'}, {id: 'from', label: 'App', type: 'string'}, {id: 'to', label: 'Declared dependency', type: 'string'}], inputs: [], dependsOn: []},
    {id: 'summary', title: 'Pass counts', layer: 'Derived', description: 'Counts derived from the snapshot rows.', source: 'derived', provenance: 'derived', rowKey: 'id', columns: [{id: 'id', label: 'Count', type: 'string'}, {id: 'value', label: 'Value', type: 'number'}], inputs: [], dependsOn: ['apps', 'paused', 'dependencies']}
  ],
  tasks: [],
  pages: [
    {id: 'board', title: 'Status board', description: 'Where each retained app ended the pass. Statuses are written as in the pass log.', sections: [
      {id: 'counts', columns: 4, blocks: [
        {id: 'retained-count', type: 'metric', title: 'Retained apps', value: {dataset: 'summary', row: 'retained', column: 'value'}, digits: 0},
        {id: 'published-count', type: 'metric', title: 'Published or ratified', value: {dataset: 'summary', row: 'published', column: 'value'}, digits: 0},
        {id: 'paused-count', type: 'metric', title: 'Paused by owner', value: {dataset: 'summary', row: 'paused', column: 'value'}, digits: 0},
        {id: 'edge-count', type: 'metric', title: 'Dependency edges', value: {dataset: 'summary', row: 'edges', column: 'value'}, digits: 0}
      ]},
      {id: 'retained', columns: 1, blocks: [{id: 'apps-table', type: 'table', dataset: 'apps', pageSize: 13}]},
      {id: 'paused-section', columns: 1, blocks: [{id: 'paused-table', type: 'table', dataset: 'paused', pageSize: 5}]},
      {id: 'source', columns: 1, blocks: [{id: 'source-note', type: 'text', tone: 'note', text: SOURCE_NOTE + ' Destinations are generic categories; no paths, links, hosts or hashes are published here.'}]}
    ]},
    {id: 'architecture', title: 'Architecture', description: 'The 18 apps of the pass as a graph of their declared dependency_keys. Layers are dispatch waves; paused apps sit in their own layer.', sections: [
      {id: 'graph', columns: 1, blocks: [{id: 'pass-graph', type: 'architecture', resource: 'pass'}]},
      {id: 'edge-list', columns: 1, blocks: [{id: 'edges-table', type: 'table', dataset: 'dependencies', pageSize: 24}]}
    ]}
  ]},
  bindings: {
    inline: {
      apps: snapshot.apps,
      paused: snapshot.paused,
      dependencies: snapshot.edges.map((e, i) => ({id: `dep-${i + 1}`, from: e.from, to: e.to}))
    },
    derive: {summary: () => passSummary(snapshot)}
  },
  resources: {architectures: {pass: architecture}}
});

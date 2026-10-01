import {validateArchitecture, type ArchitectureNode, type Column} from './model.ts';
const c = (name: string, type: string, nullable: boolean | null = false): Column => ({name, type, nullable});
const n = (id: string, label: string, kind: ArchitectureNode['kind'], layer: string, description: string, owner: string, logical: Column[] | null = null, physical: Column[] | null = null, code = ''): ArchitectureNode => ({id, label, kind, layer, description, owner, logical, physical, code, sourcePath: code ? `models/${id}.sql` : ''});
export const demoArchitecture = validateArchitecture({
  format: 'datapass.architecture', version: 1, title: 'Renewable operations', description: 'From telemetry and costs to a trusted performance report. A synthetic architecture-review example, not a client system.', origin: 'synthetic', layers: ['Sources', 'Ingestion', 'Lakehouse', 'Serving'],
  snapshot: {label: 'Synthetic catalog snapshot', generatedAt: '2026-09-30T08:00:00Z'},
  nodes: [
    n('telemetry', 'Turbine telemetry', 'source', 'Sources', 'Meter readings at event grain. Source owner defines the unit and timestamp contract.', 'Operations', [c('event_id', 'BIGINT'), c('energy_kwh', 'DOUBLE'), c('site_id', 'VARCHAR')]),
    n('costs', 'Operating costs', 'source', 'Sources', 'Daily finance extract. Cost allocation and currency conversion belong to the source contract.', 'Finance', [c('site_id', 'VARCHAR'), c('cost_eur', 'DECIMAL(12,2)')]),
    n('ingest', 'Daily ingestion', 'service', 'Ingestion', 'Copy both sources into an immutable landing area. Definition-only: no scheduler is connected.', 'Data engineering'),
    n('quality', 'Contract checks', 'transform', 'Ingestion', 'Validate identifiers, units and event timestamps before model refresh. No quality-test result is asserted.', 'Data engineering'),
    n('clean_events', 'Clean events', 'store', 'Lakehouse', 'One row per event. Quarantine invalid identifiers; retain the event source key.', 'Data engineering', [c('event_id', 'BIGINT'), c('energy_kwh', 'DOUBLE'), c('site_id', 'VARCHAR')], [c('event_id', 'BIGINT'), c('energy_kwh', 'DOUBLE'), c('site_id', 'VARCHAR')], 'SELECT event_id, energy_kwh, site_id\nFROM landing.events\nWHERE event_id IS NOT NULL;'),
    n('site_performance', 'Site performance', 'store', 'Lakehouse', 'One row per site and day. The example intentionally includes field-name drift for review.', 'Analytics', [c('site_id', 'VARCHAR'), c('energy_mwh', 'DOUBLE'), c('cost_eur', 'DECIMAL(12,2)')], [c('site_id', 'VARCHAR'), c('energy_mwh', 'DOUBLE'), c('operating_cost_eur', 'DECIMAL(12,2)')], 'SELECT site_id, SUM(energy_kwh) / 1000 AS energy_mwh\nFROM clean_events\nGROUP BY site_id;\n-- Illustrative excerpt; finance join is not implemented here.'),
    n('performance_report', 'Performance report', 'report', 'Serving', 'Curated operational KPIs for managers. Review the cost-field mapping before approving the interface.', 'Business intelligence'),
    n('client_app', 'Client data app', 'report', 'Serving', 'A Studio web consumer can display the same data contract without exposing its notebook or IDE.', 'Product')
  ],
  edges: [
    {id: 'e1', from: 'telemetry', to: 'ingest', kind: 'data', label: 'Events'},
    {id: 'e2', from: 'costs', to: 'ingest', kind: 'data', label: 'Costs'},
    {id: 'e3', from: 'ingest', to: 'quality', kind: 'control', label: 'After ingest'},
    {id: 'e4', from: 'quality', to: 'clean_events', kind: 'control', label: 'Validate'},
    {id: 'e5', from: 'clean_events', to: 'site_performance', kind: 'data', label: 'Aggregate'},
    {id: 'e6', from: 'site_performance', to: 'performance_report', kind: 'data', label: 'KPIs'},
    {id: 'e7', from: 'site_performance', to: 'client_app', kind: 'data', label: 'Data contract'}
  ],
  notes: ['All nodes, owners and schema snapshots in this example are synthetic.', 'cost_eur and operating_cost_eur are reported as two differences. A rename is not inferred.', 'Graph connectivity is a declared dependency, not measured runtime or automatic column lineage.']
});

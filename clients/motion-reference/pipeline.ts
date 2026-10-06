import type {MotionSpec} from '../../src/framework/motion/model.ts';

export const pipeline: MotionSpec = {
  format: 'datapass.motion', version: 1, title: 'A record becomes an analytical result',
  description: 'Follow one authored batch through capture, validation, a model and a report. The objects keep their identity in both projections.',
  provenance: 'synthetic', note: 'Illustrative data route. Colors and timings describe the explanation, not measured job status or processing duration.',
  sources: [
    {id: 'validation', path: 'examples/validate.py', language: 'python', title: 'A bounded quality rule', provenance: 'synthetic', text: '# Illustrative source, not executed by this website.\ndef validate_rows(rows):\n    return [row for row in rows\n            if row["wind_speed"] is not None]\n'},
    {id: 'aggregation', path: 'examples/summary.sql', language: 'sql', title: 'Count the available observations', provenance: 'synthetic', text: '-- Illustrative aggregation; no warehouse query is executed here.\nSELECT installation_id, COUNT(*) AS observed_rows\nFROM validated_events\nGROUP BY installation_id;\n'},
  ],
  entities: [
    {id: 'capture', kind: 'station', label: 'Capture', description: 'The declared entry point for an example batch.', position: [0, 0, 0], size: [2, 1.3, .4], color: '#4b91b5', evidence: []},
    {id: 'quality', kind: 'station', label: 'Validation', description: 'An authored quality gate. Open the referenced code to inspect the example rule.', position: [4, 0, 0], size: [2, 1.3, .4], color: '#62a396', evidence: [{artifact: 'validation', start: 2, end: 4, label: 'Inspect the quality rule'}]},
    {id: 'model', kind: 'station', label: 'Model', description: 'A generic transform boundary, not a physical wind-to-power model.', position: [4, 3, 0], size: [2, 1.3, .65], color: '#9282b6', evidence: [{artifact: 'aggregation', start: 2, end: 4, label: 'Inspect the aggregation'}]},
    {id: 'output', kind: 'station', label: 'Curated output', description: 'An illustrative publish boundary. This animation does not write any file.', position: [8, 3, 0], size: [2, 1.3, .4], color: '#c29c62', evidence: []},
    {id: 'report', kind: 'station', label: 'Report', description: 'An ordinary website can consume a result without bundling an IDE or a database.', position: [8, 0, 0], size: [2, 1.3, .4], color: '#5f9bac', evidence: [{artifact: 'aggregation', start: 2, end: 4, label: 'View the result definition'}]},
    {id: 'batch', kind: 'token', label: 'Batch A', description: 'One stable visual identity, not a copy of private client rows.', at: 'capture', size: .45, color: '#397b9f', evidence: []},
  ],
  links: [
    {id: 'ingest', from: 'capture', to: 'quality', label: 'Validate', via: []},
    {id: 'transform', from: 'quality', to: 'model', label: 'Transform', via: []},
    {id: 'publish', from: 'model', to: 'output', label: 'Publish', via: []},
    {id: 'serve', from: 'output', to: 'report', label: 'Consume', via: []},
  ],
  steps: [
    {id: 'arrive', title: 'A batch arrives', caption: 'Batch A starts at the capture boundary. Select any component to inspect its role without restarting the scene.', focus: 'capture', holdMs: 2600, transitionMs: 700, commands: [{type: 'state', entity: 'capture', value: 'active'}], activeLinks: [], evidence: []},
    {id: 'validate', title: 'Apply the quality rule', caption: 'The same batch moves along the declared link. The code excerpt documents the rule; no Python is executed.', focus: 'quality', holdMs: 2800, transitionMs: 900, commands: [{type: 'transfer', entity: 'batch', link: 'ingest'}, {type: 'state', entity: 'capture', value: 'complete'}, {type: 'state', entity: 'quality', value: 'active'}], activeLinks: ['ingest'], evidence: [{artifact: 'validation', start: 2, end: 4, label: 'Inspect the quality rule'}]},
    {id: 'aggregate', title: 'Derive a result', caption: 'The modeling boundary consumes the validated observations. The source reference is exact, but this is still an authored explanation, not a SQL execution trace.', focus: 'model', holdMs: 2800, transitionMs: 900, commands: [{type: 'transfer', entity: 'batch', link: 'transform'}, {type: 'state', entity: 'quality', value: 'complete'}, {type: 'state', entity: 'model', value: 'active'}], activeLinks: ['transform'], evidence: [{artifact: 'aggregation', start: 2, end: 4, label: 'Inspect the aggregation'}]},
    {id: 'curate', title: 'Publish the contract', caption: 'A result is handed to the next component. The framework owns the movement; the client owns the data contract and any real calculation.', focus: 'output', holdMs: 2600, transitionMs: 900, commands: [{type: 'transfer', entity: 'batch', link: 'publish'}, {type: 'state', entity: 'model', value: 'complete'}, {type: 'state', entity: 'output', value: 'active'}], activeLinks: ['publish'], evidence: []},
    {id: 'consume', title: 'Present without duplicating the logic', caption: 'The result can appear as a chart, table or technical explanation. A public source excerpt is separate from the code that runs a service.', focus: 'report', holdMs: 2600, transitionMs: 900, commands: [{type: 'transfer', entity: 'batch', link: 'serve'}, {type: 'state', entity: 'output', value: 'complete'}, {type: 'state', entity: 'report', value: 'complete'}], activeLinks: ['serve'], evidence: [{artifact: 'aggregation', start: 2, end: 4, label: 'View the result definition'}]},
  ],
};

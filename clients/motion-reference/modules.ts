import type {MotionSpec} from '../../src/framework/motion/model.ts';

export const modules: MotionSpec = {
  format: 'datapass.motion', version: 1, title: 'Load a dependency when it is needed', provenance: 'authored',
  description: 'A pedagogical metaphor for an explicit deferred import. A package token remains in the catalog until a feature requests it.',
  note: 'Authored example, not a runtime benchmark. Dwell times are presentation choices; no import-time speedup is measured or promised.',
  sources: [{id: 'lazy-source', path: 'examples/lazy_feature.py', language: 'python', title: 'Explicit deferred import', provenance: 'synthetic', text: '# Illustrative source, never run by the viewer.\nimport importlib\n\ndef summarize(values):\n    statistics = importlib.import_module("statistics")\n    return statistics.mean(values)\n'}],
  entities: [
    {id: 'catalog', kind: 'station', label: 'Module catalog', description: 'The module is available, but this diagram has not yet shown it being loaded.', position: [0, 0, 0], size: [2, 1.5, .5], color: '#6a91ad', evidence: []},
    {id: 'startup', kind: 'station', label: 'Application startup', description: 'Startup does not need the selected feature in this authored example.', position: [4, 0, 0], size: [2.3, 1.5, .35], color: '#699f8c', evidence: []},
    {id: 'request', kind: 'station', label: 'Feature requested', description: 'The visitor reaches the path that needs the dependency.', position: [4, 3, 0], size: [2.3, 1.5, .35], color: '#bd985b', evidence: [{artifact: 'lazy-source', start: 4, end: 6, label: 'Read the deferred function'}]},
    {id: 'loaded', kind: 'station', label: 'Loaded dependency', description: 'The module is now shown inside the requested feature context.', position: [8, 3, 0], size: [2.3, 1.5, .5], color: '#9683af', evidence: [{artifact: 'lazy-source', start: 5, end: 6, label: 'Read the import and use'}]},
    {id: 'package', kind: 'token', label: 'Statistics module', description: 'A semantic token, not the contents of an installed package.', at: 'catalog', size: .6, color: '#577da1', evidence: []},
  ],
  links: [{id: 'feature', from: 'startup', to: 'request', label: 'Request', via: []}, {id: 'load', from: 'catalog', to: 'loaded', label: 'Load on demand', via: [[0, 3, .78], [4, 3, .78]]}],
  steps: [
    {id: 'available', title: 'Available is not the same as loaded', caption: 'A dependency can be represented independently of the application using it. No package is loaded by this visual metaphor.', focus: 'catalog', holdMs: 2600, transitionMs: 700, commands: [{type: 'state', entity: 'package', value: 'muted'}], activeLinks: [], evidence: []},
    {id: 'start', title: 'Start with the required work', caption: 'The application-startup block becomes active. The dependency stays where it was: not every animation needs a moving object at every step.', focus: 'startup', holdMs: 2600, transitionMs: 650, commands: [{type: 'state', entity: 'startup', value: 'active'}], activeLinks: [], evidence: []},
    {id: 'demand', title: 'A feature asks for the module', caption: 'The requested feature provides the reason to load the dependency. Its source excerpt explains the call path.', focus: 'request', holdMs: 2800, transitionMs: 700, commands: [{type: 'state', entity: 'startup', value: 'complete'}, {type: 'state', entity: 'request', value: 'active'}, {type: 'state', entity: 'package', value: 'active'}], activeLinks: ['feature'], evidence: [{artifact: 'lazy-source', start: 4, end: 6, label: 'Read the deferred function'}]},
    {id: 'load-now', title: 'Follow the dependency into the feature', caption: 'The token follows the authored route through the request boundary. Switching to isometric keeps exactly the same object, step and evidence.', focus: 'loaded', holdMs: 3000, transitionMs: 1500, commands: [{type: 'transfer', entity: 'package', link: 'load'}, {type: 'state', entity: 'request', value: 'complete'}, {type: 'state', entity: 'loaded', value: 'active'}], activeLinks: ['load'], evidence: [{artifact: 'lazy-source', start: 5, end: 6, label: 'Read the import and use'}]},
    {id: 'result', title: 'Keep the explanation separate from execution', caption: 'The final state can be revisited without rerunning the sequence. Real startup behavior and performance need separate measurement.', focus: 'loaded', holdMs: 2600, transitionMs: 500, commands: [{type: 'state', entity: 'loaded', value: 'complete'}, {type: 'state', entity: 'package', value: 'complete'}], activeLinks: [], evidence: []},
  ],
};

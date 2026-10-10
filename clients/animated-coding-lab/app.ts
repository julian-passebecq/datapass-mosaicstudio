import {defineApp} from '../../src/framework/authoring.ts';
import {CodingLab} from './CodingLab.tsx';
import {LineageTab} from './LineageTab.tsx';
import {LAB_SELECTIONS} from './trace.ts';

/** Python records, Studio animates: public/artifacts/coding-lab-trace.json is written by py/coding_lab_trace.py. */
export default defineApp({manifest: {
  format: 'datapass.web-app', schemaVersion: 1, id: 'animated-coding-lab', version: '0.2.0', title: 'Animated Coding Lab',
  label: 'ILLUSTRATIVE recorded execution',
  description: 'A real Python run recorded line by line (sys.settrace) and replayed as code, moving values and explanation. Studio animates the recorded trace; it never runs Python.',
  theme: {accent: '#2f6f86', density: 'compact'},
  fields: [
    {id: 'lab-step', label: 'Trace step', type: 'number', role: 'view', min: 0, max: 63, step: 1, default: 0},
    {id: 'lab-projection', label: 'Projection', type: 'select', role: 'view', default: 'diagram', options: [{value: 'diagram', label: '2D diagram'}, {value: 'isometric', label: 'Isometric'}]},
    {id: 'lab-speed', label: 'Playback speed', type: 'select', role: 'view', default: '1', options: [{value: '0.5', label: '0.5x'}, {value: '1', label: '1x'}, {value: '2', label: '2x'}]},
    {id: 'lab-reduced', label: 'Reduced motion', type: 'toggle', role: 'view', default: false},
    // Selected identity shared by visual, code, explanation and transcript. Row ids beyond the recorded rows select nothing.
    {id: 'lab-selection', label: 'Selected value or box', type: 'select', role: 'view', default: 'none', options: LAB_SELECTIONS.map(value => ({value, label: value === 'none' ? 'Nothing selected' : value}))},
  ],
  datasets: [], tasks: [],
  pages: [
    {id: 'lab', title: 'Step through a real run', description: 'normalize() applied to each row, then a running total and a mean. Every highlighted line, moving value and number below comes from one recorded execution trace.', sections: [
      {id: 'lab', columns: 1, blocks: [{id: 'coding-lab', type: 'custom', resource: 'lab'}]},
    ]},
    {id: 'lineage', title: 'Lineage', description: 'Where the trace comes from: artifact, run, producer, declared inputs and the exact source lines they cite. Plain navigation; nothing is recomputed.', sections: [
      {id: 'lineage', columns: 1, blocks: [{id: 'trace-lineage', type: 'custom', resource: 'lineage'}]},
    ]},
  ],
}, bindings: {}, components: {lab: CodingLab, lineage: LineageTab}, customCapabilities: {lab: ['motion'], lineage: []}});

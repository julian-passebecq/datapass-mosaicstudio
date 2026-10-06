import {defineApp} from '../../src/framework/authoring.ts';
import {motionFields, motionBlock} from '../../src/framework/motion/index.ts';
import {pipeline} from './pipeline.ts';
import {modules} from './modules.ts';
import {choreography} from './choreography.ts';

export default defineApp({manifest: {
  format: 'datapass.web-app', schemaVersion: 1, id: 'motion-reference', version: '0.8.0', title: 'Motion / reference app',
  label: 'Authored explanation lab', description: 'A reusable SVG motion capability with deterministic steps and read-only evidence. No WebGL, notebook or code execution.',
  theme: {accent: '#286f89', density: 'compact'}, fields: [...motionFields(pipeline, 'flow'), ...motionFields(modules, 'modules'), ...motionFields(choreography, 'choreo')], datasets: [], tasks: [],
  pages: [
    {id: 'flow', title: 'Data journey', description: 'One scene, two projections, stable objects. Follow a batch and inspect the source-owned explanation behind each boundary.', sections: [{id: 'flow', columns: 1, blocks: [motionBlock('flow-motion', 'pipeline', 'flow')]}]},
    {id: 'modules', title: 'On-demand dependency', description: 'The same block explains a different concept. Geometry, timing and content live in this client, not in a one-off renderer.', sections: [{id: 'dependency', columns: 1, blocks: [motionBlock('module-motion', 'modules', 'modules')]}]},
    {id: 'choreography', title: 'Choreography lab', description: 'Bounded timing windows, two independent lanes and semantic annotations. Legacy examples remain on motion v1.', sections: [{id: 'choreography', columns: 1, blocks: [motionBlock('choreo-motion', 'choreography', 'choreo')]}]},
  ],
}, bindings: {}, resources: {motions: {pipeline, modules, choreography}}});

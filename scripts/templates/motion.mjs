/** Fresh source-owned sample. Does not import a reference client's content. */
export function motionTemplate({id, title}) {
  const spec = {
    format: 'datapass.motion', version: 1, title, description: 'A client-authored explanation with stable objects and two lightweight projections.',
    provenance: 'synthetic', note: 'Replace this example with approved content. Timings and state colors are narrative choices, not execution evidence.',
    sources: [],
    entities: [
      {id: 'input', kind: 'station', label: 'Input', description: 'The starting boundary.', position: [0, 0, 0], size: [2, 1.5, .5], color: '#5a94ab', evidence: []},
      {id: 'process', kind: 'station', label: 'Process', description: 'A client-owned operation.', position: [4, 0, 0], size: [2, 1.5, .5], color: '#7ba392', evidence: []},
      {id: 'result', kind: 'station', label: 'Result', description: 'The presentation boundary.', position: [4, 3, 0], size: [2, 1.5, .5], color: '#a38cb6', evidence: []},
      {id: 'item', kind: 'token', label: 'Example item', description: 'One semantic object, not a real customer record.', at: 'input', size: .45, color: '#47798f', evidence: []},
    ],
    links: [{id: 'read', from: 'input', to: 'process', label: 'Read', via: []}, {id: 'write', from: 'process', to: 'result', label: 'Write', via: []}],
    steps: [
      {id: 'begin', title: 'Begin with an input', caption: 'The same item will cross both boundaries.', focus: 'input', holdMs: 2500, transitionMs: 700, commands: [], activeLinks: [], evidence: []},
      {id: 'process-item', title: 'Process the item', caption: 'The token follows a declared link. No domain code is executed.', focus: 'process', holdMs: 2500, transitionMs: 900, commands: [{type: 'transfer', entity: 'item', link: 'read'}, {type: 'state', entity: 'process', value: 'active'}], activeLinks: ['read'], evidence: []},
      {id: 'show-result', title: 'Inspect the result', caption: 'Seek back or change projection without reconstructing state from UI history.', focus: 'result', holdMs: 2500, transitionMs: 900, commands: [{type: 'transfer', entity: 'item', link: 'write'}, {type: 'state', entity: 'process', value: 'complete'}, {type: 'state', entity: 'result', value: 'complete'}], activeLinks: ['write'], evidence: []},
    ],
  };
  return {
    'motion.ts': `import type {MotionSpec} from '../../src/framework/motion/model.ts';\nexport const motion:MotionSpec=${JSON.stringify(spec, null, 2)};\n`,
    'app.ts': `import {defineApp} from '../../src/framework/authoring.ts';\nimport {motionFields,motionBlock} from '../../src/framework/motion/index.ts';\nimport {motion} from './motion.ts';\nexport default defineApp({manifest:{format:'datapass.web-app',schemaVersion:1,id:${JSON.stringify(id)},version:'0.1.0',title:${JSON.stringify(title)},label:'Synthetic motion starter',description:'Authored explanation, no code execution or WebGL.',theme:{accent:'#286f89',density:'compact'},fields:motionFields(motion),datasets:[],tasks:[],pages:[{id:'overview',title:'Explanation',description:'One scene, two projections and a shared context.',sections:[{id:'explanation',columns:1,blocks:[motionBlock('motion','motion')]}]}]},bindings:{},resources:{motions:{motion}}});\n`,
  };
}

import type {MotionSpec} from '../../src/framework/motion/model.ts';

/** Acceptance composition, not client telemetry or a second visualization engine. */
export const choreography: MotionSpec = {
  format: 'datapass.motion', version: 2, title: 'Two lanes, one narrative clock',
  description: 'Independent property windows choreograph two stable objects. Semantic callouts retain their anchors when switching between a diagram and isometric SVG.',
  provenance: 'synthetic', note: 'Presentation timings are authored, not measured latency. No workload, simulation or source code runs in this scene.',
  sources: [{id: 'timing-note', path: 'examples/choreography.txt', language: 'text', title: 'Authored timing notes', provenance: 'synthetic', text: 'Illustrative choreography, not an execution trace.\nLane A is presented before lane B.\nThe source label illustrative_quality_rule is documentation only.\n'}],
  entities: [
    {id: 'input-a', kind: 'station', label: 'Input A', description: 'First illustrative lane.', position: [0, 0, 0], size: [2, 1.2, .4], color: '#4b91b5', evidence: []},
    {id: 'input-b', kind: 'station', label: 'Input B', description: 'Second illustrative lane.', position: [0, 3, 0], size: [2, 1.2, .4], color: '#9282b6', evidence: []},
    {id: 'review-a', kind: 'station', label: 'Review A', description: 'First presentation target; not an executed quality gate.', position: [6, 0, 0], size: [2, 1.2, .4], color: '#62a396', evidence: []},
    {id: 'review-b', kind: 'station', label: 'Review B', description: 'Second presentation target.', position: [6, 3, 0], size: [2, 1.2, .4], color: '#c29c62', evidence: []},
    {id: 'record-a', kind: 'token', label: 'Record A', description: 'A stable synthetic identity in lane A.', at: 'input-a', size: .4, color: '#397b9f', evidence: []},
    {id: 'record-b', kind: 'token', label: 'Record B', description: 'A stable synthetic identity in lane B.', at: 'input-b', size: .4, color: '#8465a3', evidence: []},
  ],
  links: [{id: 'lane-a', from: 'input-a', to: 'review-a', label: 'First lane', via: []}, {id: 'lane-b', from: 'input-b', to: 'review-b', label: 'Second lane', via: []}],
  steps: [
    {id: 'ready', title: 'Stable identities before movement', caption: 'Both records begin at their own declared source. Nothing plays automatically.', focus: 'input-a', holdMs: 2400, transitionMs: 0, commands: [], activeLinks: [], evidence: [], annotations: [{id: 'one-clock', entity: 'input-a', text: 'One shared player, not one timer per lane.', offset: [0, -100], evidence: []}]},
    {id: 'stagger', title: 'Explain the lanes in sequence', caption: 'Record A moves first. Record B starts halfway through the step. Both routes use the same finite D3 transition.', focus: 'review-a', holdMs: 2600, transitionMs: 1500, activeLinks: ['lane-a', 'lane-b'], evidence: [],
      commands: [
        {type: 'transfer', entity: 'record-a', link: 'lane-a', timing: {startMs: 0, endMs: 600, easing: 'linear'}},
        {type: 'transfer', entity: 'record-b', link: 'lane-b', timing: {startMs: 750, endMs: 1350, easing: 'cubic-in-out'}},
        {type: 'state', entity: 'review-a', value: 'complete', timing: {startMs: 600, endMs: 600, easing: 'linear'}},
        {type: 'state', entity: 'review-b', value: 'complete', timing: {startMs: 1350, endMs: 1350, easing: 'linear'}},
      ],
      annotations: [
        {id: 'first-lane', entity: 'review-a', text: 'Lane A settles before lane B begins.', offset: [0, -110], evidence: [{artifact: 'timing-note', start: 2, end: 3, label: 'Read timing notes'}]},
        {id: 'second-lane', entity: 'record-b', text: 'The leader follows Record B; this box stays stable.', offset: [0, 100], evidence: []},
      ]},
    {id: 'settled', title: 'Keep evidence without moving objects', caption: 'Transient records disappear; their semantic identities remain inspectable in the outline. The transcript carries the explanation without motion.', focus: 'review-b', holdMs: 2400, transitionMs: 1200, activeLinks: [], evidence: [], commands: [
      {type: 'visibility', entity: 'record-a', visible: false, timing: {startMs: 0, endMs: 600, easing: 'linear'}},
      {type: 'visibility', entity: 'record-b', visible: false, timing: {startMs: 600, endMs: 1200, easing: 'linear'}},
    ], annotations: [{id: 'review-note', entity: 'review-b', text: 'A source excerpt is not proof of execution.', offset: [0, 100], evidence: [{artifact: 'timing-note', start: 1, end: 3, label: 'Read the evidence boundary'}]}]},
    {id: 'reset-example', title: 'A reversible authored snapshot', caption: 'Seeking here restores a declared state directly. Reverse and restore never replay skipped commands or restart autoplay.', focus: 'input-a', holdMs: 2400, transitionMs: 1200, activeLinks: [], evidence: [], commands: [
      {type: 'move', entity: 'record-a', position: [0, 0, .68]}, {type: 'move', entity: 'record-b', position: [0, 3, .68]},
      {type: 'visibility', entity: 'record-a', visible: true}, {type: 'visibility', entity: 'record-b', visible: true},
      {type: 'state', entity: 'review-a', value: 'idle'}, {type: 'state', entity: 'review-b', value: 'idle'},
    ], annotations: []},
  ],
};

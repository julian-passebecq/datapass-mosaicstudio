// Framework gaps found by the Animated Coding Lab (#22), fixed in Studio 0.8 RC2. Each stays backwards compatible.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nodeValidationStyles} from '../scripts/node-validation-styles.mjs';
import {validateMotion} from '../src/framework/motion/model.ts';
import {compileMotion, interpolateFrame} from '../src/framework/motion/compile.ts';
import {drawing} from '../src/framework/motion/geometry.ts';
import {motionSvg, motionReport} from '../src/framework/motion/export.ts';
import {motionV2Schema} from '../src/framework/motion/schema.ts';
import {pipeline} from '../clients/motion-reference/pipeline.ts';
import {choreography} from '../clients/motion-reference/choreography.ts';

await mkdir('.generated', {recursive: true});
const output = path.resolve('.generated/motion-rc2-gaps-test.mjs');
await build({stdin: {resolveDir: process.cwd(), loader: 'tsx', contents: `
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
export * as react from './src/framework/motion/react.ts';
import {SourceReader} from './src/framework/evidence/react.ts';
export {scrollToSourceLine} from './src/framework/evidence/react.ts';
export const reader = props => renderToStaticMarkup(createElement(SourceReader, props));
`}, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', alias: {'@vizforge': path.resolve('.upstream/vizforge/src')}, plugins: [nodeValidationStyles()], logLevel: 'silent'});
const {react, reader, scrollToSourceLine} = await import(pathToFileURL(output).href);

/** A small v2 scene: one container whose centre is deeper than the token resting on its front corner. */
function scene(extra = {}) {
  return structuredClone({
    format: 'datapass.motion', version: 2, title: 'Gap scene', description: 'Runtime-built scene.', provenance: 'recorded', note: 'Recorded values.',
    entities: [
      {id: 'shelf', kind: 'station', label: 'Shelf', description: 'Container.', position: [2, 2, 0], size: [3, 3, .2], color: '#9fbccc', evidence: []},
      {id: 'dock', kind: 'station', label: 'Dock', description: 'Origin.', position: [-4, 0, 0], size: [1, 1, .2], color: '#8fb6a8', evidence: []},
      {id: 'value', kind: 'token', label: '1.0', description: 'A value.', at: 'dock', size: .4, color: '#3d7d9c', evidence: []},
    ],
    links: [],
    steps: [
      {id: 'a', title: 'Start', caption: 'Start.', focus: 'none', holdMs: 1000, transitionMs: 0, commands: [], activeLinks: [], evidence: []},
      {id: 'b', title: 'Rest on shelf', caption: 'Token on the shelf front corner.', focus: 'value', holdMs: 1200, transitionMs: 600,
        commands: [{type: 'move', entity: 'value', position: [1, 1, .2]}, {type: 'label', entity: 'value', text: '0.5'}], activeLinks: [], evidence: []},
      {id: 'c', title: 'Relabel late', caption: 'Label switches at the end of its window.', focus: 'value', holdMs: 1200, transitionMs: 600,
        commands: [{type: 'label', entity: 'value', text: '0.25', timing: {startMs: 0, endMs: 600, easing: 'linear'}}], activeLinks: [], evidence: []},
    ],
    sources: [], ...extra,
  });
}
function scheduler() {let id = 0; const jobs = new Map(); return {jobs, set(fn, delay) {const h = ++id; jobs.set(h, {fn, delay}); return h;}, clear(h) {jobs.delete(h);}, tick() {const [k, j] = jobs.entries().next().value || []; if (j) {jobs.delete(k); j.fn();}}};}

test('gap 1: motion/react.ts exports createMotionController for runtime-built specs', () => {
  assert.equal(typeof react.createMotionController, 'function');
  assert.equal(typeof react.MotionViewport, 'function');
  const c = react.createMotionController(scene(), false, scheduler());
  assert.equal(c.compiled.frames.length, 3); assert.equal(c.player.getState().index, 0); c.player.dispose();
});

test('gap 2: provenance "recorded" is accepted on v2 only; v1 and unknown kinds still fail closed', () => {
  assert.equal(validateMotion(scene()).provenance, 'recorded');
  assert.equal(validateMotion(pipeline).provenance, pipeline.provenance);
  assert.throws(() => validateMotion({...structuredClone(pipeline), provenance: 'recorded'}), /authored or recorded/);
  assert.throws(() => validateMotion(scene({provenance: 'live'})), /not a live trace/);
  assert.deepEqual(motionV2Schema.properties.provenance.enum, ['synthetic', 'authored', 'recorded']);
  const compiled = compileMotion(scene());
  assert.match(motionSvg(compiled, 1, 'diagram'), /Snapshot of a recorded trace/);
  assert.match(motionReport(compiled, 1, 'diagram'), /recorded trace, authored presentation/);
});

test('gap 3: a label command changes the displayed label in place, keeps identity and respects its window', () => {
  const compiled = compileMotion(scene());
  assert.deepEqual(compiled.frames.map(f => f.poses.value.label), ['1.0', '0.5', '0.25']);
  assert.equal(drawing(compiled, compiled.frames[1], 'diagram').objects.find(o => o.id === 'value').labelLines[0], '0.5');
  const mid = interpolateFrame(compiled.frames[1], compiled.frames[2], .5), end = interpolateFrame(compiled.frames[1], compiled.frames[2], 1);
  assert.equal(mid.value.label, '0.5'); assert.equal(end.value.label, '0.25');
  // v1 cannot use it, the same property cannot be written twice, and the text is bounded.
  const v1 = structuredClone(pipeline); v1.steps[0].commands.push({type: 'label', entity: v1.entities[0].id, text: 'x'});
  assert.throws(() => validateMotion(v1), /Unsupported motion command|Unexpected|motion command/);
  const twice = scene(); twice.steps[1].commands.push({type: 'label', entity: 'value', text: 'again'});
  assert.throws(() => validateMotion(twice), /Multiple writes/);
  const long = scene(); long.steps[1].commands[1].text = 'x'.repeat(81);
  assert.throws(() => validateMotion(long));
  // Existing scenes are unchanged: every pose label is the entity label.
  const ref = compileMotion(choreography), labels = new Map(choreography.entities.map(e => [e.id, e.label]));
  for (const frame of ref.frames) for (const [id, pose] of Object.entries(frame.poses)) assert.equal(pose.label, labels.get(id));
});

test('gap 4: a token resting on a container top is drawn above it even when the container centre is deeper', () => {
  const compiled = compileMotion(scene());
  for (const mode of ['diagram', 'isometric']) {
    const order = drawing(compiled, compiled.frames[1], mode).objects.map(o => o.id);
    assert.ok(order.indexOf('value') > order.indexOf('shelf'), mode + ': ' + order.join(','));
  }
  // Not on top (beside the shelf, at the floor): plain x+y depth order is kept.
  const beside = scene(); beside.steps[1].commands[0].position = [0, 0, 0];
  const order = drawing(compileMotion(beside), compileMotion(beside).frames[1], 'diagram').objects.map(o => o.id);
  assert.ok(order.indexOf('value') < order.indexOf('shelf'));
});

test('gap 5: playback speed scales the StoryPlayer clock deterministically, never the snapshot', () => {
  const at = speed => {const s = scheduler(), c = react.createMotionController(pipeline, false, s, {speed}); c.play(); const d = [...s.jobs.values()][0].delay; s.tick(); const r = {delay: d, next: [...s.jobs.values()][0].delay, index: c.player.getState().index, scene: c.player.getScene().id}; c.player.dispose(); return r;};
  const one = at(1), two = at(2), half = at(.5);
  assert.deepEqual([one.delay, one.next], [2600, 2800]);
  assert.deepEqual([two.delay, two.next], [1300, 1400]);
  assert.deepEqual([half.delay, half.next], [5200, 5600]);
  assert.equal(two.index, one.index); assert.equal(two.scene, one.scene);
  const s = scheduler(), c = react.createMotionController(pipeline, false, s);
  assert.equal(c.getSpeed(), 1); c.setSpeed(2); c.play(); assert.equal([...s.jobs.values()][0].delay, 1300); assert.equal(s.jobs.size, 1);
  assert.throws(() => c.setSpeed(0)); assert.throws(() => c.setSpeed(Infinity)); assert.throws(() => react.createMotionController(pipeline, false, s, {speed: 10}));
  c.player.dispose();
});

test('gap 6: SourceReader renders clickable lines, marks the current line and keeps the default unchanged', () => {
  const sources = [{id: 'snippet', path: 'a.py', language: 'python', title: 'a.py', text: 'x = 1\ny = 2\nz = 3\n', provenance: 'provided'}];
  const plain = reader({sources, selected: 'snippet', onSelect() {}});
  assert.doesNotMatch(plain, /<button[^>]*source-line-button/); assert.match(plain, /Source file/); assert.match(plain, /not a fetched repository file/);
  const html = reader({sources, selected: 'snippet', onSelect() {}, compact: true, currentLine: 2, onLineClick() {}, lineInfo: line => line === 3 ? {disabled: true, label: 'did not run'} : {badge: line + 'x'}});
  assert.equal(html.match(/<li /g).length, html.match(/class="source-line-button"/g).length);
  assert.equal(html.match(/<button[^>]*disabled=""/g).length, 1);
  assert.match(html, /data-line="2"[^>]*data-current="true"/);
  assert.match(html, /aria-current="step"/); assert.match(html, /disabled=""[^>]*aria-label="did not run"|aria-label="did not run"[^>]*disabled/);
  assert.doesNotMatch(html, /Source file|not a fetched repository file/);
  // Scroll API: only the reader container scrolls, and only when the line is out of view.
  const row = {offsetHeight: 20, getBoundingClientRect: () => ({top: 400})};
  const box = {scrollTop: 0, clientHeight: 200, getBoundingClientRect: () => ({top: 100}), querySelector: q => q === 'li[data-line="7"]' ? row : null};
  assert.equal(scrollToSourceLine(box, 7), true); assert.equal(box.scrollTop, 300 + 20 + 24 - 200);
  assert.equal(scrollToSourceLine(box, 99), false);
});

test('gap 7: motion.css no longer forces a 440 px minimum width on narrow screens', async () => {
  const css = await readFile('src/framework/motion/motion.css', 'utf8');
  assert.doesNotMatch(css, /min-width:\s*440px/);
  assert.match(css, /\.motion-viewport svg\{[^}]*min-width:min\(440px,100%\)/);
});

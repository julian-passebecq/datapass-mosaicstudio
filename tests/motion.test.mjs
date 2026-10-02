import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMotion, motionFields, motionBlock, readMotionState, validateMotionControllers} from '../src/framework/motion/model.ts';
import {compileMotion, motionFrame, pointAlong, interpolateFrame, settledDisplay, stationAnchor} from '../src/framework/motion/compile.ts';
import {drawing, motionBounds, drawingPoints, project, shade} from '../src/framework/motion/geometry.ts';
import {motionSvg, motionReport} from '../src/framework/motion/export.ts';
import {planCapabilities} from '../src/framework/capabilities.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {pipeline} from '../clients/motion-reference/pipeline.ts';
import {modules} from '../clients/motion-reference/modules.ts';
import app from '../clients/motion-reference/app.ts';
const clone = () => structuredClone(pipeline);
const definition = () => ({...app, manifest: structuredClone(app.manifest), resources: structuredClone(app.resources)});
const block = app.manifest.pages[0].sections[0].blocks[0];

test('two unrelated pedagogical clients use one validated motion contract', () => {
  for (const spec of [pipeline, modules]) {const compiled = compileMotion(spec); assert.equal(compiled.frames.length, 5); assert.equal(compiled.frames.at(-1).index, 4);}
});
test('validation clones source and compiled snapshots are immutable', () => {
  const source = clone(), valid = validateMotion(source), compiled = compileMotion(source);
  source.entities[0].label = 'Changed'; assert.notEqual(valid.entities[0].label, 'Changed');
  assert.throws(() => {compiled.frames[0].poses.capture.position[0] = 100;});
  assert.ok(Object.isFrozen(compiled.spec.sources));
});
test('compile does not mutate the authored document', () => {const source = clone(), before = JSON.stringify(source); compileMotion(source); assert.equal(JSON.stringify(source), before);});
test('cumulative target state is independent of frame visitation order', () => {
  const compiled = compileMotion(pipeline), last = JSON.stringify(motionFrame(compiled, 4));
  for (const i of [0, 3, 1, 4, 2, 0]) motionFrame(compiled, i);
  assert.equal(JSON.stringify(motionFrame(compiled, 4)), last);
  assert.deepEqual(compiled.frames[4].poses.batch.position, [8, 0, .68]);
  assert.equal(compiled.frames[4].poses.capture.status, 'complete');
});
test('forward transfer retains token identity and declares its exact world route', () => {
  const compiled = compileMotion(pipeline), [from, to] = compiled.frames;
  assert.deepEqual(to.routes.batch[0], from.poses.batch.position);
  assert.deepEqual(to.routes.batch.at(-1), to.poses.batch.position);
  assert.deepEqual(Object.keys(to.poses).sort(), Object.keys(from.poses).sort());
});
test('explicit route points remain in the deferred-import transfer', () => {
  const compiled = compileMotion(modules); assert.equal(compiled.frames[3].routes.package.length, 4);
  assert.deepEqual(compiled.frames[3].routes.package[1], [0, 3, .78]);
});
test('invalid origins cannot teleport a token into a narrated transfer', () => {
  const source = clone(); source.steps[1].commands[0].link = 'publish'; assert.throws(() => compileMotion(source), /origin/);
});
test('moving a transfer endpoint in the same step is rejected', () => {
  const source = clone(); source.steps[1].commands.push({type: 'move', entity: 'quality', position: [8, 5, 0]}); assert.throws(() => compileMotion(source), /ambiguous/);
});
test('multiple position writes cannot hide ordering ambiguities in a single step', () => {
  const source = clone(); source.steps[1].commands.push({type: 'move', entity: 'batch', position: [1, 1, 1]}); assert.throws(() => validateMotion(source), /Multiple writes/);
});
test('multiple status writes cannot silently overwrite a step', () => {
  const source = clone(); source.steps[0].commands.push({type: 'state', entity: 'capture', value: 'complete'}); assert.throws(() => validateMotion(source), /Multiple writes/);
});
test('hidden objects stay inspectable in canonical snapshots without changing identity', () => {
  const source = clone(); source.steps[4].commands.push({type: 'visibility', entity: 'batch', visible: false});
  const compiled = compileMotion(source); assert.equal(compiled.frames[4].poses.batch.visible, false);
  assert.equal(settledDisplay(compiled.frames[4]).batch.alpha, 0);
});
test('status remains the previous authored state until a transition completes', () => {
  const c = compileMotion(pipeline); assert.equal(interpolateFrame(c.frames[0], c.frames[1], .5).quality.status, 'idle');
  assert.equal(interpolateFrame(c.frames[0], c.frames[1], 1).quality.status, 'active');
});
test('interpolation endpoints match canonical poses exactly', () => {
  const c = compileMotion(pipeline);
  assert.deepEqual(interpolateFrame(c.frames[0], c.frames[1], 0).batch.position, c.frames[0].poses.batch.position);
  assert.deepEqual(interpolateFrame(c.frames[0], c.frames[1], 1).batch.position, c.frames[1].poses.batch.position);
  assert.deepEqual(interpolateFrame(c.frames[0], c.frames[1], .5).batch.position, [2, 0, .68]);
});
test('path interpolation uses segment length rather than arbitrary vertex count', () => {
  assert.deepEqual(pointAlong([[0, 0, 0], [1, 0, 0], [1, 3, 0]], .5), [1, 1, 0]);
  assert.deepEqual(pointAlong([[1, 2, 3], [1, 2, 3]], .5), [1, 2, 3]);
  assert.deepEqual(pointAlong([[0, 0, 0], [0, 0, 0], [2, 0, 0]], .5), [1, 0, 0]);
});
test('invalid path fractions and frame indices are rejected', () => {
  const c = compileMotion(pipeline);
  for (const value of [-1, .5, 5, NaN, Infinity]) assert.throws(() => motionFrame(c, value));
  for (const fraction of [-1, 2, NaN]) assert.throws(() => pointAlong([[0, 0, 0]], fraction));
  assert.throws(() => pointAlong([], .5)); assert.throws(() => pointAlong([[0, Infinity, 0]], .5));
});
test('isometric and diagram are projections of the same world coordinates', () => {
  assert.deepEqual(project([1, 2, 3], 'diagram'), [74, 32]);
  assert.deepEqual(project([1, 2, 3], 'isometric'), [-48, -69]);
  assert.throws(() => project([1, 2, 3], 'webgl'));
});
test('both projected drawings retain the same object and connection IDs', () => {
  const c = compileMotion(pipeline), a = drawing(c, c.frames[1], 'diagram'), b = drawing(c, c.frames[1], 'isometric');
  assert.deepEqual(a.objects.map(o => o.id).sort(), b.objects.map(o => o.id).sort());
  assert.equal(a.objects[0].faces.length, 1); assert.equal(b.objects[0].faces.length, 3);
  assert.deepEqual(a.links.map(l => l.id), b.links.map(l => l.id));
});
test('stable projection bounds include every frame and line label', () => {
  for (const mode of ['diagram', 'isometric']) {
    const c = compileMotion(pipeline), b = motionBounds(c, mode);
    for (const frame of c.frames) for (const [x, y] of drawingPoints(drawing(c, frame, mode))) {
      assert.ok(x >= b.x && x <= b.x + b.width); assert.ok(y >= b.y && y <= b.y + b.height);
    }
  }
});
test('color adaptation clamps components and rejects non-color payloads', () => {
  assert.equal(shade('#000000', 1), '#ffffff'); assert.equal(shade('#ffffff', -1), '#000000');
  assert.throws(() => shade('url(javascript:evil)', 1));
});
test('unknown or executable top-level fields are rejected', () => {
  for (const mutate of [s => s.html = '<script/>', s => s.onStep = 'run()', s => s.format = 'other', s => s.provenance = 'live']) {
    const source = clone(); mutate(source); assert.throws(() => validateMotion(source));
  }
});
test('identity, anchor and color constraints reject coercion and duplicates', () => {
  for (const mutate of [s => s.entities.push(s.entities[0]), s => s.entities[0].id = 'none', s => s.entities[0].id = ['capture'], s => s.entities.at(-1).at = 'batch', s => s.entities[0].color = 'red']) {
    const source = clone(); mutate(source); assert.throws(() => validateMotion(source));
  }
});
test('shape positions, dimensions and token budgets are bounded', () => {
  for (const mutate of [s => s.entities[0].position[0] = Infinity, s => s.entities[0].size[0] = 0, s => s.entities[0].size[0] = 9, s => s.entities.at(-1).size = 5, s => s.entities[0].kind = 'iframe']) {
    const source = clone(); mutate(source); assert.throws(() => validateMotion(source));
  }
});
test('links require exact distinct station endpoints and bounded routes', () => {
  for (const mutate of [s => s.links[0].from = 'batch', s => s.links[0].from = 'quality', s => s.links[0].to = ['quality'], s => s.links[0].via = Array.from({length: 9}, () => [0, 0, 0]), s => s.links.push(s.links[0])]) {
    const source = clone(); mutate(source); assert.throws(() => validateMotion(source));
  }
});
test('step pacing leaves time for the visual transition', () => {
  const s = clone(); s.steps[1].holdMs = 800; assert.throws(() => validateMotion(s), /leave time/);
});
test('step identities, focus and links reject unknown references', () => {
  for (const mutate of [s => s.steps.push(s.steps[0]), s => s.steps[0].focus = 'missing', s => s.steps[0].activeLinks = ['missing'], s => s.steps[0].activeLinks = ['ingest', 'ingest']]) {
    const source = clone(); mutate(source); assert.throws(() => validateMotion(source));
  }
});
test('commands are a closed grammar without event or execution callbacks', () => {
  for (const command of [{type: 'eval', entity: 'batch', code: 'bad()'}, {type: 'transfer', entity: 'quality', link: 'ingest'}, {type: 'state', entity: 'batch', value: ['active']}, {type: 'visibility', entity: 'batch', visible: 'true'}, {type: 'move', entity: 'batch', position: [100, 0, 0]}]) {
    const source = clone(); source.steps[0].commands.push(command); assert.throws(() => validateMotion(source));
  }
});
test('numeric and structural scene budgets are enforced', () => {
  const s = clone(); s.steps = Array.from({length: 65}, (_, i) => ({...s.steps[0], id: 'step-' + i})); assert.throws(() => validateMotion(s));
  const s2 = clone(); s2.entities = Array.from({length: 41}, (_, i) => ({...s2.entities[0], id: 'node-' + i})); assert.throws(() => validateMotion(s2));
});
test('world coordinate origins cannot be interpreted as executable source', () => {
  const s = clone(); s.sources[0].text = 'globalThis.motionDidRun = true;\n# inert\n# inert\n# inert';
  compileMotion(s); assert.equal(globalThis.motionDidRun, undefined);
});
test('runtime integration validates control bounds and source-derived choices', () => {
  const d = definition(); d.manifest.fields.find(f => f.id === block.step).max = 100; assert.throws(() => new SiteRuntime(d), /bounds mismatch/);
  const e = definition(); e.manifest.fields.find(f => f.id === block.selection).options.push({value: 'extra', label: 'Extra'}); assert.throws(() => new SiteRuntime(e), /choices mismatch/);
});
test('reusing one resource with a different control tuple is rejected', () => {
  const d = definition(); d.manifest.fields.push({...d.manifest.fields[0], id: 'other-index'});
  d.manifest.pages[0].sections[0].blocks.push({...block, id: 'other-motion', step: 'other-index'});
  assert.throws(() => new SiteRuntime(d), /coherent control set/);
});
test('a second original-player owner cannot drive the motion index', () => {
  const d = definition(); d.resources.stories = {other: {indexField: block.step, spec: {}, cues: {}}};
  assert.throws(() => validateMotionControllers(d), /Conflicting/);
});
test('story cue writes to an independently controlled motion step are rejected', () => {
  const d = definition(); d.resources.stories = {other: {indexField: 'independent', spec: {}, cues: {one: {[block.step]: 1}}}};
  assert.throws(() => validateMotionControllers(d), /independently controlled/);
});
test('motion uses only its own capability, not Three or a data workbench', () => {assert.deepEqual(planCapabilities(app).capabilities, ['motion']);});
test('saved view values contain identities and indices, not source code or compiled geometry', () => {
  const r = new SiteRuntime(app); r.patch({[block.step]: 2, [block.selection]: 'quality', [block.panel]: 'source', [block.source]: 'validation'});
  const saved = r.save('flow'), text = JSON.stringify(saved); assert.ok(!text.includes('def validate_rows')); assert.ok(!text.includes('position'));
  r.reset(); r.restore(saved); const state = readMotionState(block, r.getSnapshot().values);
  assert.equal(state.step, 2); assert.equal(state.selection, 'quality'); assert.equal(state.source, 'validation');
});
test('invalid restored step leaves values, revision and current context unchanged', () => {
  const r = new SiteRuntime(app), before = r.getSnapshot(), saved = r.save('flow'); saved.values[block.step] = 999;
  assert.throws(() => r.restore(saved)); assert.equal(r.getSnapshot(), before);
});
test('source file and projection are constrained by declared choices', () => {
  const r = new SiteRuntime(app); assert.throws(() => r.set(block.source, 'secret')); assert.throws(() => r.set(block.projection, 'webgl'));
});
test('SVG uses canonical geometry and includes no source excerpts', () => {
  const c = compileMotion(pipeline), svg = motionSvg(c, 1, 'isometric');
  assert.ok(svg.startsWith('<svg')); assert.ok(svg.includes('SYNTHETIC')); assert.ok(!svg.includes('def validate_rows'));
  assert.equal((svg.match(/data-entity=/g) || []).length, c.spec.entities.length); assert.ok(!svg.includes('foreignObject'));
});
test('SVG and HTML escape markup in labels, captions and source text', () => {
  const s = clone(); s.entities[0].label = '<script>evil()</script>'; s.title = '<img src=x onerror=evil()>';
  s.sources[0].text = '<script>bad()</script>\n# inert\n# inert\n# inert';
  const c = compileMotion(s), svg = motionSvg(c, 1, 'diagram'), html = motionReport(c, 1, 'diagram', true);
  assert.ok(!svg.includes('<script')); assert.ok(!html.includes('<script')); assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img')); assert.ok(svg.includes('&lt;script&gt;'));
});
test('script-free HTML excludes source by default and includes referenced lines only by choice', () => {
  const c = compileMotion(pipeline), safe = motionReport(c, 1, 'diagram'), source = motionReport(c, 1, 'diagram', true);
  assert.ok(safe.includes("default-src 'none'")); assert.ok(!safe.includes('def validate_rows'));
  assert.ok(source.includes('def validate_rows')); assert.ok(source.includes('included by explicit choice'));
  assert.throws(() => motionReport(c, 1, 'diagram', 'yes'));
});
test('helpers generate view-only fields with source-owned bounds and identities', () => {
  const fields = motionFields(pipeline, 'flow'); assert.equal(fields.length, 5); assert.ok(fields.every(f => f.role === 'view'));
  assert.equal(motionBlock('b', 'resource', 'flow').step, 'flow-step');
});

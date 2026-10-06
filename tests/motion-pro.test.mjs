import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateMotion, motionStepEvidence} from '../src/framework/motion/model.ts';
import {compileMotion, interpolateFrame, settledDisplay} from '../src/framework/motion/compile.ts';
import {timingProgress} from '../src/framework/motion/timing.ts';
import {migrateMotion} from '../src/framework/motion/migrate.ts';
import {drawing, motionBounds, project} from '../src/framework/motion/geometry.ts';
import {motionSvg, motionReport} from '../src/framework/motion/export.ts';
import {motionSchema} from '../src/framework/json-schema.ts';
import {motionV2Schema} from '../src/framework/motion/schema.ts';
import {choreography} from '../clients/motion-reference/choreography.ts';
import {pipeline} from '../clients/motion-reference/pipeline.ts';
import {modules} from '../clients/motion-reference/modules.ts';
const clone = () => structuredClone(choreography);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test('v2 compiles two independent lanes without mutating the authored source', () => {
  const original = JSON.stringify(choreography), c = compileMotion(choreography);
  assert.equal(c.frames.length, 4); assert.equal(c.spec.version, 2);
  assert.equal(JSON.stringify(choreography), original); assert.ok(Object.isFrozen(c.frames[1].timings));
});
test('timing windows clamp outside bounds and implement exact cuts', () => {
  const window = {startMs: 100, endMs: 500, easing: 'linear'};
  assert.equal(timingProgress(window, 0), 0); assert.equal(timingProgress(window, 300), .5); assert.equal(timingProgress(window, 900), 1);
  assert.equal(timingProgress({...window, endMs: 100}, 99), 0); assert.equal(timingProgress({...window, endMs: 100}, 100), 1);
  assert.equal(timingProgress({...window, startMs: 0, endMs: 0}, 0), 1);
});
test('cubic timing is monotonic, bounded and symmetric', () => {
  const timing = {startMs: 0, endMs: 1000, easing: 'cubic-in-out'}; let previous = 0;
  for (let t = 0; t <= 1000; t += 10) {const p = timingProgress(timing, t); assert.ok(p >= previous && p <= 1); near(p + timingProgress(timing, 1000 - t), 1); previous = p;}
  near(timingProgress(timing, 250), .0625);
});
test('first lane moves while the second waits; state cuts are exact', () => {
  const {frames: [from, to]} = compileMotion(choreography);
  const early = interpolateFrame(from, to, .2); near(early['record-a'].position[0], 3); near(early['record-b'].position[0], 0);
  assert.equal(early['review-a'].status, 'idle');
  const firstEnd = interpolateFrame(from, to, .4); near(firstEnd['record-a'].position[0], 6); assert.equal(firstEnd['review-a'].status, 'complete');
  near(interpolateFrame(from, to, .7)['record-b'].position[0], 3);
  assert.equal(interpolateFrame(from, to, 1)['review-b'].status, 'complete');
});
test('visibility windows do not share position progress', () => {
  const c = compileMotion(choreography), d = interpolateFrame(c.frames[1], c.frames[2], .75);
  assert.equal(d['record-a'].alpha, 0); near(d['record-b'].alpha, .5); near(d['record-b'].position[0], 6);
  assert.equal(interpolateFrame(c.frames[1], c.frames[2], 1)['record-b'].visible, false);
});
test('v1 migration is explicit, immutable and preserves every settled pose', () => {
  for (const old of [pipeline, modules]) {
    const before = JSON.stringify(old), next = migrateMotion(old, 2), a = compileMotion(old), b = compileMotion(next);
    assert.equal(JSON.stringify(old), before); assert.equal(next.version, 2);
    a.frames.forEach((frame, i) => assert.deepEqual(settledDisplay(frame), settledDisplay(b.frames[i])));
    for (let i = 1; i < a.frames.length; i++) for (const t of [0, .2, .5, .8, 1]) {
      const eased = timingProgress({startMs: 0, endMs: 1000, easing: 'cubic-in-out'}, t * 1000);
      const left = interpolateFrame(a.frames[i - 1], a.frames[i], eased), right = interpolateFrame(b.frames[i - 1], b.frames[i], t);
      for (const id of Object.keys(left)) {left[id].position.forEach((n, k) => near(n, right[id].position[k])); near(left[id].alpha, right[id].alpha); assert.equal(left[id].status, right[id].status);}
    }
  }
});
test('v2 migration is idempotent and refuses downgrade or unknown versions', () => {
  assert.deepEqual(migrateMotion(choreography, 2), choreography);
  assert.throws(() => migrateMotion(choreography, 1)); assert.throws(() => migrateMotion({...choreography, version: 3}, 2));
});
test('v1 rejects v2 timing and annotations instead of silently discarding them', () => {
  const withTiming = structuredClone(pipeline); withTiming.steps[1].commands[0].timing = {startMs: 0, endMs: 300, easing: 'linear'};
  assert.throws(() => validateMotion(withTiming));
  const withNotes = structuredClone(pipeline); withNotes.steps[0].annotations = []; assert.throws(() => validateMotion(withNotes));
});
for (const [name, edit] of Object.entries({
  'negative time': s => s.steps[1].commands[0].timing.startMs = -1,
  'fractional time': s => s.steps[1].commands[0].timing.endMs = 300.5,
  'infinite time': s => s.steps[1].commands[0].timing.endMs = Infinity,
  'reversed window': s => {s.steps[1].commands[0].timing.startMs = 700;},
  'window outside step': s => s.steps[1].commands[0].timing.endMs = 1700,
  'unrecognized easing': s => s.steps[1].commands[0].timing.easing = 'spring',
  'callback field': s => s.steps[1].commands[0].timing.onEnd = 'alert(1)',
  'unknown annotation entity': s => s.steps[1].annotations[0].entity = 'missing',
  'duplicate annotation ID': s => s.steps[1].annotations.push(structuredClone(s.steps[1].annotations[0])),
  'annotation overflow': s => s.steps[1].annotations = Array.from({length: 7}, (_, i) => ({...s.steps[1].annotations[0], id: 'note-' + i})),
  'annotation text overflow': s => s.steps[1].annotations[0].text = 'x'.repeat(161),
  'nonfinite annotation offset': s => s.steps[1].annotations[0].offset[0] = NaN,
  'unbounded annotation offset': s => s.steps[1].annotations[0].offset[0] = 281,
  'missing annotation source': s => s.steps[1].annotations[0].evidence[0].artifact = 'absent',
  'invalid annotation source range': s => s.steps[1].annotations[0].evidence[0].end = 999,
  'executable annotation field': s => s.steps[1].annotations[0].html = '<script>bad()</script>',
})) test('v2 boundary refuses ' + name, () => {const spec = clone(); edit(spec); assert.throws(() => validateMotion(spec));});
test('timing sampler rejects invalid elapsed samples and malformed easing', () => {
  const w = {startMs: 0, endMs: 1000, easing: 'linear'};
  for (const time of [-1, NaN, Infinity]) assert.throws(() => timingProgress(w, time));
  assert.throws(() => timingProgress({...w, easing: 'unknown'}, 100));
});
test('annotation boxes are stable while semantic leaders follow the moving identity', () => {
  const c = compileMotion(choreography), from = c.frames[0], to = c.frames[1];
  for (const mode of ['diagram', 'isometric']) {
    const early = drawing(c, to, mode, interpolateFrame(from, to, .2)), late = drawing(c, to, mode, interpolateFrame(from, to, .7));
    const a = early.annotations.find(a => a.entity === 'record-b'), b = late.annotations.find(a => a.entity === 'record-b');
    assert.deepEqual(a.box, b.box); assert.notDeepEqual(a.anchor, b.anchor); assert.equal(a.id, b.id);
    assert.deepEqual(b.anchor, project(interpolateFrame(from, to, .7)['record-b'].position, mode));
  }
});
test('annotation boxes avoid each other and stay within both stable view bounds', () => {
  const c = compileMotion(choreography);
  for (const mode of ['diagram', 'isometric']) for (const frame of c.frames) {
    const scene = drawing(c, frame, mode), bounds = motionBounds(c, mode);
    for (const [i, a] of scene.annotations.entries()) {
      assert.ok(a.box.x >= bounds.x && a.box.y >= bounds.y);
      assert.ok(a.box.x + a.box.width <= bounds.x + bounds.width && a.box.y + a.box.height <= bounds.y + bounds.height);
      for (const b of scene.annotations.slice(i + 1)) assert.ok(a.box.x + a.box.width <= b.box.x || b.box.x + b.box.width <= a.box.x || a.box.y + a.box.height <= b.box.y || b.box.y + b.box.height <= a.box.y);
    }
  }
});
test('cached annotation geometry cannot be poisoned by a caller', () => {
  const c = compileMotion(choreography), first = drawing(c, c.frames[1], 'diagram'), saved = structuredClone(first.annotations);
  first.annotations[0].box.x = 99999; first.annotations[0].lines.push('injected');
  assert.deepEqual(drawing(c, c.frames[1], 'diagram').annotations, saved);
});
test('annotation evidence is deduplicated by source identity and exact line range', () => {
  const step = structuredClone(choreography.steps[1]); step.evidence = structuredClone(step.annotations[0].evidence);
  assert.equal(motionStepEvidence(step).length, 1);
});
test('static exports retain annotations but do not include source implicitly', () => {
  const c = compileMotion(choreography), vector = motionSvg(c, 1, 'isometric'), report = motionReport(c, 1, 'diagram');
  assert.ok(vector.includes('data-annotation="first-lane"')); assert.ok(vector.includes('data-anchor="record-b"'));
  assert.ok(report.includes('Lane A settles before lane B begins.'));
  assert.ok(!report.includes('illustrative_quality_rule')); assert.ok(motionReport(c, 1, 'diagram', true).includes('illustrative_quality_rule'));
  assert.ok(!report.includes('<script')); assert.ok(report.includes("default-src 'none'"));
});
test('annotation text remains inert in SVG and reports', () => {
  const spec = clone(); spec.steps[1].annotations[0].text = '<script>alert("x")</script>';
  const c = compileMotion(spec);
  for (const result of [motionSvg(c, 1, 'diagram'), motionReport(c, 1, 'diagram')]) {assert.ok(!result.includes('<script>')); assert.ok(result.includes('&lt;script&gt;'));}
});
test('new generated schema matches source and keeps v1 closed and unchanged', async() => {
  assert.equal((await readFile('docs/contracts/motion-v2.schema.json', 'utf8')).replace(/\r\n/g, '\n'), JSON.stringify(motionV2Schema, null, 2) + '\n');
  assert.equal(motionSchema.properties.version.const, 1); assert.ok(!('annotations' in motionSchema.properties.steps.items.properties));
  assert.ok(!motionV2Schema.properties.steps.items.required.includes('annotations'));
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {const [file, pointer] = value.$ref.split('#'); let target = file ? motionSchema : motionV2Schema; for (const part of pointer.slice(1).split('/')) target = target?.[part]; assert.notEqual(target, undefined, value.$ref);}
    Object.values(value).forEach(visit);
  }; visit(motionV2Schema);
});

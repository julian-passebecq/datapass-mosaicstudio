import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateArtifact} from '../src/framework/foundation/artifact.ts';
import {compileMotion} from '../src/framework/motion/compile.ts';
import {parseTrace, stepView, labMotion, lineSteps, nextStepAtLine, writtenNames, loopExhausted, SPEEDS} from '../clients/animated-coding-lab/trace.ts';

const dir = 'clients/animated-coding-lab/public';
const SNIPPET = 'py/examples/normalize_rows.py';
const load = async () => validateArtifact(JSON.parse(await readFile(dir + '/artifacts/coding-lab-trace.json', 'utf8')));
const source = () => readFile(dir + '/sources/' + SNIPPET + '.txt', 'utf8');
const python = ['python', 'python3', 'py'].find(cmd => spawnSync(cmd, ['--version'], {encoding: 'utf8'}).status === 0);

test('committed trace: published source equals the traced file, and every row matches its exact source line', async () => {
  assert.equal((await source()).replace(/\r\n/g, '\n'), (await readFile(SNIPPET, 'utf8')).replace(/\r\n/g, '\n'));
  const trace = parseTrace(await load(), SNIPPET, await source());
  assert.equal(trace.steps.length, 31);
  for (const s of trace.steps) assert.equal(s.code, trace.lines[s.line - 1].trim());
  assert.deepEqual(trace.steps.filter(s => s.event === 'return').map(s => s.returned), [0, .5, .25, 1]);
  assert.equal(trace.steps.at(-1).vars.mean, .438);
  assert.match((await load()).provenance.runId, /^trace-[0-9a-f]{12}$/);
});

test('trace validation rejects tampered or inconsistent rows', async () => {
  const artifact = await load(), text = await source();
  const variant = edit => {const copy = structuredClone(artifact); edit(copy.payload.rows, copy.payload); return copy;};
  const cases = [
    [rows => {rows[3].code = 'results = [1]';}, /code differs/],
    [rows => {rows[3].line = 99;}, /outside/],
    [rows => {rows[3].step = 7;}, /out of order/],
    [rows => {rows[3].event = 'jump';}, /unknown event/],
    [rows => {rows[3].vars = '{bad';}, /valid JSON/],
    [rows => {rows[3].vars = '{"x":{"y":1}}';}, /scalar/],
    [rows => {rows[3].changed = 'ghost';}, /missing variable/],
    [rows => {rows[3].returned = '1';}, /without a return event/],
    [rows => {rows[6].line = 9; rows[6].code = text.split('\n')[8].trim();}, /def line/],
    [(rows, payload) => {payload.rowKey = 'line';}, /columns/],
    [(rows, payload) => {payload.rows = [];}, /steps required/],
  ];
  for (const [edit, error] of cases) assert.throws(() => parseTrace(variant(edit), SNIPPET, text), error);
  assert.throws(() => parseTrace(artifact, SNIPPET, text.replace('rows = [', 'rowz = [')), /code differs/);
});

test('step -> state is pure: any visiting order gives identical views and motion frames', async () => {
  const trace = parseTrace(await load(), SNIPPET, await source());
  const forward = trace.steps.map((_, i) => JSON.stringify(stepView(trace, i)));
  const order = trace.steps.map((_, i) => i).reverse().concat([13, 2, 27, 13]);
  for (const i of order) assert.equal(JSON.stringify(stepView(trace, i)), forward[i]);
  const a = compileMotion(labMotion(trace, '1')), b = compileMotion(labMotion(trace, '1'));
  assert.deepEqual(a.frames, b.frames);
  for (const speed of SPEEDS) {
    const c = compileMotion(labMotion(trace, speed));
    assert.equal(c.frames.length, trace.steps.length);
    assert.deepEqual(c.frames.map(f => f.poses), a.frames.map(f => f.poses), 'speed changes timing only, never the snapshot at ' + speed);
  }
  // Semantic objects: rows[i] enters normalize and is replaced by its returned value, then lands in results.
  const end = a.frames.at(-1).poses;
  for (let i = 0; i < 4; i++) {assert.equal(end['in-' + i].visible, false); assert.equal(end['out-' + i].visible, true);}
  assert.deepEqual(a.spec.entities.filter(e => e.id.startsWith('out-')).map(e => e.label), ['0.0', '0.5', '0.25', '1.0']);
  const kpi = stepView(trace, 22).kpi;
  assert.deepEqual([kpi.processed, kpi.rows, kpi.total], [3, 4, .75]);
  assert.equal(stepView(trace, 29).title, 'Loop finished');
  assert.equal(loopExhausted(trace, 5), false); assert.equal(loopExhausted(trace, 29), true);
  assert.throws(() => stepView(trace, 31), /out of range/);
});

test('line <-> step mapping', async () => {
  const trace = parseTrace(await load(), SNIPPET, await source()), map = lineSteps(trace);
  const lineOf = code => trace.lines.findIndex(l => l.trim().startsWith(code)) + 1;
  assert.deepEqual(map.get(lineOf('results.append')), [9, 15, 21, 27]);
  assert.equal(map.get(lineOf('for item')).length, 5);
  assert.equal(map.get(lineOf('def normalize')).length, 5);
  assert.equal(map.has(1), false, 'comments never run');
  assert.equal(nextStepAtLine(trace, lineOf('results.append'), 0), 9);
  assert.equal(nextStepAtLine(trace, lineOf('results.append'), 9), 15);
  assert.equal(nextStepAtLine(trace, lineOf('results.append'), 27), 9, 'wraps around');
  assert.equal(nextStepAtLine(trace, 1, 0), null);
  for (const [line, steps] of map) for (const i of steps) assert.equal(trace.steps[i].line, line);
  assert.deepEqual(writtenNames('lo, hi = min(rows), max(rows)'), ['lo', 'hi']);
  assert.deepEqual(writtenNames('total += transformed'), ['total']);
  assert.deepEqual(writtenNames('results.append(x)'), ['results']);
  assert.deepEqual(writtenNames('for item in rows:'), ['item']);
  assert.deepEqual(writtenNames('if a == b:'), []);
});

test('cross-language: a fresh sys.settrace run reproduces the committed trace rows', {skip: python ? false : 'python not on PATH'}, async () => {
  const version = spawnSync(python, ['-c', 'import sys;print(sys.version_info[0]*100+sys.version_info[1])'], {encoding: 'utf8'});
  if (Number(version.stdout) < 312) return; // line events for `for` differ before CPython 3.12
  const out = await mkdtemp(path.join(tmpdir(), 'coding-lab-'));
  try {
    const run = spawnSync(python, ['py/coding_lab_trace.py', out], {encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const fresh = validateArtifact(JSON.parse(await readFile(path.join(out, 'coding-lab-trace.json'), 'utf8')));
    assert.deepEqual(fresh.payload.rows, (await load()).payload.rows);
    assert.equal(fresh.provenance.runId, (await load()).provenance.runId);
  } finally {await rm(out, {recursive: true, force: true});}
});

// FR-05: the coding explanation and the architecture walkthrough share one selection across views and reset atomically.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateArtifact} from '../src/framework/foundation/artifact.ts';
import {compileMotion} from '../src/framework/motion/compile.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';
import {validateManifest} from '../src/framework/validate.ts';
import {demoArchitecture} from '../src/architecture/demo.ts';
import {parseTrace, labMotion, rowSteps, relatedSteps, LAB_SELECTIONS} from '../clients/animated-coding-lab/trace.ts';
import {loadClient} from '../scripts/load-client.mjs';
import architecture from '../clients/architecture-reference/app.ts';
import {walkthrough, walkthroughSources, WALKTHROUGH_TOKEN} from '../clients/architecture-reference/walkthrough.ts';

const SNIPPET = 'py/examples/normalize_rows.py';
const trace = async () => parseTrace(validateArtifact(JSON.parse(await readFile('clients/animated-coding-lab/public/artifacts/coding-lab-trace.json', 'utf8'))), SNIPPET, await readFile('clients/animated-coding-lab/public/sources/' + SNIPPET + '.txt', 'utf8'));

test('coding lab: each recorded row owns exactly its loop iteration, from the for visit to the running total', async () => {
  const t = await trace(), rows = rowSteps(t);
  assert.equal(rows.length, 4);
  rows.forEach((steps, i) => {
    assert.equal(t.steps[steps[0]].code, 'for item in rows:');
    assert.equal(steps.filter(s => t.steps[s].event === 'call').length, 1, 'one call per row');
    assert.equal(t.steps[steps.at(-1)].code, 'total += transformed');
    if (i) assert.equal(steps[0], rows[i - 1].at(-1) + 1);
  });
  assert.deepEqual(rows.map(steps => t.steps[steps.find(s => t.steps[s].event === 'return')].returned), [0, .5, .25, 1]);
});

test('coding lab: every motion identity is a declared selection; unknown rows relate to nothing', async () => {
  const t = await trace(), spec = compileMotion(labMotion(t)).spec;
  for (const e of spec.entities) assert.ok(LAB_SELECTIONS.includes(e.id), e.id);
  assert.deepEqual(relatedSteps(t, spec, 'row-9'), []);
  assert.deepEqual(relatedSteps(t, spec, 'none'), []);
  assert.ok(relatedSteps(t, spec, 'kpi').every(i => spec.steps[i].focus === 'kpi'));
  assert.ok(relatedSteps(t, spec, 'fn').length >= 8);
});

test('coding lab: selection is view state and reset restores every declared view default in one revision', async () => {
  const runtime = new SiteRuntime(await loadClient('animated-coding-lab'));
  runtime.applyCue({'lab-step': 12, 'lab-selection': 'row-1', 'lab-projection': 'isometric', 'lab-speed': '2'});
  assert.equal(runtime.getSnapshot().values['lab-selection'], 'row-1');
  assert.equal(Object.keys(runtime.getSnapshot().tasks).length, 0);
  assert.throws(() => runtime.set('lab-selection', 'row-99'));
  const before = runtime.getSnapshot().revision;
  const fields = runtime.manifest.fields.filter(f => f.id.startsWith('lab-'));
  runtime.applyCue(Object.fromEntries(fields.map(f => [f.id, f.default])));
  const after = runtime.getSnapshot();
  assert.equal(after.revision, before + 1);
  for (const f of fields) assert.equal(after.values[f.id], f.default);
});

test('architecture walkthrough: stations are the review nodes with the same ids, links are the declared edges', () => {
  const spec = compileMotion(walkthrough).spec;
  const stations = spec.entities.filter(e => e.kind === 'station').map(e => e.id);
  assert.deepEqual([...stations].sort(), demoArchitecture.nodes.map(n => n.id).sort());
  assert.deepEqual(spec.links.map(l => [l.from, l.to]), demoArchitecture.edges.map(e => [e.from, e.to]));
  assert.equal(spec.entities.find(e => e.id === WALKTHROUGH_TOKEN).kind, 'token');
  assert.equal(spec.provenance, 'synthetic');
});

test('architecture walkthrough: source excerpts are the literal inert text of the document', () => {
  for (const id of ['clean_events', 'site_performance']) {
    const n = demoArchitecture.nodes.find(n => n.id === id), source = walkthroughSources.find(s => s.path === n.sourcePath);
    assert.equal(source.text, n.code + '\n'); assert.equal(source.provenance, 'synthetic'); assert.equal(source.language, 'sql');
  }
  assert.equal(walkthroughSources.find(s => s.id === 'review-notes').text, demoArchitecture.notes.join('\n') + '\n');
  const spec = compileMotion(walkthrough).spec;
  assert.ok(spec.steps.some(s => s.evidence.length) && spec.entities.some(e => e.evidence.length));
});

test('architecture reference: the review canvas and the walkthrough bind one selection field; the plain review page is unchanged', () => {
  const blocks = architecture.manifest.pages.flatMap(p => p.sections.flatMap(s => s.blocks));
  const motion = blocks.find(b => b.type === 'motion'), shared = blocks.find(b => b.id === 'walkthrough-review'), plain = blocks.find(b => b.id === 'architecture');
  assert.equal(motion.selection, 'arch-selection'); assert.equal(shared.selection, 'arch-selection'); assert.equal(plain.selection, undefined);
  const options = architecture.manifest.fields.find(f => f.id === 'arch-selection').options.map(o => o.value);
  for (const n of demoArchitecture.nodes) assert.ok(options.includes(n.id), n.id);
  const runtime = new SiteRuntime(architecture);
  runtime.applyCue({'arch-step': 5, 'arch-selection': 'site_performance', 'arch-panel': 'source', 'arch-source': 'site-performance-sql'});
  const keys = ['step', 'selection', 'projection', 'panel', 'source'].map(k => 'arch-' + k);
  runtime.applyCue(Object.fromEntries(keys.map(id => [id, runtime.manifest.fields.find(f => f.id === id).default])));
  assert.deepEqual(keys.map(id => runtime.getSnapshot().values[id]), [0, 'none', 'diagram', 'scene', 'none']);
});

test('architecture block selection must name a view select field with a none option', () => {
  const base = structuredClone(architecture.manifest);
  const block = base.pages[1].sections[1].blocks[0];
  block.selection = 'missing'; assert.throws(() => validateManifest(base), /architecture.selection/);
  block.selection = 'arch-step'; assert.throws(() => validateManifest(base), /architecture.selection/);
  block.selection = 'arch-selection'; assert.doesNotThrow(() => validateManifest(base));
});

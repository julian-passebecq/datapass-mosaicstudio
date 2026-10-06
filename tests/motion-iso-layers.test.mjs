import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateMotion} from '../src/framework/motion/model.ts';
import {compileMotion} from '../src/framework/motion/compile.ts';
import {drawing, labelBounds, objectPoints, project, motionBounds} from '../src/framework/motion/geometry.ts';
import {motionSvg} from '../src/framework/motion/export.ts';
import {BUILTIN_GLYPHS, registerMotionGlyphs, motionGlyphNames, glyphShapes} from '../src/framework/motion/glyphs.ts';
import {motionV2Schema} from '../src/framework/motion/schema.ts';
import {pipeline} from '../clients/motion-reference/pipeline.ts';
import {modules} from '../clients/motion-reference/modules.ts';
import {choreography} from '../clients/motion-reference/choreography.ts';

const sha = s => createHash('sha256').update(s).digest('hex');
const station = (id, x, y, z, glyph, size = [1.4, 1.4, 1]) => ({id, kind: 'station', label: id.replace(/-/g, ' '), description: 'Station ' + id, color: '#8fa9b2', evidence: [], position: [x, y, z], size, ...(glyph ? {glyph} : {})});
/** A small layered scene: a wide lake, two floors, three domains, mixed link styles and anchors. */
function scene(overrides = {}) {
  return {
    format: 'datapass.motion', version: 2, title: 'Layered test scene', description: 'Floors, glyphs and domains.', provenance: 'synthetic', note: 'Test fixture.', sources: [],
    scene: {stationSize: 40, positionRange: 60, labels: 'attached', linkCasing: true, linkCorner: 6, header: true, background: '#f4f1ea', legend: {solid: 'data', dashed: 'control'}},
    layers: [{id: 'ground', label: 'Ground', z: 0, color: '#7fb0bb', texture: 'water'}, {id: 'first', label: 'First floor', z: 3, color: '#a7b98f'}, {id: 'second', label: 'Second floor', z: 6, color: '#d39a7c'}],
    groups: [{id: 'left', label: 'Left domain', layer: 'first', members: ['store', 'pipe'], color: '#a7b98f'}, {id: 'right', layer: 'second', members: ['report', 'people'], color: '#d39a7c'}],
    entities: [
      station('lake', 0, 1.5, 0, 'lake', [12, 8, .1]),
      station('store', -2.5, 0, 3, 'database'), station('pipe', 0, 0, 3, 'pipeline'), station('book', 2.5, 3, 3, 'notebook'),
      station('report', -2.5, 0, 6, 'report'), station('people', 0, 0, 6, 'users'), station('key', 2.5, 3, 6, 'identity'),
    ],
    links: [
      {id: 'l-lake', from: 'lake', to: 'store', label: 'Read', via: [[-2.5, 1.2, .1]], attach: {from: 'surface', to: 'side'}},
      {id: 'l-store', from: 'store', to: 'pipe', label: 'Copy', via: [[-2.5, 1.2, 3], [0, 1.2, 3]], attach: {from: 'side', to: 'side'}},
      {id: 'l-up', from: 'pipe', to: 'report', label: 'Publish', via: [[0, 1.2, 3], [-2.5, 1.2, 3], [-2.5, 1.2, 6]], attach: {from: 'side', to: 'side'}},
      {id: 'l-key', from: 'key', to: 'report', label: 'Sign in', via: [[2.5, 4.2, 6], [-2.5, 4.2, 6]], style: 'dashed', attach: {from: 'base', to: 'top'}},
    ],
    steps: [{id: 'all', title: 'Everything', caption: 'One frame.', focus: 'none', holdMs: 2000, transitionMs: 0, commands: [], activeLinks: ['l-lake', 'l-store', 'l-up'], evidence: [], annotations: []}],
    ...overrides,
  };
}
const overlap = (a, b, pad = 0) => a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
const box = points => {const xs = points.map(p => p[0]), ys = points.map(p => p[1]); return {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};};

test('specs without the new options keep their exported SVG byte for byte (snapshot hashes)', () => {
  const expected = {
    pipeline: '0a3ab29c9a0863d7984628f74330c70f21f6b6d80309473a7e0bccc4ccef76ec',
    modules: 'b2350937c5070c3edeacc88a38f54051bceff4eb7c56403115413f71e5d5a0c0',
    choreography: 'db0b9b7d041a2aa5e8799fbed760f09d541eb87aac49bf2031e1c348e7c49822',
  };
  for (const [name, spec] of Object.entries({pipeline, modules, choreography})) {
    const c = compileMotion(spec), h = createHash('sha256');
    for (const mode of ['diagram', 'isometric']) for (let i = 0; i < c.frames.length; i++) h.update(motionSvg(c, i, mode, spec.entities[0].id));
    assert.equal(h.digest('hex'), expected[name], name + ' export changed');
  }
});

test('layered scenes are deterministic: same document, same bytes, in both projections', () => {
  for (const mode of ['isometric', 'diagram']) {
    const a = motionSvg(compileMotion(scene()), 0, mode, 'pipe'), b = motionSvg(compileMotion(structuredClone(scene())), 0, mode, 'pipe');
    assert.equal(sha(a), sha(b));
  }
});

test('validation: new fields are v2-only, ordered, referenced and bounded; caps lift only through scene options', () => {
  assert.doesNotThrow(() => validateMotion(scene()));
  const bad = [
    [s => {s.version = 1;}, /unexpected fields/],
    [s => {s.layers.reverse();}, /bottom to top/],
    [s => {s.layers[1].color = 'green';}, /hex/],
    [s => {s.layers[0].texture = 'lava';}, /texture/],
    [s => {s.groups[0].members.push('ghost');}, /distinct stations/],
    [s => {s.groups[0].layer = 'attic';}, /group layer/],
    [s => {delete s.layers;}, /groups need layers/],
    [s => {s.entities[1].glyph = 'Bad Glyph';}, /invalid id/],
    [s => {s.links[0].attach.to = 'middle';}, /attach/],
    [s => {s.links[0].style = 'wavy';}, /link style/],
    [s => {delete s.scene.stationSize;}, /station size/],
    [s => {delete s.scene.positionRange; s.entities[1].position = [-45, 0, 3];}, /station position/],
    [s => {s.scene.stationSize = 99;}, /scene station size/],
    [s => {s.scene.labels = 'everywhere';}, /label placement/],
    [s => {s.scene.extra = 1;}, /unexpected fields/],
  ];
  for (const [mutate, error] of bad) {const s = scene(); mutate(s); assert.throws(() => validateMotion(s), error);}
  // A link anchored off the station top cannot carry a token transfer.
  const s = scene();
  s.entities.push({id: 'parcel', kind: 'token', label: 'Parcel', description: 'A token.', color: '#2f6f84', evidence: [], at: 'store', size: .3});
  s.steps[0].commands = [{type: 'transfer', entity: 'parcel', link: 'l-store'}];
  assert.throws(() => validateMotion(s), /cannot carry a transfer/);
  // The published v2 schema names every new field.
  for (const key of ['layers', 'groups', 'scene']) assert.ok(motionV2Schema.properties[key], key);
  assert.ok(motionV2Schema.properties.links.items.properties.attach);
});

test('layer planes: one plane per layer under its stations, labelled, water texture on request', () => {
  const c = compileMotion(scene()), d = drawing(c, c.frames[0], 'isometric'), svg = motionSvg(c, 0, 'isometric');
  assert.deepEqual(d.planes.map(p => p.id), ['ground', 'first', 'second']);
  for (const p of d.planes) {assert.equal(p.polygon.length, 4); assert.ok(svg.includes(`data-layer="${p.id}"`)); assert.ok(svg.includes(`>${p.label}</text>`));}
  assert.ok(svg.includes('id="motion-water"') && svg.includes('fill="url(#motion-water)"'));
  // Stratified paint order: the ground plane, then its stations, then the first floor plane over them.
  const at = s => svg.indexOf(s);
  assert.ok(at('data-layer="ground"') < at('data-entity="lake"') && at('data-entity="lake"') < at('data-layer="first"'));
  assert.ok(at('data-layer="first"') < at('data-entity="store"') && at('data-entity="store"') < at('data-layer="second"'));
  // Every station lies inside its plane footprint (shared extent covers all stations).
  const inside = (p, poly) => {let ok = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) ok = !ok; return ok;};
  for (const e of c.spec.entities) {const z = e.position[2], plane = d.planes[z >= 6 ? 2 : z >= 3 ? 1 : 0]; assert.ok(inside(project([e.position[0], e.position[1], z - .02], 'isometric'), plane.polygon), e.id);}
});

test('kind glyphs: every built-in draws real shapes, projects per mode, and clients extend the registry', () => {
  for (const name of ['lake', 'warehouse', 'lakehouse', 'pipeline', 'notebook', 'stream', 'semantic-model', 'report', 'api', 'queue', 'identity', 'database', 'users', 'box']) {
    assert.ok(BUILTIN_GLYPHS[name], name);
    const iso = glyphShapes(name, '#8fa9b2', [0, 0, 0], [1.4, 1.4, 1], 'isometric', project), flat = glyphShapes(name, '#8fa9b2', [0, 0, 0], [1.4, 1.4, 1], 'diagram', project);
    assert.ok(iso.shapes.length >= 2 && !iso.fallback, name + ' shapes');
    assert.ok(iso.shapes.every(s => s.kind === 'circle' ? Number.isFinite(s.r) : s.points.flat().every(Number.isFinite)), name + ' finite');
    assert.notDeepEqual(iso.shapes, flat.shapes, name + ' depends on the projection');
  }
  const crate = k => k.box(0, 0, 0, .8, .8, .5, k.color);
  registerMotionGlyphs({'test-crate': crate});
  assert.doesNotThrow(() => registerMotionGlyphs({'test-crate': crate}), 'same definition is idempotent');
  assert.throws(() => registerMotionGlyphs({'test-crate': k => crate(k)}), /already registered/);
  assert.throws(() => registerMotionGlyphs({'Bad name': crate}), /Invalid motion glyph/);
  assert.ok(motionGlyphNames().includes('test-crate'));
  const s = scene(); s.entities[3].glyph = 'test-crate'; s.entities[6].glyph = 'not-registered';
  const svg = motionSvg(compileMotion(s), 0, 'isometric');
  assert.match(svg, /data-entity="book" data-glyph="test-crate">/);
  assert.match(svg, /data-entity="key" data-glyph="not-registered" data-glyph-fallback="box"/);
  // Idle glyph stations draw no status dot; plain boxes keep theirs.
  assert.ok(!/data-entity="pipe"[^]*?<circle cx="[^"]+" cy="[^"]+" r="3"/.test(svg.slice(svg.indexOf('data-entity="pipe"'), svg.indexOf('</g>', svg.indexOf('data-entity="pipe"')))));
});

test('domains: outlined regions on their layer enclose their members; labels are optional', () => {
  const c = compileMotion(scene()), d = drawing(c, c.frames[0], 'isometric'), svg = motionSvg(c, 0, 'isometric');
  const left = d.groups.find(g => g.id === 'left'), b = box(left.polygon);
  for (const id of ['store', 'pipe']) {const p = project(c.frames[0].poses[id].position, 'isometric'); assert.ok(p[0] > b.x && p[0] < b.x + b.width && p[1] > b.y && p[1] < b.y + b.height, id);}
  assert.ok(svg.includes('data-group="left"') && svg.includes('>LEFT DOMAIN</text>'));
  assert.ok(svg.includes('data-group="right"') && !svg.includes('data-group-label="right"'));
});

test('attached labels sit beside their own station, never on another station or label', () => {
  // Dense: nine stations on one floor, close together.
  const entities = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) entities.push(station(`node-${i}-${j}`, i * 2.2, j * 2.4, 3, 'database'));
  const s = scene({entities, links: [], groups: []});
  s.steps[0].activeLinks = [];
  const c = compileMotion(s), objects = drawing(c, c.frames[0], 'isometric').objects;
  const labels = objects.map(labelBounds), shapes = objects.map(o => box(objectPoints(o)));
  for (let i = 0; i < objects.length; i++) {
    for (let j = 0; j < objects.length; j++) {
      if (i !== j) assert.ok(!overlap(labels[i], labels[j]), `labels ${objects[i].id} / ${objects[j].id}`);
      if (i !== j) assert.ok(!overlap(labels[i], shapes[j]), `label ${objects[i].id} on ${objects[j].id}`);
    }
    // Attached: touching its own station's box (within a few px), or tied to it by a leader.
    const near = overlap(labels[i], shapes[i], 12);
    assert.ok(near || objects[i].leader.length === 2, objects[i].id + ' attached or led');
  }
  assert.ok(objects.filter(o => o.leader.length === 0).length >= 7, 'most labels need no leader');
});

test('link anchors: side ends on the base outline, surface on the top of a wide station; dashed style and legend export', () => {
  const c = compileMotion(scene()), d = drawing(c, c.frames[0], 'isometric'), svg = motionSvg(c, 0, 'isometric');
  const up = d.links.find(l => l.id === 'l-up'), end = up.path.at(-1);
  assert.deepEqual(end, project([-2.5, .7, 6], 'isometric'), 'side anchor = front edge of the report footprint');
  const lake = d.links.find(l => l.id === 'l-lake');
  assert.deepEqual(lake.path[0], project([-2.5, 1.2, .1], 'isometric'), 'surface anchor = lake top under the route');
  assert.match(svg, /data-link="l-key" data-style="dashed"/);
  assert.ok(svg.includes('id="motion-arrow-dashed"') && svg.includes('data-legend=""') && svg.includes('>Layered test scene</text>'));
  // Header space is reserved above the scene.
  assert.ok(motionBounds(c, 'isometric').height > motionBounds(compileMotion({...scene(), scene: {...scene().scene, header: false}}), 'isometric').height);
});

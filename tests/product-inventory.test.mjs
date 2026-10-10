// FR-05: the product inventory (docs/PRODUCT_INVENTORY_0.9.md) is checked against the source, so a module,
// block type, family, client or engine role cannot disappear without this test failing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {modules} from '../src/core/host.ts';
import {BLOCK_TYPES} from '../src/framework/validate.ts';
import {appFamilies} from '../src/framework/capabilities.ts';

const doc = readFileSync('docs/PRODUCT_INVENTORY_0.9.md', 'utf8').replace(/\r\n/g, '\n');
/** First-column backticked ids of the markdown table that follows `heading`. */
function tableIds(heading) {
  const start = doc.indexOf(heading);
  assert.ok(start >= 0, 'inventory section missing: ' + heading);
  const rows = doc.slice(start).split('\n').slice(1);
  const ids = [];
  let inTable = false;
  for (const line of rows) {
    if (line.startsWith('|')) {inTable = true; const m = /^\|\s*`([^`]+)`/.exec(line); if (m) ids.push(m[1]); continue;}
    if (inTable) break;
    if (line.startsWith('#')) break;
  }
  return ids;
}
const read = file => readFileSync(file, 'utf8');

test('the nine workbench modules listed in the inventory are still implemented', () => {
  const listed = tableIds('## 2. Workbench modules');
  assert.equal(listed.length, 9);
  const implemented = modules.filter(m => m.status === 'implemented').map(m => m.id);
  assert.deepEqual([...listed].sort(), [...implemented].sort());
});

test('the 19 block types listed in the inventory are exactly the validated block types', () => {
  const listed = tableIds('## 3. Block types (19)');
  assert.equal(listed.length, 19);
  assert.deepEqual([...listed].sort(), [...BLOCK_TYPES].sort());
});

test('the five client families are unchanged', () => {
  const listed = tableIds('Families: ');
  assert.deepEqual(listed, appFamilies.map(f => f.id));
  assert.equal(listed.length, 5);
  for (const f of appFamilies) assert.ok(existsSync(f.guide), f.guide);
});

test('every client folder in the inventory still exists with an app entry, and none is unlisted', () => {
  const listed = tableIds('Clients in `clients/`');
  assert.ok(listed.length >= 17);
  // Tracked clients only: other tests scaffold temporary clients (ignored acceptance-* folders, engine checks) while they run.
  const folders = execFileSync('git', ['ls-files', 'clients/*/app.ts'], {encoding: 'utf8'}).split(/\r?\n/).filter(Boolean).map(file => file.split('/')[1]);
  for (const id of listed) assert.ok(folders.includes(id), 'client lost: ' + id);
  assert.deepEqual(folders.filter(id => !listed.includes(id)), [], 'client folder missing from the inventory');
});

test('D3, VizForge, ConceptMotion, Three.js, React Flow and SQLRooms keep their documented roles', () => {
  // D3 viz kit and authored motion
  assert.ok(existsSync('src/framework/viz/index.ts'));
  assert.match(read('src/framework/motion/renderer.ts'), /from 'd3/);
  // VizForge and ConceptMotion are pinned upstreams reached through aliases, never copied
  const vite = read('vite.config.ts');
  assert.match(vite, /@vizforge/); assert.match(vite, /@conceptmotion/);
  assert.match(read('src/framework/motion/controller.ts'), /@vizforge/);
  // Three.js stays in the optional spatial/model/WebGL modules
  for (const dir of ['src/framework/scene-renderer', 'src/framework/model-assets', 'src/framework/viz/webgl', 'src/framework/concept/three']) assert.ok(existsSync(dir), dir);
  // React Flow: pipeline and architecture
  for (const file of ['src/panels/Pipeline.tsx', 'src/panels/Architecture.tsx']) assert.match(read(file), /@xyflow\/react/, file);
  // SQLRooms + UWData Mosaic + DuckDB-WASM own the data workbench
  const store = read('src/store.ts');
  assert.match(store, /@sqlrooms\//); assert.match(store, /createWasmDuckDbConnector/);
  assert.match(read('src/panels/Linked.tsx'), /@uwdata\/|mosaic/i);
});

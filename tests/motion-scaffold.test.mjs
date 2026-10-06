import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {scaffoldClient} from '../scripts/scaffold-client.mjs';
import {appFamilies} from '../src/framework/capabilities.ts';

test('motion is a capability on a content starter, not another forced app family', async() => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-motion-'));
  try {
    const folder = await scaffoldClient({root, id: 'my-explanation', title: 'Original "title"', family: 'content', motion: true});
    const files = await readdir(folder); assert.ok(files.includes('motion.ts')); assert.ok(!files.includes('scene.ts')); assert.equal(appFamilies.length, 5);
    const app = await readFile(path.join(folder, 'app.ts'), 'utf8'); assert.ok(app.includes('motionFields(motion)')); assert.ok(!app.includes('motion-reference')); assert.ok(!app.includes('three'));
    await assert.rejects(() => scaffoldClient({root, id: 'my-explanation', motion: true}));
  } finally {await rm(root, {recursive: true, force: true});}
});
test('ambiguous addon flags fail before creating client files', async() => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-motion-bad-'));
  try {
    await assert.rejects(() => scaffoldClient({root, id: 'bad', motion: true, custom: 'invalid'}));
    await assert.rejects(() => scaffoldClient({root, id: 'bad', motion: true, family: 'spatial'}));
    assert.deepEqual(await readdir(root), []);
  } finally {await rm(root, {recursive: true, force: true});}
});

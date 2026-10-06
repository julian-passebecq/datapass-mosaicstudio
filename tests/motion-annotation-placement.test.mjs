import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMotion} from '../src/framework/motion/compile.ts';
import {drawing} from '../src/framework/motion/geometry.ts';
import {choreography} from '../clients/motion-reference/choreography.ts';
test('annotation collision placement respects the authored side of the anchor', () => {
  const c = compileMotion(choreography);
  for (const mode of ['diagram', 'isometric']) {
    const notes = drawing(c, c.frames[1], mode).annotations;
    const above = notes.find(a => a.id === 'first-lane'), below = notes.find(a => a.id === 'second-lane');
    assert.ok(above.box.y + above.box.height < above.anchor[1]);
    assert.ok(below.box.y > below.anchor[1]);
  }
});

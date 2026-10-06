import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';

// src/styles.css lists SQLRooms packages explicitly (static bases survive a junctioned node_modules; a wildcard does not).
test('Tailwind @source covers every installed SQLRooms package with a dist folder', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const match = css.match(/@source '\.\.\/node_modules\/@sqlrooms\/\{([^}]+)\}\/dist\/';/);
  assert.ok(match, 'styles.css must declare SQLRooms sources as one brace list of static package bases');
  assert.doesNotMatch(css, /@sqlrooms\/\*\//, 'a wildcard @sqlrooms base is skipped when node_modules is a junction');
  const listed = match[1].split(',').map(s => s.trim()).sort();
  const installed = readdirSync('node_modules/@sqlrooms').filter(p => existsSync(`node_modules/@sqlrooms/${p}/dist`)).sort();
  assert.deepEqual(listed, installed);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSources, validateEvidence, sourceLines, excerpt} from '../src/framework/evidence/model.ts';
const artifact = () => ({id: 'example', path: 'models/example.py', language: 'python', title: 'Example', text: 'a\nb\nc', provenance: 'synthetic'});
const ref = () => ({artifact: 'example', start: 2, end: 3, label: 'Example lines'});

test('source content and references are cloned rather than modified', () => {const a = artifact(), result = validateSources([a]); a.text = 'changed'; assert.equal(result[0].text, 'a\nb\nc'); assert.deepEqual(validateEvidence([ref()], result), [ref()]);});
test('evidence uses exact one-based inclusive ranges', () => {assert.equal(excerpt([artifact()], ref()), 'b\nc');});
test('line boundaries consistently support CRLF input', () => {const a = artifact(); a.text = 'a\r\nb\r\nc'; assert.deepEqual(sourceLines(a), ['a', 'b', 'c']); assert.equal(excerpt([a], ref()), 'b\nc');});
test('artifact paths cannot be absolute, URLs, parent traversals or control sequences', () => {
  for (const path of ['/root/key', '../secret', 'a/../../key', 'https://host/file', 'C:\\users\\secret', 'a//b', 'a/./b', 'a\nfile']) {const a = artifact(); a.path = path; assert.throws(() => validateSources([a]));}
});
test('duplicate source identity and duplicate path are rejected', () => {const a = artifact(); assert.throws(() => validateSources([a, a])); assert.throws(() => validateSources([a, {...a, id: 'other'}]));});
test('source budgets measure actual UTF-8 bytes, not only character count', () => {const a = artifact(); a.text = '\u20ac'.repeat(24000); assert.throws(() => validateSources([a]), /budget/);});
test('line budgets and NUL are rejected', () => {const a = artifact(); a.text = 'x\n'.repeat(2001); assert.throws(() => validateSources([a])); a.text = '\0'; assert.throws(() => validateSources([a]));});
test('references cannot guess nonexistent files or out-of-range lines', () => {
  for (const patch of [{artifact: 'missing'}, {start: 0}, {start: 4}, {end: 4}, {start: 3, end: 1}, {start: 1.5}, {end: Infinity}]) assert.throws(() => validateEvidence([{...ref(), ...patch}], [artifact()]));
});
test('source fields do not allow markup handlers, executable callbacks or remote addresses', () => {assert.throws(() => validateSources([{...artifact(), onOpen: 'exec()'}])); assert.throws(() => validateSources([{...artifact(), language: 'html'}])); assert.throws(() => validateEvidence([{...ref(), url: 'https://host'}], [artifact()]));});
test('source text itself remains inert, including script-like strings', () => {const a = artifact(); a.text = 'globalThis.sourceDidRun = true;'; validateSources([a]); assert.equal(globalThis.sourceDidRun, undefined);});

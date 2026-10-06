import test from 'node:test';
import assert from 'node:assert/strict';
import {assessClientBudgets, clientBudgets} from '../scripts/check-client-performance.mjs';
const fixture = () => ({sourceUnchanged: true, clients: Object.entries(clientBudgets).map(([id, [bytes]]) => ({id, javascriptFiles: 2, javascriptGzipBytes: bytes, status: 'passed'}))});
test('performance gate recognizes the complete 19-target measured matrix', () => {const report = assessClientBudgets(fixture()); assert.equal(report.clients.length, 19); assert.ok(report.clients.every(c => c.deltaBytes === 0)); assert.match(report.limitation, /Not an initial-load/);});
test('performance gate accepts an exact budget but rejects one excess byte', () => {const report = fixture(), first = report.clients[0]; first.javascriptGzipBytes = clientBudgets[first.id][1]; assessClientBudgets(report); first.javascriptGzipBytes++; assert.throws(() => assessClientBudgets(report), /budget exceeded/);});
for (const [name, edit] of Object.entries({
  'missing target': r => r.clients.pop(),
  'duplicate target': r => r.clients[1] = {...r.clients[0]},
  'unknown target': r => r.clients[0].id = '__proto__',
  'failed browser': r => r.clients[0].status = 'failed',
  'missing gzip': r => delete r.clients[0].javascriptGzipBytes,
  'nonfinite gzip': r => r.clients[0].javascriptGzipBytes = NaN,
  'negative gzip': r => r.clients[0].javascriptGzipBytes = -1,
  'fractional gzip': r => r.clients[0].javascriptGzipBytes = 1.5,
  'no JS files': r => r.clients[0].javascriptFiles = 0,
  'mutated framework': r => r.sourceUnchanged = false,
})) test('performance gate refuses ' + name, () => {const report = fixture(); edit(report); assert.throws(() => assessClientBudgets(report));});

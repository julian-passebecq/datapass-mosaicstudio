import test from 'node:test';
import assert from 'node:assert/strict';
import {updateSiteMetadata} from '../src/framework/site-metadata.ts';
const node = (initial = {}) => {const attrs = new Map(Object.entries(initial)); return {getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v), hasAttribute: k => attrs.has(k)};};
function documentFixture(published = false) {
  const title = node(published ? {'data-studio-publication-title': 'Approved client title'} : {});
  let meta = published ? node({name: 'description', content: 'Approved description', 'data-studio-publication-description': 'true'}) : null;
  return {title: '', querySelector: selector => selector === 'title' ? title : meta, createElement: () => node(), head: {appendChild: n => (meta = n)}};
}
test('unpublished workbench derives its metadata from the active client manifest', () => {
  const doc = documentFixture(); updateSiteMetadata(doc, {title: 'Runtime app', description: 'Runtime summary'}, 'Overview');
  assert.equal(doc.title, 'Overview | Runtime app'); assert.equal(doc.querySelector('meta').getAttribute('content'), 'Runtime summary');
});
test('approved publication title and description survive hydration and page navigation', () => {
  const doc = documentFixture(true), manifest = {title: 'Runtime app', description: 'Generic summary'};
  updateSiteMetadata(doc, manifest, 'Overview'); assert.equal(doc.title, 'Overview | Approved client title');
  updateSiteMetadata(doc, manifest, 'Evidence'); assert.equal(doc.title, 'Evidence | Approved client title');
  assert.equal(doc.querySelector('meta').getAttribute('content'), 'Approved description');
});
test('integrated client switching does not retain a previous unowned description', () => {
  const doc = documentFixture(); updateSiteMetadata(doc, {title: 'A', description: 'First'}, 'One'); updateSiteMetadata(doc, {title: 'B', description: 'Second'}, 'Two');
  assert.equal(doc.title, 'Two | B'); assert.equal(doc.querySelector('meta').getAttribute('content'), 'Second');
});

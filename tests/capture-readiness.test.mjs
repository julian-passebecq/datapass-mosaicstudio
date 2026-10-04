import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nodeValidationStyles} from '../scripts/node-validation-styles.mjs';

// Render the actual lazy model boundary, not a manually fabricated DOM marker.
// Static React rendering deliberately exposes Suspense's pending fallback.
await mkdir('.generated',{recursive:true});
const output=path.resolve('.generated/capture-readiness-test.mjs');
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Model from './src/framework/model-assets/ModelBlock.tsx';
import {RuntimeContext} from './src/framework/hooks.tsx';
import {SiteRuntime} from './src/framework/runtime.ts';
import definition from './clients/model-reference/app.ts';
export function pendingModelMarkup(){
  const runtime=new SiteRuntime(definition);
  runtime.applyCue({'model-view':'model'});
  const block=definition.manifest.pages[0].sections[0].blocks.find(b=>b.type==='model3d');
  return renderToStaticMarkup(createElement(RuntimeContext.Provider,{value:runtime},createElement(Model,{block})));
}`},outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[nodeValidationStyles()],logLevel:'silent'});
const {pendingModelMarkup}=await import(pathToFileURL(output).href);
test('lazy model Suspense fallback explicitly blocks deterministic capture',()=>{
  const html=pendingModelMarkup();
  assert.match(html,/<p\b[^>]*data-capture-state="busy"[^>]*>Loading optional model viewer/);
  assert.ok(!html.includes('data-capture-state="ready"'));
});

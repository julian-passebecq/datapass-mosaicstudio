import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdir} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {modelFixture} from '../scripts/templates/model.mjs';
await mkdir('.generated',{recursive:true});
const file=path.resolve('.generated/model-loader-test.mjs');await build({entryPoints:['src/framework/model-assets/prepare.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,logLevel:'silent'});
const {prepareModel}=await import(pathToFileURL(file).href);

test('real pinned GLTFLoader binds nested semantic roots and owns disposable resources',async()=>{
  const old=globalThis.fetch,{bytes,model}=modelFixture('fixture','Fixture');let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response(bytes);};
  try{
    const loaded=await prepareModel(model,new AbortController().signal,'https://site.example/');
    assert.equal(requests,1);assert.equal(loaded.content.items.size,5);assert.equal(loaded.content.meshes.length,9);assert.equal(loaded.scene.parts.length,5);
    assert.equal(loaded.content.meshes.filter(m=>m.userData.entity==='frame').length,4);
    assert.equal(loaded.content.meshes.filter(m=>m.userData.entity==='carriage').length,2);
    assert.deepEqual(loaded.content.items.get('plate').position.toArray(),[0,4.25,.25]);
    assert.equal(loaded.content.anchors.get('plate').object,loaded.content.items.get('plate'));
    const mats=loaded.content.meshes.map(m=>m.material);assert.equal(new Set(mats).size,mats.length);
    let disposed=0;for(const g of loaded.content.geometries)g.addEventListener('dispose',()=>disposed++);
    loaded.content.dispose();assert.equal(disposed,loaded.content.geometries.size);loaded.content.dispose();assert.equal(disposed,loaded.content.geometries.size);
  }finally{globalThis.fetch=old;}
});
test('an aborted load never returns owned graphics',async()=>{
  const old=globalThis.fetch,{bytes,model}=modelFixture('fixture','Fixture'),abort=new AbortController();
  globalThis.fetch=async()=>{abort.abort();return new Response(bytes);};
  try{await assert.rejects(()=>prepareModel(model,abort.signal,'https://site.example/'));}finally{globalThis.fetch=old;}
});
test('corrupted file never reaches the pinned loader',async()=>{
  const old=globalThis.fetch,{bytes,model}=modelFixture('fixture','Fixture');bytes[50]^=1;
  globalThis.fetch=async()=>new Response(bytes);
  try{await assert.rejects(()=>prepareModel(model,new AbortController().signal,'https://site.example/'),/SHA-256/);}finally{globalThis.fetch=old;}
});

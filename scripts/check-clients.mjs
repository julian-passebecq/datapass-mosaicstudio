import {checkModelAssets} from './model-assets.mjs';
import {readdir,mkdir,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {loadClient} from './load-client.mjs';
import {SiteRuntime,validateScene} from '../src/framework/index.ts';
const requested=process.argv[2];if(requested&&!/^[a-z][a-z0-9-]{0,59}$/.test(requested))throw new Error('Invalid client id');
const ids=requested?[requested]:(await readdir('clients',{withFileTypes:true})).filter(d=>d.isDirectory()&&/^[a-z][a-z0-9-]{0,59}$/.test(d.name)).map(d=>d.name);
await mkdir('qa/client-manifests',{recursive:true});
for(const id of ids){
  const dir=path.resolve('clients',id);if((await lstat(dir)).isSymbolicLink())throw new Error('Symbolic client directory refused');
  const definition=await loadClient(id);
  await checkModelAssets(definition,dir);
  const runtime=new SiteRuntime(definition);if(runtime.manifest.id!==id)throw new Error('Folder and app id differ: '+id);
  for(const d of runtime.manifest.datasets)if(d.source!=='task')runtime.dataset(d.id);
  for(const scene of Object.values(definition.resources?.scenes||{}))validateScene(scene);
  for(const block of runtime.manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks)))if(block.type==='scene3d'){
    const scene=validateScene(definition.resources.scenes[block.resource]);
    const camera=runtime.manifest.fields.find(f=>f.id===block.camera),selection=runtime.manifest.fields.find(f=>f.id===block.selection);
    if(camera.options.some(o=>!scene.cameras.some(c=>c.id===o.value))||!scene.cameras.some(c=>c.id===camera.default))throw new Error('Scene camera field mismatch');
    const ids=['none',...scene.entities.map(e=>e.id)];if(!ids.every(id=>selection.options.some(o=>o.value===id))||selection.options.some(o=>!ids.includes(o.value)))throw new Error('Scene selection field mismatch');
  }
  const saved=runtime.save(runtime.manifest.pages[0].id);runtime.review(JSON.stringify(saved));
  await writeFile('qa/client-manifests/'+id+'.json',JSON.stringify(runtime.manifest,null,2)+'\n');
  console.log('Client OK: '+id+' / '+runtime.manifest.pages.length+' pages / '+runtime.manifest.datasets.length+' datasets');
}

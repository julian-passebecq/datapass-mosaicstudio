import {readFile,lstat,realpath,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {validateModel} from '../src/framework/model-assets/model.ts';
import {verifyModelBytes} from '../src/framework/model-assets/load.ts';
import {validatePartBindings} from '../src/framework/model-assets/glb.ts';
/** Build-time asset verification; no asset can silently point outside its client's public tree. */
export async function checkModelAssets(definition,root) {
  const publicDir=path.resolve(root,'public'),checked=[];
  const used=[...new Set(definition.manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks)).filter(b=>b.type==='model3d').map(b=>b.resource))];
  for(const id of used){
    const spec=validateModel(definition.resources?.models?.[id]),full=path.resolve(publicDir,spec.asset.path);
    let cursor=publicDir;
    for(const part of ['',...spec.asset.path.split('/')]){if(part)cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw new Error('Symbolic model asset paths are refused');}
    if(!(await lstat(full)).isFile()||!(await realpath(full)).startsWith((await realpath(publicDir))+path.sep))throw new Error('Model asset escapes the client public directory');
    const bytes=await readFile(full),data=await verifyModelBytes(spec.asset,bytes);validatePartBindings(spec,data);
    checked.push({id,path:spec.asset.path,sha256:spec.asset.sha256,bytes:bytes.length,nodes:data.document.nodes.length,vertices:data.vertices,triangles:data.triangles});
  }
  return checked;
}
export async function prepareReferenceModels() {
  // A deliberate reference allowlist. New client assets are never copied into the public review build.
  const {model}=await import('../clients/model-reference/model.ts');
  const definition={manifest:{pages:[{sections:[{blocks:[{type:'model3d',resource:'assembly'}]}]}]},resources:{models:{assembly:model}}};
  await checkModelAssets(definition,path.resolve('clients/model-reference'));
  const destination=path.join('public',model.asset.path);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join('clients/model-reference/public',model.asset.path),destination);
}

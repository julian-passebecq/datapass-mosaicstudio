/** Build-time only: self-host the pinned Pyodide runtime. No runtime CDN or model download. */
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const version='0.28.3';
const files=['pyodide.js','pyodide.mjs','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json'];
const root=path.resolve('public/python',version);
await mkdir(root,{recursive:true});
const hashes={};
for(const file of files){
  const target=path.join(root,file);
  let bytes;
  try{bytes=await readFile(target);if(bytes.length<20)throw new Error('Empty cached runtime');}
  catch{
    const response=await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${file}`,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`Python runtime asset ${file}: HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<20||bytes.length>40*1024*1024)throw new Error(`Python runtime asset ${file}: invalid size`);
    await writeFile(target+'.tmp',bytes);await rename(target+'.tmp',target);
  }
  hashes[file]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile(path.join(root,'runtime-manifest.json'),JSON.stringify({version,source:`https://cdn.jsdelivr.net/pyodide/v${version}/full/`,files:hashes},null,2)+'\n');
console.log(`Self-hosted Pyodide ${version}: ${files.length} verified nonempty files; loaded only after explicit browser Python consent.`);

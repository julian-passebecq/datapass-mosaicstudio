import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const pkg=JSON.parse(await readFile('node_modules/@duckdb/duckdb-wasm/package.json','utf8'));
if(pkg.version!=='1.32.0')throw new Error('Review the DuckDB engine/extension pin before changing its package version.');
// The pinned 1.32.0 WASM package reports DuckDB v1.4.3 in the real browser gate.
const engine='v1.4.3',root='public/duckdb/extensions',manifestFile=path.join(root,'manifest.json');
const previous=existsSync(manifestFile)?JSON.parse(await readFile(manifestFile,'utf8')):{files:[]};
const files=[];
for(const platform of ['wasm_mvp','wasm_eh'])for(const name of ['json','parquet']){
 const relative=`${engine}/${platform}/${name}.duckdb_extension.wasm`,target=path.join(root,relative),url=`https://extensions.duckdb.org/${relative}`;
 const old=previous.files.find(item=>item.path===relative&&item.url===url);
 let bytes;
 if(old&&existsSync(target)){
  bytes=await readFile(target);
  if(createHash('sha256').update(bytes).digest('hex')!==old.sha256)throw new Error('Cached extension changed: '+relative);
 }else{
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Official extension fetch failed (${response.status}): ${url}`);
  bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<8||bytes.length>40*1024*1024||!bytes.subarray(0,4).equals(Buffer.from([0,97,115,109])))throw new Error('Expected a bounded WebAssembly extension: '+url);
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
 }
 files.push({path:relative,url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 console.log(`Prepared signed upstream extension ${platform}/${name}: ${bytes.length} bytes`);
}
await writeFile(manifestFile,JSON.stringify({format:'datapass.duckdb.extension-assets',version:1,wasmPackage:pkg.version,engine,files},null,2)+'\n');
// Preserve DuckDB's original signatures. Runtime verification stays enabled.

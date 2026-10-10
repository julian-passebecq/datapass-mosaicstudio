#!/usr/bin/env node
/**
 * Hash the built release outputs of this checkout (FR-07). Builds nothing itself: run, in this order,
 *   npm ci && npm run build && npm run sdk:pack && npm run build:client -- <id>   (for each selected client)
 * then
 *   node scripts/release-manifest.mjs --out <evidence dir> [--compare <other release-manifest.json>]
 *
 * Writes <out>/release-manifest.json: for every output (workbench dist/, each dist-clients/<id>/, dist-sdk/, the
 * committed standalone viewer) the file count, bytes, every file's sha256 and a tree sha256 (sha256 of the sorted
 * "sha256  path" lines), plus the source commit and tree state. --compare reports per output whether another
 * checkout's manifest has the same tree hash (reproducibility). The outputs themselves are not copied anywhere.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const repo=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);let out=null,compare=null;
for(let i=0;i<args.length;i++){if(args[i]==='--out'&&args[i+1])out=path.resolve(args[++i]);else if(args[i]==='--compare'&&args[i+1])compare=path.resolve(args[++i]);else{console.error('Usage: node scripts/release-manifest.mjs --out <dir> [--compare <release-manifest.json>]');process.exit(2);}}
if(!out)throw new Error('--out is required');
const sha=b=>createHash('sha256').update(b).digest('hex');
function walk(dir,base=dir,acc=[]){
  for(const name of readdirSync(dir)){const p=path.join(dir,name),s=statSync(p);if(s.isDirectory())walk(p,base,acc);else acc.push({path:path.relative(base,p).split(path.sep).join('/'),bytes:s.size,sha256:sha(readFileSync(p))});}
  return acc;
}
function output(id,kind,rel){
  const abs=path.join(repo,rel);if(!existsSync(abs))return {id,kind,path:rel,present:false};
  const files=statSync(abs).isDirectory()?walk(abs).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0):[{path:path.basename(abs),bytes:statSync(abs).size,sha256:sha(readFileSync(abs))}];
  return {id,kind,path:rel,present:true,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),treeSha256:sha(files.map(f=>`${f.sha256}  ${f.path}`).join('\n')+'\n'),list:files};
}
let commit=null,clean=null;
try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();clean=execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim()==='';}catch{/* not a git checkout */}
const pkg=JSON.parse(readFileSync(path.join(repo,'package.json'),'utf8'));
const outputs=[output('workbench','browser build (npm run build)','dist'),output('concept-viewer','standalone viewer (committed, npm run build:concept-standalone)','dist-standalone/concept-viewer.html'),output('sdk','SDK release folder (npm run sdk:pack)','dist-sdk')];
const clientsDir=path.join(repo,'dist-clients');
if(existsSync(clientsDir))for(const id of readdirSync(clientsDir).sort())if(statSync(path.join(clientsDir,id)).isDirectory())outputs.push(output('client:'+id,'selected client build (npm run build:client)','dist-clients/'+id));
let sdkArchive=null;
try{const m=JSON.parse(readFileSync(path.join(repo,'dist-sdk','sdk-release.json'),'utf8'));sdkArchive={name:m.archive.name,bytes:m.archive.bytes,sha256:m.archive.sha256,sourceCommit:m.sourceCommit,sourceTreeClean:m.sourceTreeClean,files:m.files.length};}catch{/* not packed */}
const manifest={format:'datapass.release-manifest',version:1,package:pkg.name,packageVersion:pkg.version,sourceCommit:commit,sourceTreeClean:clean,generatedAt:new Date().toISOString(),node:process.version,platform:`${process.platform}-${process.arch}`,sdkArchive,outputs};
if(compare){
  const other=JSON.parse(readFileSync(compare,'utf8'));
  manifest.comparison={against:{sourceCommit:other.sourceCommit,platform:other.platform,generatedAt:other.generatedAt},outputs:outputs.map(o=>{const t=other.outputs.find(x=>x.id===o.id);
    if(!t||!o.present||!t.present)return {id:o.id,result:'MISSING'};
    if(t.treeSha256===o.treeSha256)return {id:o.id,result:'IDENTICAL'};
    const a=new Map(o.list.map(f=>[f.path,f.sha256])),b=new Map(t.list.map(f=>[f.path,f.sha256]));
    const differing=[...new Set([...a.keys(),...b.keys()])].filter(p=>a.get(p)!==b.get(p));
    return {id:o.id,result:'DIFFERENT',differing:differing.slice(0,40),differingCount:differing.length};})};
}
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,1)+'\n');
const summary=outputs.map(o=>o.present?`${o.id}: ${o.files} files, ${o.bytes} bytes, tree ${o.treeSha256.slice(0,16)}`:`${o.id}: absent`);
console.log(`Release manifest for ${pkg.name} ${pkg.version} at ${commit?.slice(0,12)??'?'}${clean===false?' (dirty)':''}:\n  `+summary.join('\n  ')+(manifest.comparison?'\nComparison: '+manifest.comparison.outputs.map(c=>`${c.id}=${c.result}${c.differingCount?` (${c.differingCount})`:''}`).join(', '):''));

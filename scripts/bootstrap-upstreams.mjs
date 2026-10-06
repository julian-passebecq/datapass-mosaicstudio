import {readFile,mkdir,writeFile,rm,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const lock=JSON.parse(await readFile(new URL('../upstreams.lock.json',import.meta.url),'utf8'));
function git(args,cwd){const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:180000});if(r.status!==0)throw new Error(`git ${args[0]} failed: ${r.stderr}`);return r.stdout.trim();}
await mkdir('.upstream',{recursive:true});
for(const source of lock.sources){
 if(!/^[a-z][a-z0-9-]*$/.test(source.id)||!/^[-\w]+\/[-\w]+$/.test(source.repository)||!(/^[a-f0-9]{40}$/).test(source.commit))throw new Error('Invalid upstream lock');
 const target=path.resolve('.upstream',source.id),marker=path.join(target,'.source-commit');
 if(existsSync(marker)&&(await readFile(marker,'utf8')).trim()===source.commit){console.log(`Verified cached ${source.id} ${source.commit}`);continue;}
 if(existsSync(target))throw new Error(`Refusing to overwrite ${target}; review/remove it explicitly to change the source pin.`);
 const temporary=path.resolve('.tmp-upstream',source.id);await rm(temporary,{recursive:true,force:true});await mkdir(temporary,{recursive:true});
 try {
  git(['init','-q'],temporary);git(['remote','add','origin',`https://github.com/${source.repository}.git`],temporary);
  git(['fetch','--depth','1','origin',source.commit],temporary);
  if(git(['rev-parse','FETCH_HEAD'],temporary)!==source.commit)throw new Error('Upstream commit mismatch');
  git(['checkout','--detach','FETCH_HEAD'],temporary);
  await cp(temporary,target,{recursive:true,filter:src=>!['.git','node_modules','dist','.env'].includes(path.basename(src))});
  await writeFile(marker,source.commit+'\n');console.log(`Prepared ${source.id} at ${source.commit}`);
 } finally {await rm(temporary,{recursive:true,force:true});}
}

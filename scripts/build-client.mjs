import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadClient} from './load-client.mjs';
const id=process.argv[2];
if(!id||!/^[a-z][a-z0-9-]{0,59}$/.test(id)||process.argv.length!==3)throw new Error('Usage: npm run build:client -- <client-id>');
const dir=path.resolve('clients',id);if(!existsSync(path.join(dir,'app.ts'))||lstatSync(dir).isSymbolicLink())throw new Error('Unknown or symbolic client directory');
const bootstrap=spawnSync(process.execPath,['scripts/bootstrap-upstreams.mjs'],{stdio:'inherit',env:process.env});
if(bootstrap.status!==0)process.exit(bootstrap.status||1);
const definition=await loadClient(id);
const features=[...new Set(definition.manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks.map(b=>b.type))))];
// Opaque custom components can compose built-in renderers. Do not incorrectly
// eliminate them just because their nested block types are absent from JSON.
if(features.includes('custom'))features.push('chart','scene3d','story-controls','architecture','explorer','explanation');
if(features.includes('explorer')&&Object.values(definition.resources?.explorers||{}).some(e=>e.scene))features.push('scene3d');
const run=(args)=>{const p=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,STUDIO_CLIENT:id,STUDIO_BLOCKS:JSON.stringify(features),STUDIO_TITLE:definition.manifest.title,STUDIO_DESCRIPTION:definition.manifest.description}});if(p.status!==0)process.exit(p.status||1);};
run(['scripts/prepare-fluent-icons.mjs']);
run(['--experimental-strip-types','scripts/check-clients.mjs',id]);
await mkdir('.generated',{recursive:true});
const tsconfig='.generated/tsconfig-client-'+id+'.json';
await writeFile(tsconfig,JSON.stringify({extends:'../tsconfig.json',include:['../clients/'+id,'../src/client-main.tsx','../src/framework','../vite.client.config.ts']},null,2));
run(['node_modules/typescript/bin/tsc','--noEmit','-p',tsconfig]);
run(['node_modules/vite/bin/vite.js','build','--config','vite.client.config.ts']);
console.log(`Client ${id} built to dist-clients/${id}. No deployment was performed.`);

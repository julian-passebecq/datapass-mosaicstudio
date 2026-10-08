import {readPublication} from './publication.mjs';
import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {planCapabilities} from '../src/framework/capabilities.ts';
import {validateArtifact} from '../src/framework/foundation/artifact.ts';
import {loadClient} from './load-client.mjs';
import {clientCspFor} from './client-csp.mjs';
import {writePreview} from './preview-validate.mjs';
const id=process.argv[2];
if(!id||!/^[a-z][a-z0-9-]{0,59}$/.test(id)||process.argv.length!==3)throw new Error('Usage: npm run build:client -- <client-id>');
const dir=path.resolve('clients',id);if(!existsSync(path.join(dir,'app.ts'))||lstatSync(dir).isSymbolicLink())throw new Error('Unknown or symbolic client directory');
const bootstrap=spawnSync(process.execPath,['scripts/bootstrap-upstreams.mjs'],{stdio:'inherit',env:process.env});
if(bootstrap.status!==0)process.exit(bootstrap.status||1);
const definition=await loadClient(id);
const publication=await readPublication(dir,{title:definition.manifest.title,description:definition.manifest.description||'A DataPass client application.'});
const plan=planCapabilities(definition);
for(const warning of plan.warnings)console.warn(warning);
const run=(args)=>{const p=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,STUDIO_CLIENT:id,STUDIO_PUBLICATION:JSON.stringify(publication),STUDIO_CAPABILITIES:JSON.stringify(plan.capabilities),STUDIO_TITLE:definition.manifest.title,STUDIO_DESCRIPTION:definition.manifest.description}});if(p.status!==0)process.exit(p.status||1);};
run(['scripts/prepare-fluent-icons.mjs']);
run(['--experimental-strip-types','scripts/check-clients.mjs',id]);
await mkdir('.generated',{recursive:true});
await writeFile('.generated/client-plan-'+id+'.json',JSON.stringify(plan,null,2)+'\n');
const tsconfig='.generated/tsconfig-client-'+id+'.json';
await writeFile(tsconfig,JSON.stringify({extends:'../tsconfig.json',include:['../clients/'+id,'../src/client-main.tsx','../src/framework','../src/dom-compat.d.ts','../vite.client.config.ts']},null,2));
run(['node_modules/typescript/bin/tsc','--noEmit','-p',tsconfig]);
run(['node_modules/vite/bin/vite.js','build','--config','vite.client.config.ts']);
await writeClientPreview();
console.log(`Client ${id} built to dist-clients/${id}. No deployment was performed.`);

/** datapass.preview/1 descriptor of the built folder (inert metadata for any viewer; see spec/preview/v1/README.md). */
async function writeClientPreview(){
  const out=path.resolve('dist-clients',id),git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});return r.status===0?r.stdout.trim():null;};
  const head=git(['rev-parse','HEAD']),clean=git(['status','--porcelain'])==='';
  const artifacts=[],source=path.join(dir,'public','artifacts');
  if(existsSync(source))for(const name of (await readdir(source)).filter(n=>n.endsWith('.json')).sort()){
    let value;try{value=JSON.parse(await readFile(path.join(source,name),'utf8'));}catch{continue;}
    if(value?.format!=='datapass.artifact')continue;
    try{const a=validateArtifact(value);if(existsSync(path.join(out,'artifacts',name)))artifacts.push({id:a.id,path:'artifacts/'+name,provenance:a.provenance.kind});}
    catch(e){console.warn('preview.json: skipped invalid artifact artifacts/'+name+': '+e.message);}
  }
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const doc=await writePreview(out,{app:{id,title:definition.manifest.title,variant:'client'},sdkVersion:pkg.version,sourceCommit:head&&clean?head:null,
    publication:{mode:publication.visibility,noindex:publication.visibility!=='public'},capabilities:plan.capabilities,artifacts,
    open:{file:false,httpLoopback:true},csp:clientCspFor(dir)});
  console.log(`Preview descriptor: dist-clients/${id}/preview.json (${doc.files.length} files, ${doc.artifacts.length} artifacts${doc.sourceCommit?'':'; sourceCommit null: uncommitted changes'}).`);
}

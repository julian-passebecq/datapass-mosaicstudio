import {customFields,customSource} from './templates/custom.mjs';
import {modelTemplate} from './templates/model.mjs';
import {foundationTemplate} from './templates/foundation.mjs';
import {motionTemplate} from './templates/motion.mjs';
import {mkdir,writeFile,lstat,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {explorerTemplate} from './templates/explorer.mjs';
import {analyticsTemplate} from './templates/analytics.mjs';
import {replayTemplate} from './templates/replay.mjs';
import {familyById,appFamilies} from '../src/framework/capabilities.ts';
export async function scaffoldClient({id,title=id,root=process.cwd(),custom=false,template,family,motion=false,foundation=false,model=false}){
  if(family!==undefined){const selected=familyById(family);if(template!==undefined&&template!==selected.template)throw new Error('Family and template disagree');template=selected.template;}
  template??='basic';
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,59}$/.test(id)||['node-modules','src','public'].includes(id))throw new Error('Use a lowercase client id with letters, numbers and hyphens');
  if(typeof title!=='string'||!title.trim()||title.length>120)throw new Error('Title must contain 1-120 characters');
  if(typeof custom!=='boolean')throw new Error('custom must be a boolean');
  if(!['basic','knowledge','spatial','analytics','replay'].includes(template))throw new Error('Choose basic, knowledge, spatial, analytics or replay');
  if(typeof motion!=='boolean'||motion&&template!=='basic')throw new Error('--motion starts a content client; other families can add the capability explicitly');
  if(typeof foundation!=='boolean'||foundation&&(template!=='analytics'||motion))throw new Error('--foundation requires the analytics family without --motion');
  if(typeof model!=='boolean'||model&&(template!=='spatial'||motion||foundation))throw new Error('--model requires the spatial family and no other addon');
  const clients=path.join(root,'clients');await mkdir(clients,{recursive:true});if((await lstat(clients)).isSymbolicLink())throw new Error('Refusing a symbolic clients directory');
  const target=path.join(clients,id);await mkdir(target); // EEXIST is deliberate: never overwrite a client.
  const customImport=custom?"import {ClientNote} from './ClientNote.tsx';\n":'';
  const customBlock=custom?",{id:'client-note',type:'custom',resource:'clientNote',span:2}":'';
  const components=custom?",components:{clientNote:ClientNote},customCapabilities:{clientNote:[]}":'';
  const text=`${customImport}import {defineApp} from '../../src/framework/authoring.ts';\nexport default defineApp({manifest:{format:'datapass.web-app',schemaVersion:1,id:${JSON.stringify(id)},version:'0.1.0',title:${JSON.stringify(title)},label:'Synthetic starter - replace before release',description:'A client-owned application built with DataPass Studio.',theme:{accent:'#286b7d',density:'compact'},fields:${JSON.stringify(custom?customFields:[])},datasets:[],tasks:[],pages:[{id:'overview',title:'Overview',description:'Start with the client brief, then choose blocks from docs/contracts/components.json.',sections:[{id:'intro',columns:2,blocks:[{id:'intro-text',type:'text',title:${JSON.stringify(title)},text:'Edit this client file. Framework internals stay unchanged.',tone:'lead'},{id:'starter-metric',type:'metric',title:'Example indicator',value:{literal:42},note:'Replace this synthetic placeholder'}${customBlock}]}]}]},bindings:{}${components}});\n`;
  try{
    if(model){for(const [name,content] of Object.entries(modelTemplate({id,title}))){await mkdir(path.dirname(path.join(target,name)),{recursive:true});await writeFile(path.join(target,name),content,{flag:'wx'});}}
    else if(foundation){for(const [name,content] of Object.entries(foundationTemplate({id,title})))await writeFile(path.join(target,name),content,{flag:'wx'});}
    else if(motion){for(const [name,content] of Object.entries(motionTemplate({id,title})))await writeFile(path.join(target,name),content,{flag:'wx'});}
    else if(template==='basic')await writeFile(path.join(target,'app.ts'),text,{flag:'wx'});
    else for(const [name,content] of Object.entries(template==='analytics'?analyticsTemplate({id,title}):template==='replay'?replayTemplate({id,title}):explorerTemplate({id,title,template})))await writeFile(path.join(target,name),content,{flag:'wx'});
    if(custom){
      if(template!=='basic'||motion||foundation||model){
        await rename(path.join(target,'app.ts'),path.join(target,'base.ts'));
        const extra={id:'custom-lab',title:'Custom visual',description:'Synthetic shared-state SVG/Canvas experiment.',sections:[{id:'custom',columns:1,blocks:[{id:'client-note',type:'custom',resource:'clientNote'}]}]};
        await writeFile(path.join(target,'app.ts'),`import base from './base.ts';\nimport {defineApp} from '../../src/framework/authoring.ts';\nimport {ClientNote} from './ClientNote.tsx';\nimport type {Field} from '../../src/framework/types.ts';\nconst customFields:Field[]=${JSON.stringify(customFields)};\nexport default defineApp({...base,manifest:{...base.manifest,fields:[...base.manifest.fields,...customFields],pages:[...base.manifest.pages,${JSON.stringify(extra)}]},components:{...base.components,clientNote:ClientNote},customCapabilities:{...base.customCapabilities,clientNote:[]}});\n`,{flag:'wx'});
      }
      await writeFile(path.join(target,'ClientNote.tsx'),customSource,{flag:'wx'});
    }
    const chosen=familyById(family||appFamilies.find(f=>f.template===template).id);
    await writeFile(path.join(target,'client.config.json'),JSON.stringify({format:'datapass.client-profile',version:1,family:chosen.id},null,2)+'\n',{flag:'wx'});
    await writeFile(path.join(target,'CLIENT_GUIDE.md'),`# Start here\n\nFamily: ${chosen.id}. Read docs/recipes/START.md and ${chosen.guide}. Edit this client folder, not the renderer libraries.\n\nRun npm run client:context -- ${id} to generate the exact block/capability reading list as this client changes. Families are starting compositions, not limitations.\n`,{flag:'wx'});
    await writeFile(path.join(target,'README.md'),`# ${title}\n\nClient source: app.ts. Read ../../docs/AI_SITE_AUTHORING.md.\n\nPreview with npm run client:dev -- ${id}. The command prints the exact loopback URL and preserves Vite HMR.\nCheck with npm run client:check -- ${id}.\nBuild only this site with npm run build:client -- ${id}.\n\nThe default production workbench build includes reference clients only. This client is not automatically published or added to that public review build.\n`,{flag:'wx'});
    await writeFile(path.join(target,'AGENTS.md'),'Read CLIENT_GUIDE.md first, then generate a focused context with client:context. Do not open the entire 3D stack unless the actual capability plan needs it. Keep domain content and trusted calculations here. Do not edit src/framework to create this client. Use custom source components when a built-in block is insufficient. Never put private data, tokens or local machine paths into a public build. Run the client check and browser acceptance tests before delivery.\n',{flag:'wx'});
  }catch(e){await rm(target,{recursive:true,force:true});throw e;}
  return target;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [id,...rest]=process.argv.slice(2);let title=id,custom=false,motion=false,foundation=false,model=false,template,family;
  for(let i=0;i<rest.length;i++){if(rest[i]==='--model')model=true;else if(rest[i]==='--title'&&rest[i+1])title=rest[++i];else if(rest[i]==='--foundation')foundation=true;else if(rest[i]==='--motion')motion=true;else if(rest[i]==='--custom')custom=true;else if(rest[i]==='--template'&&rest[i+1])template=rest[++i];else if(rest[i]==='--family'&&rest[i+1])family=rest[++i];else throw new Error('Usage: npm run client:new -- id [--title "Title"] [--custom | --motion | --foundation | --model] [--family content|knowledge|analytics|spatial|replay] [--template basic|knowledge|spatial|analytics|replay]');}
  const dir=await scaffoldClient({id,title,custom,template,family,motion,foundation,model});console.log('Created '+dir+' without changing framework files.');
}

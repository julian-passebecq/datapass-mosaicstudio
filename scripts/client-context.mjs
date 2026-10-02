import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadClient} from './load-client.mjs';
import {planCapabilities,appFamilies,familyById} from '../src/framework/capabilities.ts';
import {componentCatalog} from '../src/framework/catalog.ts';
export async function readClientProfile(id,root=process.cwd()){
  if(!/^[a-z][a-z0-9-]{0,59}$/.test(id))throw new Error('Invalid client id');
  let profile;try{profile=JSON.parse(await readFile(path.join(root,'clients',id,'client.config.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!profile||Object.keys(profile).some(k=>!['format','version','family'].includes(k))||profile.format!=='datapass.client-profile'||profile.version!==1)throw new Error('Invalid client profile');
  familyById(profile.family);return profile;
}
export function contextDocument(id,definition,profile){
  const plan=planCapabilities(definition),family=profile?familyById(profile.family):null;
  const lines=[`# ${id}: focused authoring context`,'',`Application: ${definition.manifest.title}. Family: ${family?.id||'composed (no family profile)'}.`,'',
    'This generated guide is a starting route, not a restriction on the next client. Add the smallest justified capability; do not read every renderer or donor library.',
    '', '## Edit here',`- clients/${id}/app.ts: pages, blocks and bindings.`,`- clients/${id}/: approved content, models, data and optional assets.`,
    '- Do not change src/framework for ordinary client content. Do not modify .upstream.',
    '', '## Read first','1. docs/recipes/START.md',...(family?[`2. ${family.guide}`]:[]),
    ...plan.guides.filter(g=>g!==family?.guide).map(g=>`- ${g}`),'','## Required block contracts'];
  for(const c of componentCatalog.filter(c=>plan.blocks.includes(c.type)))lines.push(`### ${c.type}`,c.purpose,`Required: ${c.required.join(', ')}.`,c.limits,'');
  lines.push('## Actual optional capabilities',plan.capabilities.length?plan.capabilities.map(c=>`- ${c}: ${plan.reasons[c].join(', ')}`).join('\n'):'None. Do not open the 3D, graph, story or SQL library source.');
  if(!plan.capabilities.includes('spatial'))lines.push('3D is not required. Do not load Three.js source or create a scene.');
  if(!plan.capabilities.includes('replay'))lines.push('No replay clock is required.');
  lines.push('','## Commands',`npm run client:check -- ${id}`,`npm run build:client -- ${id}`,`npm run client:context -- ${id}`,'',
    'Family metadata does not override the actual block plan. Custom React components may declare customCapabilities; an omitted declaration conservatively retains all renderers. This is not an import sandbox.',
    'Static builds expose embedded content. Confirm public assets and data before delivery. Synthetic signals and geometry are not production evidence. No deploy, package publish or merge is authorized by this guide.');
  if(plan.warnings.length)lines.push('','## Warnings',...plan.warnings);
  return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const id=process.argv[2];
  if(!id||id==='--families'){console.log(appFamilies.map(f=>`${f.id.padEnd(10)} ${f.title}\n           ${f.purpose}\n           ${f.guide}`).join('\n\n'));}
  else{
    const definition=await loadClient(id),profile=await readClientProfile(id),text=contextDocument(id,definition,profile),plan=planCapabilities(definition);
    const root=path.join('.generated','client-context',id);await mkdir(root,{recursive:true});await writeFile(path.join(root,'GUIDE.md'),text);await writeFile(path.join(root,'plan.json'),JSON.stringify(plan,null,2)+'\n');
    console.log(text);console.log('Generated guide: '+path.join(root,'GUIDE.md'));
  }
}

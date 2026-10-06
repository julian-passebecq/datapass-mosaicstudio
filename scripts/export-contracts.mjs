import {motionV2Schema} from '../src/framework/motion/schema.ts';
import {modelSchema} from '../src/framework/model-assets/schema.ts';
import {foundationSchemas} from '../src/framework/foundation/schemas.ts';
import {appFamilies,capabilityCatalog} from '../src/framework/capabilities.ts';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {manifestSchema,savedStateSchema,sceneSchema,explorerSchema,explanationSchema,replaySchema,clientProfileSchema,motionSchema,sourceArtifactSchema} from '../src/framework/json-schema.ts';
import {componentCatalog} from '../src/framework/catalog.ts';
import {conceptSpecJsonSchema} from '../src/framework/concept/json-schema.ts';
import {checkConceptSpec} from '../src/framework/concept/schema.ts';
const checking=process.argv.includes('--check');await mkdir('docs/contracts',{recursive:true});
for(const [name,value] of Object.entries({'motion-v2.schema.json':motionV2Schema,'model3d.schema.json':modelSchema,...foundationSchemas,'web-app.schema.json':manifestSchema,'web-state.schema.json':savedStateSchema,'scene3d.schema.json':sceneSchema,'components.json':componentCatalog,'explorer.schema.json':explorerSchema,'explanation.schema.json':explanationSchema,'replay.schema.json':replaySchema,'client-profile.schema.json':clientProfileSchema,'families.json':appFamilies,'capabilities.json':capabilityCatalog,'motion.schema.json':motionSchema,'source-artifact.schema.json':sourceArtifactSchema,'concept-spec.schema.json':conceptSpecJsonSchema})){
 const file='docs/contracts/'+name,content=JSON.stringify(value,null,2)+'\n';
 if(checking){if((await readFile(file,'utf8')).replace(/\r\n/g,'\n')!==content)throw new Error('Contract drift: '+file);}else await writeFile(file,content);
}
// Concept spec v1: the stable published contract (spec/concept/v1/) is generated from the same zod source.
await mkdir('spec/concept/v1',{recursive:true});
{const file='spec/concept/v1/concept-spec.schema.json',content=JSON.stringify(conceptSpecJsonSchema,null,2)+'\n';
 if(checking){let prior='';try{prior=(await readFile(file,'utf8')).replace(/\r\n/g,'\n');}catch{}if(prior!==content)throw new Error('Contract drift: '+file+' (run npm run contracts)');}else await writeFile(file,content);}
for(const name of (await readdir('spec/concept/v1')).filter(f=>f.endsWith('.concept.json')).sort()){
 const r=checkConceptSpec(JSON.parse(await readFile('spec/concept/v1/'+name,'utf8')));
 const problems=[...(r.ok?[]:r.issues),...r.warnings].map(i=>(i.path?i.path+': ':'')+i.message);
 if(problems.length)throw new Error('Published concept example spec/concept/v1/'+name+' must validate without warnings:\n- '+problems.join('\n- '));
}
console.log('App, snapshot, scene, component-catalog and published concept spec contracts match their sources.');

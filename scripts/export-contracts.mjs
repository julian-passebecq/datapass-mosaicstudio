import {appFamilies,capabilityCatalog} from '../src/framework/capabilities.ts';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {manifestSchema,savedStateSchema,sceneSchema,explorerSchema,explanationSchema,replaySchema,clientProfileSchema} from '../src/framework/json-schema.ts';
import {componentCatalog} from '../src/framework/catalog.ts';
const checking=process.argv.includes('--check');await mkdir('docs/contracts',{recursive:true});
for(const [name,value] of Object.entries({'web-app.schema.json':manifestSchema,'web-state.schema.json':savedStateSchema,'scene3d.schema.json':sceneSchema,'components.json':componentCatalog,'explorer.schema.json':explorerSchema,'explanation.schema.json':explanationSchema,'replay.schema.json':replaySchema,'client-profile.schema.json':clientProfileSchema,'families.json':appFamilies,'capabilities.json':capabilityCatalog})){
 const file='docs/contracts/'+name,content=JSON.stringify(value,null,2)+'\n';
 if(checking){if(await readFile(file,'utf8')!==content)throw new Error('Contract drift: '+file);}else await writeFile(file,content);
}
console.log('App, snapshot, scene and component-catalog contracts match their sources.');

import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {manifestSchema,savedStateSchema,sceneSchema} from '../src/framework/json-schema.ts';
import {componentCatalog} from '../src/framework/catalog.ts';
const checking=process.argv.includes('--check');await mkdir('docs/contracts',{recursive:true});
for(const [name,value] of Object.entries({'web-app.schema.json':manifestSchema,'web-state.schema.json':savedStateSchema,'scene3d.schema.json':sceneSchema,'components.json':componentCatalog})){
 const file='docs/contracts/'+name,content=JSON.stringify(value,null,2)+'\n';
 if(checking){if(await readFile(file,'utf8')!==content)throw new Error('Contract drift: '+file);}else await writeFile(file,content);
}
console.log('App, snapshot, scene and component-catalog contracts match their sources.');

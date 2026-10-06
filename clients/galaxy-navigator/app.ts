import {defineApp} from '../../src/framework/authoring.ts';
import {GalaxyNavigator} from './GalaxyNavigator.tsx';
import {REGISTRY} from './registry.generated.ts';

/** Galaxy Navigator: reference client for the App Galaxy registry (apps and repos as nodes, shared
 * contracts as edges). 2D only, content family, no SQL, no runs, no 3D. All fields are view state:
 * changing them never recomputes the registry or runs a task.
 */
import {FIELDS} from './fields.ts';
export default defineApp({manifest:{
  format:'datapass.web-app',schemaVersion:1,id:'galaxy-navigator',version:'0.1.0',
  title:'Galaxy Navigator',label:'Registry snapshot, not live data',
  description:'Apps and repositories of the App Galaxy as nodes, shared formats and contracts as edges. Read from a dated registry snapshot.',
  theme:{accent:'#2f6f86',density:'compact'},
  fields:[
    {id:FIELDS.view,label:'Projection',type:'select',role:'view',default:'graph',options:[{value:'graph',label:'Graph'},{value:'list',label:'List'}]},
    {id:FIELDS.focus,label:'Focused node',type:'select',role:'view',default:'none',options:[{value:'none',label:'None'},...REGISTRY.nodes.map(n=>({value:n.id,label:n.name}))]},
    {id:FIELDS.status,label:'Contract status',type:'select',role:'view',default:'all',options:[{value:'all',label:'All statuses'},{value:'live',label:'Live only'},{value:'pending',label:'Branch, planned or proposed'}]},
  ],
  datasets:[],tasks:[],
  pages:[{id:'galaxy',title:'App Galaxy',description:'Search, focus a node and export the current 2D view. Positions are a computed cluster layout.',sections:[{id:'navigator',columns:1,blocks:[{id:'navigator',type:'custom',resource:'navigator'}]}]}],
},bindings:{},components:{navigator:GalaxyNavigator},customCapabilities:{navigator:[]}});

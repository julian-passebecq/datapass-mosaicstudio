import {defineApp,type Field} from '../../src/framework/authoring.ts';
import {AtlasExperience} from './AtlasExperience.tsx';
import {specs,specById} from './specs/index.ts';
import {ATLAS_LIMITS} from './spec.ts';

const fields:Field[]=[
  {id:'atlas-spec',label:'Architecture',type:'select',role:'view',default:specs[0].id,options:specs.map(s=>({value:s.id,label:s.title}))},
  {id:'atlas-view',label:'Representation',type:'select',role:'view',default:'3d',options:[{value:'3d',label:'3D atlas'},{value:'layered',label:'Layered 2D'},{value:'isometric',label:'Isometric 2D'}]},
  {id:'atlas-selection',label:'Selected node',type:'select',role:'view',default:'none',options:[{value:'none',label:'None'},...specs.flatMap(s=>s.nodes.map(n=>({value:n.id,label:s.title+' / '+n.label})))]},
  {id:'atlas-layer',label:'Layer (-1 = overview)',type:'number',role:'view',default:-1,min:-1,max:ATLAS_LIMITS.layers-1,step:1},
  {id:'atlas-group',label:'Domain (-1 = all)',type:'number',role:'view',default:-1,min:-1,max:ATLAS_LIMITS.groups-1,step:1}
];

export default defineApp({
  manifest:{
    format:'datapass.web-app',schemaVersion:1,id:'arch-atlas',version:'0.1.0',title:'Architecture Atlas',
    label:'PROTOTYPE',
    description:'One architecture spec rendered as a layered 3D atlas with natural icons, and as static layered and isometric SVG diagrams with the same ids.',
    theme:{accent:'#2f6f84',density:'comfortable'},
    fields,datasets:[],tasks:[],
    pages:[{id:'atlas',title:'Architecture Atlas',description:'Layered architecture atlas prototype.',sections:[{id:'atlas',columns:1,blocks:[{id:'atlas-workspace',type:'custom',resource:'atlasWorkspace'}]}]}]
  },
  bindings:{validateViewState(values){
    const spec=specById(String(values['atlas-spec']));
    if(spec.id!==values['atlas-spec'])throw new Error('Unknown architecture spec');
    const selection=String(values['atlas-selection']);
    if(selection!=='none'&&!spec.nodes.some(n=>n.id===selection))throw new Error('Selected node must belong to the current architecture');
    const layer=Number(values['atlas-layer']),group=Number(values['atlas-group']);
    if(layer%1!==0||layer<-1||layer>=spec.layers.length)throw new Error('Layer must be -1 (overview) or a layer of the current architecture');
    if(group%1!==0||group<-1||group>=spec.groups.length)throw new Error('Domain must be -1 (all) or a domain of the current architecture');
  }},
  components:{atlasWorkspace:AtlasExperience},
  customCapabilities:{atlasWorkspace:['spatial']}
});

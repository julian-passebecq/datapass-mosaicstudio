import {defineApp,type Field} from '../../src/framework/authoring.ts';
import {FabricWorkspace} from './FabricWorkspace.tsx';
import {bricks} from './fixture.ts';
import {fabricScene} from './scene.ts';

const fields:Field[]=[
  {id:'fabric-selection',label:'Selected brick',type:'select',role:'view',default:'none',options:[{value:'none',label:'Complete assembly'},...bricks.map(brick=>({value:brick.id,label:brick.label}))]},
  {id:'fabric-representation',label:'Representation',type:'select',role:'view',default:'2d',options:[{value:'2d',label:'2D'},{value:'3d',label:'3D'}]},
  {id:'fabric-level',label:'View level',type:'select',role:'view',default:'overview',options:[{value:'overview',label:'Overview'},{value:'detail',label:'Detail'}]},
  {id:'fabric-camera',label:'Camera',type:'select',role:'view',default:'overview',options:fabricScene.cameras.map(camera=>({value:camera.id,label:camera.label}))},
  {id:'fabric-explode',label:'Fixture separation',type:'number',role:'view',default:0,min:0,max:1,step:.01}
];

export default defineApp({
  manifest:{
    format:'datapass.web-app',schemaVersion:1,id:'fabric-bricks',version:'0.1.0',title:'Fabric Bricks 2D/3D',
    label:'PROVISIONAL synthetic thin slice',
    description:'Client-owned pressure test for stable semantic selection, 2D/3D switching, focus, detail, evidence and lazy spatial loading. No Fabric Bricks source-approved asset is claimed.',
    theme:{accent:'#305f72',density:'comfortable'},
    fields,datasets:[],tasks:[],
    pages:[{id:'overview',title:'Fabric Bricks',description:'Synthetic/provisional interaction fixture; replace with source-approved content before client qualification.',sections:[{id:'fabric',columns:1,blocks:[{id:'fabric-workspace',type:'custom',resource:'fabricWorkspace'}]}]}]
  },
  bindings:{validateViewState(values){
    const selection=String(values['fabric-selection']),level=String(values['fabric-level']),camera=String(values['fabric-camera']);
    if(selection==='none'&&level==='detail')throw new Error('Fabric detail requires a selected semantic brick');
    if(selection!=='none'&&camera!=='overview'&&camera!==selection)throw new Error('Fabric focus camera must match the selected semantic brick or use overview');
  }},
  resources:{scenes:{fabricScene}},
  components:{fabricWorkspace:FabricWorkspace},
  customCapabilities:{fabricWorkspace:['spatial']}
});

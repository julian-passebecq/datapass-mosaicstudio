import {defineApp,type Field} from '../../src/framework/authoring.ts';
import {FabricExperience} from './FabricExperience.tsx';
import {kits,lots,kitScenes,getBOM} from './kits.ts';
import {bricks} from './fixture.ts';
import {fabricScene} from './scene.ts';

const fields:Field[]=[
  {id:'fabric-selection',label:'Selected brick',type:'select',role:'view',default:'none',options:[{value:'none',label:'Complete assembly'},...bricks.map(brick=>({value:brick.id,label:brick.label})),...lots.map(l=>({value:l.id,label:l.name}))]},
  {id:'fabric-representation',label:'Representation',type:'select',role:'view',default:'2d',options:[{value:'2d',label:'2D'},{value:'3d',label:'3D'}]},
  {id:'fabric-level',label:'View level',type:'select',role:'view',default:'overview',options:[{value:'overview',label:'Overview'},{value:'detail',label:'Detail'}]},
  {id:'fabric-camera',label:'Camera',type:'select',role:'view',default:'overview',options:[...fabricScene.cameras.map(camera=>({value:camera.id,label:camera.label})),...lots.map(l=>({value:l.id,label:l.name+' focus'}))]},
  {id:'fabric-explode',label:'Fixture separation',type:'number',role:'view',default:0,min:0,max:1,step:.01},
  {id:'fabric-kit',label:'Kit',type:'select',role:'view',default:'lakehouse',options:kits.map(k=>({value:k.id,label:k.title}))},
  {id:'fabric-screen',label:'Screen',type:'select',role:'view',default:'gallery',options:[{value:'gallery',label:'Gallery'},{value:'detail',label:'Kit detail'}]},
  {id:'fabric-step',label:'Build step',type:'number',role:'view',default:6,min:1,max:6,step:1},
  {id:'fabric-isolate',label:'Isolate selected parts',type:'toggle',role:'view',default:false}
];

export default defineApp({
  manifest:{
    format:'datapass.web-app',schemaVersion:1,id:'fabric-bricks',version:'0.2.0',title:'Fabric Bricks',
    label:'PROVISIONAL / SYNTHETIC visual study',
    description:'Reference-inspired brick kits with semantic parts, 2D/3D exploration, layered explosion and manual build steps. All models, imagery and costs are synthetic/provisional.',
    theme:{accent:'#305f72',density:'comfortable'},
    fields,datasets:[],tasks:[],
    pages:[{id:'overview',title:'Fabric Bricks',description:'Synthetic/provisional interaction fixture; replace with source-approved content before client qualification.',sections:[{id:'fabric',columns:1,blocks:[{id:'fabric-workspace',type:'custom',resource:'fabricWorkspace'}]}]}]
  },
  bindings:{validateViewState(values){
    const selection=String(values['fabric-selection']),level=String(values['fabric-level']),camera=String(values['fabric-camera']);
    if(selection==='none'&&level==='detail')throw new Error('Fabric detail requires a selected semantic brick');
    if(selection!=='none'&&camera!=='overview'&&camera!==selection)throw new Error('Fabric focus camera must match the selected semantic brick or use overview');
    if(Number(values['fabric-step'])%1!==0)throw new Error('Fabric build step must be an integer');
    if(lots.some(l=>l.id===selection)&&!getBOM(String(values['fabric-kit'])).some(l=>l.id===selection))throw new Error('Selected part must belong to the current kit');
  }},
  resources:{scenes:{fabricScene,...kitScenes}},
  components:{fabricWorkspace:FabricExperience},
  customCapabilities:{fabricWorkspace:['spatial']}
});

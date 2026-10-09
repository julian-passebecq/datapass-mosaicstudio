import {defineApp,type Field} from '../../src/framework/authoring.ts';
import {FabricExperience} from './FabricExperience.tsx';
import {concepts,conceptEntities,conceptScene,conceptOwner} from './concepts.ts';
import {kits,lots,kitScenes,getBOM,getKit,pieceIds,collectionScene} from './kits.ts';
import {bricks} from './fixture.ts';
import {fabricScene} from './scene.ts';

const fields:Field[]=[
  {id:'fabric-content',label:'Content',type:'select',role:'view',default:'concepts',options:[{value:'concepts',label:'Fabric concepts'},{value:'bricks',label:'Brick visual study'}]},
  {id:'fabric-piece',label:'Individual piece',type:'select',role:'view',default:'none',options:[{value:'none',label:'All pieces of selected type'},...pieceIds.map(id=>({value:id,label:id}))]},
  {id:'fabric-selection',label:'Selected object or component',type:'select',role:'view',default:'none',options:[{value:'none',label:'Complete assembly'},...bricks.map(brick=>({value:brick.id,label:brick.label})),...lots.map(l=>({value:l.id,label:l.name})),...conceptEntities.map(id=>({value:id,label:id}))]},
  {id:'fabric-representation',label:'Representation',type:'select',role:'view',default:'2d',options:[{value:'2d',label:'2D'},{value:'3d',label:'3D'}]},
  {id:'fabric-level',label:'View level',type:'select',role:'view',default:'overview',options:[{value:'overview',label:'Overview'},{value:'detail',label:'Detail'}]},
  {id:'fabric-camera',label:'Camera',type:'select',role:'view',default:'overview',options:[...fabricScene.cameras.map(camera=>({value:camera.id,label:camera.label})),...lots.map(l=>({value:l.id,label:l.name+' focus'})),...['near','far','focus-a','focus-b'].map(id=>({value:id,label:id}))]},
  {id:'fabric-explode',label:'Fixture separation',type:'number',role:'view',default:0,min:0,max:1,step:.01},
  {id:'fabric-kit',label:'Kit',type:'select',role:'view',default:'lakehouse',options:kits.map(k=>({value:k.id,label:k.title}))},
  {id:'fabric-screen',label:'Screen',type:'select',role:'view',default:'gallery',options:[{value:'gallery',label:'Gallery'},{value:'detail',label:'Kit detail'}]},
  {id:'fabric-step',label:'Build step',type:'number',role:'view',default:6,min:1,max:6,step:1},
  {id:'fabric-isolate',label:'Isolate selected parts',type:'toggle',role:'view',default:false}
];

export default defineApp({
  manifest:{
    format:'datapass.web-app',schemaVersion:1,id:'fabric-bricks',version:'0.3.0',title:'Fabric Explorer',
    label:'Documented concepts / illustrative geometry',
    description:'Microsoft Fabric concepts with source references, a persistent overview and foreground component exploration. Client-authored teaching geometry; no connected Fabric tenant.',
    theme:{accent:'#305f72',density:'comfortable'},
    fields,datasets:[],tasks:[],
    pages:[{id:'overview',title:'Fabric Bricks',description:'Synthetic/provional interaction fixture; replace with source-approved content before client qualification.',sections:[{id:'fabric',columns:1,blocks:[{id:'fabric-workspace',type:'custom',resource:'fabricWorkspace'}]}]}]
  },
  bindings:{validateViewState(values){
    const selection=String(values['fabric-selection']),level=String(values['fabric-level']),camera=String(values['fabric-camera']);
    if(selection==='none'&&level==='detail')throw new Error('Fabric detail requires a selected semantic brick');
    if(selection!=='none'&&!['overview','near','far','focus-a','focus-b',selection].includes(camera))throw new Error('Fabric focus camera must match the selected semantic brick or use overview');
    if(['focus-a','focus-b'].includes(camera)&&selection==='none')throw new Error('Focus requires a selection');
    const piece=String(values['fabric-piece']);
    if(values['fabric-content']==='concepts'){
      if(selection!=='none'&&!conceptOwner(selection))throw new Error('Concept selection must belong to the documented Fabric map');
      if(piece!=='none')throw new Error('Brick piece selection is incompatible with the concepts map');
    }else if(conceptOwner(selection))throw new Error('Concept selection is incompatible with the brick study');
    if(piece!=='none'&&!getKit(String(values['fabric-kit'])).parts.some(p=>p.id===piece&&p.lot===selection))throw new Error('Selected piece must belong to the current kit and selected type');
    if(Number(values['fabric-step'])%1!==0)throw new Error('Fabric build step must be an integer');
    if(lots.some(l=>l.id===selection)&&!getBOM(String(values['fabric-kit'])).some(l=>l.id===selection))throw new Error('Selected part must belong to the current kit');
  }},
  resources:{scenes:{fabricScene,...kitScenes,collectionScene,conceptScene}},
  components:{fabricWorkspace:FabricExperience},
  customCapabilities:{fabricWorkspace:['spatial']}
});

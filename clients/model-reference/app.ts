import {modelStory} from './story.ts';
import {defineApp} from '../../src/framework/authoring.ts';
import {modelFields,modelBlock} from '../../src/framework/model-assets/index.ts';
import {model} from './model.ts';
export default defineApp({manifest:{format:'datapass.web-app',schemaVersion:1,id:"model-reference",version:'0.1.0',title:"Static model / reference app",label:'Synthetic model acceptance',description:'A verified static asset, semantic parts and optional 3D.',theme:{accent:'#286f89',density:'compact'},fields:[...modelFields(model),{id:'model-story',label:'Tour step',type:'number',role:'view',default:0,min:0,max:3,step:1}],datasets:[],tasks:[],pages:[{id:'overview',title:'Model explorer',description:'Inspect the outline first, then load approved geometry.',sections:[{id:'model',columns:1,blocks:[{id:'model-tour',type:'story-controls',resource:'modelStory'},modelBlock('model','assembly')]}]}]},bindings:{},resources:{models:{assembly:model},stories:{modelStory}}});

import type {StoryResource} from '../../src/framework/types.ts';
/** Existing narrative player controls the imported model through ordinary view-only fields. */
export const modelStory:StoryResource={indexField:'model-story',spec:{
  id:'imported-assembly-story',version:'1.0',title:'Explore the assembly',description:'An authored tour, not a physics simulation.',intervalMs:4000,
  visuals:[{id:'parts',version:'1.0',type:'ranking',title:'Five semantic parts',subtitle:'Index values are illustrative, not performance',takeaway:'Each part keeps its own identity.',source:'Synthetic model fixture',note:'No measured values.',accessibility:{summary:'Semantic part labels'},data:[{id:'frame',label:'Frame',time:0,value:1},{id:'plate',label:'Plate',time:0,value:1}],encodings:{id:'id',label:'label',time:'time',value:'value'},topN:2}],
  scenes:[{id:'overview',visualId:'parts',title:'Begin with the outline',caption:'Review the parts and evidence before loading geometry.'},{id:'focus',visualId:'parts',title:'Focus the plate',caption:'The same semantic identity drives the camera and inspector.'},{id:'separate',visualId:'parts',title:'Separate the assembly',caption:'Authored offsets expose the parts; no mechanics is being solved.'},{id:'return',visualId:'parts',title:'Reassemble',caption:'Return to the overview without recalculating domain results.'}]
},cues:{
  overview:{'model-view':'outline','model-selection':'none','model-camera':'overview','model-mode':'assembled'},
  focus:{'model-view':'model','model-selection':'plate','model-camera':'plate','model-mode':'assembled'},
  separate:{'model-view':'model','model-selection':'plate','model-camera':'overview','model-mode':'exploded','model-explode':1},
  return:{'model-view':'model','model-selection':'none','model-camera':'overview','model-mode':'assembled'}
}};

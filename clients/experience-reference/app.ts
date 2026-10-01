import {defineApp,explorerFields,explorerBlock,type AppDefinition} from '../../src/framework/index.ts';
import {contextDocuments,isInBranch} from '../../src/framework/explorer/navigation.ts';
import {atlas} from './atlas.ts';
import {atlasScene} from './scene.ts';
import {stableOrder} from './explanation.ts';
import {demoArchitecture} from '../../src/architecture/demo.ts';
const fields=explorerFields(atlas,'atlas');
const metricColumns=[{id:'id',label:'ID',type:'string' as const},{id:'label',label:'Item',type:'string' as const},{id:'count',label:'Count',type:'number' as const}];
const app:AppDefinition={manifest:{format:'datapass.web-app',schemaVersion:1,id:'experience-reference',version:'0.3.0',title:'Experience / reference app',label:'Synthetic interaction lab',description:'A client-owned system atlas that uses one framework for spatial discovery, project maps and a focused knowledge library.',theme:{mode:'dark',accent:'#70c6ef',density:'compact'},fields:[...fields,{id:'explanationStep',label:'Explanation frame',role:'view',type:'number',default:0,min:0,max:3,step:1}],datasets:[
  {id:'context-summary',title:'Current authored context',layer:'Presentation',description:'Counts the provided content, not professional experience or system performance.',source:'derived',provenance:'derived',rowKey:'id',columns:metricColumns,inputs:['atlas-focus','atlas-group','atlas-facet','atlas-view','atlas-level','atlas-document'],dependsOn:[]},
  {id:'coverage',title:'Document coverage by facet',layer:'Presentation',description:'Documents in the selected branch and domain.',source:'derived',provenance:'derived',rowKey:'id',columns:metricColumns,inputs:['atlas-focus','atlas-group'],dependsOn:[]}
],tasks:[],pages:[
  {id:'explore',title:'A system you can explore',description:'Move from the whole to a component, then to its work and evidence. Spatial, Map and Library are three views of the same authored content.',sections:[
    {id:'atlas',columns:1,blocks:[explorerBlock('system-atlas','atlas','atlas',true)]},
    {id:'context',columns:2,blocks:[{id:'context-component-count',type:'metric',title:'Components in scope',value:{dataset:'context-summary',row:'components',column:'count'},note:'Counted from the authored collection'},{id:'context-document-count',type:'metric',title:'Documents in this facet',value:{dataset:'context-summary',row:'documents',column:'count'},note:'Updates with selection and facet'}]},
    {id:'boundary',columns:1,blocks:[{id:'scope',type:'text',tone:'note',text:'This is not a final portfolio. Content and geometry are synthetic; the reusable navigation, shared context, document view and renderers belong to Studio. No client achievements, cloud status or certification claims are imported.'}]}
  ]},
  {id:'implementation',title:'Architecture walkthrough',description:'An explicit project destination, separate from selecting or zooming a component. This reuses the existing artifact review renderer.',sections:[{id:'review',columns:1,blocks:[{id:'project-architecture',type:'architecture',resource:'example'}]}]},
  {id:'signals',title:'Content signals',description:'The selected component and domain continue to drive this original D3 chart. These are counts of authored content, not performance claims.',sections:[{id:'coverage',columns:1,blocks:[{id:'coverage-chart',type:'chart',dataset:'coverage',kind:'bar',x:'label',y:'count',title:'Content by facet'}]}]},
  {id:'method',title:'Explain a transformation',description:'Original ConceptMotion semantics in a normal website. No old learning-app shell or embedded editor.',sections:[{id:'steps',columns:1,blocks:[{id:'stable-explanation',type:'explanation',resource:'stableOrder'}]},{id:'limits',columns:1,blocks:[{id:'explanation-scope',type:'text',tone:'note',text:'Frames are authored data, not a trace collected from running Python. The same component can explain a quality check, aggregation or algorithm with stable row identities.'}]}]}
]},bindings:{derive:{
  'context-summary':({values})=>{const state={focus:String(values['atlas-focus']),group:String(values['atlas-group']),facet:String(values['atlas-facet']),view:values['atlas-view'] as 'spatial'|'map'|'library',level:values['atlas-level'] as 'overview'|'focus'|'evidence',document:String(values['atlas-document'])};return [{id:'components',label:'Components',count:atlas.items.filter(i=>isInBranch(atlas,i.id,state.focus)&&(state.group==='all'||i.group===state.group)).length},{id:'documents',label:'Documents',count:contextDocuments(atlas,state).length}];},
  coverage:({values})=>atlas.facets.map(f=>({id:f.id,label:f.label,count:atlas.documents.filter(d=>d.facet===f.id&&isInBranch(atlas,d.item,String(values['atlas-focus']))&&(values['atlas-group']==='all'||atlas.items.find(i=>i.id===d.item)?.group===values['atlas-group'])).length}))
}},resources:{explorers:{atlas},scenes:{atlas:atlasScene},explanations:{stableOrder},architectures:{example:demoArchitecture}}};
export default defineApp(app);

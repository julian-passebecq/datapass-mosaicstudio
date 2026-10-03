import {defineApp} from '../../src/framework/authoring.ts';
import type {RunResource} from '../../src/framework/foundation/journal.ts';
import {navigationFields,readNavigation} from '../../src/framework/foundation/navigation.ts';
import {NavigationDemo} from './NavigationDemo.tsx';
import {KnowledgeDemo} from './KnowledgeDemo.tsx';
import {navigation} from './navigation.ts';
export const runResource:RunResource={maxRecords:12,maxBytes:2097152,specs:[{
  format:'datapass.run-spec',version:1,taskId:'evaluate',modelId:'scale-fixture',modelVersion:'1.0.0',providerId:'browser-handler',source:'Synthetic scaling fixture. Values and the short delay are authored acceptance data, not Foil\'o measurements or physics.',provenance:'synthetic',representations:[
    {id:'curve',title:'Curve',kind:'chart',chart:'line',x:'time',y:'value',unit:'relative units'},
    {id:'table',title:'Table',kind:'table'},
    {id:'metric',title:'Last sample',kind:'metric',row:'sample-11',column:'value',digits:2,unit:'relative units'},
    {id:'json',title:'JSON',kind:'json'},
  ],
}]};
export default defineApp({manifest:{
  format:'datapass.web-app',schemaVersion:1,id:'foundation-reference',version:'0.6.0',title:'Foundation / reference app',label:'Synthetic framework acceptance',description:'One task runtime, durable result semantics and independent stakeholder views. No connected cloud or validated physical model.',theme:{accent:'#286f89',density:'compact'},
  fields:[{id:'gain',label:'Gain',role:'input',type:'number',default:1,min:0,max:4,step:.5},{id:'reject-run',label:'Demonstrate a model error',role:'input',type:'toggle',default:false},...navigationFields(navigation,'nav')],
  datasets:[{id:'result',title:'Scaled example series',layer:'Gold',description:'One synthetic output with several representations.',source:'task',provenance:'synthetic',rowKey:'id',columns:[{id:'id',label:'Sample',type:'string'},{id:'time',label:'Elapsed example time',type:'number',unit:'s'},{id:'value',label:'Output',type:'number',unit:'relative units'}],inputs:['gain','reject-run'],dependsOn:[]}],
  tasks:[{id:'evaluate',label:'Evaluate example',output:'result',timeoutMs:3000}],
  pages:[
    {id:'runs',title:'Results',description:'Run once; inspect the same output as a chart, table, metric or JSON. Compare captured runs without rerunning either model.',sections:[{id:'runs',columns:1,blocks:[{id:'run-workbench',type:'runs',resource:'experiments'}]}]},
    {id:'navigation',title:'Navigation',description:'A synthetic ecosystem pressure-tests the Galaxy contract: projection, facet and depth do not change semantic identity or trigger calculations.',sections:[{id:'navigation',columns:1,blocks:[{id:'navigation-demo',type:'custom',resource:'navigationDemo'}]}]},
    {id:'knowledge',title:'Sources',description:'Search and prepare approved source context locally. Nothing is sent automatically to an external service.',sections:[{id:'knowledge',columns:1,blocks:[{id:'knowledge-demo',type:'custom',resource:'knowledgeDemo'}]}]},
  ],
},bindings:{validateViewState:values=>{readNavigation(navigation,values,'nav');},tasks:{evaluate:async({values,signal})=>{
  await new Promise<void>((resolve,reject)=>{const done=()=>{signal.removeEventListener('abort',abort);resolve();},timer=setTimeout(done,260),abort=()=>{clearTimeout(timer);reject(new Error('Example cancelled'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  if(values['reject-run'])throw new Error('Deliberate synthetic model error. No artifact was produced.');
  return Array.from({length:12},(_,i)=>({id:'sample-'+i,time:i,value:(i+1)*Number(values.gain)}));
}}},resources:{runs:{experiments:runResource}},components:{navigationDemo:NavigationDemo,knowledgeDemo:KnowledgeDemo},customCapabilities:{navigationDemo:[],knowledgeDemo:[]}});

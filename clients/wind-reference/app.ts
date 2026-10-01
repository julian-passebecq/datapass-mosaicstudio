import {defineApp,type AppDefinition,type Dataset,type Values,type Rows} from '../../src/framework/index.ts';
import {indicativeLcoe,annualEnergy} from './model.ts';
import {turbine} from './scene.ts';
import {assemblyStory} from './story.ts';
const columns=[{id:'id',label:'ID',type:'string' as const},{id:'label',label:'Indicator',type:'string' as const},{id:'value',label:'Value',type:'number' as const},{id:'unit',label:'Unit',type:'string' as const}];
const dataset=(id:string,title:string,layer:string,source:Dataset['source'],inputs:string[],dependsOn:string[]):Dataset=>({id,title,layer,source,inputs,dependsOn,columns,rowKey:'id',description:title+' for the illustrative constant-output model.',provenance:source==='inline'?'synthetic':'derived'});
const model=(v:Values)=>indicativeLcoe({powerMW:Number(v.power),capacityFactor:Number(v.capacityFactor)/100,capex:Number(v.capex),opex:Number(v.opex),years:Number(v.years),discount:Number(v.discount)/100});
const modelInputs=['power','capacityFactor','capex','opex','years','discount'];
const definition:AppDefinition={
  manifest:{format:'datapass.web-app',schemaVersion:1,id:'wind-reference',version:'0.2.0',title:'Wind / reference app',label:'Synthetic framework acceptance client',description:'A reusable 3D story and a small scenario model built only from Studio contracts.',theme:{accent:'#286b7d',density:'compact'},
    fields:[
      {id:'power',label:'Rated power',type:'number',role:'input',default:6,min:1,max:20,step:.5,unit:'MW'},
      {id:'capacityFactor',label:'Capacity factor',type:'number',role:'input',default:42,min:10,max:70,step:1,unit:'%'},
      {id:'capex',label:'Capital cost',type:'number',role:'input',default:9000000,min:100000,max:100000000,step:100000,unit:'EUR'},
      {id:'opex',label:'Annual operating cost',type:'number',role:'input',default:220000,min:0,max:5000000,step:10000,unit:'EUR/year'},
      {id:'years',label:'Operating life',type:'number',role:'input',default:25,min:1,max:50,step:1,unit:'years'},
      {id:'discount',label:'Discount rate',type:'number',role:'input',default:6,min:0,max:20,step:.5,unit:'%'},
      {id:'explode',label:'Exploded view',type:'number',role:'view',default:0,min:0,max:1,step:.01},
      {id:'phase',label:'Rotor phase',type:'number',role:'view',default:0,min:0,max:1,step:.01},
      {id:'camera',label:'Camera preset',type:'select',role:'view',default:'iso',options:turbine.cameras.map(c=>({value:c.id,label:c.label}))},
      {id:'selection',label:'Selected component',type:'select',role:'view',default:'none',options:[{value:'none',label:'All components'},...turbine.entities.map(e=>({value:e.id,label:e.label}))]},
      {id:'storyStep',label:'Assembly story step',type:'number',role:'view',default:0,min:0,max:3,step:1}
    ],
    datasets:[
      dataset('assumptions','Reference conventions','Bronze','inline',[],[]),
      dataset('energy','Annual energy','Silver','derived',['power','capacityFactor'],[]),
      dataset('economics','Indicative economics','Gold','derived',modelInputs,['energy']),
      {...dataset('sensitivity','Capacity-factor sensitivity','Gold','derived',modelInputs,[]),columns:[{id:'id',label:'ID',type:'string'},{id:'capacityFactor',label:'Capacity factor',type:'number',unit:'%'},{id:'lcoe',label:'Indicative LCOE',type:'number',unit:'EUR/MWh'}]},
      dataset('checked','Explicit scenario result','Gold','task',[],['economics'])
    ],
    tasks:[{id:'scenario-check',label:'Run scenario check',output:'checked',timeoutMs:5000}],
    pages:[
      {id:'turbine',title:'Turbine',description:'An interactive assembly, one shared story, and original VizForge charts. This is a framework acceptance example, not the final client website.',sections:[
        {id:'assembly',columns:3,blocks:[{id:'turbine-scene',type:'scene3d',span:2,resource:'turbine',explode:'explode',phase:'phase',camera:'camera',selection:'selection'},{id:'assembly-controls',type:'story-controls',resource:'assembly'}]},
        {id:'story-data',columns:3,blocks:[{id:'assembly-chart',type:'story-figure',span:2,resource:'assembly'},{id:'scene-boundary',type:'text',title:'Built from reusable blocks',text:'Scene geometry and camera presets belong to this client. Three.js rendering, selection, export and reduced-motion behavior belong to Studio.\nThe story is the existing VizForge StorySpec. There is no second playback timer.',tone:'lead'}]}
      ]},
      {id:'economics',title:'Economics',description:'Change assumptions to update only their dependent datasets. Values are illustrative and are not suitable for an investment decision.',sections:[
        {id:'kpis',columns:3,blocks:[{id:'lcoe',type:'metric',title:'Indicative LCOE',value:{dataset:'economics',row:'lcoe',column:'value'},unit:'EUR/MWh',digits:2,note:'Annualized cost / constant annual energy'},{id:'aep',type:'metric',title:'Annual energy',value:{dataset:'energy',row:'aep',column:'value'},unit:'MWh',digits:0,note:'Rated MW x 8,760 x capacity factor'},{id:'annual-cost',type:'metric',title:'Annualized cost',value:{dataset:'economics',row:'annualCost',column:'value'},unit:'EUR/year',digits:0}]},
        {id:'inputs',title:'Scenario assumptions',columns:3,blocks:modelInputs.map(id=>({id:'input-'+id,type:'input' as const,field:id}))},
        {id:'analysis',columns:2,blocks:[{id:'sensitivity-chart',type:'chart',dataset:'sensitivity',kind:'line',x:'capacityFactor',y:'lcoe',title:'Capacity factor / indicative LCOE',unit:'EUR/MWh'},{id:'scenario-task',type:'task',task:'scenario-check'}]},
        {id:'outputs',columns:2,blocks:[{id:'economics-table',type:'table',dataset:'economics'},{id:'checked-table',type:'table',dataset:'checked'}]},
        {id:'limitations',columns:1,blocks:[{id:'finance-scope',type:'text',tone:'note',text:'Simplified constant annual generation and OPEX; no degradation, curtailment, taxes, financing structure, replacements, decommissioning or inflation. The model is an implementation example, not a bankable LCOE assessment. The scene geometry is unrelated to these numerical inputs.'}]}
      ]},
      {id:'contracts',title:'Data contract',description:'Explicit layers and dependencies without requiring a lakehouse or a notebook server.',sections:[{id:'catalog',columns:1,blocks:[{id:'datasets',type:'catalog'}]},{id:'equation',columns:1,blocks:[{id:'formula',type:'code',title:'Client-owned model',language:'TypeScript',text:'AEP = ratedMW * 8760 * capacityFactor;\nCRF = rate === 0 ? 1 / years : rate / (1 - (1 + rate) ** -years);\nLCOE = (capitalCost * CRF + annualOperatingCost) / AEP;'}]}]}
    ]
  },
  bindings:{
    inline:{assumptions:[{id:'hours',label:'Annual hours (non-leap reference)',value:8760,unit:'hours'},{id:'degradation',label:'Degradation omitted',value:0,unit:'%'}]},
    derive:{
      energy:({values})=>[{id:'aep',label:'Annual energy',value:annualEnergy(Number(values.power),Number(values.capacityFactor)/100),unit:'MWh'}],
      economics:({values})=>{const out=model(values);return [{id:'lcoe',label:'Indicative LCOE',value:out.lcoe,unit:'EUR/MWh'},{id:'annualCost',label:'Annualized cost',value:out.annualCost,unit:'EUR/year'}];},
      sensitivity:({values})=>[20,25,30,35,40,45,50,55,60,65,70].map(cf=>({id:'cf-'+cf,capacityFactor:cf,lcoe:model({...values,capacityFactor:cf}).lcoe}))
    },
    tasks:{'scenario-check':async({datasets,signal,report}):Promise<Rows>=>{
      report(.2);
      await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new Error('Cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},500);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});
      report(1);return datasets.economics.map(r=>({...r,id:'checked-'+r.id,label:'Explicit result: '+r.label}));
    }}
  },resources:{scenes:{turbine},stories:{assembly:assemblyStory}}
};
export default defineApp(definition);

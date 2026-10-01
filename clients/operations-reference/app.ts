import {defineApp,type AppDefinition,type Column} from '../../src/framework/index.ts';
const rawColumns:Column[]=[{id:'id',label:'ID',type:'string'},{id:'region',label:'Region',type:'string'},{id:'month',label:'Month',type:'number'},{id:'revenue',label:'Revenue',type:'number',unit:'EUR'},{id:'cost',label:'Cost',type:'number',unit:'EUR'}];
const raw=['North','South','East','West'].flatMap((region,index)=>Array.from({length:12},(_,i)=>({id:`row-${index}-${i}`,region,month:i+1,revenue:45000+index*9500+i*1200,cost:29000+index*5800+i*750})));
const app:AppDefinition={manifest:{format:'datapass.web-app',schemaVersion:1,id:'operations-reference',version:'0.2.0',title:'Operations / reference app',label:'Synthetic framework acceptance client',description:'A small business data app built with the same registry as the 3D wind example.',theme:{accent:'#356da2',density:'compact'},
  fields:[{id:'region',label:'Region filter',type:'select',role:'input',default:'All',options:['All','North','South','East','West'].map(value=>({value,label:value}))},{id:'minimum',label:'Minimum monthly revenue',type:'number',role:'input',default:0,min:0,max:200000,step:1000,unit:'EUR'}],
  datasets:[
    {id:'orders',title:'Monthly regional observations',layer:'Bronze',description:'48 deterministic synthetic rows. No customer or production data.',source:'inline',provenance:'synthetic',rowKey:'id',columns:rawColumns,inputs:[],dependsOn:[]},
    {id:'filtered',title:'Filtered observations',layer:'Silver',description:'Client-owned pure filtering for this small acceptance dataset.',source:'derived',provenance:'derived',rowKey:'id',columns:rawColumns,inputs:['region','minimum'],dependsOn:['orders']},
    {id:'summary',title:'Performance indicators',layer:'Gold',description:'Totals derived from the currently filtered rows.',source:'derived',provenance:'derived',rowKey:'id',columns:[{id:'id',label:'Indicator',type:'string'},{id:'value',label:'Value',type:'number',nullable:true}],inputs:[],dependsOn:['filtered']},
    {id:'regional',title:'Revenue by region',layer:'Gold',description:'Region aggregation for the existing VizForge ranking renderer.',source:'derived',provenance:'derived',rowKey:'region',columns:[{id:'region',label:'Region',type:'string'},{id:'revenue',label:'Revenue',type:'number',unit:'EUR'}],inputs:[],dependsOn:['filtered']}
  ],tasks:[],pages:[
    {id:'overview',title:'Overview',description:'A compact business page, not a notebook. The same field bindings update its metrics, chart and table.',sections:[
      {id:'inputs',columns:2,blocks:[{id:'region-control',type:'input',field:'region'},{id:'minimum-control',type:'input',field:'minimum'}]},
      {id:'kpis',columns:3,blocks:[{id:'total-revenue',type:'metric',title:'Revenue',value:{dataset:'summary',row:'revenue',column:'value'},unit:'EUR',digits:0},{id:'gross-margin',type:'metric',title:'Gross margin',value:{dataset:'summary',row:'margin',column:'value'},unit:'%',digits:1},{id:'observation-count',type:'metric',title:'Observations',value:{dataset:'summary',row:'count',column:'value'},digits:0}]},
      {id:'visual',columns:1,blocks:[{id:'regional-chart',type:'chart',title:'Regional revenue',dataset:'regional',kind:'bar',x:'region',y:'revenue',unit:'EUR'}]},
      {id:'details',columns:1,blocks:[{id:'rows',type:'table',dataset:'filtered',pageSize:10}]}
    ]},
    {id:'contracts',title:'Data contract',description:'Clear ownership, no lakehouse requirement.',sections:[{id:'metadata',columns:1,blocks:[{id:'catalog',type:'catalog'},{id:'local-limit',type:'text',tone:'note',text:'This acceptance client uses small in-memory rows and pure source bindings. It does not replace UWData Mosaic for query-coordinated brushing, and does not initialize DuckDB. The existing SQLRooms workbench keeps those larger-data capabilities.'}]}]}
  ]},bindings:{inline:{orders:raw},derive:{
    filtered:({values,datasets})=>datasets.orders.filter(r=>(values.region==='All'||r.region===values.region)&&Number(r.revenue)>=Number(values.minimum)),
    summary:({datasets})=>{const revenue=datasets.filtered.reduce((s,r)=>s+Number(r.revenue),0),cost=datasets.filtered.reduce((s,r)=>s+Number(r.cost),0);return [{id:'revenue',value:revenue},{id:'margin',value:revenue?(revenue-cost)/revenue*100:null},{id:'count',value:datasets.filtered.length}];},
    regional:({datasets})=>[...new Set(datasets.filtered.map(r=>String(r.region)))].map(region=>({region,revenue:datasets.filtered.filter(r=>r.region===region).reduce((sum,r)=>sum+Number(r.revenue),0)}))
  }}};
export default defineApp(app);

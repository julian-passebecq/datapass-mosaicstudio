import type {ReplaySpec} from '../../src/framework/replay/model.ts';
/** Deterministic invented signals for interface acceptance, not Foil'o measurements. */
const time=Array.from({length:49},(_,i)=>i<25?i:i+3);
const entities=[
  {id:'rig-a',label:'Rig A',description:'Generic oscillating plate assembly. Illustrative geometry only.',position:[-4,-3] as [number,number],camera:'rig-a-detail'},
  {id:'rig-b',label:'Rig B',description:'Includes deliberately missing signal samples to exercise honest data handling.',position:[4,-3] as [number,number],camera:'rig-b-detail'},
  {id:'rig-c',label:'Rig C',description:'Independent synthetic phase, same shared recording clock.',position:[0,4] as [number,number],camera:'rig-c-detail'},
];
const round=(n:number)=>Math.round(n*1000)/1000;
function values(fn:(t:number,i:number,e:number)=>number|null){return Object.fromEntries(entities.map((e,k)=>[e.id,time.map((t,i)=>{const value=fn(t,i,k);return value===null?null:round(value);})]));}
export const recording:ReplaySpec={format:'datapass.replay',version:1,title:'Energy installation / replay',description:'Inspect a supplied sample across the site plan, signals and an optional 3D assembly. Nothing here is a live measurement or a validated Foil\'o model.',source:'Synthetic acceptance fixture, authored in clients/energy-replay-reference/recording.ts',provenance:'synthetic',time,maxGapSeconds:1.5,entities,
  channels:[
    {id:'wind',label:'Wind test signal',unit:'m/s',digits:1,domain:[0,20],values:values((t,_i,e)=>8+2*Math.sin(t/8+e*.4))},
    {id:'stroke',label:'Displacement test signal',unit:'m',digits:2,domain:[-.7,.7],values:values((t,i,e)=>e===1&&i===21?null:.55*Math.sin(t/2+e*.8))},
    {id:'power',label:'Output test signal',unit:'kW',digits:1,domain:[0,200],values:values((t,i,e)=>e===1&&i>=17&&i<=21?null:105+e*10+25*Math.sin(t/8+e*.5))},
    {id:'load',label:'Load test signal',unit:'N',digits:0,domain:[0,1000],values:values((t,_i,e)=>440+95*Math.sin(t/3+e))},
  ],events:[
    {id:'event-start',time:0,entity:null,label:'Recording begins',detail:'All values are deterministic synthetic samples.'},
    {id:'event-gap',time:18,entity:'rig-b',label:'Missing output sample',detail:'The value is null. The plot must not fill this interval or report zero.'},
    {id:'event-time-gap',time:28,entity:null,label:'Recording resumes after gap',detail:'No observations are supplied for the skipped times.'},
    {id:'event-end',time:51,entity:null,label:'Review checkpoint',detail:'Use the same sample and selection in either presentation.'},
  ],scene:'rigs',overviewCamera:'overview',motion:entities.map(e=>({part:e.id+'-carriage',entity:e.id,channel:'stroke',kind:'translate',axis:'y',scale:1,offset:0}))};

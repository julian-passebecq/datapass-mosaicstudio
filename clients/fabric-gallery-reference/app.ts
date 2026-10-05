import {defineApp} from '../../src/framework/authoring.ts';
import {Dashboard} from './Dashboard.tsx';
import {CATEGORIES,CHANNELS,DISCOUNT_RANGE,MARGIN_RANGE,REGIONS} from './data.ts';
const options=(list:readonly {key:string;label:string}[])=>list.map(o=>({value:o.key,label:o.label}));
/** Viz kit N1 gallery: a Fabric-app-like dashboard over SYNTHETIC orders. Cross-visual state is
 * five view fields (three multi selections, two brush intervals) plus theme and bar layout.
 */
export default defineApp({manifest:{
  format:'datapass.web-app',schemaVersion:1,id:'fabric-gallery-reference',version:'0.1.0',title:'Viz gallery / reference app',label:'Synthetic viz kit acceptance',
  description:'A dense analytics dashboard built from the DataPass viz kit: KPI count-ups, stacked bars, areas, donut, heatmap and a 50,000-point canvas scatter with crossfilter. Synthetic data only.',
  theme:{accent:'#0b7a70',density:'compact'},
  fields:[
    {id:'fg-theme',label:'Theme',type:'select',role:'view',default:'dark',options:[{value:'dark',label:'Dark'},{value:'light',label:'Light'}]},
    {id:'fg-bar-mode',label:'Bar layout',type:'select',role:'view',default:'stacked',options:[{value:'stacked',label:'Stacked'},{value:'grouped',label:'Grouped'}]},
    {id:'fg-region',label:'Selected regions',type:'multi',role:'view',default:'',options:options(REGIONS)},
    {id:'fg-category',label:'Selected categories',type:'multi',role:'view',default:'',options:options(CATEGORIES)},
    {id:'fg-channel',label:'Selected channels',type:'multi',role:'view',default:'',options:options(CHANNELS)},
    {id:'fg-discount',label:'Discount brush',type:'interval',role:'view',default:null,min:DISCOUNT_RANGE[0],max:DISCOUNT_RANGE[1],unit:'%'},
    {id:'fg-margin',label:'Margin brush',type:'interval',role:'view',default:null,min:MARGIN_RANGE[0],max:MARGIN_RANGE[1],unit:'%'},
  ],
  datasets:[],tasks:[],
  pages:[{id:'dashboard',title:'Revenue cockpit',description:'Synthetic Contoso sales orders. Click or brush any visual to filter the others.',sections:[{id:'dashboard',columns:1,blocks:[{id:'gallery',type:'custom',resource:'dashboard'}]}]}],
},bindings:{},components:{dashboard:Dashboard},customCapabilities:{dashboard:[]}});

import {defineApp} from '../../src/framework/authoring.ts';
import {Portfolio} from './Portfolio.tsx';
/** Portfolio showcase: a compact public-site client (content family, no 3D, no SQL, no runs).
 * One page, one client-owned component. The only field is the theme (view state).
 */
export default defineApp({manifest:{
  format:'datapass.web-app',schemaVersion:1,id:'portfolio-showcase',version:'0.1.0',
  title:'Julian Passebecq · data engineering & analytics apps',label:'Portfolio showcase built with DataPass Studio',
  description:'Selected data engineering and analytics work built with DataPass Studio, with live numbers read from the framework repository at build time.',
  theme:{accent:'#c8402a',density:'comfortable'},
  fields:[{id:'pf-theme',label:'Theme',type:'select',role:'view',default:'auto',options:[{value:'auto',label:'Follow system'},{value:'light',label:'Light'},{value:'dark',label:'Dark'}]}],
  datasets:[],tasks:[],
  pages:[{id:'home',title:'Portfolio',description:'Selected work, the framework behind it and contact.',sections:[{id:'portfolio',columns:1,blocks:[{id:'portfolio',type:'custom',resource:'portfolio'}]}]}],
},bindings:{},components:{portfolio:Portfolio},customCapabilities:{portfolio:[]}});

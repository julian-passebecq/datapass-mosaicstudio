import {defineApp} from '../../src/framework/authoring.ts';
import type {Field} from '../../src/framework/types.ts';
import {ParamLab} from './ParamLab.tsx';
import {paramFields} from './params.ts';
import {selectionOptions} from './features.ts';

/** Model inputs (rebuild the solid) are generated from the param schema.
 * View state (selection, camera, overlays) never triggers a rebuild.
 */
const viewFields: Field[] = [
  {id:'view-selection',label:'Selected feature',type:'select',role:'view',default:'none',options:selectionOptions()},
  {id:'view-camera',label:'Camera preset',type:'select',role:'view',default:'iso',options:[{value:'iso',label:'Isometric'},{value:'front',label:'Front (axis)'},{value:'side',label:'Side'},{value:'top',label:'Top'}]},
  {id:'view-edges',label:'Show feature edges',type:'toggle',role:'view',default:true},
  {id:'view-wire',label:'Wireframe overlay',type:'toggle',role:'view',default:false},
];

export default defineApp({
  manifest:{format:'datapass.web-app',schemaVersion:1,id:'param-lab',version:'0.1.0',title:'Param Lab',label:'Prototype - ILLUSTRATIVE geometry, not FOIL data',
    description:'Parametric CAD lab: schema-driven sliders rebuild a solid in a worker; clicking a face or edge shows its stable feature id, driving parameters and geometry references.',
    theme:{accent:'#286f89',density:'compact'},
    fields:[...paramFields(),...viewFields],datasets:[],tasks:[],
    pages:[{id:'lab',title:'Parametric blade + hub',description:'Generic NACA 4-digit blade on a hub. Illustrative shape only: no FOIL data, no validated design, no hydrodynamic claim.',
      sections:[{id:'lab',columns:1,blocks:[{id:'param-lab',type:'custom',resource:'paramLab'}]}]}]},
  bindings:{},
  components:{paramLab:ParamLab},
  customCapabilities:{paramLab:['spatial']},
});

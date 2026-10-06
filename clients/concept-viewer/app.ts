import {defineApp} from '../../src/framework/authoring.ts';
import {ConceptViewer} from './ConceptViewer.tsx';
import {RENDERINGS} from './examples.ts';

/**
 * Concept Viewer: reference client for concept spec v1. Opens any spec file (bundled example, drag-and-drop,
 * or `?spec=<relative path>`) and switches between the isometric SVG, the flat layer cake and the lazy 3D scene.
 * Only the rendering is saved view state; the loaded file is never stored, and nothing is computed.
 */
export default defineApp({
  manifest:{
    format:'datapass.web-app',schemaVersion:1,id:'concept-viewer',version:'0.1.0',title:'Concept Viewer',
    label:'REFERENCE',
    description:'Open any concept spec v1 file and see it as an isometric diagram, a layer cake or a 3D scene, with the same ids.',
    theme:{accent:'#2f6f84',density:'comfortable'},
    fields:[{id:'concept-rendering',label:'Rendering',type:'select',role:'view',default:'isometric',options:RENDERINGS.map(r=>({value:r.id,label:r.label}))}],
    datasets:[],tasks:[],
    pages:[{id:'viewer',title:'Concept Viewer',description:'Concept spec viewer.',sections:[{id:'viewer',columns:1,blocks:[{id:'concept-viewer',type:'custom',resource:'conceptViewer'}]}]}]
  },
  bindings:{},
  components:{conceptViewer:ConceptViewer},
  customCapabilities:{conceptViewer:['spatial']}
});

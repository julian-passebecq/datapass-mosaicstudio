import {defineApp} from '../../src/framework/authoring.ts';
import {artifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';

/** Python computes, Studio renders: public/artifacts/wind-aep-weibull.json is written by py/notebooks/wind_reference.py. */
export default defineApp({manifest:{
  format:'datapass.web-app',schemaVersion:1,id:'python-wind-reference',version:'0.1.0',title:'Wind / Python artifact reference',label:'ILLUSTRATIVE Python bridge proof',
  description:'A table computed by any Python producer (script, Jupyter, marimo, job or service) and rendered by Studio with its provenance. Generic power curve and Weibull wind; not FOIL data and not a site assessment.',
  theme:{accent:'#286f89',density:'compact'},fields:[],datasets:[],tasks:[],
  pages:[{id:'result',title:'Annual energy',description:'One Python-written datapass.artifact v1 file, validated in the browser before display. No calculation runs in TypeScript.',sections:[
    {id:'note',columns:1,blocks:[{id:'illustrative',type:'text',tone:'note',text:'ILLUSTRATIVE values: a generic 3 MW-class power curve integrated against a Weibull (k=2) wind distribution, gross of losses. Regenerate with: python py/wind_reference_model.py'}]},
    {id:'artifact',columns:1,blocks:[{id:'aep-artifact',type:'custom',resource:'aepArtifact'}]},
  ]}],
},bindings:{},components:{aepArtifact:artifactSource('wind-aep-weibull',['aep-8','table','curve'])},customCapabilities:{aepArtifact:['charts']}});

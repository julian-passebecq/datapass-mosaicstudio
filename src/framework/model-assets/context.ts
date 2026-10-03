import {validateContext,type ContextModel} from '../foundation/context.ts';
import type {ModelSpec,ModelState} from './model.ts';
export function modelContext(spec:ModelSpec,state:ModelState):ContextModel {
  const part=spec.parts.find(p=>p.id===state.selection);
  return validateContext({id:part?.id??'model-overview',kind:part?'Model part':'Model asset',title:part?.label??spec.title,summary:part?.description??spec.note,
    facts:[{label:'Source',value:spec.provenance},{label:'Declared file size',value:spec.asset.byteLength+' bytes'},{label:'View mode',value:state.mode},...(part?[{label:'Bound GLB node',value:String(part.node)}]:[{label:'Semantic parts',value:String(spec.parts.length)}])],
    references:part?.evidence??[],related:[],note:'Geometry, labels and offsets are supplied by the author. File integrity is not engineering validation. A visual cutaway has no capped CAD section.'},spec.sources);
}

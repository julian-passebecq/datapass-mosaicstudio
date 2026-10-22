import type {SelectionBinding} from '../../src/framework/engineering/index.ts';
/** SYNTHETIC selection-binding record for the generic engineering consumer (datapass.engineering/1).
 * `geometryRevision` is the designDigest of ./model.ts (tests/engineering-binding.test.mjs asserts it). Bindings are authored
 * here, never inferred by the framework: one of them is deliberately `inferred` and one `unmapped`. */
export const MODEL_GEOMETRY_REVISION='f63a96a1dbe2134aef495820fad0964ee62fbc56fba50a3d671227266c311623';
export const genericBinding:SelectionBinding={
  format:'datapass.engineering',version:1,kind:'selection-binding',entityId:'plate',
  geometryRevision:{alg:'sha256',over:'datapass-c14n/1',value:MODEL_GEOMETRY_REVISION},
  viewToken:'synthetic.model-reference.1',
  bindings:[
    {signal:'plate.heave',entityId:'plate',status:'sourced',source:'SYNTHETIC acceptance column plate_heave (authored fixture, no measurement)'},
    {signal:'module.output',entityId:'module',status:'sourced',source:'SYNTHETIC acceptance column module_output (authored fixture, no conversion model)'},
    {signal:'linkage.load',entityId:'linkage',status:'inferred',source:'Authored hint only: the signal name starts with "linkage"; not confirmed by a source'},
    {signal:'frame.vibration',entityId:null,status:'unmapped'},
  ],
  timeCursor:0,
};
/** SYNTHETIC illustrative samples at t = 0..10 s, one per second. Not results of any model; values are relative units. */
export const SYNTHETIC_SAMPLES:Readonly<Record<string,readonly number[]>>={
  'plate.heave':[0,.59,.95,.95,.59,0,-.59,-.95,-.95,-.59,0],
  'module.output':[0,.2,.45,.7,.85,.9,.85,.7,.45,.2,0],
  'linkage.load':[.1,.3,.5,.6,.5,.3,.1,.3,.5,.6,.5],
  'frame.vibration':[.02,.05,.01,.04,.03,.02,.05,.01,.04,.03,.02],
};

/** Pure authoring entry. No Three.js, GLTFLoader or network initialization. */
export {validateModel,validateModelAsset,modelFields,modelBlock,readModelState,MODEL_MODES,MODEL_LIMITS} from './model.ts';
export type {ModelSpec,ModelAsset,PartBinding,ModelAnnotation,ModelState,ModelBlock,ModelMode} from './model.ts';
export {inspectGlb,validatePartBindings} from './glb.ts';
export {verifyModelBytes,fetchModelBytes} from './load.ts';
export {modelContext} from './context.ts';

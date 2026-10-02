/** Pure optional authoring entry. Import rendering explicitly only when composing custom UI. */
export {validateMotion, motionFields, motionBlock, readMotionState} from './model.ts';
export type {MotionSpec, MotionBlock, MotionState, MotionCommand, MotionEntity, MotionProjection} from './model.ts';
export {compileMotion, motionFrame, pointAlong, stationAnchor} from './compile.ts';
export type {CompiledMotion, MotionFrame} from './compile.ts';
export {motionSvg, motionReport} from './export.ts';

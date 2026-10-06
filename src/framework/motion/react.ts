/** Explicit rendering entry. This loads D3, not Three.js. */
export {default as MotionViewport} from './Viewport';
export type {MotionView} from './renderer';
export {MotionScope,useMotionController} from './Scope';
/** For specs built at runtime (not in resources.motions): one controller per compiled spec. */
export {createMotionController, MOTION_SPEED} from './controller';
export type {MotionController, MotionControllerOptions} from './controller';

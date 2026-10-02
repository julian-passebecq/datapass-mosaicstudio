/** Pure authoring surface; importing it does not load React, Three.js or DuckDB. */
export type * from './types.ts';
export {SiteRuntime} from './runtime.ts';
export {validateManifest,validateDefinition,validateRows,parseSavedState,LIMITS} from './validate.ts';
export {validateScene,pose} from './scene.ts';
export type {SceneSpec,ScenePart,Vec3} from './scene.ts';
export {componentCatalog} from './catalog.ts';
import type {AppDefinition} from './types.ts';
import {validateDefinition} from './validate.ts';
export function defineApp(app:AppDefinition):AppDefinition{validateDefinition(app);return app;}

export {createJsonTask} from './http-task.ts';
export type {JsonTaskOptions} from './http-task.ts';

export {validateExplorer,explorerFields,explorerBlock,validateExplorerState,readExplorerState,explorerStatePatch} from './explorer/model.ts';
export type {ExplorerSpec,ExplorerState,ExplorerItem,ExplorerDocument,ExplorerBlock} from './explorer/model.ts';
export {navigateExplorer,ancestors,contextDocuments,explorerCamera,searchExplorer,explorerLink,readExplorerLink} from './explorer/navigation.ts';
export {validateExplanation} from './explanation.ts';
export type {ExplanationResource} from './explanation.ts';

export {planCapabilities,capabilityCatalog,appFamilies,familyById} from './capabilities.ts';
export type {AppFamily,CapabilityId,CapabilityPlan} from './capabilities.ts';
export {validateReplay,replayFields,replayBlock,sampleValue,nearestSample} from './replay/model.ts';
export type {ReplaySpec,ReplayBlock,ReplayEntity,ReplayChannel,ReplayMotion} from './replay/model.ts';

export {validateMotion,motionFields,motionBlock} from './motion/model.ts';
export type {MotionSpec,MotionBlock,MotionEntity,MotionStep,MotionCommand} from './motion/model.ts';
export {compileMotion,motionFrame} from './motion/compile.ts';
export {validateSources,validateEvidence} from './evidence/model.ts';
export type {SourceArtifact,EvidenceRef} from './evidence/model.ts';

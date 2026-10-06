/**
 * Concept spec v1: schema, validation and the static renderers. Pure modules only (no DOM, no Three.js).
 * The 3D scene and the film live in `concept/react/ConceptStage.tsx` and `concept/react/ConceptFilm.tsx`;
 * load them lazily so a 2D-only page never downloads Three.js.
 */
export * from './schema.ts';
export {conceptSpecJsonSchema,CONCEPT_SCHEMA_URL} from './json-schema.ts';
export {KINDS,kindLabel,kindColor,layerTint,FLOW_STYLE,INK,MUTED,PAPER,LINE} from './kinds.ts';
export {layerCakeSvg,flatRoutes,cardText,FLAT_FONT} from './flat.ts';
export {isometricSvg,toMotion,isoScreenPaths,ISO} from './iso.ts';
export {grid,flatCard,flatHead,flatFoot,FLAT,WORLD,nodePosition,layerY} from './layout.ts';
export {routes3d,isoRoutes,countCrossings,front} from './routing.ts';
export {navPose,overviewPose,step,transition,filmFrame,filmPlan,frameTime,defaultFocus,FILM_DURATION,FILM_FPS,OVERVIEW,type Nav,type Pose,type FilmFrame} from './navigation.ts';
export {flatGlyph,FLAT_GLYPHS} from './flat-glyphs.ts';
export {CONCEPT_GLYPHS,registerConceptGlyphs} from './iso-glyphs.ts';
export {textWidth,wrapText,fitText} from './text.ts';

import type {ConceptSpec} from './schema.ts';
import {layerCakeSvg} from './flat.ts';
import {isometricSvg} from './iso.ts';
export const CONCEPT_RENDERINGS=[
  {id:'isometric',label:'Isometric 2D'},
  {id:'layered',label:'Layer cake 2D'},
  {id:'3d',label:'3D scene'}
] as const;
export type ConceptRendering=typeof CONCEPT_RENDERINGS[number]['id'];
/** The two static renderings as standalone SVG documents (exportable, printable). */
export function conceptSvg(spec:ConceptSpec,rendering:'isometric'|'layered',selection='none'):string{
  return rendering==='layered'?layerCakeSvg(spec,selection):isometricSvg(spec,selection);
}

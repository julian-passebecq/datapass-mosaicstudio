/** Small default source entry. No React, Three.js or visualization package imports. */
import type {AppDefinition} from './types.ts';
import {validateDefinition} from './validate.ts';
export type {AppDefinition,Manifest,Block,Field,Dataset,Rows,Row,Values,Scalar,Page,Section} from './types.ts';
export function defineApp(app:AppDefinition):AppDefinition{validateDefinition(app);return app;}

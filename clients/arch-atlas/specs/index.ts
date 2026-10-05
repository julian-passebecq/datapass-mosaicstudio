import {validateSpec,type ArchSpec} from '../spec.ts';
import {fabricPlatform} from './fabricPlatform.ts';
import {datapassStack} from './datapassStack.ts';

export const specs:ArchSpec[]=[validateSpec(fabricPlatform),validateSpec(datapassStack)];
export const specById=(id:string)=>specs.find(s=>s.id===id)??specs[0];

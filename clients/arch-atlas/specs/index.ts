import {parseConceptSpec,type ConceptSpec} from '../../../src/framework/concept/schema.ts';
import fabricPlatform from './fabric-platform.concept.json' with {type:'json'};
import datapassStack from './datapass-stack.concept.json' with {type:'json'};

/** The atlas architectures are concept spec v1 files; each is validated (fail closed) at module load. */
export const specs:ConceptSpec[]=[parseConceptSpec(fabricPlatform),parseConceptSpec(datapassStack)];
export const specById=(id:string)=>specs.find(s=>s.id===id)??specs[0];
export const SPEC_FILES={'fabric-platform':'specs/fabric-platform.concept.json','datapass-stack':'specs/datapass-stack.concept.json'} as const;

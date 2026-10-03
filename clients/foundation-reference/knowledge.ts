import {StaticKnowledgeProvider} from '../../src/framework/foundation/knowledge.ts';
import type {SourceArtifact} from '../../src/framework/evidence/model.ts';
export const sources:SourceArtifact[]=[
  {id:'model-source',path:'examples/scale.ts',language:'typescript',title:'The source-owned calculation',provenance:'synthetic',text:'// Illustrative scaling, not a physical energy model.\nexport function scale(value: number, gain: number) {\n  return value * gain;\n}\n'},
  {id:'architecture-note',path:'docs/result-views.md',language:'markdown',title:'Result views',provenance:'synthetic',text:'# One result, several views\nA run produces an immutable artifact.\nChanging the selected table, chart or metric never runs the model again.\nThe public view profile is presentation filtering, not access control.\n'},
];
export const knowledge=new StaticKnowledgeProvider('approved-static-sources',sources,[{sourceId:'model-source',text:'This fixture multiplies each supplied value by a gain. It is not an engineering solver.'},{sourceId:'architecture-note',text:'Keep calculations independent from presentation. Exported data still needs a sharing review.'}]);

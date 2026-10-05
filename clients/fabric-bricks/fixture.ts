import type {EvidenceRef,SourceArtifact} from '../../src/framework/evidence/model.ts';

export type FabricBrick={
  id:string;
  label:string;
  summary:string;
  x:number;
  y:number;
  width:number;
  height:number;
  color:string;
  evidence:EvidenceRef;
};

export const SOURCE_STATUS='synthetic/provisional' as const;

export const sourceStatusText=`# Fabric Bricks source status

Status: PROVISIONAL / SYNTHETIC.

No source-approved Fabric Bricks content, specification, model or 3D asset was found in the qualified repository, targeted DataPass Mongo HOT context, current Project files or targeted Library search at implementation start.

brick-alpha: synthetic fixture object for semantic-selection and 2D/3D representation testing.
brick-beta: synthetic fixture object for semantic-selection and 2D/3D representation testing.
brick-gamma: synthetic fixture object for semantic-selection and 2D/3D representation testing.
brick-delta: synthetic fixture object for semantic-selection and 2D/3D representation testing.

These labels, positions, dimensions, colors, relationships and descriptions are not client-approved domain facts.
Replace this fixture with source-approved material before treating Fabric Bricks as a completed real client.`;

export const fabricSources:SourceArtifact[]=[{
  id:'fabric-source-status',
  path:'SOURCE_STATUS.md',
  language:'markdown',
  title:'Fabric Bricks provisional source status',
  text:sourceStatusText,
  provenance:'synthetic'
}];

export const bricks:FabricBrick[]=[
  {id:'brick-alpha',label:'Brick Alpha',summary:'Synthetic top-left module used to verify stable semantic identity.',x:74,y:72,width:236,height:116,color:'#305f72',evidence:{artifact:'fabric-source-status',start:7,end:7,label:'Synthetic fixture declaration'}},
  {id:'brick-beta',label:'Brick Beta',summary:'Synthetic top-right module used to verify cross-representation selection.',x:390,y:72,width:256,height:116,color:'#5a7480',evidence:{artifact:'fabric-source-status',start:8,end:8,label:'Synthetic fixture declaration'}},
  {id:'brick-gamma',label:'Brick Gamma',summary:'Synthetic lower-left module used to verify overview/detail transitions.',x:104,y:238,width:264,height:116,color:'#6c596f',evidence:{artifact:'fabric-source-status',start:9,end:9,label:'Synthetic fixture declaration'}},
  {id:'brick-delta',label:'Brick Delta',summary:'Synthetic lower-right module used to verify camera focus and optional explode.',x:430,y:238,width:214,height:116,color:'#75633f',evidence:{artifact:'fabric-source-status',start:10,end:10,label:'Synthetic fixture declaration'}}
];

export const brickIds=bricks.map(brick=>brick.id);
export const brickById=(id:string)=>bricks.find(brick=>brick.id===id);
export const cameraForSelection=(id:string)=>brickById(id)?.id??'overview';
export function evidenceExcerpt(ref:EvidenceRef){
  return sourceStatusText.split(/\r?\n/).slice(ref.start-1,ref.end).join('\n');
}

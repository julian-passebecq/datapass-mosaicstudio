import type {ScenePart,SceneSpec,Vec3} from '../../src/framework/scene.ts';
import {bricks} from './fixture.ts';

const positions:Record<string,Vec3>={
  'brick-alpha':[-2.7,2.65,-1.15],
  'brick-beta':[2.35,2.65,-1.15],
  'brick-gamma':[-2.0,1.15,1.15],
  'brick-delta':[2.7,1.15,1.15]
};
const sizes:Record<string,Vec3>={
  'brick-alpha':[4.0,1.0,2.3],
  'brick-beta':[4.4,1.0,2.3],
  'brick-gamma':[4.5,1.0,2.3],
  'brick-delta':[3.7,1.0,2.3]
};
const explode:Record<string,Vec3>={
  'brick-alpha':[-1.2,.8,-.9],
  'brick-beta':[1.2,.8,-.9],
  'brick-gamma':[-1.2,-.3,.9],
  'brick-delta':[1.2,-.3,.9]
};
const part=(id:string,entity:string,size:Vec3,position:Vec3,color:string,offset:Vec3):ScenePart=>({
  id,parent:null,entity,shape:'box',size,position,rotation:[0,0,0],explode:offset,color
});

export const fabricScene:SceneSpec={
  format:'datapass.scene3d',
  version:1,
  title:'Fabric Bricks provisional assembly',
  note:'Synthetic procedural geometry only. It validates MosaicStudio interaction contracts; it is not a source-approved Fabric Bricks model, CAD asset or physical design.',
  entities:bricks.map(brick=>({id:brick.id,label:brick.label,description:brick.summary})),
  parts:bricks.map(brick=>part(brick.id+'-body',brick.id,sizes[brick.id],positions[brick.id],brick.color,explode[brick.id])),
  cameras:[
    {id:'overview',label:'Assembly overview',position:[12,9,13],target:[0,1.8,0]},
    ...bricks.map(brick=>{
      const target=positions[brick.id];
      return {id:brick.id,label:brick.label+' focus',position:[target[0]+6,target[1]+4,target[2]+7] as Vec3,target};
    })
  ]
};

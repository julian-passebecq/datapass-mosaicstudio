import type {SceneSpec,ScenePart,Vec3} from '../../src/framework/scene.ts';
import {recording} from './recording.ts';
const parts:ScenePart[]=[];
function add(id:string,parent:string|null,entity:string|null,shape:ScenePart['shape'],size:Vec3,position:Vec3,color:string,rotation:Vec3=[0,0,0]){parts.push({id,parent,entity,shape,size,position,rotation,explode:[0,0,0],color});}
for(const [i,e] of recording.entities.entries()){
  const [x,z]=e.position,color=['#438fa8','#6fa58b','#a389b5'][i];
  add(e.id+'-root',null,e.id,'group',[1,1,1],[x,0,z],color);
  add(e.id+'-base',e.id+'-root',null,'box',[3.3,.3,2.1],[0,.1,0],'#657b87');
  for(const side of [-1,1])add(e.id+'-post-'+(side<0?'left':'right'),e.id+'-root',null,'box',[.15,3.8,.15],[side*1.3,2,0],'#728892');
  add(e.id+'-crossbar',e.id+'-root',null,'box',[2.8,.15,.2],[0,3.85,0],'#728892');
  add(e.id+'-carriage',e.id+'-root',null,'group',[1,1,1],[0,2,0],color);
  add(e.id+'-plate',e.id+'-carriage',null,'box',[2.8,.18,1.4],[0,0,0],color,[.12,0,0]);
  add(e.id+'-joint',e.id+'-carriage',null,'cylinder',[.16,.16,2.5],[0,0,0],'#dae5e8',[0,0,Math.PI/2]);
}
export const rigs:SceneSpec={format:'datapass.scene3d',version:1,title:'Abstract oscillating assemblies',note:'Generic test geometry: not a turbine, CAD model or a validated Foil\'o mechanism.',parts,entities:recording.entities.map(e=>({id:e.id,label:e.label,description:e.description})),cameras:[{id:'overview',label:'Installation group',position:[17,16,21],target:[0,1,0]},...recording.entities.map(e=>({id:e.camera!,label:e.label,position:[e.position[0]+6,6,e.position[1]+8] as Vec3,target:[e.position[0],1.7,e.position[1]] as Vec3}))]};

import type {SceneSpec,ScenePart,Vec3} from '../../src/framework/index.ts';
import {domains} from './atlas.ts';
const parts:ScenePart[]=[];
function part(id:string,entity:string|null,shape:ScenePart['shape'],size:Vec3,position:Vec3,color:string,explode:Vec3=[0,0,0],rotation:Vec3=[0,0,0]){parts.push({id,parent:null,entity,shape,size,position,color,explode,rotation});}
for(const d of domains){
  part(d.id+'-base',d.id,'box',[3.9,.35,3.9],[d.x,.2,d.z],'#233a51');
  part(d.id+'-accent',d.id,'box',[3.55,.12,3.55],[d.x,.45,d.z],d.color);
  part(d.id+'-deck',d.id,'box',[3.35,.25,3.35],[d.x,.65,d.z],'#1b3147',[0,.4,0]);
  if(d.id==='cloud'){
    [[-.75,1.6,0],[0,1.95,0],[.7,1.55,0]].forEach(([x,y,z],i)=>part('cloud-lobe-'+i,d.id,'sphere',[.78,.78,.78],[d.x+x,y,d.z+z],d.color,[0,.8,0]));
    part('cloud-foot',d.id,'box',[2.3,.65,1.25],[d.x,1.2,d.z],d.color,[0,.8,0]);
  }else if(d.id==='insights'){
    [1.0,1.75,2.5].forEach((height,i)=>part('bar-'+i,d.id,'box',[.55,height,.65],[d.x+(i-1)*.85,.8+height/2,d.z],d.color,[0,.5+i*.35,0]));
  }else if(d.id==='models'){
    [0,1,2].forEach(i=>part('model-layer-'+i,d.id,'box',[2.1,.35,2.1],[d.x,1.1+i*.55,d.z],i===1?'#91c9b1':d.color,[0,i*.6,0],[0,Math.PI/4,0]));
  }else{
    [0,1,2,3].forEach(i=>{const a=i*Math.PI/2;part('automation-step-'+i,d.id,'box',[.85,.85,.85],[d.x+Math.cos(a)*.8,1.45,d.z+Math.sin(a)*.8],d.color,[Math.cos(a)*.8,.5,Math.sin(a)*.8],[0,Math.PI/4,0]);});
    part('automation-hub',d.id,'cylinder',[.38,.38,1.1],[d.x,1.4,d.z],'#cfb685',[0,.7,0]);
  }
  part(d.child+'-satellite',d.child,'box',[.9,.9,.9],[d.x+2.5,.65,d.z+1.8],d.color,[0,.5,0],[0,Math.PI/4,0]);
}
// Simple connecting rails are presentation geometry, not measured data throughput.
part('horizontal-link-a',null,'box',[5.1,.025,.035],[0,.09,-4.2],'#426a87');
part('horizontal-link-b',null,'box',[5.1,.025,.035],[0,.09,4.2],'#426a87');
part('vertical-link-a',null,'box',[.035,.025,4.4],[-4.6,.09,0],'#426a87');
part('vertical-link-b',null,'box',[.035,.025,4.4],[4.6,.09,0],'#426a87');
export const atlasScene:SceneSpec={format:'datapass.scene3d',version:1,title:'Capability system',note:'Original procedural geometry. No proprietary product artwork, imported models or real infrastructure status.',entities:domains.flatMap(d=>[{id:d.id,label:d.label,description:d.summary},{id:d.child,label:d.project,description:'Synthetic project within '+d.label}]),parts,cameras:[{id:'overview',label:'System overview',position:[21,22,26],target:[0,.5,0]},...domains.flatMap(d=>[{id:d.id+'-front',label:d.label,position:[d.x+7,7.5,d.z+9] as Vec3,target:[d.x,.85,d.z] as Vec3},{id:d.id+'-side',label:d.label+' / project facet',position:[d.x-8,6.5,d.z+7] as Vec3,target:[d.x+1,1,d.z+.8] as Vec3}])]};

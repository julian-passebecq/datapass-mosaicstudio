import {strict,text,identifier} from './validate.ts';
export type Vec3=[number,number,number];
export type ScenePart={id:string;parent:string|null;entity:string|null;shape:'group'|'box'|'cylinder'|'sphere'|'cone';size:Vec3;position:Vec3;rotation:Vec3;explode:Vec3;color:string;spin?:{axis:'x'|'y'|'z';turns:number}};
export type SceneSpec={format:'datapass.scene3d';version:1;title:string;note:string;entities:{id:string;label:string;description:string}[];parts:ScenePart[];cameras:{id:string;label:string;position:Vec3;target:Vec3}[]};
const vec=(v:unknown,label:string,positive=false):v is Vec3=>{if(!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1000||(positive&&x<=0)))throw new Error('Invalid scene '+label);return true;};
export function validateScene(value:unknown):SceneSpec{
  strict(value,['format','version','title','note','entities','parts','cameras'],'scene');
  if(value.format!=='datapass.scene3d'||value.version!==1)throw new Error('Unsupported scene');text(value.title,'scene.title',200);text(value.note,'scene.note',2000);
  if(!Array.isArray(value.entities)||!value.entities.length||value.entities.length>64||!Array.isArray(value.parts)||!value.parts.length||value.parts.length>128||!Array.isArray(value.cameras)||!value.cameras.length||value.cameras.length>12)throw new Error('Scene size limit');
  const entities=new Set<string>(),parts=new Set<string>(),cameras=new Set<string>();
  for(const e of value.entities){strict(e,['id','label','description'],'entity');identifier(e.id,'entity.id');if(entities.has(e.id))throw new Error('Duplicate entity');entities.add(e.id);text(e.label,'entity.label',160);text(e.description,'entity.description',2000);}
  for(const p of value.parts){strict(p,['id','parent','entity','shape','size','position','rotation','explode','color','spin'],'part');identifier(p.id,'part.id');if(parts.has(p.id))throw new Error('Duplicate part');parts.add(p.id);if(p.parent!==null)identifier(p.parent,'parent');if(p.entity!==null&&!entities.has(p.entity as string))throw new Error('Unknown entity');if(!['group','box','cylinder','sphere','cone'].includes(String(p.shape)))throw new Error('Invalid primitive');vec(p.size,'size',true);vec(p.position,'position');vec(p.rotation,'rotation');vec(p.explode,'explode');if(typeof p.color!=='string'||!/^#[a-fA-F0-9]{6}$/.test(p.color))throw new Error('Invalid scene color');if(p.spin!==undefined){strict(p.spin,['axis','turns'],'spin');if(!['x','y','z'].includes(String(p.spin.axis))||typeof p.spin.turns!=='number'||!Number.isFinite(p.spin.turns)||Math.abs(p.spin.turns)>10)throw new Error('Invalid spin');}}
  const sceneParts=value.parts as ScenePart[];
  for(const p of sceneParts){let parent=p.parent;const seen=new Set([p.id]);while(parent!==null){if(seen.has(parent)||!parts.has(parent)||seen.size>12)throw new Error('Invalid scene hierarchy');seen.add(parent);parent=sceneParts.find(p=>p.id===parent)!.parent;}}
  for(const c of value.cameras){strict(c,['id','label','position','target'],'camera');identifier(c.id,'camera.id');if(cameras.has(c.id))throw new Error('Duplicate camera');cameras.add(c.id);text(c.label,'camera.label',100);vec(c.position,'camera.position');vec(c.target,'camera.target');if((c.position as Vec3).every((v:number,i:number)=>v===(c.target as number[])[i]))throw new Error('Camera position equals target');}
  return structuredClone(value) as SceneSpec;
}
export function pose(part:ScenePart,explode:number,phase:number):{position:Vec3;rotation:Vec3}{
  if(!Number.isFinite(explode)||explode<0||explode>1||!Number.isFinite(phase)||phase<0||phase>1)throw new Error('Scene phase/explode must be in [0,1]');
  const position=part.position.map((v,i)=>v+part.explode[i]*explode) as Vec3,rotation=[...part.rotation] as Vec3;
  if(part.spin)rotation[{x:0,y:1,z:2}[part.spin.axis]]+=part.spin.turns*phase*Math.PI*2;
  return {position,rotation};
}

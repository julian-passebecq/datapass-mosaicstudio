/** Read-only, bounded sampled telemetry. Rendering is not a physical simulation. */
import {strict,text,identifier,object} from '../guards.ts';
import {validateScene,scenePartLimit,type SceneSpec} from '../scene.ts';
import type {AppDefinition,Manifest,Field,Block,Values} from '../types.ts';
export const REPLAY_LIMITS=Object.freeze({frames:200,entities:24,channels:8,events:100,bytes:1024*1024});
export const REPLAY_SPEEDS=['0.5','1','2','4'] as const;
export type ReplayChannel={id:string;label:string;unit:string;digits:number;domain:[number,number];values:Record<string,(number|null)[]>};
export type ReplayEntity={id:string;label:string;description:string;position:[number,number];camera?:string};
export type ReplayMotion={part:string;entity:string;channel:string;kind:'translate'|'rotate';axis:'x'|'y'|'z';scale:number;offset:number};
export type ReplaySpec={
  format:'datapass.replay';version:1;title:string;description:string;source:string;provenance:'synthetic'|'recorded';
  time:number[];maxGapSeconds:number;entities:ReplayEntity[];channels:ReplayChannel[];
  events:{id:string;time:number;entity:string|null;label:string;detail:string}[];
  scene?:string;overviewCamera?:string;motion?:ReplayMotion[];
};
export type ReplayBlock=Extract<Block,{type:'replay'}>;
export type ReplayState={frame:number;selection:string;channel:string;view:'plan'|'scene';speed:string};
export const REPLAY_KEYS=['frame','selection','channel','view','speed'] as const;
function list(v:unknown,max:number,label:string,min=0):asserts v is unknown[]{if(!Array.isArray(v)||v.length<min||v.length>max)throw new Error('Replay '+label+' size limit');}
function finite(v:unknown,label:string,min=-1e9,max=1e9):asserts v is number{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid replay '+label);}
function unique(v:unknown,label:string,seen:Set<string>):asserts v is string{identifier(v,label);if(seen.has(v))throw new Error('Duplicate replay '+label);seen.add(v);}
export function validateReplay(input:unknown):ReplaySpec{
  strict(input,['format','version','title','description','source','provenance','time','maxGapSeconds','entities','channels','events','scene','overviewCamera','motion'],'replay');
  if(input.format!=='datapass.replay'||input.version!==1)throw new Error('Unsupported replay');
  text(input.title,'replay title',160);text(input.description,'replay description',2000);text(input.source,'replay source',1000);
  if(input.provenance!=='synthetic'&&input.provenance!=='recorded')throw new Error('Invalid replay provenance');
  list(input.time,REPLAY_LIMITS.frames,'frames',2);let previous=-1;
  for(const time of input.time){finite(time,'time',0,86400);if(previous>=0&&time-previous<.1-1e-8)throw new Error('Replay times must increase by at least 0.1 seconds');previous=time;}
  finite(input.maxGapSeconds,'max gap',.1,86400);
  list(input.entities,REPLAY_LIMITS.entities,'entities',1);const entities=new Set<string>();
  for(const e of input.entities){strict(e,['id','label','description','position','camera'],'replay entity');unique(e.id,'entity id',entities);text(e.label,'entity label',100);text(e.description,'entity description',1000);
    if(!Array.isArray(e.position)||e.position.length!==2)throw new Error('Replay position needs two coordinates');e.position.forEach(p=>finite(p,'position',-1000,1000));if(e.camera!==undefined)identifier(e.camera,'replay camera');}
  list(input.channels,REPLAY_LIMITS.channels,'channels',1);const channels=new Set<string>();
  for(const c of input.channels){strict(c,['id','label','unit','digits','domain','values'],'replay channel');unique(c.id,'channel id',channels);text(c.label,'channel label',100);text(c.unit,'channel unit',40,false);finite(c.digits,'digits',0,6);if(!Number.isInteger(c.digits))throw new Error('Replay digits must be integer');
    if(!Array.isArray(c.domain)||c.domain.length!==2)throw new Error('Channel requires a fixed domain');c.domain.forEach(n=>finite(n,'domain'));if(c.domain[0]>=c.domain[1])throw new Error('Channel domain must increase');
    strict(c.values,[...entities],'channel values');for(const id of entities){const values=c.values[id];list(values,input.time.length,'channel samples',input.time.length);for(const v of values)if(v!==null)finite(v,'sample',c.domain[0],c.domain[1]);}
  }
  list(input.events,REPLAY_LIMITS.events,'events');const events=new Set<string>();
  for(const e of input.events){strict(e,['id','time','entity','label','detail'],'replay event');unique(e.id,'event id',events);finite(e.time,'event time',input.time[0] as number,input.time.at(-1) as number);if(e.entity!==null&&(typeof e.entity!=='string'||!entities.has(e.entity)))throw new Error('Unknown event entity');text(e.label,'event label',120);text(e.detail,'event detail',1500);}
  if(input.scene!==undefined){identifier(input.scene,'replay scene');identifier(input.overviewCamera,'replay overview camera');}
  else if(input.overviewCamera!==undefined||input.motion!==undefined||input.entities.some(e=>(e as ReplayEntity).camera))throw new Error('Replay scene mappings need a scene resource');
  if(input.motion!==undefined){list(input.motion,96,'motion bindings');const seen=new Set<string>();for(const m of input.motion){strict(m,['part','entity','channel','kind','axis','scale','offset'],'motion');identifier(m.part,'motion part');identifier(m.entity,'motion entity');identifier(m.channel,'motion channel');if(!entities.has(m.entity)||!channels.has(m.channel))throw new Error('Unknown motion signal');
      if(m.kind!=='translate'&&m.kind!=='rotate'||(typeof m.axis!=='string'||!['x','y','z'].includes(m.axis)))throw new Error('Unsupported motion binding');finite(m.scale,'motion scale',-1000,1000);finite(m.offset,'motion offset',-1000,1000);
      const key=m.part+':'+m.kind+':'+m.axis;if(seen.has(key))throw new Error('Ambiguous motion binding');seen.add(key);
      const c=(input.channels as ReplayChannel[]).find(c=>c.id===m.channel)!;for(const v of c.domain)if(Math.abs(v*m.scale+m.offset)>1000)throw new Error('Motion transform exceeds scene limits');
  }}
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>REPLAY_LIMITS.bytes)throw new Error('Replay exceeds 1 MiB');
  return structuredClone(input) as ReplaySpec;
}
export function replayFields(spec:ReplaySpec,prefix='replay'):Field[]{
  identifier(prefix,'replay prefix');
  return [{id:prefix+'-frame',label:'Replay sample',role:'view',type:'number',min:0,max:spec.time.length-1,step:1,default:0},
    {id:prefix+'-selection',label:'Selected installation',role:'view',type:'select',options:spec.entities.map(e=>({value:e.id,label:e.label})),default:spec.entities[0].id},
    {id:prefix+'-channel',label:'Signal',role:'view',type:'select',options:spec.channels.map(c=>({value:c.id,label:c.label})),default:spec.channels[0].id},
    {id:prefix+'-view',label:'Replay view',role:'view',type:'select',options:[{value:'plan',label:'2D plan'},...(spec.scene?[{value:'scene',label:'3D scene'}]:[])],default:'plan'},
    {id:prefix+'-speed',label:'Playback speed',role:'view',type:'select',options:REPLAY_SPEEDS.map(s=>({value:s,label:s+'x'})),default:'1'}];
}
export function replayBlock(id:string,resource:string,prefix='replay'):ReplayBlock{return {id,type:'replay',resource,...Object.fromEntries(REPLAY_KEYS.map(k=>[k,prefix+'-'+k]))} as ReplayBlock;}
export function readReplayState(block:ReplayBlock,values:Values):ReplayState{return Object.fromEntries(REPLAY_KEYS.map(k=>[k,values[block[k]]])) as ReplayState;}
export function validateReplayBinding(spec:ReplaySpec,block:ReplayBlock,manifest:Manifest,definition:AppDefinition):SceneSpec|null{
  if(new Set(REPLAY_KEYS.map(k=>block[k])).size!==5)throw new Error('Replay fields must be distinct');
  const expected=replayFields(spec);
  REPLAY_KEYS.forEach((key,i)=>{const f=manifest.fields.find(f=>f.id===block[key]),e=expected[i];
    if(!f||f.role!=='view'||f.type!==e.type)throw new Error('Replay binding must use view fields');
    if(key==='frame'){if(f.min!==0||f.max!==spec.time.length-1||f.step!==1)throw new Error('Replay index bounds must match sample count');}
    else if(f.options!.length!==e.options!.length||f.options!.some(o=>!e.options!.some(x=>x.value===o.value)))throw new Error('Replay field choices mismatch: '+key);
  });
  if(!spec.scene)return null;
  const scene=validateScene(definition.resources?.scenes?.[spec.scene],{maxParts:scenePartLimit(definition)}),cameras=new Set(scene.cameras.map(c=>c.id));
  if(!cameras.has(spec.overviewCamera!))throw new Error('Unknown replay overview camera');
  for(const entity of spec.entities){if(!scene.entities.some(e=>e.id===entity.id)||entity.camera&&!cameras.has(entity.camera))throw new Error('Replay entity/scene mismatch');}
  for(const m of spec.motion||[]){let part=scene.parts.find(p=>p.id===m.part);if(!part)throw new Error('Unknown replay motion part');while(part&&!part.entity&&part.parent)part=scene.parts.find(p=>p.id===part!.parent);
    if(part?.entity!==m.entity)throw new Error('Replay motion must bind its own scene entity');}
  return scene;
}
export function sampleValue(spec:ReplaySpec,entity:string,channel:string,index:number):number|null{
  if(!Number.isInteger(index)||index<0||index>=spec.time.length)throw new Error('Replay frame out of range');
  const c=spec.channels.find(c=>c.id===channel);if(!c||!Object.hasOwn(c.values,entity))throw new Error('Unknown replay signal');return c.values[entity][index];
}
/** Nearest supplied sample, earlier one wins ties. No invented intermediate observation. */
export function nearestSample(spec:ReplaySpec,time:number):number{
  if(!Number.isFinite(time))throw new Error('Invalid requested replay time');let lo=0,hi=spec.time.length-1;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(spec.time[mid]<time)lo=mid+1;else hi=mid;}
  return lo>0&&Math.abs(spec.time[lo-1]-time)<=Math.abs(spec.time[lo]-time)?lo-1:lo;
}
export type PoseOffsets=Record<string,{position?:[number,number,number];rotation?:[number,number,number]}>;
export function replayOffsets(spec:ReplaySpec,index:number):PoseOffsets{
  const result:PoseOffsets={};for(const m of spec.motion||[]){const v=sampleValue(spec,m.entity,m.channel,index);if(v===null)continue;
    const part=result[m.part]??={},key=m.kind==='translate'?'position':'rotation';part[key]??=[0,0,0];part[key]![{x:0,y:1,z:2}[m.axis]]=v*m.scale+m.offset;}
  return result;
}
export function validateReplayControllers(definition:AppDefinition):void{
  const owners=new Map<string,string>(),resources=new Map<string,string>();
  const own=(field:string,id:string)=>{const old=owners.get(field);if(old&&old!==id)throw new Error('Multiple clocks own field '+field);owners.set(field,id);};
  for(const [id,s] of Object.entries(definition.resources?.stories||{}))own(s.indexField,'story:'+id);
  for(const b of definition.manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks)))if(b.type==='replay'){
    const identity=REPLAY_KEYS.map(k=>b[k]).join('|'),old=resources.get(b.resource);if(old&&old!==identity)throw new Error('One replay resource requires one set of controls');resources.set(b.resource,identity);own(b.frame,'replay:'+b.resource);
  }
}

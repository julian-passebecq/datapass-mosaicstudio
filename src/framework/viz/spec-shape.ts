/** ChartSpec shape: the type, the limits and a zod-free structural checker for the hot path.
 * Mirrors `chartSpecSchema` (spec-schema.ts) exactly: same keys (strict), types, enums and limits.
 * tests/viz-spec-parity.test.mjs compares both on a fuzzed corpus; spec-schema.ts checks the types.
 */
export const MARKS=['bar','line','area','point','arc','rect','kpi','bar3d','surface','point3d'] as const;
export const ID_PATTERN=/^[a-z][a-zA-Z0-9_-]{0,79}$/;
export const SPEC_LIMITS=Object.freeze({title:200,channelTitle:120,channelFormat:24,tooltip:8,unit:30,digits:6});
export const ENUMS={
  stack:['stacked','grouped','normalize'],
  sort:['none','ascending','descending'],
  selectionMode:['point','multi','interval'],
  renderer:['auto','svg','canvas','webgl'],
} as const;

export type ChartChannel={field:string;title?:string;format?:string};
export type ChartSpec={
  id:string;
  title?:string;
  mark:typeof MARKS[number];
  encoding:{x?:ChartChannel;y?:ChartChannel;z?:ChartChannel;color?:ChartChannel;size?:ChartChannel;series?:ChartChannel;theta?:ChartChannel;tooltip?:ChartChannel[]};
  stack?:typeof ENUMS.stack[number];
  sort?:typeof ENUMS.sort[number];
  format?:{unit?:string;digits?:number;compact?:boolean};
  selection?:{field:string;mode:typeof ENUMS.selectionMode[number];on?:string};
  renderer?:typeof ENUMS.renderer[number];
};

type Issues=string[];
type Rule=(value:unknown,path:string,issues:Issues)=>unknown;
const isObject=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const say=(issues:Issues,path:string,message:string)=>{issues.push((path||'spec')+': '+message);};
const join=(path:string,key:string|number)=>path?path+'.'+key:String(key);

const str=(max:number,pattern?:RegExp):Rule=>(v,p,issues)=>{
  if(typeof v!=='string')return say(issues,p,'Expected string');
  if(v.length>max)say(issues,p,`String must contain at most ${max} character(s)`);
  if(pattern&&!pattern.test(v))say(issues,p,'column id');
  return v;
};
const oneOf=(values:readonly string[]):Rule=>(v,p,issues)=>values.includes(v as string)?v:say(issues,p,'Invalid enum value');
const bool:Rule=(v,p,issues)=>typeof v==='boolean'?v:say(issues,p,'Expected boolean');
const int=(min:number,max:number):Rule=>(v,p,issues)=>{
  if(typeof v!=='number'||Number.isNaN(v))return say(issues,p,'Expected number');
  if(!Number.isInteger(v))say(issues,p,'Expected integer');
  if(v<min||v>max)say(issues,p,`Number must be between ${min} and ${max}`);
  return v;
};
const opt=(rule:Rule):Rule=>(v,p,issues)=>v===undefined?undefined:rule(v,p,issues);
/** Strict object: unknown keys are rejected, keys present with `undefined` are kept (as zod does). */
const obj=(shape:Record<string,Rule>):Rule=>(v,p,issues)=>{
  if(!isObject(v))return say(issues,p,'Expected object');
  const out:Record<string,unknown>={};
  for(const key in shape){const value=shape[key](v[key],join(p,key),issues);if(Object.hasOwn(v,key))out[key]=value;}
  const extra=Object.keys(v).filter(k=>!(k in shape));
  if(extra.length)say(issues,p,'Unrecognized key(s) in object: '+extra.map(k=>`'${k}'`).join(', '));
  return out;
};
const list=(rule:Rule,max:number):Rule=>(v,p,issues)=>{
  if(!Array.isArray(v))return say(issues,p,'Expected array');
  if(v.length>max)say(issues,p,`Array must contain at most ${max} element(s)`);
  return Array.from(v,(item,i)=>rule(item,join(p,i),issues));// holes count as undefined, as in zod
};

const id=str(Infinity,ID_PATTERN);
const channelObject=obj({field:id,title:opt(str(SPEC_LIMITS.channelTitle)),format:opt(str(SPEC_LIMITS.channelFormat))}),channel=opt(channelObject);
const specRule=obj({
  id,
  title:opt(str(SPEC_LIMITS.title)),
  mark:oneOf(MARKS),
  encoding:obj({x:channel,y:channel,z:channel,color:channel,size:channel,series:channel,theta:channel,tooltip:opt(list(channelObject,SPEC_LIMITS.tooltip))}),
  stack:opt(oneOf(ENUMS.stack)),
  sort:opt(oneOf(ENUMS.sort)),
  format:opt(obj({unit:opt(str(SPEC_LIMITS.unit)),digits:opt(int(0,SPEC_LIMITS.digits)),compact:opt(bool)})),
  selection:opt(obj({field:id,mode:oneOf(ENUMS.selectionMode),on:opt(id)})),
  renderer:opt(oneOf(ENUMS.renderer)),
});

/** Structural check without zod. Returns a fresh copy (never the caller's object) or the issues. */
export function checkSpecShape(input:unknown):{success:true;data:ChartSpec}|{success:false;issues:string[]}{
  const issues:Issues=[],data=specRule(input,'',issues);
  return issues.length?{success:false,issues}:{success:true,data:data as ChartSpec};
}

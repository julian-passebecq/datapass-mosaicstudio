import {strict,text,identifier,object} from './guards.ts';
import type {Manifest,Scalar} from './types.ts';
/** Bounded text/scalar subset of the original ConceptMotion LoopSceneSpec. */
export type ExplanationResource={
  frameField:string;note:string;source:string;
  spec:{kind:'loop';version:string;id:string;title:string;
    items:{id:string;label?:string;value:Scalar}[];
    codeLines:{id:string;text:string}[];
    frames:{id:string;iteration:number;pointerItemId?:string;activeItemIds?:string[];doneItemIds?:string[];order?:string[];variables?:Record<string,Scalar>;codeLineIds:string[];operation:string;caption:string}[];
  };
};
function list(v:unknown,label:string,max:number,min=0):asserts v is unknown[]{if(!Array.isArray(v)||v.length>max||v.length<min)throw new Error('Invalid explanation '+label);}
function atom(v:unknown){if(v!==null&&typeof v!=='boolean'&&!(typeof v==='string'&&v.length<=1000)&&!(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12))throw new Error('Explanation values must be finite, bounded scalars');}
function uniqueIds(items:unknown[]):Set<string>{const ids=new Set<string>();for(const item of items){identifier(item,'explanation id');if(ids.has(item))throw new Error('Duplicate explanation id');ids.add(item);}return ids;}
export function validateExplanation(input:unknown,manifest?:Manifest):ExplanationResource{
  strict(input,['frameField','note','source','spec'],'explanation');identifier(input.frameField,'frame field');text(input.note,'explanation note',2000);text(input.source,'explanation source',1000);
  const s=input.spec;strict(s,['kind','version','id','title','items','codeLines','frames'],'ConceptMotion loop spec');
  if(s.kind!=='loop')throw new Error('This adapter supports ConceptMotion loop scenes');identifier(s.id,'scene id');text(s.version,'scene version',40);text(s.title,'scene title',200);
  list(s.items,'items',40,1);list(s.codeLines,'code lines',80,1);list(s.frames,'frames',100,1);
  const items=uniqueIds(s.items.map(i=>{strict(i,['id','label','value'],'loop item');atom(i.value);if(i.label!==undefined)text(i.label,'item label',120);return i.id;}));
  const code=uniqueIds(s.codeLines.map(c=>{strict(c,['id','text'],'code line');text(c.text,'code line',2000,false);return c.id;}));
  uniqueIds(s.frames.map(f=>{strict(f,['id','iteration','pointerItemId','activeItemIds','doneItemIds','order','variables','codeLineIds','operation','caption'],'loop frame');
    if(typeof f.iteration!=='number'||!Number.isSafeInteger(f.iteration)||f.iteration<0||f.iteration>1e6)throw new Error('Invalid iteration');text(f.operation,'operation',120);text(f.caption,'caption',2000);
    for(const key of ['activeItemIds','doneItemIds','order'])if(f[key]!==undefined){list(f[key],key,40);const ids=uniqueIds(f[key]);if([...ids].some(id=>!items.has(id)))throw new Error('Unknown explanation item reference');if(key==='order'&&ids.size!==items.size)throw new Error('Order must contain every item exactly once');}
    if(f.pointerItemId!==undefined&&!items.has(String(f.pointerItemId)))throw new Error('Unknown pointer item');
    list(f.codeLineIds,'code references',80);if([...uniqueIds(f.codeLineIds)].some(id=>!code.has(id)))throw new Error('Unknown explanation code reference');
    if(f.variables!==undefined){if(!object(f.variables)||Object.keys(f.variables).length>20)throw new Error('Explanation variable limit');for(const [key,value] of Object.entries(f.variables)){identifier(key,'variable');atom(value);}}
    return f.id;
  }));
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>256*1024)throw new Error('Explanation exceeds 256 KiB');
  if(manifest){const field=manifest.fields.find(f=>f.id===input.frameField);if(!field||field.role!=='view'||field.type!=='number'||field.min!==0||field.max!==s.frames.length-1||field.step!==1)throw new Error('Explanation frame field must cover exactly the authored frames');}
  return structuredClone(input) as ExplanationResource;
}

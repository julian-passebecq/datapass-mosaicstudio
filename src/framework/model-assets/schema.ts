/** Structural authoring aid. Byte/profile/binding validation remains authoritative. */
const id={type:'string',pattern:'^[a-z][a-zA-Z0-9_-]{0,79}$'};
const obj=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const str=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const list=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,maxItems,minItems});
const vec=(bound:number)=>({type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-bound,maximum:bound}});
const ref=obj({artifact:id,start:{type:'integer',minimum:1,maximum:2000},end:{type:'integer',minimum:1,maximum:2000},label:str(160)});
export const modelSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass approved static model v1',...obj({
  format:{const:'datapass.model3d'},version:{const:1},title:str(160),note:str(2000),provenance:{enum:['synthetic','provided']},credit:str(1000),
  asset:obj({path:{type:'string',maxLength:240,pattern:'^[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_.-]+)*\\.glb$'},byteLength:{type:'integer',minimum:28,maximum:16777216},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}}),
  parts:list(obj({id,node:{type:'integer',minimum:0,maximum:127},label:str(120),description:str(2000),explode:vec(100),evidence:list(ref,8)}),64,1),
  annotations:list(obj({part:id,label:str(80),position:vec(1000)}),64),
  cameras:list(obj({id,label:str(100),position:vec(1000),target:vec(1000)}),12,1),
  sources:list(obj({id,path:str(500),language:{enum:['python','sql','typescript','json','markdown','text']},title:str(160),text:{type:'string',maxLength:64000},provenance:{enum:['synthetic','provided']}}),24),
})};

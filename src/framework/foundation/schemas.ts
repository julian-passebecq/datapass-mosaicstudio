/** Structural authoring aids. Cross-resource, field, byte and status rules live in validators. */
const id={type:'string',pattern:'^[a-z][a-zA-Z0-9_-]{0,79}$',not:{enum:['constructor','prototype','__proto__']}};
const string=(maxLength=2000)=>({type:'string',maxLength});
const obj=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const list=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,maxItems,minItems});
const nullable=(schema:unknown)=>({anyOf:[schema,{type:'null'}]});
const scalar={type:['number','string','boolean','null'],maxLength:4000};
const reference=obj({artifact:id,start:{type:'integer',minimum:1,maximum:2000},end:{type:'integer',minimum:1,maximum:2000},label:string(160)});
const column=obj({id,label:string(120),type:{enum:['string','number','boolean']},unit:string(40),nullable:{type:'boolean'}},['id','label','type']);
const representation=(kind:string,extra:Record<string,unknown>={},required:string[]=[])=>obj({id,title:string(160),kind:{const:kind},...extra},['id','title','kind',...required]);
const reps=list({oneOf:[representation('table'),representation('text'),representation('json'),representation('chart',{chart:{enum:['bar','line','scatter']},x:id,y:id,unit:string(30)},['chart','x','y']),representation('metric',{row:string(160),column:id,unit:string(40),digits:{type:'integer',minimum:0,maximum:6}},['row','column'])]},12,1);
const artifact=obj({format:{const:'datapass.artifact'},version:{const:1},id,title:string(160),provenance:obj({kind:{enum:['synthetic','provided','computed']},source:string(),runId:id},['kind','source']),payload:{oneOf:[obj({kind:{const:'table'},rowKey:id,columns:list(column,40,1),rows:list({type:'object',maxProperties:40,propertyNames:id,additionalProperties:scalar},10000)}),obj({kind:{const:'text'},text:string(20000)})]},representations:reps});
const runSpec=obj({format:{const:'datapass.run-spec'},version:{const:1},taskId:id,modelId:id,modelVersion:string(80),providerId:id,source:string(),provenance:{enum:['synthetic','provided','computed']},representations:reps});
const run=obj({format:{const:'datapass.run'},version:{const:1},id,taskId:id,appId:id,appVersion:string(80),modelId:id,modelVersion:string(80),providerId:id,parameters:{type:'object',maxProperties:100,propertyNames:id,additionalProperties:scalar},dependencies:{type:'object',maxProperties:50,propertyNames:id,additionalProperties:{type:'integer',minimum:1}},status:{enum:['running','succeeded','failed','cancelled','superseded','timed-out','unobserved']},startedAt:{type:'string',format:'date-time'},finishedAt:nullable({type:'string',format:'date-time'}),durationMs:{type:'number',minimum:0},artifact:nullable(artifact),retention:{enum:['pending','retained','none','omitted-budget','invalid-output']},message:string()});
const named=obj({id,label:string(100)});
const navigation=obj({format:{const:'datapass.navigation'},version:{const:1},entities:list(obj({id,label:string(100),kind:string(40),summary:string(),external:{type:'boolean'}}),99,1),relations:list(obj({id,from:id,to:id,kind:{enum:['depends-on','contains','integrates-with','related']},source:string(500)}),300),facets:list(obj({id,label:string(100),entities:list(id,99)}),12,1),projections:list(named,8,1),depths:list(named,4,1)});
const context=obj({format:{const:'datapass.context'},version:{const:1},entries:list(obj({sourceId:id,path:string(500),mode:{enum:['full','summary','excerpt']},text:string(256000),references:list(reference,8)}),24),omitted:list(obj({sourceId:id,reason:{enum:['excluded','budget']}}),24)});
const schema=(title:string,body:object)=>({$schema:'https://json-schema.org/draft/2020-12/schema',title,...body});
export const foundationSchemas={
  'artifact.schema.json':schema('DataPass immutable result artifact v1',artifact),
  'run-spec.schema.json':schema('DataPass observed task/model profile v1',runSpec),
  'run-record.schema.json':schema('DataPass captured task run v1',run),
  'navigation.schema.json':schema('DataPass semantic navigation v1',navigation),
  'knowledge-context.schema.json':schema('DataPass approved context payload v1',context),
};

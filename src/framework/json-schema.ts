/** Structural authoring schemas. Runtime validators also enforce bounds across fields and references. */
const id={type:'string',pattern:'^[a-z][a-zA-Z0-9_-]{0,79}$',not:{enum:['constructor','prototype','__proto__']}};
const text=(max=2000)=>({type:'string',maxLength:max});
const scalar={type:['string','number','boolean','null'],maxLength:4000};
const obj=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const list=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,maxItems,minItems});
const ids=list(id,100);const finite={type:'number',minimum:-1e12,maximum:1e12};
const common={id,label:{...text(160),minLength:1},role:{enum:['input','view']},unit:text(40)};
const field={oneOf:[obj({...common,type:{const:'number'},default:finite,min:finite,max:finite,step:{type:'number',minimum:1e-12,maximum:1e12}},['id','label','role','type','default','min','max','step']),obj({...common,type:{const:'select'},default:{...text(160),minLength:1},options:list(obj({value:{...text(160),minLength:1},label:{...text(160),minLength:1}}),100,1)},['id','label','role','type','default','options']),obj({...common,type:{const:'toggle'},default:{type:'boolean'}},['id','label','role','type','default'])]};
const column=obj({id,label:{...text(120),minLength:1},type:{enum:['string','number','boolean']},unit:text(40),nullable:{type:'boolean'}},['id','label','type']);
const dataset=obj({id,title:{...text(200),minLength:1},layer:{...text(80),minLength:1},description:text(),source:{enum:['inline','derived','task']},provenance:{enum:['synthetic','user-provided','derived']},rowKey:id,columns:list(column,40,1),inputs:ids,dependsOn:list(id,50)});
const value={oneOf:[obj({literal:scalar}),obj({field:id}),obj({dataset:id,row:{...text(160),minLength:1},column:id})]};
const block=(type:string,props:Record<string,unknown>,required:string[])=>obj({id,type:{const:type},span:{type:'integer',minimum:1,maximum:4},title:{...text(200),minLength:1},...props},['id','type',...required]);
const blocks={oneOf:[
  block('text',{text:text(20000),tone:{enum:['lead','body','note']}},['text']),
  block('metric',{value,unit:text(40),digits:{type:'integer',minimum:0,maximum:6},note:text()},['value']),
  block('input',{field:id,control:{enum:['field','slider']}},['field']),block('table',{dataset:id,pageSize:{type:'integer',minimum:1,maximum:100}},['dataset']),
  block('chart',{dataset:id,x:id,y:id,kind:{enum:['bar','line','scatter']},unit:text(30)},['dataset','x','y','kind']),
  block('task',{task:id},['task']),block('catalog',{},[]),block('code',{text:text(20000),language:{...text(40),minLength:1}},['text','language']),
  block('scene3d',{resource:id,explode:id,phase:id,camera:id,selection:id},['resource','explode','phase','camera','selection']),
  block('model3d',{resource:id,selection:id,camera:id,mode:id,explode:id,section:id,view:id,annotations:id,source:id},['resource','selection','camera','mode','explode','section','view','annotations','source']),
  block('motion',{resource:id,step:id,selection:id,projection:id,panel:id,source:id},['resource','step','selection','projection','panel','source']),
  block('replay',{resource:id,frame:id,selection:id,channel:id,view:id,speed:id},['resource','frame','selection','channel','view','speed']),
  block('explorer',{resource:id,focus:id,facet:id,view:id,level:id,group:id,document:id,scroll:{type:'boolean'}},['resource','focus','facet','view','level','group','document']),
  ...['story-controls','story-figure','architecture','custom','explanation','runs'].map(type=>block(type,{resource:id},['resource']))
]};
export const manifestSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass web app v1',...obj({format:{const:'datapass.web-app'},schemaVersion:{const:1},id,version:{...text(40),minLength:1},title:{...text(160),minLength:1},description:text(),label:{...text(120),minLength:1},theme:obj({accent:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},density:{enum:['compact','comfortable']},mode:{enum:['light','dark']}},['accent','density']),fields:list(field,100),datasets:list(dataset,50),tasks:list(obj({id,label:{...text(160),minLength:1},output:id,timeoutMs:{type:'integer',minimum:100,maximum:60000}}),50),pages:list(obj({id,title:{...text(160),minLength:1},description:text(),sections:list(obj({id,title:{...text(160),minLength:1},columns:{type:'integer',minimum:1,maximum:4},blocks:list(blocks,40,1)},['id','columns','blocks']),30,1)}),20,1)})};
export const savedStateSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass web input snapshot v1',...obj({format:{const:'datapass.web-state'},version:{const:1},appId:id,appVersion:{...text(40),minLength:1},page:id,values:{type:'object',maxProperties:100,propertyNames:id,additionalProperties:scalar}})};
const vector={type:'array',items:{type:'number',minimum:-1000,maximum:1000},minItems:3,maxItems:3};
export const sceneSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass procedural scene v1',...obj({format:{const:'datapass.scene3d'},version:{const:1},title:{...text(200),minLength:1},note:{...text(),minLength:1},entities:list(obj({id,label:{...text(160),minLength:1},description:{...text(),minLength:1}}),64,1),parts:list(obj({id,parent:{anyOf:[id,{type:'null'}]},entity:{anyOf:[id,{type:'null'}]},shape:{enum:['group','box','cylinder','sphere','cone']},size:{...vector,items:{type:'number',exclusiveMinimum:0,maximum:1000}},position:vector,rotation:vector,explode:vector,color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},spin:obj({axis:{enum:['x','y','z']},turns:{type:'number',minimum:-10,maximum:10}})},['id','parent','entity','shape','size','position','rotation','explode','color']),128,1),cameras:list(obj({id,label:{...text(100),minLength:1},position:vector,target:vector}),12,1)})};

const named=obj({id,label:{...text(80),minLength:1}});
const xy={type:'array',minItems:2,maxItems:2,items:{type:'number',minimum:-5000,maximum:5000}};
export const explorerSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass explorer v1',...obj({format:{const:'datapass.explorer'},version:{const:1},title:{...text(160),minLength:1},description:text(2000),provenance:{enum:['synthetic','authored','user-provided']},groups:list(named,12,1),facets:list(named,12,1),items:list(obj({id,label:{...text(120),minLength:1},kind:{...text(40),minLength:1},parent:{anyOf:[id,{type:'null'}]},group:id,summary:{...text(300),minLength:1},description:{...text(3000),minLength:1},tags:list({...text(60),minLength:1},12),position:xy,facts:list(obj({label:{...text(100),minLength:1},value:{...text(400),minLength:1}}),12),scene:obj({entity:id,camera:id,facetCameras:{type:'object',maxProperties:12,propertyNames:id,additionalProperties:id}},['entity','camera']),open:obj({page:id,label:{...text(100),minLength:1}})},['id','label','kind','parent','group','summary','description','tags','position','facts']),64,1),documents:list(obj({id,item:id,facet:id,title:{...text(160),minLength:1},summary:{...text(500),minLength:1},sections:list(obj({title:{...text(160),minLength:1},text:text(6000),code:text(12000),language:{...text(40),minLength:1}},['title','text']),16,1),provenance:{enum:['synthetic','authored','user-provided']},source:{...text(300),minLength:1}}),80),journey:list(id,20),scene:id,overviewCamera:id},['format','version','title','description','provenance','groups','facets','items','documents','journey'])};

const atom={type:['string','number','boolean','null'],maxLength:1000,minimum:-1e12,maximum:1e12};
export const explanationSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'Bounded ConceptMotion loop resource',...obj({frameField:id,note:{...text(2000),minLength:1},source:{...text(1000),minLength:1},spec:obj({kind:{const:'loop'},version:{...text(40),minLength:1},id,title:{...text(200),minLength:1},items:list(obj({id,label:{...text(120),minLength:1},value:atom},['id','value']),40,1),codeLines:list(obj({id,text:text(2000)}),80,1),frames:list(obj({id,iteration:{type:'integer',minimum:0,maximum:1000000},pointerItemId:id,activeItemIds:list(id,40),doneItemIds:list(id,40),order:list(id,40),variables:{type:'object',maxProperties:20,propertyNames:id,additionalProperties:atom},codeLineIds:list(id,80),operation:{...text(120),minLength:1},caption:{...text(2000),minLength:1}},['id','iteration','codeLineIds','operation','caption']),100,1)})})};

export const replaySchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass sampled replay v1',...obj({
  format:{const:'datapass.replay'},version:{const:1},title:{...text(160),minLength:1},description:{...text(2000),minLength:1},source:{...text(1000),minLength:1},provenance:{enum:['synthetic','recorded']},
  time:list({type:'number',minimum:0,maximum:86400},200,2),maxGapSeconds:{type:'number',minimum:.1,maximum:86400},
  entities:list(obj({id,label:{...text(100),minLength:1},description:{...text(1000),minLength:1},position:{type:'array',items:{type:'number',minimum:-1000,maximum:1000},minItems:2,maxItems:2},camera:id},['id','label','description','position']),24,1),
  channels:list(obj({id,label:{...text(100),minLength:1},unit:text(40),digits:{type:'integer',minimum:0,maximum:6},domain:{type:'array',items:{type:'number',minimum:-1e9,maximum:1e9},minItems:2,maxItems:2},values:{type:'object',maxProperties:24,propertyNames:id,additionalProperties:list({type:['number','null'],minimum:-1e9,maximum:1e9},200,2)}}),8,1),
  events:list(obj({id,time:{type:'number',minimum:0,maximum:86400},entity:{anyOf:[id,{type:'null'}]},label:{...text(120),minLength:1},detail:{...text(1500),minLength:1}}),100),
  scene:id,overviewCamera:id,motion:list(obj({part:id,entity:id,channel:id,kind:{enum:['translate','rotate']},axis:{enum:['x','y','z']},scale:{type:'number',minimum:-1000,maximum:1000},offset:{type:'number',minimum:-1000,maximum:1000}}),96)
},['format','version','title','description','source','provenance','time','maxGapSeconds','entities','channels','events'])};
export const clientProfileSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass client family profile',...obj({format:{const:'datapass.client-profile'},version:{const:1},family:{enum:['content','knowledge','analytics','spatial','replay']},
  csp:{...obj({wasm:{type:'boolean',description:"Adds 'wasm-unsafe-eval' to script-src for this client only."},connect:{type:'array',maxItems:8,uniqueItems:true,description:'Extra connect-src origins: https or http loopback (127.0.0.1, localhost, [::1]) only.',items:{type:'string',pattern:'^(https://[^/*\\s]+|http://(127\\.0\\.0\\.1|localhost|\\[::1\\])(:[0-9]{1,5})?)$'}}},[]),description:'Optional per-client CSP opt-ins; omitted means the default policy.'}},['format','version','family'])};

const evidenceRef = obj({artifact:id,start:{type:'integer',minimum:1,maximum:2000},end:{type:'integer',minimum:1,maximum:2000},label:{...text(160),minLength:1}});
export const sourceArtifactSchema = {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Inert client source excerpt',...obj({id,path:{...text(500),minLength:1},language:{enum:['python','sql','typescript','json','markdown','text']},title:{...text(160),minLength:1},text:text(64000),provenance:{enum:['synthetic','provided']}})};
const motionPoint={type:'array',items:{type:'number',minimum:-30,maximum:30},minItems:3,maxItems:3};
const motionBase={id,label:{...text(80),minLength:1},description:{...text(2000),minLength:1},color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},evidence:list(evidenceRef,8)};
const motionCommands={oneOf:[
  obj({type:{const:'move'},entity:id,position:motionPoint}),
  obj({type:{const:'transfer'},entity:id,link:id}),
  obj({type:{const:'state'},entity:id,value:{enum:['idle','active','complete','warning','muted']}}),
  obj({type:{const:'visibility'},entity:id,visible:{type:'boolean'}}),
]};
export const motionSchema={$schema:'https://json-schema.org/draft/2020-12/schema',title:'DataPass authored motion v1',...obj({
  format:{const:'datapass.motion'},version:{const:1},title:{...text(160),minLength:1},description:{...text(2000),minLength:1},provenance:{enum:['synthetic','authored']},note:{...text(2000),minLength:1},
  entities:list({oneOf:[obj({...motionBase,kind:{const:'station'},position:motionPoint,size:{...motionPoint,items:{type:'number',minimum:.1,maximum:8}}}),obj({...motionBase,kind:{const:'token'},at:id,size:{type:'number',minimum:.1,maximum:1}})]},40,1),
  links:list(obj({id,from:id,to:id,label:text(100),via:list(motionPoint,8)}),64),
  steps:list(obj({id,title:{...text(160),minLength:1},caption:{...text(3000),minLength:1},focus:id,holdMs:{type:'integer',minimum:800,maximum:15000},transitionMs:{type:'integer',minimum:0,maximum:1800},commands:list(motionCommands,80),activeLinks:list(id,64),evidence:list(evidenceRef,8)}),64,1),
  sources:list(sourceArtifactSchema,24),
})};

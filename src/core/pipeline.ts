/** A bounded STATIC pipeline document. Importing this cannot run a task or SQL. */
export type Activity = {id:string; name:string; kind:string; detail:string; sourcePath:string; code:string; x:number; y:number};
export type Dependency = {id:string; from:string; to:string; condition:string};
export type Pipeline = {format:'datapass.pipeline'; version:1; title:string; sourceKind:'synthetic'|'user-file'; activities:Activity[]; dependencies:Dependency[]};
const maxNodes=180, maxEdges=400;
function text(value: unknown, max=200): value is string {return typeof value==='string' && value.length<=max;}
function object(value: unknown): value is Record<string,unknown> {return !!value && typeof value==='object' && !Array.isArray(value);}
export function validatePipeline(value: unknown): Pipeline {
  if(!object(value) || value.format!=='datapass.pipeline' || value.version!==1 || !text(value.title) || !['synthetic','user-file'].includes(String(value.sourceKind))) throw new Error('Unsupported pipeline document');
  for(const key of Object.keys(value)) if(!['format','version','title','sourceKind','activities','dependencies'].includes(key)) throw new Error('Unexpected pipeline field: '+key);
  if(!Array.isArray(value.activities)||value.activities.length>maxNodes||!value.activities.length||!Array.isArray(value.dependencies)||value.dependencies.length>maxEdges) throw new Error('Pipeline size limit exceeded');
  const ids=new Set<string>();
  for(const n of value.activities){
    if(!object(n)||!text(n.id)||!/^[-a-zA-Z0-9_]+$/.test(n.id)||ids.has(n.id)||!text(n.name)||!text(n.kind)||!text(n.detail,4000)||!text(n.sourcePath,1000)||!text(n.code,50000)||typeof n.x!=='number'||!Number.isFinite(n.x)||typeof n.y!=='number'||!Number.isFinite(n.y)||Math.abs(n.x)>50000||Math.abs(n.y)>50000) throw new Error('Invalid or duplicate activity');
    for(const key of Object.keys(n)) if(!['id','name','kind','detail','sourcePath','code','x','y'].includes(key)) throw new Error('Unexpected activity field');
    ids.add(n.id);
  }
  const edges=new Set<string>();
  for(const e of value.dependencies){
    if(!object(e)||!text(e.id)||edges.has(e.id)||!text(e.from)||!text(e.to)||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!text(e.condition,100)) throw new Error('Invalid dependency');
    for(const key of Object.keys(e)) if(!['id','from','to','condition'].includes(key)) throw new Error('Unexpected dependency field');
    edges.add(e.id);
  }
  return structuredClone(value) as Pipeline;
}
export function pipelineIssues(pipeline: Pipeline): string[] {
  const p=validatePipeline(pipeline), degree=new Map(p.activities.map(n=>[n.id,0])), next=new Map(p.activities.map(n=>[n.id,[] as string[]]));
  for(const e of p.dependencies){degree.set(e.to,degree.get(e.to)!+1); next.get(e.from)!.push(e.to);}
  const queue=p.activities.filter(n=>degree.get(n.id)===0).map(n=>n.id);
  for(let i=0;i<queue.length;i++) for(const id of next.get(queue[i])!){degree.set(id,degree.get(id)!-1);if(degree.get(id)===0)queue.push(id);}
  const issues=queue.length===p.activities.length?[]:['Dependency cycle: this graph is not a DAG.'];
  if(p.activities.length>1)for(const n of p.activities) if(!p.dependencies.some(e=>e.from===n.id||e.to===n.id))issues.push('Unconnected activity: '+n.name);
  return issues;
}
export function parsePipeline(textValue: string): Pipeline {
  if(textValue.length>2*1024*1024)throw new Error('Pipeline JSON is limited to 2 MiB');
  const value:unknown=JSON.parse(textValue);
  if(object(value)&&value.format==='datapass.pipeline') return validatePipeline({...value,sourceKind:'user-file'});
  if(!object(value))throw new Error('Expected a DataPass or ADF/Fabric pipeline object');
  const properties=object(value.properties)?value.properties:value;
  if(!Array.isArray(properties.activities))throw new Error('No activities array found');
  const activities:Activity[]=[], dependencies:Dependency[]=[];
  function visit(items:unknown[], path:string, parent:string|null, depth:number){
    if(depth>8)throw new Error('Nested activity depth exceeded');
    const local=new Map<string,string>();
    for(let i=0;i<items.length;i++){
      const a=items[i];if(!object(a)||!text(a.name)||!text(a.type))throw new Error('Activity name/type missing');
      if(local.has(a.name))throw new Error('Duplicate sibling activity name: '+a.name);
      const id='activity_'+activities.length;local.set(a.name,id);
      const sourcePath=`${path}[${i}]`, code=JSON.stringify(a,null,2);if(code.length>50000)throw new Error('Activity source exceeds display limit');
      activities.push({id,name:a.name,kind:a.type,detail:depth?'Nested activity; container semantics remain source-owned.':'Imported definition; not executed.',sourcePath,code,x:depth*60+i*260,y:depth*180});
      if(activities.length>maxNodes)throw new Error('Too many activities');
      if(parent)dependencies.push({id:'edge_'+dependencies.length,from:parent,to:id,condition:'contains'});
    }
    for(let i=0;i<items.length;i++){
      const a=items[i] as Record<string,unknown>, id=local.get(a.name as string)!;
      if(a.dependsOn!==undefined&&!Array.isArray(a.dependsOn))throw new Error('dependsOn must be an array');
      for(const dep of (a.dependsOn||[]) as unknown[]){
        if(!object(dep)||!text(dep.activity)||!local.has(dep.activity))throw new Error('Unknown sibling dependency');
        const conditions=Array.isArray(dep.dependencyConditions)?dep.dependencyConditions:[];
        if(conditions.some(c=>!text(c,30)))throw new Error('Invalid dependency condition');
        dependencies.push({id:'edge_'+dependencies.length,from:local.get(dep.activity)!,to:id,condition:conditions.join(', ')||'Succeeded'});
      }
      const props=object(a.typeProperties)?a.typeProperties:{};
      for(const k of ['activities','ifTrueActivities','ifFalseActivities','defaultActivities'])if(Array.isArray(props[k]))visit(props[k],`${path}[${i}].typeProperties.${k}`,id,depth+1);
      if(Array.isArray(props.cases))for(let j=0;j<props.cases.length;j++){const c=props.cases[j];if(object(c)&&Array.isArray(c.activities))visit(c.activities,`${path}[${i}].typeProperties.cases[${j}].activities`,id,depth+1);}
    }
  }
  visit(properties.activities,'properties.activities',null,0);
  return validatePipeline({format:'datapass.pipeline',version:1,title:text(value.name)?value.name:'Imported pipeline',sourceKind:'user-file',activities,dependencies});
}
export const demoPipeline:Pipeline = {
  format:'datapass.pipeline',version:1,title:'Renewable operations / daily performance',sourceKind:'synthetic',
  activities:[
    {id:'landing',name:'Read operations',kind:'Source',detail:'The synthetic operations table loaded into this browser.',sourcePath:'samples/operations.csv',code:'SELECT * FROM operations LIMIT 100;',x:40,y:160},
    {id:'quality',name:'Check measurements',kind:'Check',detail:'Count rows with missing region or non-positive energy.',sourcePath:'pipelines/quality.sql',code:'SELECT count(*) AS invalid_rows\nFROM operations\nWHERE region IS NULL OR energy_mwh <= 0;',x:300,y:160},
    {id:'aggregate',name:'Regional performance',kind:'Aggregate',detail:'An analytical projection, not a cloud job.',sourcePath:'pipelines/aggregate.sql',code:'SELECT region, sum(energy_mwh) AS energy_mwh,\n       sum(revenue_eur) AS revenue_eur\nFROM operations\nGROUP BY region;',x:560,y:160},
    {id:'publish',name:'Serve application',kind:'Publish',detail:'A data contract consumed by linked views and stories.',sourcePath:'apps/operations',code:'// Outputs feed Studio panels.\n// No external publication occurs in this demo.',x:820,y:160}
  ],
  dependencies:[{id:'e1',from:'landing',to:'quality',condition:'Succeeded'},{id:'e2',from:'quality',to:'aggregate',condition:'Succeeded'},{id:'e3',from:'aggregate',to:'publish',condition:'Succeeded'}]
};

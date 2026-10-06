import type {Field,Values} from '../types.ts';
import {identifier,strict,text} from '../guards.ts';
import {boundedJson,freezeValue} from './safety.ts';

export type SemanticEntity={id:string;label:string;kind:string;summary:string;external:boolean};
export type SemanticRelation={id:string;from:string;to:string;kind:'depends-on'|'contains'|'integrates-with'|'related';source:string};
export type NavigationSpec={
  format:'datapass.navigation';version:1;entities:SemanticEntity[];relations:SemanticRelation[];
  facets:{id:string;label:string;entities:string[]}[];
  projections:{id:string;label:string}[];
  depths:{id:string;label:string}[];
};
export const NAV_KEYS=['selection','facet','projection','depth'] as const;
export type NavigationState={selection:string;facet:string;projection:string;depth:string};
function choices(input:unknown,max:number,label:string):asserts input is {id:string;label:string}[]{
  if(!Array.isArray(input)||!input.length||input.length>max)throw new Error('Invalid '+label+' budget');
  const ids=new Set<string>();for(const choice of input){strict(choice,['id','label'],label);identifier(choice.id,label);text(choice.label,label,100);if(ids.has(choice.id))throw new Error('Duplicate '+label);ids.add(choice.id);}
}
export function validateNavigation(input:unknown):NavigationSpec{
  boundedJson(input,262144);strict(input,['format','version','entities','relations','facets','projections','depths'],'navigation');
  if(input.format!=='datapass.navigation'||input.version!==1)throw new Error('Unsupported navigation document');
  if(!Array.isArray(input.entities)||!input.entities.length||input.entities.length>99)throw new Error('Navigation entity budget');
  const ids=new Set<string>();for(const entity of input.entities){
    strict(entity,['id','label','kind','summary','external'],'semantic entity');identifier(entity.id,'entity id');
    if(entity.id==='none'||ids.has(entity.id))throw new Error('Reserved or duplicate semantic identity');ids.add(entity.id);
    text(entity.label,'entity label',100);text(entity.kind,'entity kind',40);text(entity.summary,'entity summary',2000);
    if(typeof entity.external!=='boolean')throw new Error('Entity ownership must be explicit');
  }
  if(!Array.isArray(input.relations)||input.relations.length>300)throw new Error('Relation budget');
  const edges=new Set<string>();for(const rel of input.relations){
    strict(rel,['id','from','to','kind','source'],'semantic relation');identifier(rel.id,'relation id');
    if(edges.has(rel.id))throw new Error('Duplicate relation');edges.add(rel.id);
    if(typeof rel.from!=='string'||typeof rel.to!=='string'||!ids.has(rel.from)||!ids.has(rel.to)||rel.from===rel.to)throw new Error('Unknown relation endpoint');
    if(typeof rel.kind!=='string'||!['depends-on','contains','integrates-with','related'].includes(rel.kind))throw new Error('Unknown relation kind');
    text(rel.source,'relationship source',500);
  }
  choices(input.projections,8,'projection');choices(input.depths,4,'depth');
  if(!Array.isArray(input.facets)||!input.facets.length||input.facets.length>12)throw new Error('Facet budget');
  const facets=new Set<string>();for(const f of input.facets){
    strict(f,['id','label','entities'],'facet');identifier(f.id,'facet id');text(f.label,'facet label',100);
    if(facets.has(f.id))throw new Error('Duplicate facet');facets.add(f.id);
    if(!Array.isArray(f.entities)||f.entities.length>99||new Set(f.entities).size!==f.entities.length||f.entities.some(id=>typeof id!=='string'||!ids.has(id)))throw new Error('Invalid facet membership');
  }
  return freezeValue(structuredClone(input) as NavigationSpec);
}
export function defaultNavigation(spec:NavigationSpec):NavigationState{return {selection:'none',facet:spec.facets[0].id,projection:spec.projections[0].id,depth:spec.depths[0].id};}
export function validateNavigationState(spec:NavigationSpec,input:unknown):NavigationState{
  strict(input,NAV_KEYS,'navigation state');
  if(typeof input.selection!=='string'||input.selection!=='none'&&!spec.entities.some(e=>e.id===input.selection))throw new Error('Unknown semantic selection');
  for(const key of ['facet','projection','depth'] as const){
    const options=key==='facet'?spec.facets:key==='projection'?spec.projections:spec.depths;
    if(typeof input[key]!=='string'||!options.some(option=>option.id===input[key]))throw new Error('Unknown navigation '+key);
  }
  if(input.selection==='none'&&input.depth!==spec.depths[0].id)throw new Error('Select an entity before entering detail');
  return freezeValue({...input} as NavigationState);
}
/** A projection change preserves identity. Facet filtering may hide, but never erase, selection. */
export function navigateContext(spec:NavigationSpec,current:NavigationState,patch:Partial<NavigationState>):NavigationState{
  validateNavigationState(spec,current);strict(patch,NAV_KEYS,'navigation intent');
  const target={...current,...patch};
  if(patch.selection==='none'&&patch.depth===undefined)target.depth=spec.depths[0].id;
  return validateNavigationState(spec,target);
}
export function visibleEntities(spec:NavigationSpec,state:NavigationState):SemanticEntity[]{
  validateNavigationState(spec,state);const visible=new Set(spec.facets.find(f=>f.id===state.facet)!.entities);
  return spec.entities.filter(e=>visible.has(e.id));
}
export function navigationFields(spec:NavigationSpec,prefix='context'):Field[]{
  validateNavigation(spec);identifier(prefix,'navigation prefix');
  const defaults=defaultNavigation(spec);
  return NAV_KEYS.map(key=>{
    const options=key==='selection'?[{id:'none',label:'Overview'},...spec.entities]:key==='facet'?spec.facets:key==='projection'?spec.projections:spec.depths;
    const id=prefix+'-'+key;identifier(id,'navigation field');
    return {id,label:key[0].toUpperCase()+key.slice(1),type:'select',role:'view',default:defaults[key],options:options.map(o=>({value:o.id,label:o.label}))};
  });
}
export function readNavigation(spec:NavigationSpec,values:Values,prefix='context'):NavigationState{
  return validateNavigationState(spec,Object.fromEntries(NAV_KEYS.map(k=>[k,values[prefix+'-'+k]])));
}
export function navigationPatch(spec:NavigationSpec,current:NavigationState,patch:Partial<NavigationState>,prefix='context'):Record<string,string>{
  const next=navigateContext(spec,current,patch);return Object.fromEntries(NAV_KEYS.map(k=>[prefix+'-'+k,next[k]]));
}
/** Local view IDs only. No credentials, source text, runtime data or external URL is generated. */
export function navigationQuery(spec:NavigationSpec,state:NavigationState):string{
  validateNavigationState(spec,state);return new URLSearchParams(NAV_KEYS.map(k=>['context.'+k,state[k]])).toString();
}
export function parseNavigationQuery(spec:NavigationSpec,query:string):NavigationState|null{
  if(query.length>2048)throw new Error('Navigation URL budget exceeded');
  const params=new URLSearchParams(query),owned=[...params.keys()].filter(k=>k.startsWith('context.'));
  if(!owned.length)return null;
  if(owned.length!==NAV_KEYS.length||NAV_KEYS.some(k=>params.getAll('context.'+k).length!==1))throw new Error('Incomplete or duplicate navigation URL state');
  return validateNavigationState(spec,Object.fromEntries(NAV_KEYS.map(k=>[k,params.get('context.'+k)])));
}

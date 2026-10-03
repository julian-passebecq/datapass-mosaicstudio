/** Pure capability planning. Families guide authors; they do not restrict composition. */
import type {AppDefinition} from './types.ts';
import {object} from './guards.ts';
export const CAPABILITY_IDS = ['charts','stories','spatial','architecture','explorer','explanation','replay','motion','runs','models'] as const;
export type CapabilityId = typeof CAPABILITY_IDS[number];
export const capabilityCatalog = {
  models: {title:'Approved static GLB models',flag:'__STUDIO_MODELS__',guide:'docs/recipes/models.md',engines:['Shared Three.js viewport / GLTFLoader']},
  runs: {title:'Run history and result views', flag:'__STUDIO_RUNS__', guide:'docs/recipes/runs.md', engines:['Existing SiteRuntime tasks / artifact adapters']},
  charts: {title:'Analytical charts', flag:'__STUDIO_CHARTS__', guide:'docs/recipes/analytics.md', engines:['VizForge / D3']},
  stories: {title:'Authored visual stories', flag:'__STUDIO_STORIES__', guide:'docs/recipes/stories.md', engines:['VizForge StoryPlayer']},
  spatial: {title:'Optional 3D scenes', flag:'__STUDIO_3D__', guide:'docs/recipes/spatial.md', engines:['Three.js']},
  architecture: {title:'Architecture review', flag:'__STUDIO_ARCHITECTURE__', guide:'docs/ARCHITECTURE_REVIEW.md', engines:['React Flow']},
  explorer: {title:'Context and documents', flag:'__STUDIO_EXPLORER__', guide:'docs/recipes/knowledge.md', engines:['React Flow']},
  explanation: {title:'Semantic explanations', flag:'__STUDIO_EXPLANATIONS__', guide:'docs/recipes/explanation.md', engines:['ConceptMotion']},
  motion: {title:'Authored 2D / isometric motion', flag:'__STUDIO_MOTION__', guide:'docs/recipes/motion.md', engines:['D3 SVG / VizForge StoryPlayer']},
  replay: {title:'Sampled engineering replay', flag:'__STUDIO_REPLAY__', guide:'docs/recipes/replay.md', engines:['VizForge StoryPlayer / Figure']},
} satisfies Record<CapabilityId,{title:string;flag:string;guide:string;engines:string[]}>;
export type CapabilityPlan = {capabilities:CapabilityId[];reasons:Record<string,string[]>;blocks:string[];guides:string[];warnings:string[]};
export function validateCustomCapabilities(definition:AppDefinition):void {
  const declarations=definition.customCapabilities;
  if(declarations===undefined)return;
  if(!object(declarations))throw new Error('customCapabilities must be a source-owned mapping');
  for(const [id,caps] of Object.entries(declarations)){
    if(typeof definition.components?.[id]!=='function')throw new Error('Capabilities reference an unknown custom component: '+id);
    if(!Array.isArray(caps)||caps.length>CAPABILITY_IDS.length||new Set(caps).size!==caps.length||caps.some(c=>!CAPABILITY_IDS.includes(c)))throw new Error('Invalid custom capability list: '+id);
  }
}
export function planCapabilities(definition:AppDefinition):CapabilityPlan {
  validateCustomCapabilities(definition);
  const reasons:Record<string,string[]>={},warnings:string[]=[],blocks=new Set<string>();
  const need=(id:CapabilityId,why:string)=>{(reasons[id]??=[]).push(why);};
  for(const b of definition.manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks))){
    blocks.add(b.type);
    switch(b.type){
      case 'runs':{need('runs',b.id);const resource=definition.resources?.runs?.[b.resource] as {specs?:{representations?:{kind:string}[]}[]}|undefined;if(resource?.specs?.some(s=>s.representations?.some(r=>r.kind==='chart')))need('charts',b.id+' result views');break;}
      case 'model3d':need('models',b.id);need('spatial',b.id+' imported geometry');break;
      case 'motion':need('motion',b.id);break;
      case 'chart':need('charts',b.id);break;
      case 'scene3d':need('spatial',b.id);break;
      case 'architecture':need('architecture',b.id);break;
      case 'story-controls':case 'story-figure':need('stories',b.id);break;
      case 'explanation':need('explanation',b.id);break;
      case 'explorer':{
        need('explorer',b.id);const resource=definition.resources?.explorers?.[b.resource];
        if(object(resource)&&resource.scene)need('spatial',b.id+' scene');break;
      }
      case 'replay':{
        need('replay',b.id);need('charts',b.id+' time series');
        const resource=definition.resources?.replays?.[b.resource];
        if(object(resource)&&resource.scene)need('spatial',b.id+' optional scene');break;
      }
      case 'custom':{
        const declared=definition.customCapabilities?.[b.resource];
        if(declared===undefined){for(const id of CAPABILITY_IDS)need(id,b.id+' legacy opaque component');warnings.push('Custom '+b.resource+' has no capability declaration; all optional renderers are retained.');}
        else for(const id of declared){need(id,b.id+' declared extension');if(id==='models')need('spatial',b.id+' imported geometry');if(id==='replay'||id==='runs')need('charts',b.id+' result chart');}
        break;
      }
    }
  }
  const capabilities=CAPABILITY_IDS.filter(id=>reasons[id]);
  return {capabilities,reasons,blocks:[...blocks].sort(),guides:[...new Set(capabilities.map(id=>capabilityCatalog[id].guide))],warnings};
}
export function capabilityDefines(capabilities:readonly CapabilityId[]):Record<string,string>{
  if(capabilities.some(id=>!CAPABILITY_IDS.includes(id))||new Set(capabilities).size!==capabilities.length)throw new Error('Invalid build capabilities');
  return Object.fromEntries(CAPABILITY_IDS.map(id=>[capabilityCatalog[id].flag,String(capabilities.includes(id))]));
}
export const appFamilies = [
  {id:'content',title:'Content and presentation',template:'basic',guide:'docs/recipes/content.md',defaultCapabilities:[],purpose:'Pages, figures and public project content; no 3D requirement.'},
  {id:'knowledge',title:'Knowledge and architecture',template:'knowledge',guide:'docs/recipes/knowledge.md',defaultCapabilities:['explorer'],purpose:'Search, documents, context and optional architecture views.'},
  {id:'analytics',title:'Analytical applications',template:'analytics',guide:'docs/recipes/analytics.md',defaultCapabilities:['charts'],purpose:'Validated inputs, datasets, KPIs and charts.'},
  {id:'spatial',title:'Spatial discovery',template:'spatial',guide:'docs/recipes/spatial.md',defaultCapabilities:['explorer','spatial'],purpose:'An optional 3D representation of an authored system.'},
  {id:'replay',title:'Engineering replay',template:'replay',guide:'docs/recipes/replay.md',defaultCapabilities:['charts','replay'],purpose:'A shared sample index for a plan, measurements, events and optional 3D.'},
] as const;
export type AppFamily = typeof appFamilies[number]['id'];
export function familyById(id:string){const family=appFamilies.find(f=>f.id===id);if(!family)throw new Error('Unknown app family: '+id);return family;}

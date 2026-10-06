import type {ConceptKind,ConceptLayer,LayerRole,NodeStatus} from './schema.ts';

/**
 * The glyph catalog: one natural metaphor per kind, drawn the same way in every rendering.
 * `flat` = 2D glyph key (flat-glyphs.ts), `iso` = isometric glyph registry name (iso-glyphs.ts or Motion built-ins),
 * `icon` = 3D icon builder key (three/icons.ts). Aliased kinds share a metaphor but keep their own label and color.
 */
export type KindInfo={label:string;color:string;flat:string;iso:string;icon:string};
export const KINDS:Record<ConceptKind,KindInfo>={
  app:{label:'App',color:'#8aa39a',flat:'app',iso:'concept-app',icon:'app'},
  'web-app':{label:'Web app',color:'#7f97a8',flat:'browser',iso:'concept-browser',icon:'browser'},
  browser:{label:'Browser client',color:'#8597a6',flat:'browser',iso:'concept-browser',icon:'browser'},
  api:{label:'API service',color:'#c2b49a',flat:'api',iso:'api',icon:'api'},
  endpoint:{label:'Query endpoint',color:'#b8a5c4',flat:'endpoint',iso:'concept-endpoint',icon:'endpoint'},
  function:{label:'Function',color:'#d4ad5a',flat:'function',iso:'concept-function',icon:'function'},
  'sql-db':{label:'SQL database',color:'#8fa2b5',flat:'database',iso:'database',icon:'database'},
  database:{label:'Database',color:'#9aa5ad',flat:'database',iso:'database',icon:'database'},
  lake:{label:'Data lake',color:'#7fb0bb',flat:'lake',iso:'lake',icon:'lake'},
  lakehouse:{label:'Lakehouse',color:'#c99a78',flat:'lakehouse',iso:'lakehouse',icon:'lakehouse'},
  warehouse:{label:'Warehouse',color:'#b9a58a',flat:'warehouse',iso:'warehouse',icon:'warehouse'},
  eventhouse:{label:'Event store',color:'#8d9fb6',flat:'eventhouse',iso:'concept-eventhouse',icon:'eventhouse'},
  notebook:{label:'Notebook',color:'#ece5d3',flat:'notebook',iso:'notebook',icon:'notebook'},
  pipeline:{label:'Pipeline',color:'#9bb0b8',flat:'pipeline',iso:'pipeline',icon:'pipeline'},
  stream:{label:'Event stream',color:'#79a9b8',flat:'stream',iso:'stream',icon:'stream'},
  queue:{label:'Queue',color:'#a1907a',flat:'queue',iso:'queue',icon:'queue'},
  producer:{label:'Producer job',color:'#b98f74',flat:'producer',iso:'concept-producer',icon:'producer'},
  library:{label:'Library',color:'#a88f6e',flat:'library',iso:'concept-library',icon:'library'},
  'semantic-model':{label:'Semantic model',color:'#c9a65f',flat:'semantic-model',iso:'semantic-model',icon:'semantic-model'},
  report:{label:'Report',color:'#6f8796',flat:'report',iso:'report',icon:'report'},
  dashboard:{label:'Live dashboard',color:'#6f8796',flat:'dashboard',iso:'concept-dashboard',icon:'dashboard'},
  alert:{label:'Alert rule',color:'#d17d5e',flat:'alert',iso:'concept-alert',icon:'alert'},
  identity:{label:'Identity',color:'#d0a948',flat:'identity',iso:'identity',icon:'identity'},
  repo:{label:'Repository',color:'#8f9b7a',flat:'repo',iso:'concept-repo',icon:'repo'},
  artifact:{label:'Artifact files',color:'#e3d7bd',flat:'artifact',iso:'concept-artifact',icon:'artifact'},
  'ci-runner':{label:'CI runner',color:'#8f9eab',flat:'ci-runner',iso:'concept-ci-runner',icon:'ci-runner'},
  'static-host':{label:'Static host',color:'#7e8b95',flat:'static-host',iso:'concept-static-host',icon:'static-host'},
  user:{label:'Persona',color:'#c48e6e',flat:'user',iso:'concept-user',icon:'user'},
  users:{label:'People',color:'#c48e6e',flat:'users',iso:'users',icon:'users'},
  device:{label:'Device fleet',color:'#97a39a',flat:'device',iso:'concept-device',icon:'device'},
  external:{label:'External system',color:'#a3a9b3',flat:'external',iso:'concept-external',icon:'external'}
};
export const kindLabel=(k:ConceptKind)=>KINDS[k].label;
export const kindColor=(k:ConceptKind)=>KINDS[k].color;

/** One calm, matte, editorial palette for 3D, flat and isometric outputs. */
export const INK='#24333d',MUTED='#6a7a84',PAPER='#f4f1ea',LINE='#c9c2b4';
export const ROLE_TINT:Record<LayerRole,string>={
  storage:'#7fa9b5',data:'#8fb2a6',compute:'#a7b98f',serving:'#d2b071',experience:'#d39a7c',delivery:'#a99bc0',users:'#8e9fb2'
};
const CYCLE=['#7fa9b5','#8fb2a6','#a7b98f','#d2b071','#d39a7c','#a99bc0','#8e9fb2','#b5a48c'];
/** Layer tint: its role's tint, else a stable tint from its position. */
export const layerTint=(layer:ConceptLayer,index:number)=>layer.role?ROLE_TINT[layer.role]:CYCLE[index%CYCLE.length];
export const layerRoleText=(layer:ConceptLayer)=>layer.role??'layer';
export const FLOW_STYLE={
  data:{stroke:'#4f7482',text:'#46636e',dash:'',legend:'data flow'},
  control:{stroke:'#a0835a',text:'#8a6f4a',dash:'5 4',legend:'control / trigger'},
  auth:{stroke:'#7d68a8',text:'#66558c',dash:'1.5 3.5',legend:'auth / identity'}
} as const;
export const STATUS_TEXT:Record<NodeStatus,string>={active:'',planned:'PLANNED',deprecated:'DEPRECATED',external:'EXTERNAL'};
/** Status as presentation: planned/external are dashed outlines, deprecated is faded. */
export function statusColor(color:string,status:NodeStatus):string{
  if(status==='active')return color;
  const k=status==='deprecated'?.55:.35,c=parseInt(color.slice(1),16),mix=(v:number)=>Math.round(v+(255-v)*k);
  return '#'+[(c>>16)&255,(c>>8)&255,c&255].map(v=>mix(v).toString(16).padStart(2,'0')).join('');
}

/**
 * Architecture Atlas spec: one generic, renderer-free description of an app or a cloud project.
 * Layers are listed bottom (storage) to top (users); groups (domains, workspaces) left to right.
 * The 3D atlas, the flat layered SVG and the isometric SVG all read this one document and share its ids.
 */
export const NODE_KINDS=[
  'lake','warehouse','lakehouse','eventhouse','database','artifact','repo',
  'pipeline','notebook','stream','producer','semantic-model','library',
  'report','dashboard','api','queue','identity','ci-runner','static-host',
  'browser','users','device','alert'
] as const;
export type NodeKind=typeof NODE_KINDS[number];
export const LAYER_ROLES=['storage','data','compute','serving','experience','delivery','users'] as const;
export type LayerRole=typeof LAYER_ROLES[number];
export const EDGE_KINDS=['data','control'] as const;
export type EdgeKind=typeof EDGE_KINDS[number];

export type ArchLayer={id:string;label:string;role:LayerRole;description:string};
export type ArchGroup={id:string;label:string;description:string};
export type SourceRef={path:string;note?:string};
export type ArchNode={id:string;label:string;kind:NodeKind;layer:string;group:string;purpose:string;sources:SourceRef[]};
export type ArchEdge={id:string;from:string;to:string;kind:EdgeKind;label:string};
export type ArchSpec={
  format:'datapass.arch-atlas';version:1;id:string;title:string;subtitle:string;
  /** synthetic = generic illustrative platform; documented = every node cites a repository source. */
  provenance:'synthetic'|'documented';note:string;
  layers:ArchLayer[];groups:ArchGroup[];nodes:ArchNode[];edges:ArchEdge[];
};

export const KIND_LABELS:Record<NodeKind,string>={
  lake:'Data lake',warehouse:'Warehouse',lakehouse:'Lakehouse',eventhouse:'Event store',database:'Database',
  artifact:'Artifact files',repo:'Repository',pipeline:'Pipeline',notebook:'Notebook',stream:'Event stream',
  producer:'Producer job','semantic-model':'Semantic model',library:'Library',report:'Report',dashboard:'Live dashboard',
  api:'API service',queue:'Queue',identity:'Identity',"ci-runner":'CI runner','static-host':'Static host',
  browser:'Browser client',users:'People',device:'Device fleet',alert:'Alert rule'
};
export const ATLAS_LIMITS=Object.freeze({layers:8,groups:8,nodes:40,edges:64,perCell:3});
const ID=/^[a-z][a-z0-9-]{0,47}$/;

function fail(message:string):never{throw new Error('Atlas spec: '+message);}
function text(v:unknown,label:string,max:number):asserts v is string{if(typeof v!=='string'||!v.trim()||v.length>max)fail(label+' must be 1..'+max+' characters');}
function only(o:unknown,keys:string[],label:string,optional:string[]=[]):asserts o is Record<string,unknown>{
  if(!o||typeof o!=='object'||Array.isArray(o))fail(label+' must be an object');
  for(const k of Object.keys(o))if(!keys.includes(k)&&!optional.includes(k))fail('unknown field '+label+'.'+k);
  for(const k of keys)if(!(k in (o as object)))fail('missing '+label+'.'+k);
}
function unique(id:unknown,seen:Set<string>,label:string):asserts id is string{
  if(typeof id!=='string'||!ID.test(id)||id==='none')fail('invalid '+label+' id '+JSON.stringify(id));
  if(seen.has(id))fail('duplicate id '+id);seen.add(id);
}

/** Fails closed on anything a renderer would have to guess. Returns the same document, typed. */
export function validateSpec(input:unknown):ArchSpec{
  only(input,['format','version','id','title','subtitle','provenance','note','layers','groups','nodes','edges'],'spec');
  if(input.format!=='datapass.arch-atlas'||input.version!==1)fail('unsupported format');
  const ids=new Set<string>();unique(input.id,new Set(),'spec');
  text(input.title,'title',120);text(input.subtitle,'subtitle',240);text(input.note,'note',600);
  if(input.provenance!=='synthetic'&&input.provenance!=='documented')fail('provenance must be synthetic or documented');
  const arr=(v:unknown,label:string,max:number):unknown[]=>{if(!Array.isArray(v)||!v.length||v.length>max)fail(label+' must hold 1..'+max+' items');return v;};
  const layers=new Set<string>(),groups=new Set<string>(),nodes=new Map<string,NodeKind>();
  for(const l of arr(input.layers,'layers',ATLAS_LIMITS.layers)){
    only(l,['id','label','role','description'],'layer');unique(l.id,ids,'layer');layers.add(l.id);
    text(l.label,'layer label',60);text(l.description,'layer description',400);
    if(!LAYER_ROLES.includes(l.role as LayerRole))fail('unknown layer role '+String(l.role));
  }
  for(const g of arr(input.groups,'groups',ATLAS_LIMITS.groups)){
    only(g,['id','label','description'],'group');unique(g.id,ids,'group');groups.add(g.id);
    text(g.label,'group label',60);text(g.description,'group description',400);
  }
  const cells=new Map<string,number>();
  for(const n of arr(input.nodes,'nodes',ATLAS_LIMITS.nodes)){
    only(n,['id','label','kind','layer','group','purpose','sources'],'node');unique(n.id,ids,'node');
    text(n.label,'node label',40);text(n.purpose,'node purpose',600);
    if(!NODE_KINDS.includes(n.kind as NodeKind))fail('unknown node kind '+String(n.kind));
    if(typeof n.layer!=='string'||!layers.has(n.layer))fail('node '+n.id+' has unknown layer');
    if(typeof n.group!=='string'||!groups.has(n.group))fail('node '+n.id+' has unknown group');
    if(!Array.isArray(n.sources)||n.sources.length>6)fail('node '+n.id+' sources must hold 0..6 refs');
    for(const s of n.sources){only(s,['path'],'source',['note']);text(s.path,'source path',200);if(s.note!==undefined)text(s.note,'source note',200);}
    if(input.provenance==='documented'&&!n.sources.length)fail('documented node '+n.id+' needs a source ref');
    if(n.kind==='lake'){if([...nodes.values()].includes('lake'))fail('one lake per spec');if((input.layers as ArchLayer[])[0].id!==n.layer)fail('the lake lies on the bottom layer');}
    else{const cell=n.layer+'/'+n.group,c=(cells.get(cell)??0)+1;if(c>ATLAS_LIMITS.perCell)fail('cell '+cell+' holds more than '+ATLAS_LIMITS.perCell+' nodes');cells.set(cell,c);}
    nodes.set(n.id,n.kind as NodeKind);
  }
  const pairs=new Set<string>();
  if(!Array.isArray(input.edges)||input.edges.length>ATLAS_LIMITS.edges)fail('edges must hold 0..'+ATLAS_LIMITS.edges+' items');
  for(const e of input.edges){
    only(e,['id','from','to','kind','label'],'edge');unique(e.id,ids,'edge');
    if(typeof e.from!=='string'||!nodes.has(e.from)||typeof e.to!=='string'||!nodes.has(e.to)||e.from===e.to)fail('edge '+e.id+' must join two distinct nodes');
    if(!EDGE_KINDS.includes(e.kind as EdgeKind))fail('unknown edge kind');
    text(e.label,'edge label',60);
    const key=e.from+'>'+e.to;if(pairs.has(key))fail('duplicate edge '+key);pairs.add(key);
  }
  return input as unknown as ArchSpec;
}

export const nodeById=(spec:ArchSpec,id:string)=>spec.nodes.find(n=>n.id===id);
export const inputsOf=(spec:ArchSpec,id:string)=>spec.edges.filter(e=>e.to===id);
export const outputsOf=(spec:ArchSpec,id:string)=>spec.edges.filter(e=>e.from===id);

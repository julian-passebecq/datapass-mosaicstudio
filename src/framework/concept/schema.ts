/**
 * Concept spec v1: one renderer-free description of an app or a cloud project.
 * Layers are ordered bottom (stores, the shared lake) to top (people) and carry a height; domains group nodes
 * left to right (a `side` domain becomes a vertical band such as identity); flows join nodes (data, control,
 * auth). The isometric SVG, the flat layer-cake SVG and the 3D scene all read this one document and share its ids.
 */
import {z} from 'zod';

export const CONCEPT_FORMAT='datapass.concept-spec';
/** Published contract version (semver). A 1.x reader accepts every 1.y file; a 1.y change only adds optional fields. */
export const CONCEPT_SPEC_VERSION='1.0.0';
/** Well-known evidence kinds. Other lowercase kinds are accepted (forward compatible) and shown as given. */
export const EVIDENCE_KINDS=['source','doc','url','commit','test','issue','config','log','other'] as const;
export const CONCEPT_KINDS=[
  'app','web-app','browser','api','endpoint','function','sql-db','database','lake','lakehouse','warehouse','eventhouse',
  'notebook','pipeline','stream','queue','producer','library','semantic-model','report','dashboard','alert',
  'identity','repo','artifact','ci-runner','static-host','user','users','device','external'
] as const;
export type ConceptKind=typeof CONCEPT_KINDS[number];
export const LAYER_ROLES=['storage','data','compute','serving','experience','delivery','users'] as const;
export type LayerRole=typeof LAYER_ROLES[number];
export const FLOW_KINDS=['data','control','auth'] as const;
export type FlowKind=typeof FLOW_KINDS[number];
export const NODE_STATUSES=['active','planned','deprecated','external'] as const;
export type NodeStatus=typeof NODE_STATUSES[number];
export const CONCEPT_LIMITS=Object.freeze({layers:8,domains:8,nodes:40,flows:64,annotations:6,evidence:12,perCell:3,minLayerGap:.6,maxHeight:40,bytes:256*1024});

const ID=/^[a-z][a-z0-9-]{0,47}$/;
const id=z.string({required_error:'is required',invalid_type_error:'must be a string id'})
  .regex(ID,'must be a lowercase id: a-z first, then a-z, 0-9 or "-" (at most 48 characters)')
  .refine(v=>v!=='none','"none" is reserved');
const text=(max:number)=>z.string({required_error:'is required',invalid_type_error:'must be text'})
  .min(1,'must not be empty').max(max,`must be at most ${max} characters`).refine(v=>v.trim().length>0,'must not be blank');
const oneOf=<T extends readonly [string,...string[]]>(values:T,what:string)=>z.enum(values as unknown as [T[number],...T[number][]],{
  errorMap:(issue,ctx)=>({message:issue.code==='invalid_enum_value'?`unknown ${what} ${JSON.stringify(issue.received)}; expected one of: ${values.join(', ')}`:ctx.defaultError})
});

export const conceptLayerSchema=z.object({
  id,label:text(60),
  /** Elevation in levels (0 = ground). Strictly increasing bottom to top; 3D and isometric planes stand at this height. */
  height:z.number({required_error:'is required',invalid_type_error:'must be a number'}).finite().min(0,'must be ≥ 0').max(CONCEPT_LIMITS.maxHeight,`must be ≤ ${CONCEPT_LIMITS.maxHeight}`),
  role:oneOf(LAYER_ROLES,'layer role').optional(),
  description:text(400).optional()
});
export const conceptDomainSchema=z.object({
  id,label:text(60),description:text(400).optional(),
  /** `side`: a cross-cutting band (identity, monitoring) drawn as a vertical band beside the layer cake. */
  placement:oneOf(['main','side'] as const,'domain placement').optional()
});
export const conceptSourceSchema=z.object({path:text(200),note:text(200).optional()});
/** A pointer to where a node or flow was found (a file, a URL, a commit). Inert text: renderers never fetch it. */
export const conceptEvidenceSchema=z.object({
  kind:z.string({required_error:'is required',invalid_type_error:'must be text'}).regex(/^[a-z][a-z0-9-]{0,31}$/,`must be a lowercase evidence kind such as ${EVIDENCE_KINDS.join(', ')}`),
  ref:text(500),label:text(120).optional()
});
const evidence=z.array(conceptEvidenceSchema).max(CONCEPT_LIMITS.evidence,`must hold at most ${CONCEPT_LIMITS.evidence} evidence refs`).optional();
export const conceptNodeSchema=z.object({
  id,kind:oneOf(CONCEPT_KINDS,'node kind'),layer:id,domain:id,label:text(40),
  status:oneOf(NODE_STATUSES,'node status').optional(),
  description:text(600).optional(),
  sources:z.array(conceptSourceSchema).max(6,'must hold at most 6 refs').optional(),
  evidence
});
export const conceptFlowSchema=z.object({
  id,from:id,to:id,kind:oneOf(FLOW_KINDS,'flow kind'),label:text(60),
  direction:oneOf(['forward','both'] as const,'flow direction').optional(),
  evidence
});
export const conceptAnnotationSchema=z.object({id,target:id.optional(),text:text(160)});
export const conceptSpecSchema=z.object({
  /** Optional editor hint (a path or URL to concept-spec.schema.json); ignored by renderers. */
  $schema:z.string().max(300).optional(),
  format:z.literal(CONCEPT_FORMAT,{errorMap:()=>({message:`must be "${CONCEPT_FORMAT}"`})}),
  version:z.literal(1,{errorMap:()=>({message:'must be 1'})}),
  /** Contract version the file was written for (semver, major 1). Exporters always emit it. */
  specVersion:z.string({invalid_type_error:'must be a semver string such as "1.0.0"'}).regex(/^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,`must be a 1.x semver version such as "${CONCEPT_SPEC_VERSION}" (this reader supports major version 1)`).optional(),
  id,title:text(120),subtitle:text(240).optional(),
  /** synthetic = generic illustration; documented = every node cites a repository source. */
  provenance:oneOf(['synthetic','documented'] as const,'provenance'),
  note:text(600),
  layers:z.array(conceptLayerSchema).min(1,'needs at least 1 layer').max(CONCEPT_LIMITS.layers,`must hold at most ${CONCEPT_LIMITS.layers} layers`),
  domains:z.array(conceptDomainSchema).min(1,'needs at least 1 domain').max(CONCEPT_LIMITS.domains,`must hold at most ${CONCEPT_LIMITS.domains} domains`),
  nodes:z.array(conceptNodeSchema).min(1,'needs at least 1 node').max(CONCEPT_LIMITS.nodes,`must hold at most ${CONCEPT_LIMITS.nodes} nodes`),
  flows:z.array(conceptFlowSchema).max(CONCEPT_LIMITS.flows,`must hold at most ${CONCEPT_LIMITS.flows} flows`),
  annotations:z.array(conceptAnnotationSchema).max(CONCEPT_LIMITS.annotations,`must hold at most ${CONCEPT_LIMITS.annotations} annotations`).optional()
});
export type ConceptSpecInput=z.input<typeof conceptSpecSchema>;

/* ---------- normalized document (defaults filled) consumed by every renderer ---------- */
export type ConceptLayer={id:string;label:string;height:number;role?:LayerRole;description:string};
export type ConceptDomain={id:string;label:string;description:string;placement:'main'|'side'};
export type SourceRef={path:string;note?:string};
export type EvidenceRef={kind:string;ref:string;label?:string};
export type ConceptNode={id:string;kind:ConceptKind;layer:string;domain:string;label:string;status:NodeStatus;description:string;sources:SourceRef[];evidence:EvidenceRef[]};
export type ConceptFlow={id:string;from:string;to:string;kind:FlowKind;label:string;direction:'forward'|'both';evidence:EvidenceRef[]};
export type ConceptAnnotation={id:string;target?:string;text:string};
export type ConceptSpec={
  format:typeof CONCEPT_FORMAT;version:1;id:string;title:string;subtitle:string;provenance:'synthetic'|'documented';note:string;
  layers:ConceptLayer[];domains:ConceptDomain[];nodes:ConceptNode[];flows:ConceptFlow[];annotations:ConceptAnnotation[];
};

export type ConceptIssue={path:string;message:string};
export class ConceptSpecError extends Error{
  readonly issues:ConceptIssue[];
  constructor(issues:ConceptIssue[]){
    const shown=issues.slice(0,8).map(i=>(i.path?i.path+': ':'')+i.message);
    super('Concept spec is invalid:\n- '+shown.join('\n- ')+(issues.length>8?`\n- … and ${issues.length-8} more`:''));
    this.name='ConceptSpecError';this.issues=issues;
  }
}
const pathText=(path:(string|number)[])=>path.reduce<string>((s,p)=>typeof p==='number'?s+'['+p+']':s+(s?'.':'')+p,'');

/** Cross-reference rules a schema cannot express. Paths point at the offending field. */
function semanticIssues(s:z.output<typeof conceptSpecSchema>):ConceptIssue[]{
  const issues:ConceptIssue[]=[],add=(path:string,message:string)=>issues.push({path,message});
  const seen=new Map<string,string>();
  const claim=(value:string,path:string)=>{const prior=seen.get(value);if(prior)add(path,`duplicate id "${value}" (already used at ${prior})`);else seen.set(value,path);};
  claim(s.id,'id');
  s.layers.forEach((l,i)=>claim(l.id,`layers[${i}].id`));
  s.domains.forEach((d,i)=>claim(d.id,`domains[${i}].id`));
  s.nodes.forEach((n,i)=>claim(n.id,`nodes[${i}].id`));
  s.flows.forEach((f,i)=>claim(f.id,`flows[${i}].id`));
  (s.annotations??[]).forEach((a,i)=>claim(a.id,`annotations[${i}].id`));
  for(let i=1;i<s.layers.length;i++)if(s.layers[i].height-s.layers[i-1].height<CONCEPT_LIMITS.minLayerGap)
    add(`layers[${i}].height`,`must be at least ${CONCEPT_LIMITS.minLayerGap} above "${s.layers[i-1].id}" (${s.layers[i-1].height}); layers are listed bottom to top`);
  const firstSide=s.domains.findIndex(d=>d.placement==='side');
  if(firstSide>=0)s.domains.forEach((d,i)=>{if(i>firstSide&&d.placement!=='side')add(`domains[${i}].placement`,'side domains must come after every main domain (they are drawn at the right edge)');});
  if(firstSide===0)add('domains','needs at least one main domain before side domains');
  const layers=new Set(s.layers.map(l=>l.id)),domains=new Set(s.domains.map(d=>d.id)),nodes=new Set(s.nodes.map(n=>n.id));
  const cells=new Map<string,number>();let lake=-1;
  s.nodes.forEach((n,i)=>{
    if(!layers.has(n.layer))add(`nodes[${i}].layer`,`unknown layer "${n.layer}"; declared layers: ${[...layers].join(', ')}`);
    if(!domains.has(n.domain))add(`nodes[${i}].domain`,`unknown domain "${n.domain}"; declared domains: ${[...domains].join(', ')}`);
    if(s.provenance==='documented'&&!(n.sources?.length)&&!(n.evidence?.length))add(`nodes[${i}].sources`,'a documented spec needs at least one source or evidence ref per node');
    if(n.kind==='lake'){
      if(lake>=0)add(`nodes[${i}].kind`,`only one lake per spec (nodes[${lake}] is already the lake)`);lake=i;
      if(n.layer!==s.layers[0].id)add(`nodes[${i}].layer`,`the lake lies on the bottom layer "${s.layers[0].id}"`);
    }else{
      const cell=n.layer+' / '+n.domain,c=(cells.get(cell)??0)+1;cells.set(cell,c);
      if(c===CONCEPT_LIMITS.perCell+1)add(`nodes[${i}]`,`cell ${cell} holds more than ${CONCEPT_LIMITS.perCell} nodes; split the domain or move a node to another layer`);
    }
  });
  const pairs=new Set<string>();
  s.flows.forEach((f,i)=>{
    if(!nodes.has(f.from))add(`flows[${i}].from`,`unknown node "${f.from}"`);
    if(!nodes.has(f.to))add(`flows[${i}].to`,`unknown node "${f.to}"`);
    if(f.from===f.to)add(`flows[${i}]`,'a flow must join two distinct nodes');
    const key=f.from+'>'+f.to;if(pairs.has(key))add(`flows[${i}]`,`duplicate flow ${f.from} → ${f.to}; merge the labels`);pairs.add(key);
  });
  (s.annotations??[]).forEach((a,i)=>{if(a.target!==undefined&&!nodes.has(a.target))add(`annotations[${i}].target`,`unknown node "${a.target}"`);});
  return issues;
}

function normalize(s:z.output<typeof conceptSpecSchema>):ConceptSpec{
  return {
    format:CONCEPT_FORMAT,version:1,id:s.id,title:s.title,subtitle:s.subtitle??'',provenance:s.provenance,note:s.note,
    layers:s.layers.map(l=>({id:l.id,label:l.label,height:l.height,...(l.role?{role:l.role}:{}),description:l.description??''})),
    domains:s.domains.map(d=>({id:d.id,label:d.label,description:d.description??'',placement:d.placement??'main'})),
    nodes:s.nodes.map(n=>({id:n.id,kind:n.kind,layer:n.layer,domain:n.domain,label:n.label,status:n.status??'active',description:n.description??'',sources:(n.sources??[]).map(r=>({...r})),evidence:(n.evidence??[]).map(r=>({...r}))})),
    flows:s.flows.map(f=>({id:f.id,from:f.from,to:f.to,kind:f.kind,label:f.label,direction:f.direction??'forward',evidence:(f.evidence??[]).map(r=>({...r}))})),
    annotations:(s.annotations??[]).map(a=>({...a}))
  };
}

/**
 * Fields this reader does not know. They are ignored (a newer 1.x file stays readable) and reported as warnings,
 * so a typo such as "lable" is still visible. Walks the raw input against the zod object shapes.
 */
function unknownFieldWarnings(input:unknown):ConceptIssue[]{
  const out:ConceptIssue[]=[];
  const walk=(value:unknown,schema:z.ZodTypeAny,path:string)=>{
    let s=schema;
    while(s instanceof z.ZodOptional||s instanceof z.ZodEffects)s=s instanceof z.ZodOptional?s.unwrap():s.innerType();
    if(s instanceof z.ZodArray){const el=s.element as z.ZodTypeAny;if(Array.isArray(value))value.forEach((v,i)=>walk(v,el,path+'['+i+']'));return;}
    if(!(s instanceof z.ZodObject)||!value||typeof value!=='object'||Array.isArray(value))return;
    const shape=s.shape as Record<string,z.ZodTypeAny>;
    for(const [k,v] of Object.entries(value as Record<string,unknown>)){
      const at=path?path+'.'+k:k;
      if(Object.hasOwn(shape,k))walk(v,shape[k],at);else out.push({path:at,message:`unknown field "${k}" ignored (not part of concept spec ${CONCEPT_SPEC_VERSION})`});
    }
  };
  walk(input,conceptSpecSchema,'');
  return out;
}
function versionWarnings(input:unknown):ConceptIssue[]{
  const v=(input as {specVersion?:unknown}).specVersion;
  if(v===undefined)return [{path:'specVersion',message:`missing; read as ${CONCEPT_SPEC_VERSION} (exporters always write it)`}];
  if(typeof v==='string'&&/^1\.\d+\.\d+$/.test(v)&&Number(v.split('.')[1])>Number(CONCEPT_SPEC_VERSION.split('.')[1]))
    return [{path:'specVersion',message:`file is ${v}, this reader knows ${CONCEPT_SPEC_VERSION}: newer optional fields are ignored`}];
  return [];
}

export type ConceptCheck={ok:true;spec:ConceptSpec;warnings:ConceptIssue[]}|{ok:false;issues:ConceptIssue[];warnings:ConceptIssue[]};
/** Never throws: either a normalized spec or every issue found (schema issues first, then cross-references), plus non-blocking warnings. */
export function checkConceptSpec(input:unknown):ConceptCheck{
  const parsed=conceptSpecSchema.safeParse(input);
  const warnings=input&&typeof input==='object'&&!Array.isArray(input)?[...versionWarnings(input),...unknownFieldWarnings(input)]:[];
  if(!parsed.success)return {ok:false,warnings,issues:parsed.error.issues.map(i=>({path:pathText(i.path),message:i.message}))};
  const issues=semanticIssues(parsed.data);
  return issues.length?{ok:false,issues,warnings}:{ok:true,spec:normalize(parsed.data),warnings};
}
/** Fails closed with a readable ConceptSpecError. Returns a fresh normalized copy (the input is not mutated). */
export function parseConceptSpec(input:unknown):ConceptSpec{
  const r=checkConceptSpec(input);if(!r.ok)throw new ConceptSpecError(r.issues);return r.spec;
}
/** JSON text to a plain value. Bounded and inert: plain JSON only (a leading BOM is tolerated). */
function jsonValue(text:string):unknown{
  if(typeof text!=='string')throw new ConceptSpecError([{path:'',message:'expected JSON text'}]);
  if(text.length>CONCEPT_LIMITS.bytes)throw new ConceptSpecError([{path:'',message:`file is larger than ${CONCEPT_LIMITS.bytes/1024} KB`}]);
  try{return JSON.parse(text.charCodeAt(0)===0xfeff?text.slice(1):text);}catch(e){throw new ConceptSpecError([{path:'',message:'not valid JSON ('+(e instanceof Error?e.message:String(e))+')'}]);}
}
/** JSON text (a dropped file, a fetched URL) to a normalized spec. */
export function parseConceptJson(text:string):ConceptSpec{return parseConceptSpec(jsonValue(text));}
/** Like parseConceptJson, and also returns the warnings (unknown fields ignored, missing or newer specVersion). */
export function readConceptJson(text:string):{spec:ConceptSpec;warnings:ConceptIssue[]}{
  const r=checkConceptSpec(jsonValue(text));if(!r.ok)throw new ConceptSpecError(r.issues);return {spec:r.spec,warnings:r.warnings};
}

export const nodeById=(spec:ConceptSpec,id:string)=>spec.nodes.find(n=>n.id===id);
export const inputsOf=(spec:ConceptSpec,id:string)=>spec.flows.filter(f=>f.to===id);
export const outputsOf=(spec:ConceptSpec,id:string)=>spec.flows.filter(f=>f.from===id);

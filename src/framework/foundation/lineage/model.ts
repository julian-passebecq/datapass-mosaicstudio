import type {Artifact,EvidenceLink,Representation} from '../artifact.ts';

/**
 * Deterministic lineage graph of one validated artifact (no React, no fetch, no AI):
 * value -> representation -> artifact -> producer / inputs / upstream artifacts -> evidence (file + lines).
 * Everything shown is declared by the producer; Studio does not observe or verify execution.
 */
export type LineageKind='value'|'representation'|'artifact'|'producer'|'input'|'dependency'|'evidence';
export type LineageNode={id:string;kind:LineageKind;rank:number;label:string;detail:string;evidence?:EvidenceLink;inputs?:readonly string[]};
export type LineageEdge={from:string;to:string};
export type LineageGraph={nodes:LineageNode[];edges:LineageEdge[]};
export type LineagePoint={id:string;x:number;y:number;layer:number;order:number};
export type LineageLayout={width:number;height:number;nodeWidth:number;nodeHeight:number;points:Record<string,LineagePoint>;layers:string[][];edges:{from:string;to:string;path:string}[]};
export const LINEAGE_RANK:Readonly<Record<LineageKind,number>>=Object.freeze({value:0,representation:1,artifact:2,producer:3,input:3,dependency:3,evidence:4});
export const LINEAGE_LAYER_TITLES:Readonly<Record<number,string>>=Object.freeze({0:'Values',1:'Representations',2:'Artifact',3:'Producer and inputs',4:'Evidence'});

export const evidenceKey=(ref:EvidenceLink)=>`${ref.path}:${ref.start}-${ref.end}`;
const lines=(ref:EvidenceLink)=>ref.start===ref.end?`line ${ref.start}`:`lines ${ref.start}-${ref.end}`;
const format=(value:unknown,digits?:number)=>typeof value==='number'?new Intl.NumberFormat('en-US',{maximumFractionDigits:digits??3,minimumFractionDigits:digits??0}).format(value):String(value);

/** The displayed value of a metric representation, formatted like the metric block (en-US, fixed digits). */
export function metricValue(artifact:Artifact,rep:Representation):string|null{
  if(rep.kind!=='metric'||artifact.payload.kind!=='table')return null;
  const key=artifact.payload.rowKey,row=artifact.payload.rows.find(r=>String(r[key])===rep.row);
  if(!row)return null;
  const value=row[rep.column];
  return value===null||value===undefined?null:format(value,rep.digits)+(rep.unit?' '+rep.unit:'');
}

/** Every evidence link the artifact declares (producer first, then inputs), deduplicated, in declaration order. */
export function artifactEvidence(artifact:Artifact):EvidenceLink[]{
  const p=artifact.provenance,seen=new Set<string>(),out:EvidenceLink[]=[];
  for(const ref of [...(p.producer?.evidence??[]),...(p.inputs??[]).flatMap(i=>i.evidence??[])])if(!seen.has(evidenceKey(ref))){seen.add(evidenceKey(ref));out.push(ref);}
  return out;
}

export function artifactLineage(artifact:Artifact):LineageGraph{
  const nodes:LineageNode[]=[],edges:LineageEdge[]=[],ids=new Set<string>();
  const add=(node:Omit<LineageNode,'rank'>)=>{if(!ids.has(node.id)){ids.add(node.id);nodes.push({...node,rank:LINEAGE_RANK[node.kind]});}return node.id;};
  const p=artifact.provenance,artifactId='artifact:'+artifact.id;
  for(const rep of artifact.representations){
    const value=metricValue(artifact,rep);
    if(value!==null){add({id:'value:'+rep.id,kind:'value',label:value,detail:rep.title});edges.push({from:'value:'+rep.id,to:'rep:'+rep.id});}
  }
  for(const rep of artifact.representations){
    add({id:'rep:'+rep.id,kind:'representation',label:rep.title,detail:rep.kind+(rep.inputs?` / ${rep.inputs.length} inputs`:''),...(rep.inputs?{inputs:rep.inputs}:{})});
    edges.push({from:'rep:'+rep.id,to:artifactId});
  }
  const facts=[p.kind,p.runId?'run '+p.runId:'no run id',p.inputHash?'inputs '+p.inputHash.slice(0,12):'no input hash'];
  add({id:artifactId,kind:'artifact',label:artifact.id,detail:facts.join(' / ')});
  const cite=(owner:string,refs:readonly EvidenceLink[]|undefined)=>{for(const ref of refs??[]){const id='evidence:'+evidenceKey(ref);add({id,kind:'evidence',label:ref.label,detail:`${ref.path} ${lines(ref)}`,evidence:ref});edges.push({from:owner,to:id});}};
  if(p.producer){add({id:'producer',kind:'producer',label:p.producer.name,detail:'producer / '+p.producer.kind});edges.push({from:artifactId,to:'producer'});}
  for(const input of p.inputs??[]){
    const id='input:'+input.id;
    add({id,kind:'input',label:input.label,detail:input.value===undefined?'declared input':format(input.value)+(input.unit?' '+input.unit:'')});
    edges.push({from:artifactId,to:id});
  }
  for(const dep of p.dependsOn??[]){add({id:'dep:'+dep,kind:'dependency',label:dep,detail:'upstream artifact'});edges.push({from:artifactId,to:'dep:'+dep});}
  if(p.producer)cite('producer',p.producer.evidence);
  for(const input of p.inputs??[])cite('input:'+input.id,input.evidence);
  return {nodes,edges};
}

/**
 * Nodes on the path through `start`: everything downstream and upstream of it. A representation that declares
 * `inputs` only reaches those inputs, and an input only climbs back to the representations that use it.
 */
export function lineagePath(graph:LineageGraph,start:string):Set<string>{
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));
  if(!byId.has(start))return new Set();
  const out=new Map<string,string[]>(),inn=new Map<string,string[]>();
  for(const e of graph.edges){(out.get(e.from)??out.set(e.from,[]).get(e.from)!).push(e.to);(inn.get(e.to)??inn.set(e.to,[]).get(e.to)!).push(e.from);}
  const result=new Set([start]);
  const allowed=(rep:LineageNode|undefined,input:LineageNode|undefined)=>!rep||!input||!rep.inputs||rep.inputs.includes(input.id.slice('input:'.length));
  const walk=(next:Map<string,string[]>,down:boolean)=>{
    const first=byId.get(start)!;
    const stack:[string,LineageNode|undefined][]=[[start,first.kind==='representation'||first.kind==='input'?first:undefined]];
    const seen=new Set<string>();
    while(stack.length){
      const [id,context]=stack.pop()!;
      if(seen.has(id+'|'+(context?.id??'')))continue;seen.add(id+'|'+(context?.id??''));
      for(const target of next.get(id)??[]){
        const node=byId.get(target)!;
        if(down&&node.kind==='input'&&!allowed(context?.kind==='representation'?context:undefined,node))continue;
        if(!down&&node.kind==='representation'&&!allowed(node,context?.kind==='input'?context:undefined))continue;
        if(down&&node.kind==='representation'||!down&&node.kind==='input'){result.add(target);stack.push([target,node]);continue;}
        result.add(target);stack.push([target,context]);
      }
    }
  };
  walk(out,true);walk(inn,false);
  return result;
}

/**
 * Layered left-to-right layout. Columns are the distinct ranks (empty ranks collapse). Within a column, nodes keep
 * declaration order unless they have predecessors, then they sort by the mean row of their predecessors
 * (one barycentre sweep, ties by declaration order). Pure and deterministic: same graph, same coordinates.
 */
export function layoutLineage(graph:LineageGraph,options:{nodeWidth?:number;nodeHeight?:number;gapX?:number;gapY?:number}={}):LineageLayout{
  const nodeWidth=options.nodeWidth??176,nodeHeight=options.nodeHeight??46,gapX=options.gapX??40,gapY=options.gapY??12;
  const ranks=[...new Set(graph.nodes.map(n=>n.rank))].sort((a,b)=>a-b);
  const index=new Map(graph.nodes.map((n,i)=>[n.id,i]));
  const preds=new Map<string,string[]>();
  for(const e of graph.edges)(preds.get(e.to)??preds.set(e.to,[]).get(e.to)!).push(e.from);
  const row=new Map<string,number>(),layers:string[][]=[];
  for(const rank of ranks){
    const column=graph.nodes.filter(n=>n.rank===rank).map(n=>n.id);
    const center=(id:string)=>{const from=(preds.get(id)??[]).filter(p=>row.has(p));return from.length?from.reduce((s,p)=>s+row.get(p)!,0)/from.length:Number.POSITIVE_INFINITY;};
    const keyed=column.map(id=>({id,c:center(id),i:index.get(id)!}));
    if(keyed.some(k=>Number.isFinite(k.c)))keyed.sort((a,b)=>(Number.isFinite(a.c)&&Number.isFinite(b.c)?a.c-b.c:Number.isFinite(a.c)?-1:Number.isFinite(b.c)?1:0)||a.i-b.i);
    keyed.forEach((k,i)=>row.set(k.id,i));layers.push(keyed.map(k=>k.id));
  }
  const tallest=Math.max(1,...layers.map(l=>l.length));
  const height=tallest*nodeHeight+(tallest-1)*gapY,width=layers.length*nodeWidth+Math.max(0,layers.length-1)*gapX;
  const points:Record<string,LineagePoint>={};
  layers.forEach((layer,l)=>{
    const offset=(height-(layer.length*nodeHeight+(layer.length-1)*gapY))/2;
    layer.forEach((id,order)=>{points[id]={id,layer:l,order,x:l*(nodeWidth+gapX),y:Math.round(offset+order*(nodeHeight+gapY))};});
  });
  const edges=graph.edges.filter(e=>points[e.from]&&points[e.to]).map(e=>{
    const a=points[e.from],b=points[e.to],x1=a.x+nodeWidth,y1=a.y+nodeHeight/2,x2=b.x,y2=b.y+nodeHeight/2,mid=(x1+x2)/2;
    return {...e,path:`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`};
  });
  return {width,height,nodeWidth,nodeHeight,points,layers,edges};
}

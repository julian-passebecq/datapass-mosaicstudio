/** Galaxy Navigator model: registry types and pure graph helpers (no React, no DOM).
 * Positions are a deterministic cluster layout computed from the registry, not authored geography.
 */
export type Status='live'|'branch'|'planned'|'proposed'|'no-consumer'|'retired';
export type RegistryNode={id:string;name:string;kind:'app'|'repo';stack:string;repo:string;hub:boolean};
export type Contract={id:string;name:string;owner:string;consumers:string[];status:Status};
export type Edge={id:string;from:string;to:string;contract:string;kind:string;status:Status};
export type Registry={format:'galaxy-navigator.registry';version:1;source:{name:string;generated:string;updated:string};nodes:RegistryNode[];contracts:Contract[];edges:Edge[]};

/** Status order: first = strongest. Labels and styles are presentation config, kept here in one place. */
export const STATUS_ORDER:readonly Status[]=['live','branch','planned','proposed','no-consumer','retired'];
export const STATUS_LABEL:Record<Status,string>={live:'Live','branch':'On a branch',planned:'Planned',proposed:'Proposed','no-consumer':'No consumer',retired:'Retired'};
export const STATUS_DASH:Record<Status,string>={live:'',branch:'7 4',planned:'2 4',proposed:'2 4','no-consumer':'1 5',retired:'1 5'};
/** Status filter presets (a view field). */
export const STATUS_FILTERS={all:STATUS_ORDER,live:['live'] as Status[],pending:['branch','planned','proposed'] as Status[]} as const;
export type StatusFilter=keyof typeof STATUS_FILTERS;

/** Clusters (configurable): group id -> label and member node ids. Unlisted nodes fall into "other". */
export type Group={id:string;label:string;members:readonly string[]};
export const GROUPS:readonly Group[]=[
  {id:'datapass',label:'DataPass',members:['datapass-vscode','mosaic','data-xray','datapass','datapass-studio','datapass-vscode-cloud','datapass-vscode-common','foil','foil-study']},
  {id:'mongoku',label:'Mongoku & DiagramCloud',members:['mongoku','diagramcloud']},
  {id:'atlas',label:'AtlasNote & Power Ops',members:['atlasnote','powerops']},
  {id:'control',label:'Claude Control',members:['claude-control','effort-board']},
];
export const OTHER_GROUP:Group={id:'other',label:'Other',members:[]};
export const groupOf=(id:string,groups:readonly Group[]=GROUPS)=>groups.find(g=>g.members.includes(id))||OTHER_GROUP;

export type Point={x:number;y:number};
/** angle: direction from the cluster centre (radians), null for a single-member cluster. */
export type Placed=RegistryNode&Point&{r:number;group:Group;degree:number;angle:number|null};
export type Pair={id:string;from:string;to:string;edges:Edge[];status:Status};
export type Graph={nodes:Placed[];byId:Map<string,Placed>;pairs:Pair[];loops:Edge[];width:number;height:number;clusters:{group:Group;x:number;y:number;r:number;labelBelow:boolean}[]};

export const strongest=(statuses:readonly Status[]):Status=>STATUS_ORDER.find(s=>statuses.includes(s))||'retired';
export function degrees(registry:Registry){
  const d=new Map<string,number>();
  for(const e of registry.edges)if(e.from!==e.to){d.set(e.from,(d.get(e.from)||0)+1);d.set(e.to,(d.get(e.to)||0)+1);}
  return d;
}

/** Deterministic cluster layout: the largest group sits in the centre when it holds at least a third of
 * the nodes, the other groups on a ring around it; members sit on a small ring inside their group,
 * hubs and high-degree nodes first. Same registry, same positions. */
export function layout(registry:Registry,{width=1100,height=760,groups=GROUPS,allowed=STATUS_ORDER}:{width?:number;height?:number;groups?:readonly Group[];allowed?:readonly Status[]}={}):Graph{
  const deg=degrees(registry),cx=width/2,cy=height/2;
  const buckets=new Map<string,{group:Group;nodes:RegistryNode[]}>();
  for(const g of [...groups,OTHER_GROUP])buckets.set(g.id,{group:g,nodes:[]});
  for(const n of registry.nodes)buckets.get(groupOf(n.id,groups).id)!.nodes.push(n);
  const used=[...buckets.values()].filter(b=>b.nodes.length);
  const innerOf=(count:number)=>count<=1?0:20+11*count,radiusOf=(count:number)=>innerOf(count)+30;
  const largest=[...used].sort((a,b)=>b.nodes.length-a.nodes.length)[0];
  const central=largest&&used.length>1&&largest.nodes.length*3>=registry.nodes.length?largest:null;
  const ring=used.filter(b=>b!==central);
  const ringRadius=central?radiusOf(central.nodes.length)+Math.max(...ring.map(b=>radiusOf(b.nodes.length)))+40:Math.min(width,height)*0.31;
  const nodes:Placed[]=[],clusters:Graph['clusters']=[];
  const place=(b:{group:Group;nodes:RegistryNode[]},gx:number,gy:number,start:number,labelBelow:boolean)=>{
    const members=[...b.nodes].sort((p,q)=>Number(q.hub)-Number(p.hub)||(deg.get(q.id)||0)-(deg.get(p.id)||0)||p.id.localeCompare(q.id));
    const inner=innerOf(members.length);
    clusters.push({group:b.group,x:gx,y:gy,r:inner+30,labelBelow});
    members.forEach((n,j)=>{
      const t=start+j*2*Math.PI/members.length;
      const x=members.length<=1?gx:gx+Math.cos(t)*inner,y=members.length<=1?gy:gy+Math.sin(t)*inner;
      const degree=deg.get(n.id)||0;
      nodes.push({...n,x:Math.round(x*10)/10,y:Math.round(y*10)/10,r:Math.round((7+Math.sqrt(degree)*2.6)*10)/10,group:b.group,degree,angle:members.length<=1?null:t});
    });
  };
  if(central)place(central,cx,cy,-Math.PI/2,ring.length%2===1);
  ring.forEach((b,i)=>{
    const a=-Math.PI/2+i*2*Math.PI/ring.length;
    place(b,cx+Math.cos(a)*ringRadius*1.4,cy+Math.sin(a)*ringRadius,a+Math.PI,Math.sin(a)>0.2);
  });
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const pairMap=new Map<string,Pair>(),loops:Edge[]=[];
  for(const e of registry.edges){
    if(!allowed.includes(e.status))continue;
    if(e.from===e.to){loops.push(e);continue;}
    const id=e.from+'>'+e.to;let p=pairMap.get(id);
    if(!p){p={id,from:e.from,to:e.to,edges:[],status:e.status};pairMap.set(id,p);}
    p.edges.push(e);p.status=strongest(p.edges.map(x=>x.status));
  }
  return {nodes,byId,pairs:[...pairMap.values()],loops,width,height,clusters};
}

/** Label placement pointing away from the cluster centre, so neighbouring labels do not collide. */
export function labelSpot(n:Placed):{x:number;y:number;anchor:'start'|'middle'|'end'}{
  if(n.angle===null)return {x:0,y:n.r+13,anchor:'middle'};
  const c=Math.cos(n.angle),s=Math.sin(n.angle),anchor=c>0.3?'start':c<-0.3?'end':'middle';
  if(s>0.5)return {x:anchor==='middle'?0:-Math.sign(c)*n.r*0.6,y:n.r+13,anchor};
  if(s<-0.5)return {x:anchor==='middle'?0:-Math.sign(c)*n.r*0.6,y:-n.r-6,anchor};
  return {x:Math.sign(c)*(n.r+5),y:4,anchor};
}

/** Quadratic curve from a to b, bent to the right of the direction so a<->b pairs do not overlap. */
export function curve(a:Placed,b:Placed,bend=0.18){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  const sx=a.x+ux*a.r,sy=a.y+uy*a.r,ex=b.x-ux*(b.r+4),ey=b.y-uy*(b.r+4);
  const mx=(sx+ex)/2-uy*len*bend,my=(sy+ey)/2+ux*len*bend;
  const f=(v:number)=>Math.round(v*10)/10;
  return `M${f(sx)},${f(sy)} Q${f(mx)},${f(my)} ${f(ex)},${f(ey)}`;
}

export function neighbours(registry:Registry,id:string){
  const out=new Set<string>();
  for(const e of registry.edges){if(e.from===id&&e.to!==id)out.add(e.to);if(e.to===id&&e.from!==id)out.add(e.from);}
  return out;
}
/** Contracts a node provides (owner) and consumes, from the edge list. */
export function contractsOf(registry:Registry,id:string){
  const byId=new Map(registry.contracts.map(c=>[c.id,c]));
  const provides=registry.contracts.filter(c=>c.owner===id);
  const consumes=new Map<string,{contract:string;name:string;from:string;status:Status}>();
  for(const e of registry.edges)if(e.to===id&&e.from!==id&&!consumes.has(e.contract+'|'+e.from))consumes.set(e.contract+'|'+e.from,{contract:e.contract,name:byId.get(e.contract)?.name||e.contract,from:e.from,status:e.status});
  return {provides,consumes:[...consumes.values()].sort((a,b)=>STATUS_ORDER.indexOf(a.status)-STATUS_ORDER.indexOf(b.status)||a.contract.localeCompare(b.contract))};
}

export type Hit={node:string;label:string;via:'node'|'contract';detail:string};
/** Literal, case-insensitive search over node ids/names/stacks and contract ids/names. Deterministic order. */
export function search(registry:Registry,query:string,limit=8):Hit[]{
  const q=query.trim().toLowerCase();if(!q)return [];
  const hits:Hit[]=[],seen=new Set<string>();
  const nodeName=new Map(registry.nodes.map(n=>[n.id,n.name]));
  const rank=(s:string)=>s.toLowerCase().startsWith(q)?0:1;
  const nodes=registry.nodes.filter(n=>[n.id,n.name,n.stack,n.repo].some(s=>s.toLowerCase().includes(q))).sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name));
  for(const n of nodes){seen.add('n:'+n.id);hits.push({node:n.id,label:n.name,via:'node',detail:n.kind==='app'?n.stack:'repository'});}
  for(const c of registry.contracts)if((c.id+' '+c.name).toLowerCase().includes(q)&&!seen.has('c:'+c.id)){seen.add('c:'+c.id);hits.push({node:c.owner,label:c.id,via:'contract',detail:'owned by '+(nodeName.get(c.owner)||c.owner)});}
  return hits.slice(0,limit);
}

/** Viewport that frames a node and its neighbours (padding in user units), clamped to the canvas aspect. */
export function focusBox(graph:Graph,ids:readonly string[],pad=70){
  const pts=ids.map(id=>graph.byId.get(id)).filter((n):n is Placed=>!!n);
  if(!pts.length)return {x:0,y:0,w:graph.width,h:graph.height};
  let x0=Math.min(...pts.map(p=>p.x-p.r))-pad,x1=Math.max(...pts.map(p=>p.x+p.r))+pad,y0=Math.min(...pts.map(p=>p.y-p.r))-pad,y1=Math.max(...pts.map(p=>p.y+p.r))+pad;
  const aspect=graph.width/graph.height;let w=x1-x0,h=y1-y0;
  if(w/h<aspect){const nw=h*aspect;x0-=(nw-w)/2;w=nw;}else{const nh=w/aspect;y0-=(nh-h)/2;h=nh;}
  if(w>graph.width*0.85)return {x:0,y:0,w:graph.width,h:graph.height};
  const r=(v:number)=>Math.round(v*10)/10;
  return {x:r(x0),y:r(y0),w:r(w),h:r(h)};
}

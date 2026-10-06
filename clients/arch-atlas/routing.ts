import type {ArchSpec,ArchEdge} from './spec.ts';
import {type Grid,nodePosition,layerY,WORLD,type Vec3} from './layout.ts';

/**
 * Bundled orthogonal routing shared by the 3D atlas and the isometric diagram.
 * Pipes leave a node, run in the gap next to the target layer (one trunk per layer gap, one lane per
 * pipe) and enter the target; pipes from one source share its riser. Leg order (x first or depth first)
 * is chosen greedily to cross the pipes already placed as little as possible. Pure and deterministic.
 */
export type P2=[number,number];
type Seg=[P2,P2];
const EPS=1e-6;
function segments(path:P2[]):Seg[]{return path.slice(1).map((b,i)=>[path[i],b] as Seg).filter(([a,b])=>Math.hypot(b[0]-a[0],b[1]-a[1])>EPS);}
/** Proper crossing of two segments (touching ends and collinear overlaps are bundling, not crossings). */
export function segmentsCross([a,b]:Seg,[c,d]:Seg):boolean{
  const o=(p:P2,q:P2,r:P2)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const d1=o(c,d,a),d2=o(c,d,b),d3=o(a,b,c),d4=o(a,b,d);
  return (d1>EPS&&d2<-EPS||d1<-EPS&&d2>EPS)&&(d3>EPS&&d4<-EPS||d3<-EPS&&d4>EPS);
}
/** Number of crossings between different paths, in screen (or front-view) space. */
export function countCrossings(paths:P2[][]):number{
  const segs=paths.map(segments);let n=0;
  for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++)for(const s of segs[i])for(const t of segs[j])if(segmentsCross(s,t))n++;
  return n;
}
const crossingsWith=(path:P2[],placed:P2[][])=>{const own=segments(path);let n=0;for(const other of placed)for(const t of segments(other))for(const s of own)if(segmentsCross(s,t))n++;return n;};
const dedupe=<T extends number[]>(p:T[]):T[]=>p.filter((q,i)=>i===0||q.some((v,k)=>Math.abs(v-p[i-1][k])>EPS));

/* ---------- 3D: pipes run in a service plane behind the icons ---------- */
const BACK=-1.75,STUB=-1.05,SPACING=.2;
/** Front-view projection used to count crossings (x right, y up). */
export const front=(p:Vec3):P2=>[p[0],p[1]];
type Trunk={kind:'gap';k:number}|{kind:'base'};
/**
 * All 3D pipe routes, bundled in a service plane behind the icons (pure, deterministic).
 * Every pipe has the same shape in both directions: up the lower node's column, along one trunk in a layer
 * gap, up the upper node's column. Pipes through one column share it (a bundle), and each layer gap is a
 * channel where every trunk gets its own lane, ordered so that a trunk passes above the columns that end
 * under it and below the columns that start over it (channel routing). The gap of each pipe is chosen by a
 * few deterministic local-search sweeps minimising the total number of crossings, then the total length.
 * Lake pipes rise straight out of the water behind the node they feed.
 */
export function routes3d(spec:ArchSpec,g:Grid):Map<string,Vec3[]>{
  const slot=(id:string)=>g.slots.get(id)!,isLake=(id:string)=>slot(id).node.kind==='lake';
  const layer=(id:string)=>slot(id).layer,x=(id:string)=>nodePosition(g,id)[0];
  const base=(id:string)=>layerY(layer(id))+.32,top=(id:string)=>layerY(layer(id))+WORLD.iconHeight-.25;
  const pipes=spec.edges.filter(e=>!isLake(e.from)&&!isLake(e.to));
  const ends=(e:ArchEdge)=>layer(e.from)<=layer(e.to)?{lo:e.from,hi:e.to,up:true}:{lo:e.to,hi:e.from,up:false};
  const candidates=(e:ArchEdge):Trunk[]=>{
    const {lo,hi}=ends(e),a=layer(lo),b=layer(hi);
    if(a===b)return [{kind:'base'},{kind:'gap',k:a},...(a>0?[{kind:'gap' as const,k:a-1}]:[])];
    return [...Array(b-a)].map((_,i)=>({kind:'gap' as const,k:a+i}));
  };
  const keyOf=(e:ArchEdge,t:Trunk)=>t.kind==='base'?'base:'+layer(e.from):'gap:'+t.k;
  /** Which of the pipe's two columns reach the trunk from below ('lo') or leave it upwards ('hi'). */
  const columns=(e:ArchEdge,t:Trunk):{x:number;side:'lo'|'hi'}[]=>{
    const {lo,hi}=ends(e);
    if(t.kind==='base'||layer(lo)===layer(hi)&&t.k===layer(lo))return [{x:x(lo),side:'lo'},{x:x(hi),side:'lo'}];
    if(layer(lo)===layer(hi))return [{x:x(lo),side:'hi'},{x:x(hi),side:'hi'}];
    return [{x:x(lo),side:'lo'},{x:x(hi),side:'hi'}];
  };
  const lanesFor=(choice:Map<string,Trunk>)=>{
    const byKey=new Map<string,ArchEdge[]>();
    for(const e of pipes){const k=keyOf(e,choice.get(e.id)!);byKey.set(k,[...(byKey.get(k)??[]),e]);}
    const lanes=new Map<string,number>();
    for(const list of byKey.values()){
      const span=(e:ArchEdge)=>{const c=columns(e,choice.get(e.id)!);return [Math.min(c[0].x,c[1].x),Math.max(c[0].x,c[1].x)];};
      const inside=(v:number,[a,b]:number[])=>v>a+1e-6&&v<b-1e-6;
      // Bottom-up: place next the pipe whose placement at the bottom breaks the fewest preferences.
      const left=list.slice().sort((p,q)=>p.id.localeCompare(q.id));let lane=0;
      while(left.length){
        const cost=(e:ArchEdge)=>left.filter(o=>o!==e).reduce((n,o)=>n
          +columns(o,choice.get(o.id)!).filter(c=>c.side==='lo'&&inside(c.x,span(e))).length
          +columns(e,choice.get(e.id)!).filter(c=>c.side==='hi'&&inside(c.x,span(o))).length,0);
        const best=left.reduce((p,q)=>cost(q)<cost(p)?q:p);
        lanes.set(best.id,lane++);left.splice(left.indexOf(best),1);
      }
    }
    return lanes;
  };
  const build=(e:ArchEdge,t:Trunk,lane:number):Vec3[]=>{
    const {lo,hi,up}=ends(e),z=BACK-lane*.05,same=layer(lo)===layer(hi);
    // The lower node is left from the top of its back, the upper node entered at the bottom of its back.
    const y0=same?base(lo):top(lo),y=t.kind==='base'?base(lo)+.25+lane*SPACING*.6:layerY(t.k)+WORLD.iconHeight+.45+lane*SPACING;
    const path=dedupe<Vec3>([[x(lo),y0,STUB],[x(lo),y0,z],[x(lo),y,z],[x(hi),y,z],[x(hi),base(hi),z],[x(hi),base(hi),STUB]]);
    return up?path:path.slice().reverse();
  };
  const routesFor=(choice:Map<string,Trunk>)=>{const lanes=lanesFor(choice);return new Map(pipes.map(e=>[e.id,build(e,choice.get(e.id)!,lanes.get(e.id)!)]));};
  const score=(choice:Map<string,Trunk>)=>{
    const r=[...routesFor(choice).values()];
    return countCrossings(r.map(p=>p.map(front)))*1e4+r.reduce((s,p)=>s+p.slice(1).reduce((t,q,i)=>t+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0),0);
  };
  // Start from the lowest gap (the N1 choice), then sweep: each pipe takes its best trunk given the others.
  const choice=new Map<string,Trunk>(pipes.map(e=>[e.id,candidates(e)[0]]));
  let current=score(choice);
  for(let sweep=0;sweep<4;sweep++){
    let improved=false;
    for(const e of pipes)for(const t of candidates(e)){
      const prev=choice.get(e.id)!;if(JSON.stringify(prev)===JSON.stringify(t))continue;
      choice.set(e.id,t);const s=score(choice);
      if(s<current-1e-9){current=s;improved=true;}else choice.set(e.id,prev);
    }
    if(!improved)break;
  }
  const out=routesFor(choice);
  for(const e of spec.edges){
    if(!isLake(e.from)&&!isLake(e.to))continue;
    const n=isLake(e.from)?e.to:e.from,px=x(n)+(isLake(e.from)?-.28:.28);
    const path:Vec3[]=[[px,.06,BACK+.2],[px,base(n),BACK+.2],[x(n),base(n),BACK+.2],[x(n),base(n),STUB]];
    out.set(e.id,isLake(e.from)?path:path.slice().reverse());
  }
  return new Map(spec.edges.map(e=>[e.id,out.get(e.id)!]));
}

/* ---------- isometric diagram: world x = column, y = domain row, z = layer height ---------- */
type Attach='top'|'base'|'surface'|'side';
export type IsoRoute={via:Vec3[];attach:{from:Attach;to:Attach}};
export type IsoFrame={position:(id:string)=>Vec3;layer:(id:string)=>number;rise:number;height:number;depth:number;column:number;lakeTop:number;project:(p:Vec3)=>P2};
type Choice={plane:'source'|'target';side:1|-1};
type Run={key:string;x0:number;x1:number};
/**
 * Isometric routes follow "streets": every domain row has a street in front of it on each plane, and
 * columns have side streets between them. A pipe leaves its node from the front, runs along a street
 * (one lane per pipe), changes row through a side street (on the source or the target plane), climbs or
 * drops in front of the target and enters it from the front, so every arrowhead stays visible.
 * Each edge takes the candidate with the fewest crossings with the pipes already placed, then the shortest.
 */
export function isoRoutes(spec:ArchSpec,f:IsoFrame):Map<string,IsoRoute>{
  const lake=(id:string)=>spec.nodes.find(n=>n.id===id)!.kind==='lake';
  const street=(row:number,lane:number)=>row+f.depth/2+.48+lane*.2;
  const same=(p:number,q:number)=>Math.abs(p-q)<1e-6;
  /** The route and the street runs it occupies (keys: plane height / row). */
  const plan=(e:ArchEdge,c:Choice,laneOf:(key:string)=>number):{route:IsoRoute;runs:Run[]}=>{
    const a=f.position(e.from),b=f.position(e.to),runs:Run[]=[];
    const run=(z:number,row:number,x0:number,x1:number)=>{const key=z+'/'+row;runs.push({key,x0:Math.min(x0,x1),x1:Math.max(x0,x1)});return street(row,laneOf(key));};
    if(lake(e.from)){const y=run(b[2],b[1],b[0],b[0]);return {route:{via:dedupe<Vec3>([[b[0],y,f.lakeTop],[b[0],y,b[2]]]),attach:{from:'surface',to:'side'}},runs};}
    if(lake(e.to)){const y=run(a[2],a[1],a[0],a[0]);return {route:{via:dedupe<Vec3>([[a[0],y,a[2]],[a[0],y,f.lakeTop]]),attach:{from:'side',to:'surface'}},runs};}
    const via:Vec3[]=[];
    if(same(a[1],b[1])){
      const y=run(a[2],a[1],a[0],b[0]);via.push([a[0],y,a[2]],[b[0],y,a[2]],[b[0],y,b[2]]);
    }else if(c.plane==='source'){
      const xm=a[0]+c.side*f.column/2,ys=run(a[2],a[1],a[0],xm),yt=run(a[2],b[1],xm,b[0]);
      via.push([a[0],ys,a[2]],[xm,ys,a[2]],[xm,yt,a[2]],[b[0],yt,a[2]],[b[0],yt,b[2]]);
    }else{
      const xm=b[0]+c.side*f.column/2,ys=run(a[2],a[1],a[0],xm),yt=run(b[2],b[1],xm,b[0]);
      via.push([a[0],ys,a[2]],[xm,ys,a[2]],[xm,ys,b[2]],[xm,yt,b[2]],[b[0],yt,b[2]]);
    }
    return {route:{via:dedupe<Vec3>(via),attach:{from:'side',to:'side'}},runs};
  };
  const screenPath=(e:ArchEdge,r:IsoRoute)=>{
    const a=f.position(e.from),b=f.position(e.to),first=r.via[0],last=r.via[r.via.length-1];
    const s:Vec3=lake(e.from)?first:[first[0],a[1]+f.depth/2,a[2]],t:Vec3=lake(e.to)?last:[last[0],b[1]+f.depth/2,b[2]];
    return [s,...r.via,t].map(f.project);
  };
  const length=(p:P2[])=>p.slice(1).reduce((sum,q,i)=>sum+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0);
  // Pass 1: choose a candidate per edge without lanes.
  const choices=new Map<string,Choice>(),placed:P2[][]=[];
  for(const e of spec.edges){
    const a=f.position(e.from),b=f.position(e.to),simple=lake(e.from)||lake(e.to)||same(a[1],b[1]);
    const candidates:Choice[]=simple?[{plane:'source',side:1}]:[{plane:'source',side:1},{plane:'source',side:-1},{plane:'target',side:1},{plane:'target',side:-1}];
    const scored=candidates.map(c=>{const p=screenPath(e,plan(e,c,()=>0).route);return {c,p,score:crossingsWith(p,placed)*1e5+length(p)};});
    const best=scored.reduce((x,y)=>y.score<x.score?y:x);
    choices.set(e.id,best.c);placed.push(best.p);
  }
  // Pass 2: one lane per run in each street (interval packing), then the final routes.
  const runs=new Map<string,{id:string;x0:number;x1:number}[]>();
  for(const e of spec.edges)for(const r of plan(e,choices.get(e.id)!,()=>0).runs)runs.set(r.key,[...(runs.get(r.key)??[]),{id:e.id,x0:r.x0,x1:r.x1}]);
  const lanes=new Map<string,number>();
  for(const [key,list] of runs){
    const ends:number[]=[];
    for(const r of list.slice().sort((p,q)=>p.x0-q.x0||p.x1-q.x1||p.id.localeCompare(q.id))){
      if(lanes.has(key+'#'+r.id))continue;
      let k=ends.findIndex(end=>end<r.x0-.25);if(k<0){k=ends.length;ends.push(r.x1);}else ends[k]=r.x1;lanes.set(key+'#'+r.id,k);
    }
  }
  return new Map(spec.edges.map(e=>[e.id,plan(e,choices.get(e.id)!,key=>lanes.get(key+'#'+e.id)??0).route]));
}

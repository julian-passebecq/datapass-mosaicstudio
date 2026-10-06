import type {ArchSpec,ArchEdge} from './spec.ts';
import {KIND_LABELS} from './spec.ts';
import {grid,flatCard,flatWidth,flatHeight,flatRowY,flatX,route2d,FLAT,type P2,type Grid} from './layout.ts';
import {glyph} from './glyphs.ts';
import {INK,MUTED,PAPER,LINE,LAYER_TINT,KIND_COLOR} from './palette.ts';
import type {MotionSpec} from '../../src/framework/motion/model.ts';
import {compileMotion} from '../../src/framework/motion/compile.ts';
import {motionSvg} from '../../src/framework/motion/export.ts';
import {project,drawing} from '../../src/framework/motion/geometry.ts';
import {KIND_GLYPH} from './isoGlyphs.ts';
import {isoRoutes,type IsoFrame} from './routing.ts';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const n=(v:number)=>(Math.round(v*10)/10).toString();
const pts=(p:P2[])=>p.map(q=>n(q[0])+','+n(q[1])).join(' ');
const FONT='font-family="Inter,Segoe UI,system-ui,sans-serif"';

/** Rounded orthogonal polyline path (r px corner radius), deterministic formatting. */
function rounded(p:P2[],r=10):string{
  if(p.length<3)return 'M'+pts(p).replace(' ',' L');
  let d='M'+n(p[0][0])+','+n(p[0][1]);
  for(let i=1;i<p.length-1;i++){
    const [a,b,c]=[p[i-1],p[i],p[i+1]];
    const l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]),k=Math.min(r,l1/2,l2/2);
    const p1:P2=[b[0]+(a[0]-b[0])/l1*k,b[1]+(a[1]-b[1])/l1*k],p2:P2=[b[0]+(c[0]-b[0])/l2*k,b[1]+(c[1]-b[1])/l2*k];
    d+=' L'+n(p1[0])+','+n(p1[1])+' Q'+n(b[0])+','+n(b[1])+' '+n(p2[0])+','+n(p2[1]);
  }
  const z=p[p.length-1];return d+' L'+n(z[0])+','+n(z[1]);
}

export type FlatRoutes=Map<string,P2[]>;
/** Two deterministic passes: spread ports along card edges, then give each edge its own lane in its row gap. */
export function flatRoutes(spec:ArchSpec,g:Grid=grid(spec)):FlatRoutes{
  const occupied=(layer:number,x:number)=>spec.nodes.some(node=>{const s=g.slots.get(node.id)!;if(s.layer!==layer||node.kind==='lake')return false;const b=flatCard(spec,g,node.id);return x>b.x-10&&x<b.x+b.w+10;});
  const center=(id:string)=>{const b=flatCard(spec,g,id);return b.x+b.w/2;};
  const ports=new Map<string,{edge:string;other:number}[]>();
  const side=(e:ArchEdge,end:'from'|'to')=>{const la=g.slots.get(e.from)!.layer,lb=g.slots.get(e.to)!.layer;if(la===lb)return null;const up=lb>la;return (end==='from'?(up?'top':'bottom'):(up?'bottom':'top'));};
  for(const e of spec.edges)for(const end of ['from','to'] as const){const s=side(e,end);if(!s)continue;const key=e[end]+'/'+s;ports.set(key,[...(ports.get(key)??[]),{edge:e.id,other:center(end==='from'?e.to:e.from)}]);}
  const portX=(e:ArchEdge,end:'from'|'to')=>{
    const s=side(e,end),c=center(e[end]);if(!s)return c;
    const list=ports.get(e[end]+'/'+s)!.slice().sort((a,b)=>a.other-b.other||a.edge.localeCompare(b.edge)),i=list.findIndex(p=>p.edge===e.id);
    return c+(i-(list.length-1)/2)*18;
  };
  const opts=new Map(spec.edges.map(e=>[e.id,{ax:portX(e,'from'),bx:portX(e,'to'),lane:0}]));
  const first=new Map(spec.edges.map(e=>[e.id,route2d(spec,g,e,opts.get(e.id)!,occupied)]));
  const channels=new Map<number,{id:string;x0:number;x1:number}[]>();
  for(const [id,p] of first)for(let i=1;i<p.length;i++)if(p[i][1]===p[i-1][1]){const key=Math.round(p[i][1]);channels.set(key,[...(channels.get(key)??[]),{id,x0:Math.min(p[i][0],p[i-1][0]),x1:Math.max(p[i][0],p[i-1][0])}]);break;}
  for(const list of channels.values()){
    list.sort((a,b)=>a.x0-b.x0||a.x1-b.x1||a.id.localeCompare(b.id));
    const step=list.length>1?Math.min(8,50/(list.length-1)):0;
    list.forEach((item,k)=>{opts.get(item.id)!.lane=(k-(list.length-1)/2)*step;});
  }
  return new Map(spec.edges.map(e=>[e.id,route2d(spec,g,e,opts.get(e.id)!,occupied)]));
}
type Box={x:number;y:number;w:number;h:number};
const hit=(a:Box,b:Box)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
/** Label spot on a segment long enough to hold it, avoiding cards and labels already placed; null = title only. */
function placeLabel(p:P2[],w:number,taken:Box[]):P2|null{
  const segs=p.slice(1).map((b,i)=>({a:p[i],b,len:Math.hypot(b[0]-p[i][0],b[1]-p[i][1]),flat:b[1]===p[i][1]}))
    .filter(s=>s.len>(s.flat?w+18:40)).sort((x,y)=>Number(y.flat)-Number(x.flat)||y.len-x.len);
  for(const s of segs)for(const t of [.5,.3,.7,.18,.82]){
    const at:P2=[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t],box={x:at[0]-w/2-2,y:at[1]-9,w:w+4,h:17};
    if(!taken.some(b=>hit(b,box))){taken.push(box);return at;}
  }
  return null;
}

/** Flat layered architecture diagram: rows are layers (users on top, storage at the bottom), columns are groups. */
export function layeredSvg(spec:ArchSpec,selection='none'):string{
  const g=grid(spec),W=flatWidth(g),H=flatHeight(spec),routes=flatRoutes(spec,g);
  const out:string[]=[];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" width="${n(W)}" height="${n(H)}" role="img" data-atlas="${esc(spec.id)}" data-representation="layered">`);
  out.push(`<title>${esc(spec.title)} — layered architecture</title><desc>${esc(spec.subtitle)} ${esc(spec.note)}</desc>`);
  out.push(`<defs><marker id="arrow-data" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9z" fill="#4f7482"/></marker><marker id="arrow-control" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9z" fill="#a0835a"/></marker><pattern id="water" width="36" height="12" patternUnits="userSpaceOnUse"><path d="M0 8 Q9 3 18 8 T36 8" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2"/></pattern></defs>`);
  out.push(`<rect width="${n(W)}" height="${n(H)}" fill="${PAPER}"/>`);
  out.push(`<text x="${FLAT.margin}" y="46" ${FONT} font-size="24" font-weight="650" fill="${INK}">${esc(spec.title)}</text>`);
  out.push(`<text x="${FLAT.margin}" y="70" ${FONT} font-size="13" fill="${MUTED}">${esc(spec.subtitle)}</text>`);
  out.push(`<text x="${n(W-FLAT.margin)}" y="46" text-anchor="end" ${FONT} font-size="10.5" letter-spacing="1.4" fill="${MUTED}">${esc(spec.provenance.toUpperCase())} · ARCHITECTURE ATLAS</text>`);
  // Group columns.
  spec.groups.forEach((group,i)=>{
    const x0=flatX(g,g.groupStart[i])+6,x1=flatX(g,g.groupStart[i]+g.groupColumns[i])-6;
    out.push(`<g data-group="${esc(group.id)}"><rect x="${n(x0)}" y="${FLAT.header-22}" width="${n(x1-x0)}" height="${n(spec.layers.length*FLAT.row+22)}" rx="14" fill="#ffffff" fill-opacity="${i%2?'.28':'.5'}"/><text x="${n((x0+x1)/2)}" y="${FLAT.header-6}" text-anchor="middle" ${FONT} font-size="10.5" font-weight="600" letter-spacing="1.3" fill="${MUTED}">${esc(group.label.toUpperCase())}</text></g>`);
  });
  // Layer rows.
  spec.layers.forEach((layer,i)=>{
    const y=flatRowY(spec,i),tint=LAYER_TINT[layer.role];
    out.push(`<g data-layer="${esc(layer.id)}"><rect x="${FLAT.margin-12}" y="${n(y+6)}" width="${n(W-2*FLAT.margin+24)}" height="${FLAT.row-12}" rx="12" fill="${tint}" fill-opacity=".12"/><rect x="${FLAT.margin-12}" y="${n(y+6)}" width="4" height="${FLAT.row-12}" rx="2" fill="${tint}"/><text x="${FLAT.margin+4}" y="${n(y+FLAT.row/2-4)}" ${FONT} font-size="13.5" font-weight="650" fill="${INK}">${esc(layer.label)}</text><text x="${FLAT.margin+4}" y="${n(y+FLAT.row/2+13)}" ${FONT} font-size="9.5" letter-spacing="1.2" fill="${MUTED}">${esc(layer.role.toUpperCase())} · ${i===0?'BOTTOM':i===spec.layers.length-1?'TOP':'L'+i}</text></g>`);
  });
  // Edges below cards.
  const taken:Box[]=spec.nodes.filter(x=>x.kind!=='lake').map(x=>flatCard(spec,g,x.id));
  const edgeMarkup=(e:ArchEdge)=>{
    const p=routes.get(e.id)!,control=e.kind==='control',w=e.label.length*5.4+12,at=placeLabel(p,w,taken);
    const on=selection!=='none'&&(e.from===selection||e.to===selection),tip=`${nodeLabel(spec,e.from)} → ${nodeLabel(spec,e.to)}: ${e.label}`;
    return `<g data-edge="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-kind="${e.kind}"><title>${esc(tip)}</title><path d="${rounded(p)}" fill="none" stroke="${control?'#a0835a':'#4f7482'}" stroke-width="${on?2.6:1.5}" stroke-opacity="${selection==='none'||on?1:.35}"${control?' stroke-dasharray="5 4"':''} marker-end="url(#arrow-${e.kind})"/>${at?`<rect x="${n(at[0]-w/2)}" y="${n(at[1]-7.5)}" width="${n(w)}" height="15" rx="7.5" fill="${PAPER}"/><text x="${n(at[0])}" y="${n(at[1]+3.4)}" text-anchor="middle" ${FONT} font-size="9.5" fill="${control?'#8a6f4a':'#46636e'}">${esc(e.label)}</text>`:''}</g>`;
  };
  out.push('<g data-edges="">'+spec.edges.map(edgeMarkup).join('')+'</g>');
  // Nodes.
  for(const node of spec.nodes){
    const b=flatCard(spec,g,node.id),color=KIND_COLOR[node.kind],sel=node.id===selection;
    if(node.kind==='lake'){
      out.push(`<g data-node="${esc(node.id)}" data-kind="lake"><title>${esc(node.label)}: ${esc(node.purpose)}</title><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(b.h/2)}" fill="${color}" stroke="${sel?INK:'#6a9aa6'}" stroke-width="${sel?2.4:1}"/><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(b.h/2)}" fill="url(#water)"/><g transform="translate(${n(b.x+24)},${n(b.y+b.h/2-16)})" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${glyph('lake','none')}</g><text x="${n(b.x+66)}" y="${n(b.y+b.h/2-2)}" ${FONT} font-size="15" font-weight="650" fill="#ffffff">${esc(node.label)}</text><text x="${n(b.x+66)}" y="${n(b.y+b.h/2+15)}" ${FONT} font-size="10.5" fill="#f2f8f9">${esc(node.purpose.split('. ')[0].slice(0,120))}</text></g>`);
      continue;
    }
    out.push(`<g data-node="${esc(node.id)}" data-kind="${node.kind}"><title>${esc(node.label)} (${esc(KIND_LABELS[node.kind])}): ${esc(node.purpose)}</title><rect x="${n(b.x)}" y="${n(b.y+3)}" width="${b.w}" height="${b.h}" rx="11" fill="#1d2b33" fill-opacity=".06"/><rect x="${n(b.x)}" y="${n(b.y)}" width="${b.w}" height="${b.h}" rx="11" fill="#ffffff" stroke="${sel?INK:LINE}" stroke-width="${sel?2.4:1}"/><rect x="${n(b.x+10)}" y="${n(b.y+14)}" width="44" height="44" rx="10" fill="${color}" fill-opacity=".2"/><g transform="translate(${n(b.x+16)},${n(b.y+20)})" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyph(node.kind,color)}</g>${wrap(node.label,13).map((line,i,all)=>`<text x="${n(b.x+64)}" y="${n(b.y+(all.length>1?30:36)+i*15)}" ${FONT} font-size="12.5" font-weight="620" fill="${INK}">${esc(line)}</text>`).join('')}<text x="${n(b.x+64)}" y="${n(b.y+b.h-14)}" ${FONT} font-size="9.5" letter-spacing=".6" fill="${MUTED}">${esc(KIND_LABELS[node.kind].toUpperCase())}</text></g>`);
  }
  // Legend and note.
  const fy=H-FLAT.footer+26;
  out.push(`<g data-legend=""><path d="M${FLAT.margin} ${fy} h36" stroke="#4f7482" stroke-width="1.6" marker-end="url(#arrow-data)"/><text x="${FLAT.margin+46}" y="${fy+4}" ${FONT} font-size="10.5" fill="${MUTED}">data flow</text><path d="M${FLAT.margin+120} ${fy} h36" stroke="#a0835a" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrow-control)"/><text x="${FLAT.margin+166}" y="${fy+4}" ${FONT} font-size="10.5" fill="${MUTED}">control / trigger</text>${noteLines(spec.note,120).map((line,i,all)=>`<text x="${n(W-FLAT.margin)}" y="${fy+4+(i-(all.length-1))*13}" text-anchor="end" ${FONT} font-size="10" fill="${MUTED}">${esc(line)}</text>`).join('')}</g>`);
  out.push('</svg>');
  return out.join('\n')+'\n';
}
const nodeLabel=(spec:ArchSpec,id:string)=>spec.nodes.find(x=>x.id===id)?.label??id;
function noteLines(note:string,max:number):string[]{
  const lines=[''];for(const w of note.split(' ')){const i=lines.length-1;if(lines[i]&&(lines[i]+' '+w).length>max)lines.push(w);else lines[i]+=(lines[i]?' ':'')+w;}
  return lines.slice(0,3);
}
function wrap(label:string,max:number):string[]{
  const words=label.split(' '),lines=[''];
  for(const w of words){const i=lines.length-1;if(lines[i]&&(lines[i]+' '+w).length>max&&lines.length<2)lines.push(w);else lines[i]+=(lines[i]?' ':'')+w;}
  return lines;
}

/* ---------- isometric: rendered by the framework Motion v2 SVG exporter ---------- */
/** World units of the isometric scene: x = column inside a domain, y = domain row, z = layer height. */
export const ISO={column:2.7,group:3.5,rise:3.1,size:[1.45,1.45,1.0] as [number,number,number],lakeDepth:.1};
type V3=[number,number,number];
function isoFrame(spec:ArchSpec,g:Grid):IsoFrame{
  const position=(id:string):V3=>{
    const s=g.slots.get(id)!;
    if(s.node.kind==='lake')return [0,(spec.groups.length-1)*ISO.group/2,0];
    return [(s.column-g.groupStart[s.group]-g.groupColumns[s.group]/2)*ISO.column,(spec.groups.length-1-s.group)*ISO.group,s.layer*ISO.rise];
  };
  return {position,layer:id=>g.slots.get(id)!.layer,rise:ISO.rise,height:ISO.size[2],depth:ISO.size[1],column:ISO.column,lakeTop:ISO.lakeDepth,project:p=>project(p,'isometric')};
}
/**
 * The atlas spec as a one-step Motion v2 scene: layers become framework layer planes, each (layer, domain)
 * cell becomes an outlined domain, every node is a station drawn with its kind glyph, the lake is one wide
 * flat station, and edges carry bundled orthogonal routes (data solid, control dashed).
 */
export function toMotion(spec:ArchSpec):MotionSpec{
  const g=grid(spec),f=isoFrame(spec,g),routes=isoRoutes(spec,f);
  const nodes=spec.nodes.filter(node=>node.kind!=='lake'),xs=nodes.map(node=>f.position(node.id)[0]);
  const lakeSize:V3=[Math.max(...xs)-Math.min(...xs)+ISO.size[0]+1.2,(spec.groups.length-1)*ISO.group+ISO.size[1]+2.4,ISO.lakeDepth];
  const station=(node:ArchSpec['nodes'][number])=>({id:node.id,kind:'station' as const,label:node.label,description:node.purpose,color:KIND_COLOR[node.kind],evidence:[],
    position:node.kind==='lake'?[(Math.max(...xs)+Math.min(...xs))/2,f.position(node.id)[1],0] as V3:f.position(node.id),size:node.kind==='lake'?lakeSize:ISO.size,glyph:KIND_GLYPH[node.kind]});
  const lakeLayer=spec.nodes.find(node=>node.kind==='lake')?.layer;
  const cells=spec.layers.flatMap(layer=>spec.groups.map(group=>({layer,group,members:nodes.filter(node=>node.layer===layer.id&&node.group===group.id).map(node=>node.id)}))).filter(c=>c.members.length);
  return {
    format:'datapass.motion',version:2,title:spec.title,description:spec.subtitle,provenance:spec.provenance==='documented'?'authored':'synthetic',note:spec.note,sources:[],
    scene:{stationSize:64,positionRange:80,labels:'attached',linkCasing:true,linkCorner:7,header:true,background:PAPER,legend:{solid:'data flow',dashed:'control / trigger'}},
    layers:spec.layers.map((layer,i)=>({id:layer.id,label:layer.label,z:i*ISO.rise,color:layer.id===lakeLayer?KIND_COLOR.lake:LAYER_TINT[layer.role],texture:layer.id===lakeLayer?'water' as const:'plain' as const})),
    groups:cells.map(c=>({id:c.layer.id+'--'+c.group.id,...(c===cells.filter(x=>x.group===c.group).at(-1)?{label:c.group.label}:{}),layer:c.layer.id,members:c.members,color:LAYER_TINT[c.layer.role]})),
    entities:spec.nodes.map(station),
    links:spec.edges.map(e=>{const r=routes.get(e.id)!;return {id:e.id,from:e.from,to:e.to,label:e.label,via:r.via,attach:r.attach,style:e.kind==='control'?'dashed' as const:'solid' as const};}),
    steps:[{id:'overview',title:'Overview',caption:spec.subtitle,focus:'none',holdMs:2000,transitionMs:0,commands:[],activeLinks:spec.edges.map(e=>e.id),evidence:[],annotations:[]}]
  };
}
/** Exactly the framework export; the client only tags the root element with its atlas ids. */
export function isometricSvg(spec:ArchSpec,selection='none'):string{
  const svg=motionSvg(compileMotion(toMotion(spec)),0,'isometric',selection);
  return svg.replace('<svg ',`<svg data-atlas="${esc(spec.id)}" data-representation="isometric" data-renderer="framework-motion-v2" `)+'\n';
}
/** Screen paths of the isometric links (for crossing metrics and tests). */
export function isoScreenPaths(spec:ArchSpec):P2[][]{
  const c=compileMotion(toMotion(spec));
  return drawing(c,c.frames[0],'isometric').links.map(l=>l.path as P2[]);
}

import type {ConceptSpec,ConceptFlow} from './schema.ts';
import {KINDS,INK,MUTED,PAPER,LINE,FLOW_STYLE,STATUS_TEXT,layerTint,layerRoleText,statusColor} from './kinds.ts';
import {grid,flatCard,flatHeight,flatRowY,flatX,flatHead,flatFooter,flatFoot,flatMainRight,route2d,FLAT,type P2,type Grid} from './layout.ts';
import {flatGlyph} from './flat-glyphs.ts';
import {fitText,textWidth,wrapText} from './text.ts';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const n=(v:number)=>(Math.round(v*10)/10).toString();
const pts=(p:P2[])=>p.map(q=>n(q[0])+','+n(q[1])).join(' ');
export const FLAT_FONT='Inter,Segoe UI,system-ui,sans-serif';
const FONT=`font-family="${FLAT_FONT}"`;
const SIDE_TINT='#7d68a8';

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
/** Two deterministic passes: spread ports along card edges, then give each flow its own lane in its row gap. */
export function flatRoutes(spec:ConceptSpec,g:Grid=grid(spec)):FlatRoutes{
  const occupied=(layer:number,x:number)=>spec.nodes.some(node=>{const s=g.slots.get(node.id)!;if(s.layer!==layer||node.kind==='lake')return false;const b=flatCard(spec,g,node.id);return x>b.x-10&&x<b.x+b.w+10;});
  const center=(id:string)=>{const b=flatCard(spec,g,id);return b.x+b.w/2;};
  const ports=new Map<string,{flow:string;other:number}[]>();
  const side=(f:ConceptFlow,end:'from'|'to')=>{const la=g.slots.get(f.from)!.layer,lb=g.slots.get(f.to)!.layer;if(la===lb)return null;const up=lb>la;return (end==='from'?(up?'top':'bottom'):(up?'bottom':'top'));};
  for(const f of spec.flows)for(const end of ['from','to'] as const){const s=side(f,end);if(!s)continue;const key=f[end]+'/'+s;ports.set(key,[...(ports.get(key)??[]),{flow:f.id,other:center(end==='from'?f.to:f.from)}]);}
  const portX=(f:ConceptFlow,end:'from'|'to')=>{
    const s=side(f,end),c=center(f[end]);if(!s)return c;
    const list=ports.get(f[end]+'/'+s)!.slice().sort((a,b)=>a.other-b.other||a.flow.localeCompare(b.flow)),i=list.findIndex(p=>p.flow===f.id);
    return c+(i-(list.length-1)/2)*18;
  };
  const opts=new Map(spec.flows.map(f=>[f.id,{ax:portX(f,'from'),bx:portX(f,'to'),lane:0}]));
  const first=new Map(spec.flows.map(f=>[f.id,route2d(spec,g,f,opts.get(f.id)!,occupied)]));
  const channels=new Map<number,{id:string;x0:number;x1:number}[]>();
  for(const [id,p] of first)for(let i=1;i<p.length;i++)if(p[i][1]===p[i-1][1]){const key=Math.round(p[i][1]);channels.set(key,[...(channels.get(key)??[]),{id,x0:Math.min(p[i][0],p[i-1][0]),x1:Math.max(p[i][0],p[i-1][0])}]);break;}
  for(const list of channels.values()){
    list.sort((a,b)=>a.x0-b.x0||a.x1-b.x1||a.id.localeCompare(b.id));
    const step=list.length>1?Math.min(8,50/(list.length-1)):0;
    list.forEach((item,k)=>{opts.get(item.id)!.lane=(k-(list.length-1)/2)*step;});
  }
  return new Map(spec.flows.map(f=>[f.id,route2d(spec,g,f,opts.get(f.id)!,occupied)]));
}
type Box={x:number;y:number;w:number;h:number};
const hit=(a:Box,b:Box)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
/** Label spot on a segment long enough to hold it, avoiding cards and labels already placed; null = tooltip only. */
function placeLabel(p:P2[],w:number,taken:Box[]):P2|null{
  const segs=p.slice(1).map((b,i)=>({a:p[i],b,len:Math.hypot(b[0]-p[i][0],b[1]-p[i][1]),flat:b[1]===p[i][1]}))
    .filter(s=>s.len>(s.flat?w+18:40)).sort((x,y)=>Number(y.flat)-Number(x.flat)||y.len-x.len);
  for(const s of segs)for(const t of [.5,.3,.7,.18,.82]){
    const at:P2=[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t],box={x:at[0]-w/2-2,y:at[1]-9,w:w+4,h:17};
    if(!taken.some(b=>hit(b,box))){taken.push(box);return at;}
  }
  return null;
}
const marker=(kind:ConceptFlow['kind'])=>`<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9z" fill="${FLOW_STYLE[kind].stroke}"/></marker>`;
/** Card text: label shrinks then wraps (≤ 3 lines) inside the card; the kind line shrinks to its width. */
export const CARD_TEXT={x:64,right:8,labelTop:20,labelBottom:54};
export function cardText(label:string,kind:string){
  const width=FLAT.card.w-CARD_TEXT.x-CARD_TEXT.right;
  const name=fitText(label,width,12.5,10,3,{bold:true});
  const kindText=kind.toUpperCase();let ks=9.5;
  while(ks>7&&textWidth(kindText,ks,{letterSpacing:.6})>width)ks-=.5;
  return {name,kind:{text:kindText,size:ks}};
}

/**
 * Flat layer cake: rows are layers (people on top, stores at the bottom), columns are domains, side domains
 * are vertical bands at the right edge (identity, monitoring), the lake is the ground row. Flows are
 * orthogonal routes (data solid, control dashed, auth dotted). Annotations are numbered notes in the footer.
 */
export function layerCakeSvg(spec:ConceptSpec,selection='none'):string{
  const g=grid(spec),head=flatHead(spec),W=head.W,H=flatHeight(spec),routes=flatRoutes(spec,g),top=head.header;
  const mainRight=flatMainRight(spec,g),bodyH=spec.layers.length*FLAT.row;
  const out:string[]=[];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" width="${n(W)}" height="${n(H)}" role="img" data-concept="${esc(spec.id)}" data-representation="layered">`);
  out.push(`<title>${esc(spec.title)} — layered architecture</title><desc>${esc(spec.subtitle)} ${esc(spec.note)}</desc>`);
  out.push(`<defs>${(['data','control','auth'] as const).map(marker).join('')}<pattern id="water" width="36" height="12" patternUnits="userSpaceOnUse"><path d="M0 8 Q9 3 18 8 T36 8" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2"/></pattern></defs>`);
  out.push(`<rect width="${n(W)}" height="${n(H)}" fill="${PAPER}"/>`);
  out.push(`<text data-text="tag" x="${n(W-FLAT.margin)}" y="${head.tag.y}" text-anchor="end" ${FONT} font-size="10" letter-spacing="1.2" fill="${MUTED}">${esc(spec.provenance.toUpperCase())} · CONCEPT SPEC</text>`);
  head.title.lines.forEach((line,i)=>out.push(`<text data-text="title" x="${FLAT.margin}" y="${head.title.y+i*head.title.step}" ${FONT} font-size="${head.title.size}" font-weight="650" fill="${INK}">${esc(line)}</text>`));
  head.subtitle.lines.forEach((line,i)=>out.push(`<text data-text="subtitle" x="${FLAT.margin}" y="${head.subtitle.y+i*head.subtitle.step}" ${FONT} font-size="${head.subtitle.size}" fill="${MUTED}">${esc(line)}</text>`));
  // Domain columns; side domains are tinted vertical bands across every layer.
  const labelTop=head.domains.y-(head.domains.lines.some(l=>l.length>1)?12:0)-16;
  spec.domains.forEach((domain,i)=>{
    const x0=flatX(g,g.domainStart[i])+6,x1=flatX(g,g.domainStart[i]+g.domainColumns[i])-6,side=domain.placement==='side';
    const lines=head.domains.lines[i],y0=head.domains.y-(lines.length-1)*12;
    const label=lines.map((line,k)=>`<text data-text="domain" x="${n((x0+x1)/2)}" y="${n(y0+k*12)}" text-anchor="middle" ${FONT} font-size="${head.domains.size}" font-weight="600" letter-spacing="${head.domains.spacing}" fill="${side?SIDE_TINT:MUTED}">${esc(line)}</text>`).join('');
    const rect=side?`<rect x="${n(x0)}" y="${n(labelTop)}" width="${n(x1-x0)}" height="${n(top+bodyH-labelTop)}" rx="14" fill="${SIDE_TINT}" fill-opacity=".08" stroke="${SIDE_TINT}" stroke-opacity=".45" stroke-dasharray="6 5"/>`
      :`<rect x="${n(x0)}" y="${n(labelTop)}" width="${n(x1-x0)}" height="${n(top+bodyH-labelTop)}" rx="14" fill="#ffffff" fill-opacity="${i%2?'.28':'.5'}"/>`;
    out.push(`<g data-domain="${esc(domain.id)}" data-placement="${domain.placement}">${rect}${label}</g>`);
  });
  // Layer rows (stop before the side bands so a band reads as one vertical strip).
  const rowRight=spec.domains.some(d=>d.placement==='side')?mainRight+FLAT.domainGap/2-10:W-FLAT.margin+12;
  spec.layers.forEach((layer,i)=>{
    const y=flatRowY(spec,i),tint=layerTint(layer,i),gw=FLAT.gutter-FLAT.margin-14;
    const name=fitText(layer.label,gw,13.5,11,3,{bold:true}),step=Math.round(name.size*1.2);
    const roleText=(layerRoleText(layer).toUpperCase()+' · '+(i===0?'BOTTOM':i===spec.layers.length-1?'TOP':'L'+i));
    const blockH=name.lines.length*step+14,y0=y+FLAT.row/2-blockH/2+name.size*.8;
    out.push(`<g data-layer="${esc(layer.id)}"><rect x="${FLAT.margin-12}" y="${n(y+6)}" width="${n(rowRight-FLAT.margin+12)}" height="${FLAT.row-12}" rx="12" fill="${tint}" fill-opacity=".12"/><rect x="${FLAT.margin-12}" y="${n(y+6)}" width="4" height="${FLAT.row-12}" rx="2" fill="${tint}"/>${name.lines.map((line,k)=>`<text data-text="layer" x="${FLAT.margin+4}" y="${n(y0+k*step)}" ${FONT} font-size="${name.size}" font-weight="650" fill="${INK}">${esc(line)}</text>`).join('')}<text data-text="layer-role" x="${FLAT.margin+4}" y="${n(y0+(name.lines.length-1)*step+17)}" ${FONT} font-size="9.5" letter-spacing="1.2" fill="${MUTED}">${esc(roleText)}</text></g>`);
  });
  // Flows below cards.
  const taken:Box[]=spec.nodes.filter(x=>x.kind!=='lake').map(x=>flatCard(spec,g,x.id));
  const flowMarkup=(f:ConceptFlow)=>{
    const p=routes.get(f.id)!,st=FLOW_STYLE[f.kind],w=textWidth(f.label,9.5)+12,at=placeLabel(p,w,taken);
    const on=selection!=='none'&&(f.from===selection||f.to===selection),tip=`${nodeLabel(spec,f.from)} ${f.direction==='both'?'↔':'→'} ${nodeLabel(spec,f.to)}: ${f.label}`;
    return `<g data-flow="${esc(f.id)}" data-from="${esc(f.from)}" data-to="${esc(f.to)}" data-kind="${f.kind}"><title>${esc(tip)}</title><path d="${rounded(p)}" fill="none" stroke="${st.stroke}" stroke-width="${on?2.6:f.kind==='auth'?1.8:1.5}" stroke-opacity="${selection==='none'||on?1:.35}"${st.dash?` stroke-dasharray="${st.dash}" stroke-linecap="round"`:''}${f.direction==='both'?` marker-start="url(#arrow-${f.kind})"`:''} marker-end="url(#arrow-${f.kind})"/>${at?`<rect x="${n(at[0]-w/2)}" y="${n(at[1]-7.5)}" width="${n(w)}" height="15" rx="7.5" fill="${PAPER}"/><text data-text="flow" x="${n(at[0])}" y="${n(at[1]+3.4)}" text-anchor="middle" ${FONT} font-size="9.5" fill="${st.text}">${esc(f.label)}</text>`:''}</g>`;
  };
  out.push('<g data-flows="">'+spec.flows.map(flowMarkup).join('')+'</g>');
  // Nodes.
  const notes=new Map<string,number[]>();spec.annotations.forEach((a,i)=>{if(a.target)notes.set(a.target,[...(notes.get(a.target)??[]),i+1]);});
  for(const node of spec.nodes){
    const b=flatCard(spec,g,node.id),info=KINDS[node.kind],color=statusColor(info.color,node.status),sel=node.id===selection;
    const dash=node.status==='planned'||node.status==='external'?' stroke-dasharray="5 4"':'',fade=node.status==='deprecated'?' opacity=".6"':'';
    const badges=(notes.get(node.id)??[]).map((k,j)=>`<g data-note-badge="${k}"><circle cx="${n(b.x+b.w-10-j*20)}" cy="${n(b.y)}" r="8.5" fill="${INK}"/><text x="${n(b.x+b.w-10-j*20)}" y="${n(b.y+3.4)}" text-anchor="middle" ${FONT} font-size="9.5" font-weight="700" fill="#ffffff">${k}</text></g>`).join('');
    const status=STATUS_TEXT[node.status]?`<g data-status="${node.status}"><rect x="${n(b.x+12)}" y="${n(b.y-7)}" width="${n(textWidth(STATUS_TEXT[node.status],8,{letterSpacing:.8})+12)}" height="14" rx="7" fill="${PAPER}" stroke="${MUTED}" stroke-width=".8"/><text data-text="status" x="${n(b.x+18)}" y="${n(b.y+3)}" ${FONT} font-size="8" letter-spacing=".8" fill="${MUTED}">${STATUS_TEXT[node.status]}</text></g>`:'';
    if(node.kind==='lake'){
      const lw=b.w-66-24,name=fitText(node.label,lw,15,12,1,{bold:true}),sub=wrapText((node.description.split('. ')[0]||info.label),lw,10.5)[0]??'';
      out.push(`<g data-node="${esc(node.id)}" data-kind="lake"${fade}><title>${esc(node.label)}: ${esc(node.description)}</title><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(b.h/2)}" fill="${color}" stroke="${sel?INK:'#6a9aa6'}" stroke-width="${sel?2.4:1}"${dash}/><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(b.h/2)}" fill="url(#water)"/><g transform="translate(${n(b.x+24)},${n(b.y+b.h/2-16)})" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${flatGlyph('lake','none')}</g><text data-text="node" x="${n(b.x+66)}" y="${n(b.y+b.h/2-2)}" ${FONT} font-size="${name.size}" font-weight="650" fill="#ffffff">${esc(name.lines[0])}</text><text data-text="node-sub" x="${n(b.x+66)}" y="${n(b.y+b.h/2+15)}" ${FONT} font-size="10.5" fill="#f2f8f9">${esc(sub===(node.description.split('. ')[0]||info.label)?sub:sub.replace(/\s*\S*$/,'')+'…')}</text>${status}${badges}</g>`);
      continue;
    }
    const t=cardText(node.label,info.label),step=t.name.size+2.5,ly=b.y+CARD_TEXT.labelTop+(CARD_TEXT.labelBottom-CARD_TEXT.labelTop-(t.name.lines.length-1)*step)/2+t.name.size*.35;
    out.push(`<g data-node="${esc(node.id)}" data-kind="${node.kind}" data-status="${node.status}"${fade}><title>${esc(node.label)} (${esc(info.label)})${node.description?': '+esc(node.description):''}</title><rect x="${n(b.x)}" y="${n(b.y+3)}" width="${b.w}" height="${b.h}" rx="11" fill="#1d2b33" fill-opacity=".06"/><rect data-card="" x="${n(b.x)}" y="${n(b.y)}" width="${b.w}" height="${b.h}" rx="11" fill="#ffffff" stroke="${sel?INK:LINE}" stroke-width="${sel?2.4:1}"${dash}/><rect x="${n(b.x+10)}" y="${n(b.y+14)}" width="44" height="44" rx="10" fill="${color}" fill-opacity=".2"/><g transform="translate(${n(b.x+16)},${n(b.y+20)})" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${flatGlyph(info.flat,color)}</g>${t.name.lines.map((line,i)=>`<text data-text="node" x="${n(b.x+CARD_TEXT.x)}" y="${n(ly+i*step)}" ${FONT} font-size="${t.name.size}" font-weight="620" fill="${INK}">${esc(line)}</text>`).join('')}<text data-text="kind" x="${n(b.x+CARD_TEXT.x)}" y="${n(b.y+b.h-12)}" ${FONT} font-size="${t.kind.size}" letter-spacing=".6" fill="${MUTED}">${esc(t.kind.text)}</text>${status}${badges}</g>`);
  }
  // Legend, numbered notes and the provenance note.
  const fy=H-flatFooter(spec)+26,kinds=(['data','control','auth'] as const).filter(k=>k==='data'||spec.flows.some(f=>f.kind===k));
  let lx=FLAT.margin;const legend=kinds.map(k=>{const st=FLOW_STYLE[k],x=lx;lx+=46+textWidth(st.legend,10.5)+22;
    return `<path d="M${n(x)} ${fy} h36" stroke="${st.stroke}" stroke-width="1.6"${st.dash?` stroke-dasharray="${st.dash}" stroke-linecap="round"`:''} marker-end="url(#arrow-${k})"/><text data-text="legend" x="${n(x+46)}" y="${fy+4}" ${FONT} font-size="10.5" fill="${MUTED}">${esc(st.legend)}</text>`;}).join('');
  const foot=flatFoot(spec);let ny=fy+30;
  const noteMarkup=foot.note.map((line,i)=>`<text data-text="note" x="${FLAT.margin}" y="${n(ny+i*FLAT.noteLine)}" ${FONT} font-size="10" fill="${MUTED}">${esc(line)}</text>`).join('');
  ny+=foot.note.length*FLAT.noteLine+6;
  const annotations=spec.annotations.map((a,i)=>{const lines=foot.annotations[i],y=ny;ny+=lines.length*FLAT.noteLine+4;
    return `<g data-annotation="${esc(a.id)}"${a.target?` data-target="${esc(a.target)}"`:''}><circle cx="${FLAT.margin+7}" cy="${n(y-3.5)}" r="7" fill="${INK}"/><text x="${FLAT.margin+7}" y="${n(y)}" text-anchor="middle" ${FONT} font-size="8.5" font-weight="700" fill="#ffffff">${i+1}</text>${lines.map((line,k)=>`<text data-text="annotation" x="${FLAT.margin+20}" y="${n(y+k*FLAT.noteLine)}" ${FONT} font-size="10.5" fill="${INK}">${esc(line)}</text>`).join('')}</g>`;}).join('');
  out.push(`<g data-legend="">${legend}${noteMarkup}</g>${annotations}`);
  out.push('</svg>');
  return out.join('\n')+'\n';
}
const nodeLabel=(spec:ConceptSpec,id:string)=>spec.nodes.find(x=>x.id===id)?.label??id;

/** Isometric 2D: the layered Galaxy world as a one-step framework Motion v2 scene, exported by the framework
 * SVG exporter (static, deterministic, standalone: fit for docs). Same world, same ids as the 3D view.
 */
import {compileMotion,motionSvg,type MotionSpec} from '../../src/framework/motion/index.ts';
import {REGISTRY} from './registry.generated.ts';
import {GROUPS,OTHER_GROUP,STATUS_LABEL,type Registry,type StatusFilter} from './registry.ts';
import {lightTokens} from '../../src/framework/viz/tokens.ts';
import {COMMONS,KIND_LABEL,WORLD,buildWorld,type World} from './world.ts';
import {glyphName,registerGalaxyGlyphs} from './glyphs.ts';

/** Light palette for the exported document (the SVG is a standalone light page in both themes). */
export const ISO_PALETTE={paper:'#f7f5f0',commons:'#7fb0bb',repo:'#5f8f9b',groups:lightTokens.categorical};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function toMotion(world:World,registry:Registry=REGISTRY,filter:StatusFilter='all'):MotionSpec{
  registerGalaxyGlyphs();
  const colorOf=(plane:string)=>plane===COMMONS.id?ISO_PALETTE.repo:ISO_PALETTE.groups[Math.max(0,[...GROUPS,OTHER_GROUP].findIndex(g=>g.id===plane))%ISO_PALETTE.groups.length];
  const layers=[{id:COMMONS.id,label:'Commons',z:0,color:ISO_PALETTE.commons,texture:'water' as const,extent:world.commons.extent},
    ...[...world.planes].sort((a,b)=>a.z-b.z).map(p=>({id:'plane-'+p.id,label:p.label,z:p.z,color:colorOf(p.id),texture:'plain' as const,extent:p.extent}))];
  const updated=registry.source.updated.slice(0,10);
  return {
    format:'datapass.motion',version:2,title:'App Galaxy, layered',description:`Registry snapshot ${updated}. Project groups float at their own heights; shared repos and contracts sit on the commons below.`,
    provenance:'authored',note:`Computed layout from the ${registry.source.name} snapshot (${updated}), not live data. Solid pipes are live contracts, dashed ones are on a branch, planned or proposed${filter==='all'?'':' (filter: '+filter+')'}.`,sources:[],
    scene:{stationSize:8,positionRange:80,labels:'attached',linkCasing:true,linkCorner:5,header:true,background:ISO_PALETTE.paper,legend:{solid:'live contract',dashed:'not live yet'}},
    layers,
    groups:[...world.planes.map(p=>({id:'group-'+p.id,label:p.label,layer:'plane-'+p.id,members:p.members,color:colorOf(p.id)})),
      ...(world.commons.members.length?[{id:'group-commons',label:'Shared repos',layer:COMMONS.id,members:world.commons.members,color:ISO_PALETTE.repo}]:[])],
    entities:world.stations.map(s=>({id:s.id,kind:'station' as const,label:s.node.name.replace(/\s*\(.*\)\s*$/,''),description:`${KIND_LABEL[s.kind]}${s.node.stack?' · '+s.node.stack:''}`,color:colorOf(s.plane),evidence:[],position:s.position,size:WORLD.station,glyph:glyphName(s.kind)})),
    links:world.pipes.map(p=>({id:'pipe-'+p.id.replace(/[^a-zA-Z0-9_-]/g,'_'),from:p.from,to:p.to,label:(STATUS_LABEL[p.status]+': '+p.contracts.join(', ')).slice(0,100),via:p.route.slice(1,-1),attach:{from:'side' as const,to:'side' as const},style:p.status==='live'?'solid' as const:'dashed' as const})),
    steps:[{id:'overview',title:'Overview',caption:'App Galaxy, layered',focus:'none',holdMs:2000,transitionMs:0,commands:[],activeLinks:world.pipes.map(p=>'pipe-'+p.id.replace(/[^a-zA-Z0-9_-]/g,'_')),evidence:[],annotations:[]}],
  };
}
/** The framework export, tagged, with labels made readable at document size (see `readableLabels`). */
export function isometricSvg(filter:StatusFilter='all',selection='none',registry:Registry=REGISTRY):string{
  const world=buildWorld(registry,filter);
  const svg=motionSvg(compileMotion(toMotion(world,registry,filter)),0,'isometric',selection==='none'||world.byId.has(selection)?selection:'none');
  return readableLabels(svg).replace('<svg ',`<svg data-galaxy="${esc(registry.source.updated.slice(0,10))}" data-representation="isometric" data-renderer="framework-motion-v2" `)+'\n';
}

/** Readability targets: the label font scales with the viewBox so it renders at least `minPx` at `refWidth`. */
export const ISO_TEXT={refWidth:1440,minPx:11,bandPad:28};
const num=(v:number)=>v.toFixed(2);
const attr=(tag:string,name:string)=>tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const setAttr=(tag:string,name:string,value:string)=>new RegExp(`\\s${name}="[^"]*"`).test(tag)?tag.replace(new RegExp(`\\s${name}="[^"]*"`),` ${name}="${value}"`):tag.replace(/^<text/,`<text ${name}="${value}"`);
const textWidth=(s:string,size:number,bold=false)=>s.length*size*(bold?.6:.55);
/**
 * Client post-processing of the exported string (deterministic, no DOM): station and domain labels are scaled
 * with the viewBox and nudged apart when they collide; plane titles move to their own band on the left with a
 * dashed leader to their plane; the header is scaled to match; the viewBox grows to contain every label.
 */
export function readableLabels(input:string):string{
  let out=input,size=0;
  // The frame grows with the labels, so the size is iterated to a fixed point on the final viewBox width.
  for(let i=0;i<6;i++){out=layoutLabels(input,size);const w=Number(out.match(/viewBox="([^"]+)"/)![1].split(/\s+/)[2]),need=ISO_TEXT.minPx*w/ISO_TEXT.refWidth;if(need<=Math.max(12,size)+1e-6)break;size=need*1.01;}
  return out;
}
function layoutLabels(svg:string,minSize:number):string{
  const vb=svg.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);let [x0,y0,w,h]=vb;
  const fs=Math.max(12,minSize,ISO_TEXT.minPx*w/ISO_TEXT.refWidth),ratio=fs/12;
  const boxes:{l:number;t:number;r:number;b:number}[]=[];
  // Station labels: middle-anchored, halo stroke; scaled, then pushed down until they no longer overlap.
  const station=/<text( [^>]*?)?text-anchor="middle" font-size="12"[^>]*paint-order="stroke">([^<]*)<\/text>/g;
  const glyphBox=(before:string)=>{
    const seg=before.slice(before.lastIndexOf('<g data-entity='));
    const pts=[...seg.matchAll(/points="([^"]+)"/g)].flatMap(m=>m[1].trim().split(/\s+/).map(p=>p.split(',').map(Number)));
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    return {l:Math.min(...xs),r:Math.max(...xs),t:Math.min(...ys),b:Math.max(...ys)};
  };
  const stations=[...svg.matchAll(station)].map(m=>({src:m[0],index:m.index!,tag:m[0].slice(0,m[0].indexOf('>')+1),text:m[2],x:Number(attr(m[0],'x')),y:Number(attr(m[0],'y')),glyph:glyphBox(svg.slice(0,m.index))}));
  boxes.push(...stations.map(s=>s.glyph));
  const out=new Map<number,string>();
  for(const s of [...stations].sort((a,b)=>a.y-b.y||a.x-b.x)){
    // Keep the side the framework chose (right, left, above, below) and clear the glyph at the new size.
    const oldHalf=textWidth(s.text,12)/2,half=textWidth(s.text,fs)/2,g=s.glyph,gcx=(g.l+g.r)/2,gap=6*ratio;
    let x=s.x,y=s.y;
    if(s.x-oldHalf>=gcx-1)x=Math.max(s.x-oldHalf,g.r+gap)+half;
    else if(s.x+oldHalf<=gcx+1)x=Math.min(s.x+oldHalf,g.l-gap)-half;
    else if(s.y>(g.t+g.b)/2)y=Math.max(s.y,g.b+fs);else y=Math.min(s.y,g.t-gap);
    for(let i=0;i<12;i++){const hit=boxes.find(b=>b!==g&&x-half<b.r&&x+half>b.l&&y-fs<b.b&&y+fs*.25>b.t);if(!hit)break;y=hit.b+fs*1.02;}
    boxes.push({l:x-half,t:y-fs,r:x+half,b:y+fs*.25});
    out.set(s.index,setAttr(setAttr(setAttr(setAttr(s.tag,'font-size',num(fs)),'stroke-width',num(3*ratio)),'x',num(x)),'y',num(y))+s.text+'</text>');
  }
  for(const s of [...stations].sort((a,b)=>b.index-a.index))svg=svg.slice(0,s.index)+out.get(s.index)+svg.slice(s.index+s.src.length);
  // Footer (provenance and legend): readable too; legend text stays inside the frame below.
  svg=svg.replace(/<text x="([-\d.]+)" y="([-\d.]+)" font-size="10.5"([^>]*)>([^<]*)<\/text>/g,(_,x,y,rest,text)=>{
    boxes.push({l:Number(x),t:Number(y)-fs,r:Number(x)+textWidth(text,fs*.85),b:Number(y)});
    return `<text x="${x}" y="${y}" font-size="${num(fs*.85)}"${rest}>${text}</text>`;
  });
  svg=svg.replace(/(<text x="[-\d.]+" y="[-\d.]+" font-size=")10("[^>]*>)/g,(_,a,b)=>a+num(fs*.8)+b);
  // Domain labels.
  svg=svg.replace(/<text data-group-label="[^"]*"[^>]*>/g,t=>setAttr(setAttr(t,'font-size',num(9.5*ratio*1.05)),'stroke-width',num(3*ratio)));
  // Plane titles: into a left band, one row each, with a leader to the plane corner.
  const planeRe=/(<g data-layer="[^"]*">.*?)<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="end" font-size="12.5" font-weight="600"[^>]*>([^<]*)<\/text>/g;
  const planes=[...svg.matchAll(planeRe)].map(m=>({src:m[0],head:m[1],x:Number(m[2]),y:Number(m[3]),text:m[4]}));
  const pfs=fs*1.2,band=Math.max(0,...planes.map(p=>textWidth(p.text,pfs,true)))+ISO_TEXT.bandPad*ratio*2;
  const nx0=x0-band;
  const rows=[...planes].sort((a,b)=>a.y-b.y);let last=-Infinity;const placed=new Map<string,number>();
  for(const p of rows){const y=Math.max(p.y,last+pfs*1.5);placed.set(p.src,y);last=y;}
  for(const p of planes){
    const y=placed.get(p.src)!,tx=nx0+ISO_TEXT.bandPad*ratio,ex=tx+textWidth(p.text,pfs,true)+6*ratio;
    svg=svg.replace(p.src,`${p.head}<path data-plane-leader="" d="M${num(ex)} ${num(y-pfs*.35)} L${num(p.x)} ${num(p.y-4)}" fill="none" stroke="#7b8a94" stroke-width="${num(ratio)}" stroke-dasharray="${num(4*ratio)} ${num(4*ratio)}"/><text data-plane-title="" x="${num(tx)}" y="${num(y)}" font-size="${num(pfs)}" font-weight="650" fill="#21384a" font-family="system-ui,sans-serif">${p.text}</text>`);
  }
  // Header: title and description at the new left edge, scaled; room is added above the scene.
  const head=fs*3.4,ny0=y0-head;
  svg=svg.replace(/<text x="[-\d.]+" y="[-\d.]+" font-size="20" font-weight="650"/,`<text x="${num(nx0+ISO_TEXT.bandPad*ratio)}" y="${num(ny0+fs*2)}" font-size="${num(fs*1.75)}" font-weight="650"`);
  svg=svg.replace(/<text x="[-\d.]+" y="[-\d.]+" font-size="11.5"/,`<text x="${num(nx0+ISO_TEXT.bandPad*ratio)}" y="${num(ny0+fs*3.2)}" font-size="${num(fs*.95)}"`);
  // Grow the frame to hold every station label, then repaint the background.
  const r=Math.max(x0+w,...boxes.map(b=>b.r+fs)),bottom=Math.max(y0+h,...boxes.map(b=>b.b+fs));
  [x0,y0,w,h]=[nx0,ny0,r-nx0,bottom-ny0];
  svg=svg.replace(/viewBox="[^"]+"/,`viewBox="${num(x0)} ${num(y0)} ${num(w)} ${num(h)}"`);
  svg=svg.replace(/<rect x="[-\d.e]+" y="[-\d.e]+" width="[\d.e]+" height="[\d.e]+" fill="(#[0-9a-fA-F]{6})"\/>/,(_,fill)=>`<rect x="${num(x0)}" y="${num(y0)}" width="${num(w)}" height="${num(h)}" fill="${fill}"/>`);
  return svg;
}

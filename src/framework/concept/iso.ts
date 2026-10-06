import type {ConceptSpec,ConceptNode} from './schema.ts';
import {KINDS,PAPER,FLOW_STYLE,layerTint,statusColor} from './kinds.ts';
import {grid,type Grid,type P2} from './layout.ts';
import {isoRoutes,type IsoFrame} from './routing.ts';
import {registerConceptGlyphs} from './iso-glyphs.ts';
import type {MotionSpec} from '../motion/model.ts';
import {compileMotion} from '../motion/compile.ts';
import {motionSvg} from '../motion/export.ts';
import {project,drawing} from '../motion/geometry.ts';

const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** World units of the isometric scene: x = column inside a domain, y = domain row, z = layer height (levels × rise). */
export const ISO={column:2.7,domain:3.5,rise:3.1,size:[1.45,1.45,1.0] as [number,number,number],lakeDepth:.1};
type V3=[number,number,number];
function isoFrame(spec:ConceptSpec,g:Grid):IsoFrame{
  const position=(id:string):V3=>{
    const s=g.slots.get(id)!;
    if(s.node.kind==='lake')return [0,(spec.domains.length-1)*ISO.domain/2,0];
    return [(s.column-g.domainStart[s.domain]-g.domainColumns[s.domain]/2)*ISO.column,(spec.domains.length-1-s.domain)*ISO.domain,g.heights[s.layer]*ISO.rise];
  };
  return {position,layer:id=>g.slots.get(id)!.layer,rise:ISO.rise,height:ISO.size[2],depth:ISO.size[1],column:ISO.column,lakeTop:ISO.lakeDepth,project:p=>project(p,'isometric')};
}
/**
 * The concept spec as a one-step Motion v2 scene: layers become layer planes at their height, each
 * (layer, domain) cell becomes an outlined domain, every node is a station drawn with its kind glyph, the lake
 * is one wide flat station, and flows carry bundled orthogonal routes (data solid, control and auth dashed;
 * auth is recoloured after export). Annotations with a target become Motion callouts.
 */
export function toMotion(spec:ConceptSpec):MotionSpec{
  registerConceptGlyphs();
  const g=grid(spec),f=isoFrame(spec,g),routes=isoRoutes(spec,f);
  const nodes=spec.nodes.filter(node=>node.kind!=='lake'),xs=nodes.map(node=>f.position(node.id)[0]);
  const lakeSize:V3=[Math.max(...xs)-Math.min(...xs)+ISO.size[0]+1.2,(spec.domains.length-1)*ISO.domain+ISO.size[1]+2.4,ISO.lakeDepth];
  const station=(node:ConceptNode)=>({id:node.id,kind:'station' as const,label:node.label,description:node.description||KINDS[node.kind].label,color:statusColor(KINDS[node.kind].color,node.status),evidence:[],
    position:node.kind==='lake'?[(Math.max(...xs)+Math.min(...xs))/2,f.position(node.id)[1],0] as V3:f.position(node.id),size:node.kind==='lake'?lakeSize:ISO.size,glyph:KINDS[node.kind].iso});
  const lakeLayer=spec.nodes.find(node=>node.kind==='lake')?.layer;
  const cells=spec.layers.flatMap((layer,li)=>spec.domains.map(domain=>({layer,li,domain,members:nodes.filter(node=>node.layer===layer.id&&node.domain===domain.id).map(node=>node.id)}))).filter(c=>c.members.length);
  const targeted=spec.annotations.filter(a=>a.target);
  return {
    format:'datapass.motion',version:2,title:spec.title,description:spec.subtitle||spec.title,provenance:spec.provenance==='documented'?'authored':'synthetic',note:spec.note,sources:[],
    scene:{stationSize:64,positionRange:400,labels:'attached',linkCasing:true,linkCorner:7,header:true,background:PAPER,legend:{solid:FLOW_STYLE.data.legend,dashed:FLOW_STYLE.control.legend}},
    layers:spec.layers.map((layer,i)=>({id:layer.id,label:layer.label,z:g.heights[i]*ISO.rise,color:layer.id===lakeLayer?KINDS.lake.color:layerTint(layer,i),texture:layer.id===lakeLayer?'water' as const:'plain' as const})),
    groups:cells.map(c=>({id:c.layer.id+'--'+c.domain.id,...(c===cells.filter(x=>x.domain===c.domain).at(-1)?{label:c.domain.label}:{}),layer:c.layer.id,members:c.members,color:c.domain.placement==='side'?'#7d68a8':layerTint(c.layer,c.li)})),
    entities:spec.nodes.map(station),
    links:spec.flows.map(fl=>{const r=routes.get(fl.id)!;return {id:fl.id,from:fl.from,to:fl.to,label:fl.label,via:r.via,attach:r.attach,style:fl.kind==='data'?'solid' as const:'dashed' as const};}),
    steps:[{id:'overview',title:'Overview',caption:spec.subtitle||spec.title,focus:'none',holdMs:2000,transitionMs:0,commands:[],activeLinks:spec.flows.map(fl=>fl.id),evidence:[],
      annotations:targeted.map(a=>({id:a.id,entity:a.target!,text:a.text,offset:[0,-96] as [number,number],evidence:[]}))}]
  };
}
const AUTH=FLOW_STYLE.auth;
/**
 * The framework Motion v2 export, plus two concept-only touches applied to the finished markup:
 * auth flows are recoloured and dotted, two-way flows get a start arrowhead, and an auth legend entry is added.
 */
export function isometricSvg(spec:ConceptSpec,selection='none'):string{
  let svg=motionSvg(compileMotion(toMotion(spec)),0,'isometric',selection);
  for(const fl of spec.flows){
    if(fl.kind!=='auth'&&fl.direction!=='both')continue;
    const open=`<g data-link="${esc(fl.id)}"`,start=svg.indexOf(open);if(start<0)continue;
    const end=svg.indexOf('</g>',start),group=svg.slice(start,end);
    let next=group;
    if(fl.kind==='auth')next=next.replace(/stroke="#(a0835a|cdb89a)"/,`stroke="${AUTH.stroke}"`).replace('stroke-dasharray="5 4"',`stroke-dasharray="${AUTH.dash}" stroke-linecap="round"`).replace('url(#motion-arrow-dashed)','url(#concept-arrow-auth)').replace(open,open+' data-kind="auth"');
    if(fl.direction==='both')next=next.replace(/marker-end="(url\(#[a-z-]+\))"/,'marker-start="$1" marker-end="$1"');
    svg=svg.slice(0,start)+next+svg.slice(end);
  }
  if(spec.flows.some(fl=>fl.kind==='auth')){
    svg=svg.replace('<defs>',`<defs><marker id="concept-arrow-auth" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="${AUTH.stroke}"/></marker>`);
    const [x,y,w,h]=/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg)!.slice(1).map(Number);
    const ly=y+h-36+13,lx=x+w-330-150;
    svg=svg.replace(/<\/svg>$/,`<g data-legend-auth=""><path d="M${lx.toFixed(3)} ${ly.toFixed(3)} h30" stroke="${AUTH.stroke}" stroke-width="1.8" stroke-dasharray="${AUTH.dash}" stroke-linecap="round" marker-end="url(#concept-arrow-auth)"/><text x="${(lx+38).toFixed(3)}" y="${(ly+4).toFixed(3)}" font-size="10.5" fill="#647889" font-family="system-ui,sans-serif">${AUTH.legend}</text></g></svg>`);
  }
  return svg.replace('<svg ',`<svg data-concept="${esc(spec.id)}" data-representation="isometric" data-renderer="framework-motion-v2" `)+'\n';
}
/** Screen paths of the isometric links (for crossing metrics and tests). */
export function isoScreenPaths(spec:ConceptSpec):P2[][]{
  const c=compileMotion(toMotion(spec));
  return drawing(c,c.frames[0],'isometric').links.map(l=>l.path as P2[]);
}

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
/** Exactly the framework export; the client only tags the root element. */
export function isometricSvg(filter:StatusFilter='all',selection='none',registry:Registry=REGISTRY):string{
  const world=buildWorld(registry,filter);
  const svg=motionSvg(compileMotion(toMotion(world,registry,filter)),0,'isometric',selection==='none'||world.byId.has(selection)?selection:'none');
  return svg.replace('<svg ',`<svg data-galaxy="${esc(registry.source.updated.slice(0,10))}" data-representation="isometric" data-renderer="framework-motion-v2" `)+'\n';
}

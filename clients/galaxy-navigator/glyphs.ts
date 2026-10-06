/** Natural kind glyphs for the Galaxy, registered in the framework glyph registry (Motion v2).
 * The same pure functions draw the isometric SVG (framework exporter) and the 3D meshes (Galaxy3D builds
 * solids from the same parts), so both views show the same objects. Local frame: footprint [-.5,.5]^2,
 * y towards the viewer, z up; front decals sit just in front of the face they decorate.
 */
import {registerMotionGlyphs,shadeColor,type GlyphKit,type GlyphPart,type MotionGlyph} from '../../src/framework/motion/glyphs.ts';
import type {P3} from './world.ts';
import type {GlyphKind} from './world.ts';

const INK='#2f3b44',PAPER='#f4f1ea',SCREEN='#203038';
/** A flat rectangle on the front (y) face of a panel: u across, v up. */
const decal=(y:number,u0:number,u1:number,v0:number,v1:number,fill:string,opacity=1):GlyphPart=>({shape:'poly',points:[[u0,y,v0],[u1,y,v0],[u1,y,v1],[u0,y,v1]] as P3[],fill,stroke:shadeColor(fill,-.2),opacity});
const stroke=(points:P3[],color:string,width=1.2):GlyphPart=>({shape:'line',points,stroke:color,width});
/** An upright panel (screen, window, board) standing on a base: returns the parts and the y of its front face. */
function panel(k:GlyphKit,w:number,h:number,z:number,color:string,thick=.08):{parts:GlyphPart[];front:number}{
  return {parts:k.box(0,-.04,z,w,thick,h,color),front:-.04+thick/2+.004};
}

export const GALAXY_GLYPHS:Record<`galaxy-${GlyphKind}`,MotionGlyph>={
  /** Editor window with side bar, tabs and code lines, and an extension "plug" on its top edge. */
  'galaxy-extension':k=>{
    const p=panel(k,.86,.56,.1,SCREEN);
    return [
      ...k.box(0,.12,0,.46,.3,.05,shadeColor(k.color,-.45)),...k.box(0,-.04,.05,.12,.08,.06,shadeColor(k.color,-.45)),
      ...p.parts,
      decal(p.front,-.39,-.27,.14,.62,shadeColor(k.color,-.2)),
      decal(p.front,-.25,.39,.56,.62,shadeColor(SCREEN,.25)),
      decal(p.front,-.25,-.06,.56,.62,k.color),
      ...[.48,.41,.34,.27,.2].map((v,i)=>decal(p.front+.001,-.21+(i%2)*.04,[.22,.08,.3,.14,.2][i],v,v+.03,i===2?'#e5a65a':'#8fd0e8')),
      ...k.box(.28,-.04,.66,.14,.1,.08,k.color),...k.box(.28,-.04,.74,.06,.06,.05,shadeColor(k.color,.2)),
    ];
  },
  /** Browser window (title bar with three dots, content blocks) next to a small globe. */
  'galaxy-webapp':k=>{
    const p=panel(k,.8,.6,.06,PAPER);
    return [
      ...k.box(.06,.1,0,.6,.36,.06,shadeColor(k.color,-.4)),
      ...p.parts,
      decal(p.front,-.4,.4,.56,.66,shadeColor(k.color,-.1)),
      ...[-.34,-.27,-.2].map((u,i)=>({shape:'sphere' as const,center:[u,p.front+.01,.61] as P3,r:.022,fill:['#e66767','#eda100','#1baf7a'][i]})),
      decal(p.front+.001,-.34,-.04,.3,.5,shadeColor(k.color,.35)),
      decal(p.front+.001,.02,.34,.42,.5,'#cfd8dc'),decal(p.front+.001,.02,.26,.34,.39,'#cfd8dc'),decal(p.front+.001,-.34,.34,.14,.25,shadeColor(k.color,.55)),
      {shape:'sphere',center:[-.36,.3,.14],r:.13,fill:'#7fb0bb'},
      stroke([[-.49,.3,.14],[-.23,.3,.14]],'#ffffff',.9),stroke([[-.36,.3,.01],[-.36,.3,.27]],'#ffffff',.9),
    ];
  },
  /** Terminal: a dark console block with a prompt and output lines. */
  'galaxy-cli':k=>{
    const p=panel(k,.8,.5,.06,'#1c2329',.16);
    return [
      ...k.box(0,.16,0,.84,.36,.06,shadeColor(k.color,-.35)),
      ...p.parts,
      decal(p.front,-.4,.4,.5,.56,shadeColor(k.color,-.05)),
      stroke([[-.32,p.front+.002,.42],[-.26,p.front+.002,.38],[-.32,p.front+.002,.34]],'#7ee2a8',1.6),
      decal(p.front+.002,-.22,-.06,.335,.355,'#7ee2a8'),
      ...[.26,.2,.14].map((v,i)=>decal(p.front+.002,-.32,[.24,.08,.18][i],v,v+.025,'#a9c4cf')),
      ...[-.24,0,.24].map(u=>k.box(u,.26,.06,.16,.08,.03,'#5b6872')).flat(),
    ];
  },
  /** Desktop app: a monitor on a stand showing a tiled window. */
  'galaxy-desktop':k=>{
    const p=panel(k,.9,.54,.2,SCREEN);
    return [
      ...k.frustum(0,.05,0,.22,.16,.04,'#7d8a93'),...k.box(0,-.04,.04,.08,.06,.16,'#7d8a93'),
      ...p.parts,
      decal(p.front,-.4,.4,.25,.69,'#dfe7ea'),
      decal(p.front+.001,-.37,-.03,.48,.66,k.color),decal(p.front+.001,.01,.37,.48,.66,shadeColor(k.color,.35)),
      decal(p.front+.001,-.37,.12,.28,.45,shadeColor(k.color,.5)),decal(p.front+.001,.16,.37,.28,.45,'#e5a65a'),
    ];
  },
  /** Documentation: a stack of pages with text lines and a folded corner. */
  'galaxy-doc':k=>[
    ...k.box(.06,-.05,0,.62,.74,.05,'#d9d3c6'),...k.box(.03,-.02,.05,.62,.74,.05,'#e8e2d5'),...k.box(0,0,.1,.62,.74,.05,PAPER),
    {shape:'poly',points:[[.19,-.37,.151],[.31,-.37,.151],[.31,-.25,.151]],fill:shadeColor(PAPER,-.15)},
    ...[-.24,-.12,0,.12,.24].map((y,i)=>stroke([[-.24,y,.152],[i===2?.06:.22,y,.152]],i===0?k.color:'#8a9aa5',i===0?2:1.2)),
    ...k.box(-.38,.3,0,.08,.08,.34,shadeColor(k.color,-.2)),{shape:'poly',points:[[-.42,.341,.34],[-.34,.341,.34],[-.38,.341,.4]],fill:'#e5a65a'},
  ],
  /** Repository: a crate of versions with a branch graph on its front. */
  'galaxy-repo':k=>{
    const y=.3+.004;
    return [
      ...k.box(0,0,0,.84,.6,.4,shadeColor(k.color,-.05)),
      ...k.box(0,0,.4,.9,.66,.06,shadeColor(k.color,-.3)),
      stroke([[-.22,y,.08],[-.22,y,.34]],INK,1.6),stroke([[-.22,y,.15],[.02,y,.24],[.02,y,.34]],INK,1.6),
      {shape:'sphere',center:[-.22,y+.01,.1],r:.04,fill:'#f4f1ea',stroke:INK},{shape:'sphere',center:[-.22,y+.01,.33],r:.04,fill:'#f4f1ea',stroke:INK},{shape:'sphere',center:[.02,y+.01,.33],r:.04,fill:'#e5a65a',stroke:INK},
      decal(y,.14,.36,.08,.3,shadeColor(k.color,.45)),
    ];
  },
};
let registered=false;
/** Idempotent: the registry rejects a second, different definition, never the same one. */
export function registerGalaxyGlyphs(){if(!registered){registerMotionGlyphs(GALAXY_GLYPHS);registered=true;}}
export const glyphName=(kind:GlyphKind)=>`galaxy-${kind}` as const;

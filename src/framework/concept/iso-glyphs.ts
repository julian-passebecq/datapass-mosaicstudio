import {registerMotionGlyphs,type MotionGlyph,type GlyphPart} from '../motion/glyphs.ts';
import type {Point3} from '../motion/model.ts';

/**
 * Concept extension of the Motion isometric glyph registry: the kinds the built-in set does not cover,
 * drawn with the same metaphors as the 3D icons. Registered once on first use (names are unique).
 */
const INK='#3b4a54';
const line=(points:Point3[],stroke=INK,width=1.1):GlyphPart=>({shape:'line',points,stroke,width});
const screenFace=(y:number)=>(u0:number,u1:number,z0:number,z1:number):Point3[]=>[[u0,y,z0],[u1,y,z0],[u1,y,z1],[u0,y,z1]];

export const CONCEPT_GLYPHS:Record<string,MotionGlyph>={
  'concept-eventhouse':k=>[
    ...k.frustum(0,0,0,.36,.36,.62,k.color),
    ...[.14,.28,.42].map(z=>({shape:'arc' as const,center:[0,0,z] as Point3,r:.36,stroke:k.shade(k.color,-.45),width:1})),
    line([[-.12,.05,.63],[.02,-.02,.63],[-.04,.08,.63],[.12,-.04,.63]],'#d9774f',1.6)
  ],
  'concept-artifact':k=>[0,1,2,3].flatMap(i=>[...k.box(-.06+i*.04,-.04+i*.03,i*.09,.62,.48,.06,i===3?k.color:k.shade(k.color,-.08*(3-i)))]).concat(
    [.0,.1,.2].map(o=>line([[-.24+o*.4,.12-o,.367],[.12+o*.4,.12-o,.367]],'#8a7a66',1)) as GlyphPart[]),
  'concept-repo':k=>[
    ...k.box(0,0,0,.72,.5,.08,k.shade(k.color,-.3)),
    line([[-.2,0,.08],[-.2,0,.62]],INK,1.6),line([[.2,0,.08],[.2,0,.3],[-.2,0,.5]],INK,1.6),
    {shape:'sphere',center:[-.2,0,.62],r:.08,fill:k.color},{shape:'sphere',center:[-.2,0,.22],r:.08,fill:k.color},{shape:'sphere',center:[.2,0,.3],r:.08,fill:k.shade(k.color,.3)}
  ],
  'concept-producer':k=>[
    ...k.box(.22,-.2,0,.16,.16,.8,k.shade(k.color,-.2)),
    ...k.box(0,0,0,.9,.6,.32,k.color),
    ...[-.3,0,.3].flatMap(x=>[{shape:'poly' as const,points:[[x-.15,-.3,.32],[x+.15,-.3,.32],[x+.15,.3,.32],[x-.15,.3,.32]] as Point3[],fill:k.shade(k.color,.2)},{shape:'poly' as const,points:[[x+.15,-.3,.32],[x+.15,.3,.32],[x+.15,.3,.5],[x+.15,-.3,.5]] as Point3[],fill:k.shade(k.color,-.35)},{shape:'poly' as const,points:[[x-.15,.3,.32],[x+.15,.3,.32],[x+.15,.3,.5]] as Point3[],fill:k.shade(k.color,-.15)}])
  ],
  'concept-library':k=>[
    ...k.box(0,0,0,.9,.42,.06,k.shade(k.color,-.4)),
    ...k.box(-.3,0,.06,.16,.36,.56,'#8f9b7a'),...k.box(-.12,0,.06,.16,.36,.64,k.color),...k.box(.06,0,.06,.14,.36,.5,'#c9a65f'),
    ...k.box(.26,0,.06,.18,.36,.42,'#7d939c')
  ],
  'concept-dashboard':k=>{
    const y=.061,face=screenFace(y);
    return [
      ...k.box(0,-.05,0,.36,.26,.05,'#7e8b95'),...k.box(0,-.05,.05,.07,.07,.16,'#7e8b95'),
      ...k.box(0,.02,.2,.92,.08,.56,'#3d4d58'),
      {shape:'poly',points:face(-.42,.42,.24,.72),fill:'#eef3f5'},
      line([[-.36,y,.34],[-.2,y,.5],[-.06,y,.42],[.1,y,.62],[.22,y,.5],[.36,y,.58]],k.color,1.8),
      {shape:'sphere',center:[.36,y,.58],r:.035,fill:'#d9774f'}
    ];
  },
  'concept-ci-runner':k=>{
    const teeth=[...Array(8)].flatMap((_,i)=>{const a=i/8*Math.PI*2;return k.box(Math.cos(a)*.34,Math.sin(a)*.34,.2,.12,.12,.16,k.shade(k.color,-.1));});
    return [...teeth.slice(0,teeth.length/2),...k.frustum(0,0,.2,.32,.32,.16,k.color),...teeth.slice(teeth.length/2),
      {shape:'poly',points:k.circle(0,0,.361,.1),fill:k.shade(k.color,-.5)},line([[-.1,.18,.37],[-.02,.26,.37],[.14,.08,.37]],'#3f8a63',1.8),
      ...k.box(0,0,0,.2,.2,.2,k.shade(k.color,-.35))];
  },
  'concept-static-host':k=>[0,1,2].flatMap(i=>[...k.box(0,0,i*.24,.72,.56,.21,i===2?k.shade(k.color,.15):k.color),
    {shape:'line' as const,points:[[-.28,.281,i*.24+.1],[-.16,.281,i*.24+.1]] as Point3[],stroke:'#7fd1a0',width:1.8},
    {shape:'line' as const,points:[[.06,.281,i*.24+.1],[.3,.281,i*.24+.1]] as Point3[],stroke:INK,width:.8}]),
  'concept-browser':k=>{
    const y=.061,face=screenFace(y);
    return [
      ...k.box(0,-.05,0,.4,.3,.05,'#7e8b95'),
      ...k.box(0,.02,.05,.92,.08,.66,k.shade(k.color,-.2)),
      {shape:'poly',points:face(-.42,.42,.09,.6),fill:'#f6f8f9'},
      {shape:'poly',points:face(-.42,.42,.6,.68),fill:k.color},
      ...[-.36,-.3,-.24].map(u=>({shape:'sphere' as const,center:[u,y+.002,.64] as Point3,r:.018,fill:'#ffffff'})),
      line([[-.34,y,.48],[.2,y,.48]],INK,1.2),line([[-.34,y,.38],[.06,y,.38]],INK,1.2),line([[-.34,y,.28],[.28,y,.28]],INK,1.2)
    ];
  },
  'concept-app':k=>{
    const y=.051,face=screenFace(y);
    return [
      ...k.box(0,-.04,0,.5,.34,.05,k.shade(k.color,-.35)),
      ...k.box(0,.0,.05,.56,.1,.7,k.shade(k.color,-.25)),
      {shape:'poly',points:face(-.24,.24,.12,.68),fill:'#f3f6f4'},
      ...[[-.12,.55],[.12,.55],[-.12,.4],[.12,.4],[-.12,.25],[.12,.25]].map(([u,z],i)=>({shape:'poly' as const,points:face(u-.08,u+.08,z-.05,z+.05),fill:i%3===1?'#d2b071':k.color}))
    ];
  },
  'concept-endpoint':k=>[
    ...k.box(0,0,0,.6,.5,.42,k.color),
    ...k.box(.38,0,.12,.16,.22,.18,k.shade(k.color,-.3)),
    line([[.46,0,.21],[.62,0,.21]],INK,1.6),line([[.62,-.08,.15],[.62,.08,.27]],INK,1.4),
    line([[-.2,.251,.3],[.12,.251,.3]],INK,1),line([[-.2,.251,.2],[.04,.251,.2]],INK,1)
  ],
  'concept-function':k=>[
    ...k.box(0,0,0,.62,.52,.14,k.shade(k.color,-.3)),
    {shape:'poly',points:[[.06,0,.86],[-.14,0,.46],[.02,0,.46],[-.08,0,.14],[.18,0,.56],[.02,0,.56],[.14,0,.86]],fill:k.color,stroke:k.shade(k.color,-.45)}
  ],
  'concept-user':k=>[
    ...k.frustum(0,0,0,.2,.14,.5,k.color),
    {shape:'sphere',center:[0,0,.66],r:.14,fill:'#e9d8c5'}
  ],
  'concept-device':k=>[
    ...k.box(0,0,0,.5,.4,.26,k.color),
    line([[0,0,.26],[0,0,.62]],INK,1.4),{shape:'sphere',center:[0,0,.64],r:.05,fill:'#d9774f'},
    line([...Array(7)].map((_,i)=>{const a=Math.PI*(.2+.6*i/6);return [Math.cos(a)*.2,0,.6+Math.sin(a)*.12] as Point3;}),INK,1),
    line([...Array(7)].map((_,i)=>{const a=Math.PI*(.15+.7*i/6);return [Math.cos(a)*.32,0,.58+Math.sin(a)*.2] as Point3;}),INK,1)
  ],
  'concept-alert':k=>[
    ...k.box(0,0,0,.5,.4,.08,k.shade(k.color,-.4)),
    {shape:'sphere',center:[0,0,.14],r:.07,fill:k.shade(k.color,-.3)},
    ...k.frustum(0,0,.16,.3,.12,.42,k.color),
    {shape:'sphere',center:[0,0,.62],r:.07,fill:k.shade(k.color,.2)},
    line([[.36,.0,.5],[.44,0,.58]],'#d9774f',1.4),line([[-.36,0,.5],[-.44,0,.58]],'#d9774f',1.4)
  ],
  'concept-external':k=>[
    ...k.box(0,0,0,.62,.5,.1,k.shade(k.color,-.35)),
    {shape:'sphere',center:[-.18,0,.32],r:.2,fill:k.shade(k.color,.1)},
    {shape:'sphere',center:[.18,0,.3],r:.18,fill:k.color},
    {shape:'sphere',center:[0,0,.46],r:.22,fill:k.shade(k.color,.25)},
    line([[-.1,.24,.32],[.14,.24,.32]],INK,1.4),line([[.08,.24,.38],[.14,.24,.32],[.08,.24,.26]],INK,1.4)
  ]
};
let registered=false;
/** Idempotent: the concept renderers call it before compiling a scene. */
export function registerConceptGlyphs(){if(!registered){registerMotionGlyphs(CONCEPT_GLYPHS);registered=true;}}

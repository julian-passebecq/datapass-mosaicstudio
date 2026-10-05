import type {SceneSpec,ScenePart,Vec3} from '../../src/framework/scene.ts';

/**
 * Twelve SYNTHETIC concept kits named after Microsoft Fabric items. Geometry, piece counts and prices are
 * illustrative only: no purchasable kit, no real part numbers and no brand logos are represented.
 */
export type KitId='powerbi'|'onelake'|'lakehouse'|'warehouse'|'eventhouse'|'sqldb'|'medallion'|'pipeline'|'notebook'|'rti'|'datawarehouse'|'fabric';
export type BrickShape='box'|'cylinder'|'leaf'|'slope'|'grille'|'cone'|'arch'|'window';
/** `size` is [width,height,depth]; for cylinder/cone it is [radiusTop,radiusBottom,height]. `rot` turns the moulded piece (radians). */
export type BrickPart={id:string;lot:string;name:string;color:string;size:Vec3;position:Vec3;step:number;studs?:[number,number];shape?:BrickShape;rot?:Vec3};
export const lots=[
  {id:'display-base',name:'Display plate',code:'8 × 10',color:'#17191a',price:1.12},
  {id:'landscape',name:'Landscape plate',code:'2 × 6',color:'#159c52',price:.19},
  {id:'water',name:'Water tile',code:'2 × 3',color:'#36c5eb',price:.22},
  {id:'walls',name:'Wall brick',code:'1 × 2',color:'#e5e5dc',price:.12},
  {id:'roof',name:'Roof tile',code:'2 × 2',color:'#686b67',price:.24},
  {id:'accent',name:'Accent tile',code:'2 × 2',color:'#05bcb5',price:.21},
  {id:'boardwalk',name:'Boardwalk tile',code:'1 × 4',color:'#bda071',price:.18},
  {id:'trunks',name:'Round brick',code:'1 × 1',color:'#85502c',price:.08},
  {id:'leaves',name:'Botanical element',code:'3 leaves',color:'#10b14c',price:.14},
  {id:'flowers',name:'Flower stud',code:'1 × 1',color:'#f5f1e2',price:.04},
  {id:'plate',name:'Plate',code:'4 × 6',color:'#9ea3a6',price:.25},
  {id:'brick',name:'Brick',code:'2 × 2',color:'#f2c230',price:.11},
  {id:'brick12',name:'Brick',code:'1 × 2',color:'#d7263d',price:.07},
  {id:'brick1',name:'Brick',code:'1 × 1',color:'#d7263d',price:.05},
  {id:'round',name:'Brick, round',code:'2 × 2',color:'#f4f4ef',price:.12},
  {id:'curve',name:'Curved brick',code:'2 × 4',color:'#f2c230',price:.19},
  {id:'slope',name:'Slope 45°',code:'2 × 2',color:'#b5b9bc',price:.14},
  {id:'arch',name:'Arch',code:'1 × 4',color:'#e5e5dc',price:.16},
  {id:'window',name:'Window',code:'1 × 2 × 2',color:'#cfe6ee',price:.31},
  {id:'grille',name:'Grille tile',code:'1 × 2',color:'#8c9096',price:.06},
  {id:'tile',name:'Tile',code:'1 × 2',color:'#f4f4ef',price:.04},
  {id:'round-tile',name:'Tile, round',code:'2 × 2',color:'#9ea3a6',price:.09},
  {id:'dot',name:'Plate, round',code:'1 × 1',color:'#2aa84a',price:.03},
  {id:'cone',name:'Cone',code:'1 × 1',color:'#1f8f3e',price:.07},
  {id:'pole',name:'Bar',code:'4L',color:'#1f2224',price:.05},
] as const;
const lotShape:Record<string,BrickShape>={round:'cylinder','round-tile':'cylinder',dot:'cylinder',pole:'cylinder',curve:'cylinder',trunks:'cylinder',flowers:'cylinder',slope:'slope',grille:'grille',cone:'cone',arch:'arch',window:'window'};
export const buildSteps=['Foundation','Water & landscape','Ground floor','Walls & windows','Roof & terrace','Trees & details'];
const stepNames:Record<string,string[]>={
  powerbi:['Foundation','First column','Second column','Third column','Rounded tops','Front details'],
  onelake:['Foundation','Lake & banks','Shared store','Lake tower','Covers','Landscape details'],
  warehouse:['Foundation','Floor & loading dock','Warehouse walls','Storage crates','Roof panels','Yard details'],
  eventhouse:['Foundation','Water & rocks','Keeper house','Tower','Lantern & roof','Shore details'],
  sqldb:['Foundation','Plinth','Main drum','Replica drum','Caps & vents','Status lights'],
  medallion:['Foundation','Plaza & channel','Bronze tower','Silver tower','Gold tower','Landscape'],
  pipeline:['Foundation','Source station','Transform station','Destination station','Connections & caps','Status indicators'],
  notebook:['Foundation','Covers & spine','Open pages','First code lines','Second code lines','Final code lines'],
  rti:['Foundation','Stand','Front signal','Back signal','Peaks','Data points'],
  datawarehouse:['Foundation','First tier','Second tier','Upper tiers','Slopes','Lights'],
  fabric:['Foundation','Warp threads','Weft threads','First ribbon','Upper ribbons','Details'],
};
export function getBuildSteps(id:string){return stepNames[id]??buildSteps;}
const lotOf=(lot:string)=>{const l=lots.find(l=>l.id===lot);if(!l)throw new Error('Unknown lot '+lot);return l;};
const make=(id:string,lot:string,size:Vec3,position:Vec3,step:number,studs?:[number,number],color?:string,shape?:BrickShape,rot?:number|Vec3):BrickPart=>({id,lot,name:lotOf(lot).name,color:color??lotOf(lot).color,size,position,step,studs,shape:shape??lotShape[lot],rot:rot===undefined?undefined:typeof rot==='number'?[0,rot,0]:rot});

/* ---------- shared kit furniture ---------- */
const C={white:'#f4f4ef',offwhite:'#e5e5dc',grey:'#9ea3a6',light:'#c3c7c9',dark:'#4a4e51',black:'#1f2224',red:'#d7263d',blue:'#1e6fd9',sky:'#5aa7f5',yellow:'#f5c518',green:'#2aa84a',lime:'#7cc242',tan:'#bda071',brown:'#85502c',orange:'#f08a24'};
const HALF=Math.PI/2;
/** Black display plate with a raised rim, as on the reference stands. */
function displayBase(w:number,d:number):BrickPart[]{return [
  make('base','display-base',[w,.32,d],[0,.16,0],1),
  make('base-front','display-base',[w,.13,.22],[0,.39,d/2-.12],1),
  make('base-left','display-base',[.22,.13,d-.4],[-w/2+.11,.39,0],1),
  make('base-right','display-base',[.22,.13,d-.4],[w/2-.11,.39,0],1),
  make('base-back','display-base',[w,.13,.22],[0,.39,-d/2+.12],1)];}
function tree(id:string,x:number,z:number,ground:number,step:number):BrickPart[]{return [
  make(`trunk-${id}`,'trunks',[.27,.27,.8],[x,ground+.43,z],step),
  ...[0,1,2].map(n=>make(`leaf-${id}-${n}`,'leaves',[1.15,.18,.47],[x+(n-1)*.22,ground+.96+n*.12,z+(n-1)*.12],step,undefined,n===1?'#1dcf60':undefined,'leaf'))];}
function conifer(id:string,x:number,z:number,ground:number,step:number):BrickPart[]{return [
  make(`conifer-trunk-${id}`,'trunks',[.12,.12,.26],[x,ground+.13,z],step),
  ...[[.44,.3],[.34,.28],[.24,.26]].map(([r,h],n)=>make(`conifer-${id}-${n}`,'cone',[r*.25,r,h],[x,ground+.36+n*.24,z],step,undefined,n===1?'#22a04b':'#1a8a40'))];}
const bush=(id:string,x:number,z:number,ground:number,step:number,n=0)=>make(`bush-${id}`,'dot',[.2,.2,.16],[x,ground+.08,z],step,[1,1],n%2?C.lime:C.green);
const flower=(id:string,x:number,z:number,ground:number,step:number,color?:string)=>make(`flower-${id}`,'flowers',[.18,.18,.2],[x,ground+.1,z],step,[1,1],color,'cylinder');
function lamp(id:string,x:number,z:number,ground:number,step:number):BrickPart[]{return [
  make(`lamp-pole-${id}`,'pole',[.045,.045,.7],[x,ground+.35,z],step),
  make(`lamp-top-${id}`,'dot',[.12,.12,.1],[x,ground+.75,z],step,undefined,'#fff4c9')];}

/* ---------- 03 Lakehouse: the original 58 ids, kept stable, plus 68 detail pieces ---------- */
const lakehouse:BrickPart[]=[
  ...displayBase(8,7),
  make('lawn-right','landscape',[1.5,.16,6.1],[2.8,.46,0],2,[2,8]),
  make('lawn-left','landscape',[1.1,.16,2.7],[-2.95,.46,-1.35],2,[2,4]),
  ...[0,1,2].flatMap(x=>[0,1].map(z=>make(`water-${x}-${z}`,'water',[1.78,.14,1.4],[-2.05+x*1.8,.46,.95+z*1.42],2,undefined,z===0?'#28bce7':'#60d5ef'))),
  make('floor','walls',[4.7,.18,2.5],[-.25,.58,-1.25],3,[6,3]),
  ...[0,1,2,3].flatMap(y=>[0,1,2,3].map(x=>make(`wall-back-${y}-${x}`,'walls',[1.14,y===3?.3:.44,.52],[-1.98+x*1.17,y===3?2.2:.89+y*.46,-2.27],4,y===3?undefined:[2,1]))),
  ...[0,1,2,3].flatMap(y=>[0,1].map(z=>make(`wall-side-${y}-${z}`,'walls',[.52,y===3?.3:.44,1.05],[-2.32,y===3?2.2:.89+y*.46,-1.52+z*1.08],4,y===3?undefined:[1,2]))),
  ...[-1.25,.65,1.85].map((x,i)=>make(`pillar-${i}`,'walls',[.42,1.4,.42],[x,1.36,-.17],4,[1,1])),
  make('lintel','walls',[4.75,.23,.5],[-.25,2.16,-.17],4,[6,1]),
  // Glazing between the pillars: three rows of window frames.
  ...[0,1,2].flatMap(r=>[[-1.76,.58],[-.3,1.4],[1.25,.74]].map(([x,w],c)=>make(`window-${c}-${r}`,'window',[w,.44,.12],[x,.89+r*.46,-.17],4))),
  ...[0,1,2].flatMap(x=>[0,1].map(z=>make(`roof-${x}-${z}`,'roof',[1.8,.25,1.65],[-1.98+x*1.82,2.51,-1.95+z*1.67],5))),
  make('roof-edge-front','roof',[5.46,.16,.16],[-.16,2.3,.64],5),
  make('roof-edge-side','roof',[.16,.16,3.35],[2.53,2.3,-1.04],5),
  make('roof-cyan','accent',[1.76,.06,1.15],[1.66,2.67,.08],5),
  ...[0,1,2].map(i=>make(`roof-grille-${i}`,'grille',[.46,.08,1.0],[-2.5+i*.52,2.675,-.35],5)),
  make('skylight','round',[.48,.48,.3],[-.6,2.785,-2.1],5,[1,1]),
  make('roof-unit','brick1',[.52,.3,.52],[1.55,2.785,-2.25],5,[1,1],C.blue),
  ...[0,1,2,3,4,5].map(i=>make(`roof-rail-${i}`,'dot',[.1,.1,.14],[-2.7+i*.55,2.705,.45],5,undefined,C.white)),
  make('walk-horizontal','boardwalk',[4.4,.2,.68],[-.48,.66,.04],3),
  make('walk-vertical','boardwalk',[.7,.2,2.74],[.65,.66,1.56],3),
  make('plate-under','plate',[4.9,.16,2.7],[-.25,.41,-1.25],1,undefined,C.grey),
  make('nameplate','tile',[2.4,.04,.18],[0,.475,3.38],1,undefined,'#e8e8e2'),
  // Pool deck on the bare left strip: plate, round stepping tiles, steps into the water, mailbox and bin.
  make('deck-left','plate',[.8,.12,3.1],[-3.36,.38,1.72],2,undefined,C.light),
  ...[0,1].map(i=>make(`stone-${i}`,'round-tile',[.24,.24,.05],[-3.36,.465,.75+i*.6],2,undefined,C.grey)),
  ...[0,1].map(i=>make(`pool-step-${i}`,'slope',[.5,.18,.42],[-3.2,.53,1.85+i*.5],3,undefined,C.white,undefined,HALF)),
  make('mailbox','brick1',[.26,.34,.26],[-3.55,.61,2.95],6,[1,1],C.red),
  make('bin','brick1',[.26,.34,.26],[-3.55,.61,2.6],6,[1,1],C.blue),
  // Terrace on the right lawn: loungers, umbrella and table.
  ...[0,1].flatMap(i=>[make(`lounger-${i}`,'tile',[.42,.07,.9],[2.42,.575,2.55-i*1.95],5,undefined,C.white),make(`lounger-back-${i}`,'slope',[.42,.24,.3],[2.42,.73,2.9-i*1.95],5,undefined,C.white,undefined,Math.PI)]),
  make('umbrella-pole','pole',[.04,.04,.95],[3.1,1.015,2.4],5,undefined,'#e8e8e2'),
  make('umbrella','cone',[.06,.58,.3],[3.1,1.6,2.4],5,undefined,C.red),
  make('table','round-tile',[.3,.3,.07],[3.1,.92,2.4],5,undefined,C.white),
  ...[[-2.95,-1.45],[2.87,-.5]].flatMap(([x,z],i)=>[
    make(`trunk-${i}`,'trunks',[.27,.27,.8],[x,.97,z],6),
    ...[0,1,2].map(n=>make(`leaf-${i}-${n}`,'leaves',[1.15,.18,.47],[x+(n-1)*.22,1.5+n*.12,z+(n-1)*.12],6,undefined,n===1?'#1dcf60':undefined,'leaf')),
  ]),
  ...tree('back',2.9,-2.45,.54,6),
  ...conifer('left',-3.15,-.3,.54,6),
  ...[[-2.6,.12],[2.77,1.65],[2.98,1.38]].map(([x,z],i)=>make(`flower-${i}`,'flowers',[.18,.18,.2],[x,.68,z],6,[1,1],i===0?'#ef7357':undefined,'cylinder')),
  ...[[3.4,-.95,C.yellow],[2.25,-1.25,C.white],[3.4,1.0,C.red],[-3.4,-1.95,C.yellow],[-2.55,-.75,C.red],[2.25,3.0,C.white]].map(([x,z,c],i)=>flower(String(i+3),x as number,z as number,.58,6,c as string)),
  ...[[2.3,-1.7],[3.3,-1.45],[3.35,.35],[2.3,1.35],[3.35,3.0],[-2.6,-2.5],[-3.4,-2.4],[-2.6,-.25]].map(([x,z],i)=>bush(String(i),x,z,.54,6,i)),
  ...lamp('deck',-3.55,.35,.44,6),...lamp('lawn',3.4,1.95,.54,6),
];

/* ---------- 02 OneLake ---------- */
const onelake:BrickPart[]=[
  ...displayBase(8,7),
  make('lawn-back','landscape',[7.2,.16,2.0],[0,.46,-2.2],2),
  make('lawn-left','landscape',[1.1,.16,4.6],[-3.0,.46,1.0],2,[2,8]),
  make('lawn-right','landscape',[1.1,.16,4.6],[3.0,.46,1.0],2,[2,8]),
  ...[0,1,2,3].flatMap(x=>[0,1].map(z=>make(`water-${x}-${z}`,'water',[1.22,.14,1.48],[-1.83+x*1.22,.46,.35+z*1.5],2,undefined,(x+z)%2?'#60d5ef':'#28bce7'))),
  ...[0,1,2,3].map(x=>make(`pool-edge-${x}`,'tile',[1.2,.12,.56],[-1.83+x*1.22,.41,2.95],2,undefined,C.white)),
  make('promenade','boardwalk',[4.9,.18,.78],[0,.46,-.8],2),
  // Shared store: a grey hall with an arched door and a pitched roof.
  ...[0,1].flatMap(r=>[0,1,2].filter(c=>!(r===0&&c===1)).map(c=>make(`hall-wall-${r}-${c}`,'walls',[1.0,.44,.4],[.4+c*1.0,.76+r*.44,-1.55],3,[2,1],C.light))),
  make('hall-door','arch',[1.0,.44,.4],[1.4,.76,-1.55],3,[2,1],C.light),
  ...[0,1].map(r=>make(`hall-side-${r}`,'walls',[.4,.44,1.6],[2.7,.76+r*.44,-2.35],3,[1,3],C.light)),
  ...[0,1,2].flatMap(c=>[make(`hall-roof-front-${c}`,'slope',[1.0,.4,.8],[.4+c*1.0,1.62,-1.95],5,[2,1],C.grey),make(`hall-roof-back-${c}`,'slope',[1.0,.4,.8],[.4+c*1.0,1.62,-2.75],5,[2,1],C.grey,undefined,Math.PI)]),
  ...[0,1].map(i=>make(`hall-vent-${i}`,'grille',[.8,.08,.3],[.65+i*1.5,1.86,-2.35],5,undefined,C.dark)),
  // Lake tower: stacked round bricks in two blues with a white dome.
  ...[0,1,2,3].map(k=>make(`tower-${k}`,'round',[.62,.62,.44],[-2.3,.76+k*.44,-2.3],4,undefined,k%2?'#2b8af0':C.blue)),
  make('tower-ring','round-tile',[.66,.66,.08],[-2.3,2.34,-2.3],5,undefined,C.white),
  make('tower-dome','cone',[.2,.52,.3],[-2.3,2.53,-2.3],5,undefined,C.white),
  make('tower-light','dot',[.12,.12,.1],[-2.3,2.73,-2.3],5,undefined,C.red),
  ...[0,1].map(k=>make(`tank-${k}`,'round',[.38,.38,.44],[3.0,.76+k*.44,2.6],4,undefined,k?C.white:C.red)),
  make('tank-cap','round-tile',[.4,.4,.08],[3.0,1.46,2.6],5,undefined,C.red),
  ...[0,1].map(i=>make(`bench-${i}`,'tile',[.8,.07,.25],[-.9+i*1.8,.59,-.98],6,undefined,C.white)),
  ...tree('a',-3.0,.25,.54,6),...conifer('b',-3.0,2.45,.54,6),...tree('c',3.0,.3,.54,6),
  ...[[-2.75,-.95],[-3.3,1.3],[2.75,1.35],[3.35,1.75],[-1.2,-2.6],[-1.0,-1.6]].map(([x,z],i)=>bush(String(i),x,z,.54,6,i)),
  ...[[-2.7,1.25,C.red],[3.3,-1.0,C.yellow],[2.7,1.95,C.white],[-3.35,3.1,C.red],[-1.55,-2.9,C.yellow]].map(([x,z,c],i)=>flower(String(i),x as number,z as number,.54,6,c as string)),
  ...lamp('w',-2.2,-.8,.55,6),...lamp('e',2.2,-.8,.55,6),
];

/* ---------- 01 Power BI report: a stepped yellow tower of bars ---------- */
const columnColors=['#f7d65a','#f2c230','#e3a71b'];
const powerbi:BrickPart[]=[
  make('bi-base','display-base',[5.4,.3,4.2],[0,.15,0],1),
  make('bi-stand','plate',[4.6,.12,3.4],[0,.36,0],1,undefined,'#2b2e30'),
  ...[3,5,7].flatMap((n,i)=>Array.from({length:n},(_,k)=>[0,1].map(z=>make(`bi-bar-${i}-${k}-${z}`,'brick',[1.1,.44,1.1],[-1.25+i*1.25,.64+k*.44,.35-i*.35+(z-.5)*1.1],i+2,[2,2],columnColors[i]))).flat()),
  ...[3,5,7].map((n,i)=>make(`bi-cap-${i}`,'curve',[.55,.55,2.2],[-1.25+i*1.25,.42+n*.44,.35-i*.35],5,undefined,columnColors[i],undefined,[HALF,0,0])),
  ...[0,1,2].map(i=>make(`bi-label-${i}`,'tile',[.9,.05,.22],[-1.25+i*1.25,.445,1.58],6,undefined,'#e8e8e2')),
  ...[-1.9,-.65,.65,1.9].map((x,i)=>make(`bi-stud-${i}`,'dot',[.12,.12,.08],[x,.46,-1.6],6,undefined,columnColors[i%3])),
];

/* ---------- 04 Warehouse ---------- */
const warehouse:BrickPart[]=[
  ...displayBase(8,7),
  make('floor','plate',[6,.12,4.4],[0,.38,-.6],2,undefined,C.grey),
  make('apron','tile',[6,.06,1.3],[0,.35,2.35],2,undefined,'#3a3d3f'),
  ...[0,1,2,3,4].filter(c=>c!==2).map(c=>make(`front-${c}`,'walls',[1.04,.44,.4],[-2.08+c*1.04,.66,.55],3,[2,1],C.light)),
  make('front-door','arch',[1.04,.44,.4],[0,.66,.55],3,[2,1],C.light),
  ...[0,1,2,3,4].map(c=>c%2?make(`front-window-${c}`,'window',[1.04,.44,.16],[-2.08+c*1.04,1.1,.55],3):make(`front-top-${c}`,'walls',[1.04,.44,.4],[-2.08+c*1.04,1.1,.55],3,[2,1],C.light)),
  ...[0,1].flatMap(r=>[make(`side-r-${r}`,'walls',[.4,.44,3.2],[2.4,.66+r*.44,-1.05],3,[1,5],C.light),make(`side-l-${r}`,'walls',[.4,.44,3.2],[-2.4,.66+r*.44,-1.05],3,[1,5],C.light)]),
  make('side-window','window',[.16,.44,1.0],[2.4,1.1,-1.05],3),
  ...[0,1,2,3,4].flatMap(c=>[make(`roof-front-${c}`,'slope',[1.04,.5,1.3],[-2.08+c*1.04,1.57,.0],5,[2,1],C.grey),make(`roof-back-${c}`,'slope',[1.04,.5,1.3],[-2.08+c*1.04,1.57,-2.1],5,[2,1],C.grey,undefined,Math.PI)]),
  make('roof-ridge','roof',[5.2,.16,.8],[0,1.74,-1.05],5),
  ...[0,1].map(i=>make(`roof-grille-${i}`,'grille',[.8,.08,.36],[-1.9+i*1.9,1.86,-1.05],5)),
  ...[0,1].map(i=>make(`roof-unit-${i}`,'round',[.26,.26,.24],[-.95+i*1.9,1.94,-1.05],5,[1,1],C.light)),
  make('roof-cyan','accent',[.9,.06,.6],[1.9,1.85,-1.05],6,undefined,'#9062d5'),
  ...[[0,0],[1,0],[0,1],[1,1]].map(([x,y],i)=>make(`crate-${i}`,'brick',[.55,.44,.55],[2.6+x*.58,.6+y*.44,2.25],4,[2,2],i%2?'#a8743f':'#bf8a4e')),
  make('forklift','brick12',[.36,.36,.7],[-2.5,.53,2.3],4,[1,2],C.yellow),
  ...[0,1].map(i=>make(`forklift-wheel-${i}`,'dot',[.12,.12,.08],[-2.69,.44,2.05+i*.5],4,undefined,C.black,undefined,[0,0,HALF])),
  make('forklift-mast','pole',[.04,.04,.6],[-2.5,.71,1.9],4,undefined,C.dark),
  ...tree('a',-3.3,-2.6,.32,6),...conifer('b',3.3,-2.6,.32,6),
  ...[[-3.4,-1.2],[3.45,-1.4],[-3.45,.3],[3.45,.6]].map(([x,z],i)=>bush(String(i),x,z,.32,6,i)),
  ...lamp('a',-1.5,2.85,.38,6),...lamp('b',1.5,2.85,.38,6),
];

/* ---------- 05 Eventhouse: a striped beacon tower and keeper house by the water ---------- */
const eventhouse:BrickPart[]=[
  ...displayBase(6.4,6),
  ...[0,1].flatMap(x=>[0,1,2].map(z=>make(`water-${x}-${z}`,'water',[1.15,.14,1.3],[1.27+x*1.16,.46,-.4+z*1.35],2,undefined,(x+z)%2?'#60d5ef':'#28bce7'))),
  make('island','landscape',[3.6,.16,5.2],[-1.25,.46,0],2,[4,6]),
  make('lawn-back','landscape',[2.9,.16,1.6],[1.55,.46,-1.9],2),
  ...[[0,0],[1,0],[0,1],[1,1]].map(([a,b],i)=>make(`rock-${i}`,'slope',[.6,.3,.5],[.5+a*.55,.59,-.6+b*.5+(i===3?.1:0)],2,undefined,'#6c7073',undefined,i*HALF)),
  ...[0,1].map(c=>make(`house-wall-${c}`,'walls',[.62,.44,.4],[-2.2+c*1.24,.76,1.2],3,[1,1],C.white)),
  make('house-door','arch',[.62,.44,.4],[-1.58,.76,1.2],3,[1,1],C.white),
  make('house-wall-top','walls',[.62,.44,.4],[-1.58,1.2,1.2],3,[1,1],C.white),
  ...[0,1].map(c=>make(`house-window-${c}`,'window',[.62,.44,.12],[-2.2+c*1.24,1.2,1.2],3)),
  ...[0,1].map(r=>make(`house-side-${r}`,'walls',[.4,.44,.6],[-.85,.76+r*.44,.7],3,[1,1],C.white)),
  ...[0,1].flatMap(c=>[make(`house-roof-f-${c}`,'slope',[.93,.4,.7],[-2.04+c*.93,1.62,1.25],5,[2,1],C.red),make(`house-roof-b-${c}`,'slope',[.93,.4,.7],[-2.04+c*.93,1.62,.55],5,[2,1],C.red,undefined,Math.PI)]),
  ...[0,1,2,3,4].map(k=>make(`tower-${k}`,'round',[.5,.5,.44],[-1.0,.76+k*.44,-1.4],4,undefined,k%2?C.white:C.red)),
  make('tower-gallery','round-tile',[.62,.62,.08],[-1.0,2.78,-1.4],5,undefined,C.black),
  make('tower-lantern','round',[.34,.34,.36],[-1.0,3.0,-1.4],5,undefined,'#ffd75e'),
  make('tower-roof','cone',[.08,.44,.36],[-1.0,3.36,-1.4],5,undefined,C.red),
  make('tower-vane','dot',[.08,.08,.1],[-1.0,3.59,-1.4],5,undefined,C.black),
  ...conifer('a',-2.4,-1.9,.54,6),
  ...[[-2.5,-.4],[-.3,-2.1],[2.6,-1.9]].map(([x,z],i)=>bush(String(i),x,z,.54,6,i)),
  ...[[-2.65,.3,C.yellow],[-.25,.35,C.red],[1.9,-2.2,C.white]].map(([x,z,c],i)=>flower(String(i),x as number,z as number,.54,6,c as string)),
];

/* ---------- 06 SQL database: stacked drums with status lights ---------- */
const sqldb:BrickPart[]=[
  ...displayBase(6,5.6),
  make('plinth','plate',[4.8,.12,4.2],[0,.38,0],2,undefined,C.light),
  make('lawn','landscape',[1.1,.16,4.2],[2.15,.52,0],2,[2,6]),
  ...[0,1,2,3,4].map(k=>make(`drum-${k}`,'round',[1.15,1.15,.44],[-.7,.66+k*.48,-.2],3,undefined,k%2?'#2f7de1':'#1d5fbf')),
  ...[0,1,2,3].map(k=>make(`drum-band-${k}`,'round-tile',[1.17,1.17,.04],[-.7,.9+k*.48,-.2],3,undefined,C.white)),
  make('drum-lid','round-tile',[1.15,1.15,.08],[-.7,2.84,-.2],5,undefined,'#e8eef6'),
  ...[0,1,2].map(i=>make(`lid-grille-${i}`,'grille',[.9,.06,.3],[-.7,2.91,-.6+i*.4],5)),
  ...[0,1,2].map(k=>make(`mini-drum-${k}`,'round',[.48,.48,.44],[.9,.66+k*.44,1.5],4,undefined,k%2?'#2f7de1':'#1d5fbf')),
  make('mini-lid','round-tile',[.5,.5,.08],[.9,1.98,1.5],5,undefined,C.white),
  ...[0,1,2].map(k=>make(`rack-${k}`,'brick',[.55,.44,.55],[1.15,.66+k*.44,-1.5],4,[2,2],C.dark)),
  ...[0,1,2].map(k=>make(`rack-led-${k}`,'dot',[.07,.07,.06],[1.15,.7+k*.44,-1.2],6,undefined,k===1?C.yellow:'#4ce07a',undefined,[HALF,0,0])),
  ...[0,1,2].map(i=>make(`lid-led-${i}`,'dot',[.09,.09,.08],[-1.5+i*.3,2.92,.55],6,undefined,'#4ce07a')),
  ...[[2.0,-1.6],[2.35,-.6],[1.85,.6],[2.35,1.6]].map(([x,z],i)=>bush(String(i),x,z,.6,6,i)),
];

/* ---------- 07 Medallion architecture: bronze, silver and gold towers ---------- */
const medal=[{id:'bronze',color:'#b0703c',n:3},{id:'silver',color:'#b9bec3',n:4},{id:'gold',color:'#e3b23c',n:5}];
const medallion:BrickPart[]=[
  ...displayBase(8,6),
  make('plaza','plate',[7.2,.12,3.4],[0,.38,-.9],2,undefined,C.light),
  ...[0,1,2].map(x=>make(`water-${x}`,'water',[2.3,.14,1.3],[-2.4+x*2.4,.41,1.45],2,undefined,x%2?'#60d5ef':'#28bce7')),
  make('lawn-front','landscape',[7.2,.16,.9],[0,.46,2.55],2),
  ...[0,1].map(i=>make(`bridge-${i}`,'boardwalk',[.6,.12,1.5],[-1.2+i*2.4,.54,1.45],2)),
  make('promenade','boardwalk',[6.4,.08,.5],[0,.48,.5],2),
  ...medal.flatMap((m,i)=>[
    make(`${m.id}-plinth`,'plate',[1.4,.12,1.4],[-2.4+i*2.4,.5,-1.2],i+3,undefined,C.dark),
    ...Array.from({length:m.n},(_,k)=>make(`${m.id}-${k}`,'round',[.5,.5,.44],[-2.4+i*2.4,.78+k*.44,-1.2],i+3,undefined,m.color)),
    make(`${m.id}-cap`,'cone',[.12,.5,.4],[-2.4+i*2.4,.76+m.n*.44,-1.2],i+3,undefined,m.color),
    make(`${m.id}-tip`,'dot',[.09,.09,.1],[-2.4+i*2.4,1.01+m.n*.44,-1.2],i+3,undefined,C.white)]),
  ...tree('a',-3.3,2.55,.54,6),...conifer('b',3.3,2.55,.54,6),
  ...[[-1.9,2.6],[-.5,2.55],[.9,2.6],[2.2,2.5]].map(([x,z],i)=>bush(String(i),x,z,.54,6,i)),
  ...lamp('a',-1.2,-.2,.44,6),...lamp('b',1.2,-.2,.44,6),
];

/* ---------- 08 Pipeline: three stations joined by pipes ---------- */
const stationColors=['#37b9d2','#976de2','#f1b344'];
const pipeline:BrickPart[]=[
  ...displayBase(8,5),
  ...[0,1,2].map(i=>make(`pad-${i}`,'plate',[2.0,.12,2.2],[-2.5+i*2.5,.38,0],i+2,undefined,C.light)),
  ...[0,1,2].flatMap(i=>[
    ...[0,1].map(r=>make(`station-${i}-${r}`,'walls',[1.6,.44,1.6],[-2.5+i*2.5,.66+r*.44,-.1],i+2,[3,3],C.white)),
    make(`station-top-${i}`,'accent',[1.45,.3,1.45],[-2.5+i*2.5,1.25,-.1],i+3,[2,2],stationColors[i]),
    make(`station-grille-${i}`,'grille',[1.0,.06,.3],[-2.5+i*2.5,.88,.73],i+2,undefined,C.dark,undefined,[HALF,0,0]),
    make(`station-tank-${i}`,'round',[.3,.3,.5],[-2.5+i*2.5+.55,1.65,-.5],i+3,[1,1],stationColors[i]),
    ...[0,1].map(n=>make(`status-${i}-${n}`,'dot',[.08,.08,.06],[-2.5+i*2.5-.5+n*.25,1.0,.73],6,undefined,n?'#22ba87':C.yellow,undefined,[HALF,0,0]))]),
  ...[0,1].flatMap(i=>[0,1].map(n=>make(`pipe-${i}-${n}`,'pole',[.09,.09,.95],[-1.25+i*2.5,.8+n*.32,-.1],5,undefined,n?'#8c9096':'#6c7073',undefined,[0,0,HALF]))),
  ...[0,1].map(i=>make(`valve-${i}`,'round',[.15,.15,.12],[-1.25+i*2.5,1.27,-.1],5,undefined,C.red)),
  ...[0,1,2].map(i=>make(`flower-${i}`,'flowers',[.19,.19,.14],[-2.5+i*2.5,.43,1.75],6,undefined,'#22ba87','cylinder')),
  ...[[-3.5,-1.8],[3.5,-1.8],[-3.5,1.8],[3.5,1.8]].map(([x,z],i)=>bush(String(i),x,z,.32,6,i)),
];

/* ---------- 09 Notebook: an open book of code lines ---------- */
const notebook:BrickPart[]=[
  ...displayBase(7,5),
  make('book-spine','accent',[.35,.35,3.6],[0,.64,0],2,undefined,'#9b69d6'),
  ...[-1,1].flatMap((side,i)=>[
    make(`book-cover-${i}`,'accent',[2.65,.18,3.6],[side*1.5,.51,0],2,undefined,'#9062d5'),
    make(`book-stack-${i}`,'plate',[2.5,.1,3.3],[side*1.48,.65,0],3,undefined,'#ece9dd'),
    make(`book-page-${i}`,'walls',[2.5,.14,3.3],[side*1.48,.77,0],3,undefined,'#fbfaf4'),
    ...[0,1,2,3].flatMap(n=>[make(`code-${i}-${n}`,'water',[1.45-(n%3)*.3,.08,.2],[side*1.48+.18-((n%3)*.15),.88,-1.1+n*.6],4+Math.floor(n/2)+(i?1:0)>6?6:4+Math.floor(n/2)+(i?1:0),undefined,i===0?['#646b73','#22b8b2','#646b73','#e0632f'][n]:['#22b8b2','#9062d5','#22b8b2','#646b73'][n]),
      make(`bullet-${i}-${n}`,'dot',[.07,.07,.06],[side*1.48-.95,.87,-1.1+n*.6],4,undefined,'#9aa094')])]),
  make('bookmark','tile',[.18,.04,1.0],[.3,.86,-1.9],6,undefined,C.red),
  make('table-grille','grille',[.9,.06,.5],[1.48,.87,1.35],6,undefined,'#c9ccd0'),
  make('sticky-note','tile',[.5,.05,.5],[-2.2,.88,1.35],6,undefined,'#ffe36e'),
  make('pen','pole',[.07,.07,1.6],[2.95,.39,.2],6,undefined,C.yellow,undefined,[HALF,0,0]),
  make('pen-tip','cone',[.01,.07,.18],[2.95,.39,1.09],6,undefined,C.black,undefined,[HALF,0,0]),
  make('mug','round',[.25,.25,.5],[-3.0,.57,-2.0],6,[1,1],C.white),
];

/* ---------- 10 Real-Time Intelligence: a signal of red bricks on a stand ---------- */
const front=[1,1,2,5,2,4,1,1],back=[1,2,1,3,1,2,1,1];
const rti:BrickPart[]=[
  make('rti-base','display-base',[6.4,.3,2.8],[0,.15,0],1),
  make('rti-stand','plate',[5.8,.12,2.2],[0,.36,0],2,undefined,'#2b2e30'),
  ...front.flatMap((n,i)=>Array.from({length:n},(_,k)=>make(`signal-${i}-${k}`,'brick12',[.56,.44,1.1],[-2.45+i*.7,.64+k*.44,.45],3,[1,2],k===n-1&&n>1?'#e5394c':C.red))),
  ...back.flatMap((n,i)=>Array.from({length:n},(_,k)=>make(`echo-${i}-${k}`,'brick12',[.56,.44,.56],[-2.45+i*.7,.64+k*.44,-.55],4,[1,1],'#a51d2d'))),
  ...[3,5,2].map(i=>make(`peak-${i}`,'slope',[.56,.36,.56],[-2.45+i*.7,.6+front[i]*.44,.18],5,[1,1],C.orange)),
  ...front.map((n,i)=>make(`point-${i}`,'dot',[.12,.12,.08],[-2.45+i*.7,.46+n*.44,.72],6,undefined,C.white)),
  ...[0,1].map(i=>make(`rti-grille-${i}`,'grille',[1.6,.06,.3],[-1.4+i*2.8,.45,1.2],6,undefined,'#5a5e61')),
];

/* ---------- 11 Data Warehouse: a stepped blue ziggurat ---------- */
const tierColors=['#1b5fbf','#2a74d6','#3b8be8','#5aa7f5'];
const datawarehouse:BrickPart[]=[
  make('dw-base','display-base',[5.2,.3,5.2],[0,.15,0],1),
  make('dw-stand','plate',[4.4,.1,4.4],[0,.35,0],1,undefined,'#2b2e30'),
  ...[0,1,2,3].flatMap(k=>{const s=3.6-.8*k;return [[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b],q)=>make(`tier-${k}-${q}`,'brick',[s/2,.44,s/2],[a*s/4,.62+k*.44,b*s/4],Math.min(4,k+2),[Math.max(1,Math.round(s/1.1)),Math.max(1,Math.round(s/1.1))],tierColors[k]));}),
  ...[0,1,2].flatMap(k=>{const s=3.6-.8*(k+1),y=.62+(k+1)*.44-.04;return [0,1,2,3].map(side=>make(`ledge-${k}-${side}`,'slope',[s,.3,.4],[Math.sin(side*HALF)*(s/2+.2),y,Math.cos(side*HALF)*(s/2+.2)],5,undefined,tierColors[k+1],undefined,side*HALF));}),
  make('dw-top','round-tile',[.5,.5,.08],[0,2.26,0],5,undefined,'#bfe0ff'),
  ...[[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b],i)=>make(`dw-light-${i}`,'dot',[.1,.1,.08],[a*1.75,.88,b*1.75],6,undefined,C.white)),
];

/* ---------- 12 Microsoft Fabric: woven threads and three rising ribbons (abstract, not a logo) ---------- */
const ribbonColors=['#0c8a6f','#17b890','#5fd3b3'];
const fabric:BrickPart[]=[
  make('fab-base','display-base',[6.4,.3,3.6],[0,.15,0],1),
  make('fab-stand','plate',[5.8,.12,3.0],[0,.36,0],1,undefined,'#2b2e30'),
  ...[0,1,2,3,4].map(i=>make(`warp-${i}`,'tile',[.4,.1,2.6],[-1.8+i*.9,.47,.1],2,undefined,i%2?'#0f6e5a':'#139a7c')),
  ...[0,1,2,3].map(j=>make(`weft-${j}`,'tile',[4.2,.1,.36],[0,.57,-.9+j*.66],3,undefined,j%2?'#7ee0c4':'#3fc39f')),
  ...ribbonColors.flatMap((c,r)=>[0,1,2,3,4,5].map(k=>make(`ribbon-${r}-${k}`,'brick',[.7,.44,.7],[-1.9+k*.75+r*.15,.86+Math.round(Math.sin((k+r)*.7)*2+2)*.22+r*.66,-.5-r*.25],r?5:4,[1,1],c))),
  ...ribbonColors.map((c,r)=>{const bottom=.64+Math.round(Math.sin((2+r)*.7)*2+2)*.22+r*.66;return make(`ribbon-post-${r}`,'pole',[.06,.06,bottom-.42],[-.4+r*.15,.42+(bottom-.42)/2,-.5-r*.25],r?5:4,undefined,'#2b2e30');}),
  ...[0,1,2,3].map(i=>make(`fab-dot-${i}`,'dot',[.1,.1,.08],[-2.4+i*1.6,.46,1.3],6,undefined,'#bdf2e2')),
];

/* ---------- catalogue (order and numbering follow the collection panel) ---------- */
export const kits=[
  {id:'powerbi' as KitId,title:'Power BI report',category:'Business intelligence',subtitle:'Make the bigger picture tangible.',description:'Three bright columns step up into a playful tower of bars.',parts:powerbi,number:'01'},
  {id:'onelake' as KitId,title:'OneLake',category:'Data foundation',subtitle:'One place. Endless possibilities.',description:'A shared lake for every team. Explore a small, connected landscape of data.',parts:onelake,number:'02'},
  {id:'lakehouse' as KitId,title:'Lakehouse',category:'Data engineering',subtitle:'A little architecture. A whole world of data.',description:'A home for structured and unstructured data, built one brick at a time.',parts:lakehouse,number:'03'},
  {id:'warehouse' as KitId,title:'Warehouse',category:'Data warehousing',subtitle:'Organize the essentials.',description:'A compact warehouse with a pitched roof, a loading dock and individual storage crates.',parts:warehouse,number:'04'},
  {id:'eventhouse' as KitId,title:'Eventhouse',category:'Real-time analytics',subtitle:'Catch every signal.',description:'A striped beacon tower and a keeper house watch the water for incoming events.',parts:eventhouse,number:'05'},
  {id:'sqldb' as KitId,title:'SQL database',category:'Databases',subtitle:'Rows, stacked neatly.',description:'Stacked blue drums, a replica and a rack of status lights on a pale plinth.',parts:sqldb,number:'06'},
  {id:'medallion' as KitId,title:'Medallion architecture',category:'Data engineering',subtitle:'Refine, layer by layer.',description:'Bronze, silver and gold towers rise along a quiet canal.',parts:medallion,number:'07'},
  {id:'pipeline' as KitId,title:'Pipeline',category:'Data integration',subtitle:'Connect the pieces.',description:'Three connected stations make a small, colorful route from source to destination.',parts:pipeline,number:'08'},
  {id:'notebook' as KitId,title:'Notebook',category:'Data science',subtitle:'Open a new chapter.',description:'An open notebook built from covers, pages and tiny lines of code. Select each layer to look inside.',parts:notebook,number:'09'},
  {id:'rti' as KitId,title:'Real-Time Intelligence',category:'Real-time analytics',subtitle:'Feel the pulse.',description:'A signal of red bricks with an echo behind it, peaking on a dark stand.',parts:rti,number:'10'},
  {id:'datawarehouse' as KitId,title:'Data Warehouse',category:'Data warehousing',subtitle:'Built in tiers.',description:'A stepped blue ziggurat of bricks and slopes, lit at its corners.',parts:datawarehouse,number:'11'},
  {id:'fabric' as KitId,title:'Microsoft Fabric',category:'Platform',subtitle:'Everything, woven together.',description:'Woven threads and three rising ribbons: an abstract study, not a logo.',parts:fabric,number:'12'},
];
/** Identity of a piece's look (what a thumbnail depends on); equal keys render identical thumbnails. */
export const thumbKey=(p:BrickPart)=>[p.lot,p.shape??'box',p.size.join(','),p.color,(p.studs??[]).join('x'),(p.rot??[]).join(',')].join('|');
/** The piece that represents a lot in a kit's parts list. */
export const lotPiece=(id:string,lot:string)=>getKit(id).parts.find(p=>p.lot===lot)!;
/**
 * Individual piece selection is stored as a 1-based ordinal inside the current kit (0 = none): the framework caps select
 * fields at 100 options, and twelve detailed kits hold several hundred pieces. The ordinal resolves to the same stable
 * semantic piece id because kit parts are authored in a fixed order.
 */
export const pieceIndex=(kit:string,id:string)=>getKit(kit).parts.findIndex(p=>p.id===id)+1;
export const pieceAt=(kit:string,n:number)=>n>0?getKit(kit).parts[n-1]:undefined;
export const MAX_PIECES=Math.max(...kits.map(k=>k.parts.length));
export const pieceIds=[...new Set(kits.flatMap(k=>k.parts.map(p=>p.id)))];
export const getKit=(id:string)=>kits.find(k=>k.id===id)??kits[2];
export function getBOM(id:string){const kit=getKit(id);return lots.map(l=>({...l,color:kit.parts.find(p=>p.lot===l.id)?.color??l.color,quantity:kit.parts.filter(p=>p.lot===l.id).length})).filter(l=>l.quantity>0);}
export function kitCost(id:string){return getBOM(id).reduce((s,l)=>s+l.price*l.quantity,0);}
/** Height of the assembled kit, used to frame tall sculptures. */
export function kitTop(id:string){return Math.max(...getKit(id).parts.map(p=>p.position[1]+(p.shape==='cylinder'||p.shape==='cone'?p.size[2]:p.size[1])/2));}
export function makeKitScene(id:string):SceneSpec{
  const kit=getKit(id),top=kitTop(id),lift=Math.max(0,top-2.8)*.45;
  const parts:ScenePart[]=kit.parts.map(p=>({id:p.id,parent:null,entity:p.lot,shape:'group',size:p.size,position:p.position,rotation:[0,0,0],explode:[0,(p.step-1)*.72,0],color:p.color}));
  return {format:'datapass.scene3d',version:1,title:kit.title+' synthetic brick kit',note:'Synthetic procedural geometry only. Reference-inspired visual study; dimensions, parts and costs are illustrative.',parts,
    // Scene entities are part types (the framework caps a scene at 64 entities); picking still resolves the individual piece id from the mesh.
    entities:getBOM(id).map(l=>({id:l.id,label:l.quantity+'× '+l.name+' '+l.code,description:'Synthetic part type '+l.id})),
    cameras:[{id:'overview',label:'Complete kit',position:[11.3,9.2+lift,13.9],target:[0,1.05+lift,0]},{id:'exploded',label:'Layered kit',position:[13,12+lift,16],target:[0,2.75+lift,0]},
      {id:'near',label:'Zoom in',position:[7,6,8.5],target:[0,1.5,0]}, {id:'far',label:'Zoom out',position:[17,14,21],target:[0,2,0]},
      {id:'focus-a',label:'Selected piece',position:[6,5,8],target:[0,1,0]}, {id:'focus-b',label:'Selected piece',position:[6,5,8],target:[0,1,0]}]};
}
/** Collection layout: rows of 5, 4 and 3 kits, like a display shelf seen from the front. */
const ROWS=[5,4,3];
export const collectionSlot=(i:number):Vec3=>{let r=0,start=0;while(i>=start+ROWS[r]){start+=ROWS[r];r++;}const c=i-start;return [(c-(ROWS[r]-1)/2)*10.5,0,(r-1)*10];};
export const collectionScene:SceneSpec={format:'datapass.scene3d',version:1,title:'Twelve synthetic Fabric kits',note:'Synthetic procedural geometry only.',
  parts:kits.map((k,i)=>({id:k.id,parent:null,entity:k.id,shape:'group',size:[8,5,7],position:collectionSlot(i),rotation:[0,0,0],explode:[0,0,0],color:'#ffffff'})),
  entities:kits.map(k=>({id:k.id,label:k.title,description:k.description})),cameras:[{id:'overview',label:'Collection plan',position:[25,38,54],target:[-4,0,1]}]};
export const kitScenes=Object.fromEntries(kits.map(k=>[k.id,makeKitScene(k.id)])) as Record<KitId,SceneSpec>;
/** Build progression hides future pieces below the stage; the shared renderer interpolates these offsets. */
export function stepOffsets(id:string,step:number){return Object.fromEntries(getKit(id).parts.filter(p=>p.step>step).map(p=>[p.id,{position:[0,-80,0] as Vec3}]));}

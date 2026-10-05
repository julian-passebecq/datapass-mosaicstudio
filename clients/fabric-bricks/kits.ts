import type {SceneSpec,ScenePart,Vec3} from '../../src/framework/scene.ts';

export type KitId='lakehouse'|'onelake'|'powerbi'|'warehouse'|'pipeline'|'notebook';
export type BrickPart={id:string;lot:string;name:string;color:string;size:Vec3;position:Vec3;step:number;studs?:[number,number];shape?:'box'|'cylinder'|'leaf'};
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
] as const;
export const buildSteps=['Foundation','Water & landscape','Ground floor','Walls & windows','Roof & terrace','Trees & details'];
export function getBuildSteps(id:string){return ({onelake:['Foundation','Lake & banks','Shared store','Lake tower','Covers','Landscape details'],powerbi:['Foundation','First column','Second column','Third column','Review structure','Front details'],warehouse:['Foundation','Floor & loading dock','Warehouse walls','Storage crates','Roof panels','Accent tile'],pipeline:['Foundation','Source station','Transform station','Destination station','Connections & caps','Status indicators'],notebook:['Foundation','Covers & spine','Open pages','First code lines','Second code lines','Final code lines']} as Record<string,string[]>)[id]??buildSteps;}
const make=(id:string,lot:string,size:Vec3,position:Vec3,step:number,studs?:[number,number],color?:string,shape?:BrickPart['shape']):BrickPart=>({id,lot,name:lots.find(l=>l.id===lot)!.name,color:color??lots.find(l=>l.id===lot)!.color,size,position,step,studs,shape});
const lakehouse:BrickPart[]=[
  make('base','display-base',[8,.32,7],[0,.16,0],1),
  make('base-front','display-base',[8,.13,.22],[0,.39,3.38],1),
  make('base-left','display-base',[.22,.13,6.6],[-3.89,.39,0],1),
  make('base-right','display-base',[.22,.13,6.6],[3.89,.39,0],1),
  make('base-back','display-base',[8,.13,.22],[0,.39,-3.38],1),
  make('lawn-right','landscape',[1.5,.16,6.1],[2.8,.46,0],2,[2,8]),
  make('lawn-left','landscape',[1.1,.16,2.7],[-2.95,.46,-1.35],2,[2,4]),
  ...[0,1,2].flatMap(x=>[0,1].map(z=>make(`water-${x}-${z}`,'water',[1.78,.14,1.4],[-2.05+x*1.8,.46,.95+z*1.42],2,undefined,z===0?'#28bce7':'#60d5ef'))),
  make('floor','walls',[4.7,.18,2.5],[-.25,.58,-1.25],3,[6,3]),
  ...[0,1,2].flatMap(y=>[0,1,2,3].map(x=>make(`wall-back-${y}-${x}`,'walls',[1.14,.44,.52],[-1.98+x*1.17,.89+y*.46,-2.27],4,[2,1]))),
  ...[0,1,2].flatMap(y=>[0,1].map(z=>make(`wall-side-${y}-${z}`,'walls',[.52,.44,1.05],[-2.32,.89+y*.46,-1.52+z*1.08],4,[1,2]))),
  ...[-1.25,.65,1.85].map((x,i)=>make(`pillar-${i}`,'walls',[.42,1.4,.42],[x,1.36,-.17],4,[1,1])),
  make('lintel','walls',[4.75,.23,.5],[-.25,2.16,-.17],4,[6,1]),
  ...[0,1,2].flatMap(x=>[0,1].map(z=>make(`roof-${x}-${z}`,'roof',[1.8,.25,1.65],[-1.98+x*1.82,2.51,-1.95+z*1.67],5))),
  make('roof-edge-front','roof',[5.46,.16,.16],[-.16,2.3,.64],5),
  make('roof-edge-side','roof',[.16,.16,3.35],[2.53,2.3,-1.04],5),
  make('roof-cyan','accent',[1.76,.06,1.15],[1.66,2.67,.08],5),
  make('walk-horizontal','boardwalk',[4.4,.2,.68],[-.48,.66,.04],3),
  make('walk-vertical','boardwalk',[.7,.2,2.74],[.65,.66,1.56],3),
  ...[[-2.95,-1.45],[2.87,-.5]].flatMap(([x,z],i)=>[
    make(`trunk-${i}`,'trunks',[.27,.27,.8],[x,.97,z],6,undefined,undefined,'cylinder'),
    ...[0,1,2].map(n=>make(`leaf-${i}-${n}`,'leaves',[1.15,.18,.47],[x+(n-1)*.22,1.5+n*.12,z+(n-1)*.12],6,undefined,n===1?'#1dcf60':undefined,'leaf')),
  ]),
  ...[[-2.6,.12],[2.77,1.65],[2.98,1.38]].map(([x,z],i)=>make(`flower-${i}`,'flowers',[.18,.18,.2],[x,.68,z],6,[1,1],i===0?'#ef7357':undefined,'cylinder')),
];
const onelake:BrickPart[]=[...lakehouse.filter(p=>['display-base','landscape','water','trunks','leaves','flowers'].includes(p.lot)),
  make('lake-tower','accent',[.85,.85,1.25],[-2.6,1.2,-1.8],4,undefined,'#2bb4e7','cylinder'),
  make('lake-tower-cap','walls',[.87,.87,.18],[-2.6,1.93,-1.8],5,undefined,undefined,'cylinder'),
  make('lake-back','walls',[2.6,.95,1.1],[.2,1,-1.9],3,[4,2]),
  make('lake-roof','roof',[2.9,.22,1.4],[.2,1.61,-1.9],5),
];
const powerbi:BrickPart[]=[make('bi-base','display-base',[5,.3,3.6],[0,.15,0],1),
  ...[1.2,2,3.3].map((h,i)=>make(`bi-bar-${i}`,'accent',[.9,h,1.3],[-1.1+i*1.1,h/2+.3,0],i+2,[1,2],['#f6d454','#efc431','#e8b519'][i])),
  ...[-1,0,1].map((x,i)=>make(`bi-stud-${i}`,'flowers',[.2,.2,.12],[x,.39,1.27],6,undefined,'#efc431','cylinder'))];
const warehouse:BrickPart[]=[make('base','display-base',[8,.32,7],[0,.16,0],1),make('floor','walls',[6,.18,4],[0,.55,-.5],2,[8,5]),
  ...[0,1,2].flatMap(y=>[0,1,2,3].map(x=>make(`wall-back-${y}-${x}`,'walls',[1.45,.6,.5],[-2.25+x*1.5,.95+y*.62,-2.3],3,[2,1]))),
  ...[0,1,2].flatMap(y=>[0,1].map(z=>make(`wall-side-${y}-${z}`,'walls',[.5,.6,1.8],[-2.9,.95+y*.62,-1.1+z*1.85],3,[1,2]))),
  ...[0,1,2].flatMap(x=>[0,1].map(z=>make(`roof-${x}-${z}`,'roof',[2.05,.25,2.1],[-2.05+x*2.08,2.82,-1.35+z*2.13],5))),
  ...[0,1,2].map(i=>make(`crate-${i}`,'boardwalk',[.9,.8,.9],[-1.6+i*1.4,1.02,.4],4,[2,2])),
  make('roof-cyan','accent',[1.8,.1,1.5],[1.8,3.02,.6],6,undefined,'#9062d5'),make('walk-horizontal','boardwalk',[5.6,.2,.7],[0,.54,2.1],2)];
const pipeline:BrickPart[]=[make('base','display-base',[8,.32,5],[0,.16,0],1),
  ...[0,1,2].flatMap(i=>[make(`station-${i}`,'walls',[1.65,.7,1.8],[-2.5+i*2.5,.78,0],i+2,[2,2]),make(`station-top-${i}`,'accent',[1.45,.3,1.6],[-2.5+i*2.5,1.34,0],i+3,[2,2],['#37b9d2','#976de2','#f1b344'][i])]),
  ...[0,1].map(i=>make(`connector-${i}`,'water',[.85,.22,.42],[-1.25+i*2.5,.84,0],5)),
  ...[0,1,2].map(i=>make(`flower-${i}`,'flowers',[.19,.19,.14],[-2.5+i*2.5,.43,1.75],6,undefined,'#22ba87','cylinder'))];
const notebook:BrickPart[]=[make('base','display-base',[7,.32,5],[0,.16,0],1),make('book-spine','accent',[.35,.35,3.6],[0,.64,0],2,undefined,'#9b69d6'),
  ...[-1,1].flatMap((side,i)=>[make(`book-cover-${i}`,'accent',[2.65,.18,3.6],[side*1.5,.51,0],2,undefined,'#9062d5'),make(`book-page-${i}`,'walls',[2.5,.24,3.3],[side*1.48,.75,0],3),
    ...[0,1,2].map(n=>make(`code-${i}-${n}`,'water',[1.45-n*.3,.08,.2],[side*1.48,.91,-.85+n*.65],n+4,undefined,i===0?'#646b73':'#22b8b2'))])];
export const kits=[
  {id:'lakehouse' as KitId,title:'Lakehouse',category:'Data engineering',subtitle:'A little architecture. A whole world of data.',description:'A home for structured and unstructured data, built one brick at a time.',parts:lakehouse,number:'01'},
  {id:'onelake' as KitId,title:'OneLake',category:'Data foundation',subtitle:'One place. Endless possibilities.',description:'A shared lake for every team. Explore a small, connected landscape of data.',parts:onelake,number:'02'},
  {id:'powerbi' as KitId,title:'Power BI',category:'Business intelligence',subtitle:'Make the bigger picture tangible.',description:'Three bright columns turn a familiar report into a playful little sculpture.',parts:powerbi,number:'03'},
  {id:'warehouse' as KitId,title:'Warehouse',category:'Data warehousing',subtitle:'Organize the essentials.',description:'A compact warehouse with stacked walls, removable roof panels and individual storage crates.',parts:warehouse,number:'04'},
  {id:'pipeline' as KitId,title:'Pipeline',category:'Data integration',subtitle:'Connect the pieces.',description:'Three connected stations make a small, colorful route from source to destination.',parts:pipeline,number:'05'},
  {id:'notebook' as KitId,title:'Notebook',category:'Data science',subtitle:'Open a new chapter.',description:'An open notebook built from covers, pages and tiny lines of code. Select each layer to look inside.',parts:notebook,number:'06'},
];
export const pieceIds=[...new Set(kits.flatMap(k=>k.parts.map(p=>p.id)))];
export const getKit=(id:string)=>kits.find(k=>k.id===id)??kits[0];
export function getBOM(id:string){const kit=getKit(id);return lots.map(l=>({...l,color:kit.parts.find(p=>p.lot===l.id)?.color??l.color,quantity:kit.parts.filter(p=>p.lot===l.id).length})).filter(l=>l.quantity>0);}
export function kitCost(id:string){return getBOM(id).reduce((s,l)=>s+l.price*l.quantity,0);}
export function makeKitScene(id:string):SceneSpec{
  const kit=getKit(id);
  const parts:ScenePart[]=kit.parts.map(p=>({id:p.id,parent:null,entity:p.id,shape:'group',size:p.size,position:p.position,rotation:[0,0,0],explode:[0,(p.step-1)*.72,0],color:p.color}));
  return {format:'datapass.scene3d',version:1,title:kit.title+' synthetic brick kit',note:'Synthetic procedural geometry only. Reference-inspired visual study; dimensions, parts and costs are illustrative.',parts,
    entities:kit.parts.map(p=>({id:p.id,label:p.name+' · '+p.id,description:'Synthetic component in '+p.lot})),
    cameras:[{id:'overview',label:'Complete kit',position:[11.3,9.2,13.9],target:[0,1.05,0]},{id:'exploded',label:'Layered kit',position:[13,12,16],target:[0,2.75,0]},
      {id:'near',label:'Zoom in',position:[7,6,8.5],target:[0,1.5,0]}, {id:'far',label:'Zoom out',position:[17,14,21],target:[0,2,0]},
      {id:'focus-a',label:'Selected piece',position:[6,5,8],target:[0,1,0]}, {id:'focus-b',label:'Selected piece',position:[6,5,8],target:[0,1,0]}]};
}
export const collectionScene:SceneSpec={format:'datapass.scene3d',version:1,title:'Six synthetic Fabric kits',note:'Synthetic procedural geometry only.',
  parts:kits.map((k,i)=>({id:k.id,parent:null,entity:k.id,shape:'group',size:[8,5,7],position:[(i%3-1)*11,0,(Math.floor(i/3)-.5)*10],rotation:[0,0,0],explode:[0,0,0],color:'#ffffff'})),
  entities:kits.map(k=>({id:k.id,label:k.title,description:k.description})),cameras:[{id:'overview',label:'Collection plan',position:[24,28,34],target:[0,0,0]}]};
export const kitScenes=Object.fromEntries(kits.map(k=>[k.id,makeKitScene(k.id)])) as Record<KitId,SceneSpec>;
/** Build progression hides future pieces below the stage; the shared renderer interpolates these offsets. */
export function stepOffsets(id:string,step:number){return Object.fromEntries(getKit(id).parts.filter(p=>p.step>step).map(p=>[p.id,{position:[0,-80,0] as Vec3}]));}

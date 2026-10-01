import type {SceneSpec,ScenePart,Vec3} from '../../src/framework/scene.ts';
const part=(id:string,entity:string|null,shape:ScenePart['shape'],size:Vec3,position:Vec3,extra:Partial<ScenePart>={}):ScenePart=>({id,parent:null,entity,shape,size,position,rotation:[0,0,0],explode:[0,0,0],color:'#e1eaf0',...extra});
export const turbine:SceneSpec={
  format:'datapass.scene3d',version:1,title:'Turbine assembly',note:'Procedural illustration. Dimensions, colors and components are demonstrative; this is not a CAD model or a validated turbine design.',
  entities:[
    {id:'foundation',label:'Foundation',description:'The foundation transfers loads to the ground. This simplified object is an explanatory shape, not a structural design.'},
    {id:'tower',label:'Tower',description:'The tower raises the rotor above the ground. Its visible height is illustrative and is not an input to the energy model.'},
    {id:'rotor',label:'Rotor',description:'The hub and three blades form one selectable group. The shared story and manual phase control rotate the same hierarchy.'},
    {id:'nacelle',label:'Nacelle',description:'Explode the assembly to reveal the housing and drivetrain. The scene uses ordinary reusable box and cylinder primitives.'},
    {id:'generator',label:'Generator',description:'The generator is visible inside the nacelle. No mechanical or electrical simulation is performed.'}
  ],
  parts:[
    part('foundation-base','foundation','cylinder',[1.25,1.5,.55],[0,.28,0],{color:'#97aab6',explode:[0,-.1,0]}),
    part('tower-main','tower','cylinder',[.27,.43,8.1],[0,4.55,0],{color:'#e5edf2'}),
    part('nacelle-base','nacelle','box',[2.4,.16,1.1],[-.15,8.65,0],{color:'#526d7c'}),
    part('nacelle-roof','nacelle','box',[2.4,.16,1.1],[-.15,9.42,0],{explode:[0,2,0],color:'#d2e1e9'}),
    part('nacelle-side-left','nacelle','box',[2.4,.66,.07],[-.15,9.05,-.53],{explode:[0,.8,-1.3],color:'#bccfdc'}),
    part('nacelle-side-right','nacelle','box',[2.4,.66,.07],[-.15,9.05,.53],{explode:[0,.8,1.3],color:'#bccfdc'}),
    part('generator-body','generator','cylinder',[.29,.29,.75],[-.75,9,0],{rotation:[0,0,Math.PI/2],explode:[-1.4,.9,0],color:'#3f8297'}),
    part('drivetrain','nacelle','box',[.55,.45,.55],[.2,8.98,0],{explode:[.4,.6,0],color:'#9aaebc'}),
    part('rotor-root',null,'group',[1,1,1],[1.38,9.04,0],{explode:[1.5,.3,0],spin:{axis:'x',turns:1}}),
    part('rotor-hub','rotor','sphere',[.36,1,1],[0,0,0],{parent:'rotor-root',color:'#d2e1e9'}),
    ...[0,1,2].flatMap(i=>[
      part('blade-pivot-'+i,null,'group',[1,1,1],[0,0,0],{parent:'rotor-root',rotation:[i*Math.PI*2/3,0,0]}),
      part('blade-inner-'+i,'rotor','box',[.12,2.35,.42],[.08,1.52,0],{parent:'blade-pivot-'+i,rotation:[0,0,-.035],explode:[0,.8,0],color:'#eaf1f5'}),
      part('blade-tip-'+i,'rotor','box',[.09,1.65,.25],[.16,3.49,0],{parent:'blade-pivot-'+i,rotation:[0,0,-.06],explode:[0,.8,0],color:'#eaf1f5'})
    ])
  ],
  cameras:[{id:'iso',label:'Overview',position:[19,13,20],target:[0,6.2,0]},{id:'drivetrain',label:'Drivetrain',position:[9,12,9],target:[0,9.2,0]},{id:'front',label:'Rotor face',position:[25,10,1],target:[0,7,0]}]
};
